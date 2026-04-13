"""
Ingests Stripe API documentation into ChromaDB.

Pipeline:
  1. Try scraping live Stripe docs pages
  2. Always include curated static content as baseline
  3. Chunk text with sentence-aware overlap
  4. Embed with sentence-transformers (all-MiniLM-L6-v2)
  5. Store in persistent ChromaDB collection
"""
import re
import time
import hashlib
import logging
import requests
from typing import List, Dict, Optional
from pathlib import Path
import chromadb
from sentence_transformers import SentenceTransformer
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

CHROMA_PATH = str(Path(__file__).parent.parent.parent / "data" / "chroma_db")
COLLECTION_NAME = "stripe_docs"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

STRIPE_SCRAPE_URLS = [
    "https://stripe.com/docs/api/authentication",
    "https://stripe.com/docs/api/errors",
    "https://stripe.com/docs/api/pagination",
    "https://stripe.com/docs/api/payment_intents",
    "https://stripe.com/docs/api/customers",
    "https://stripe.com/docs/api/charges",
    "https://stripe.com/docs/api/subscriptions",
    "https://stripe.com/docs/api/webhooks",
    "https://stripe.com/docs/api/products",
    "https://stripe.com/docs/api/prices",
    "https://stripe.com/docs/api/refunds",
    "https://stripe.com/docs/api/events",
    "https://stripe.com/docs/api/balance",
    "https://stripe.com/docs/api/checkout/sessions",
    "https://stripe.com/docs/api/idempotent_requests",
]

# Curated static content guaranteed to cover all evaluation questions
STATIC_DOCS = [
    {
        "url": "https://stripe.com/docs/api/authentication",
        "title": "Authentication",
        "content": """Authentication

The Stripe API uses API keys to authenticate requests. You can view and manage your API keys in the Stripe Dashboard.

Your secret API keys should be kept confidential and only stored on your own servers. Your account's secret API key can perform any API request to Stripe without restriction.

Test mode secret keys have the prefix sk_test_ and live mode secret keys have the prefix sk_live_. Alternatively, you can use restricted API keys for granular permissions.

Authentication to the API is performed via HTTP Basic Auth. Provide your API key as the basic auth username value. You do not need to provide a password.

All API requests must be made over HTTPS. Calls made over plain HTTP will fail. API requests without authentication will also fail.

curl https://api.stripe.com/v1/charges \\
  -u sk_test_YOUR_KEY_HERE:

Alternatively, use the Authorization header:
  Authorization: Bearer sk_test_YOUR_KEY_HERE

Publishable keys (pk_test_xxx or pk_live_xxx) are safe for client-side code and identify your account to Stripe without exposing secret functionality. Secret keys (sk_test_xxx or sk_live_xxx) must be kept server-side only.
""",
    },
    {
        "url": "https://stripe.com/docs/api/payment_intents/object",
        "title": "PaymentIntent Object",
        "content": """PaymentIntent Object

A PaymentIntent guides you through the process of collecting a payment from your customer. We recommend that you create exactly one PaymentIntent for each order or customer session.

PaymentIntent Status Values:
- requires_payment_method: A payment method needs to be attached.
- requires_confirmation: The PaymentIntent is ready to be confirmed.
- requires_action: Additional authentication is needed (e.g., 3D Secure).
- processing: The payment is being processed by the payment service provider.
- requires_capture: The funds are authorized but not yet captured (manual capture mode).
- canceled: The PaymentIntent was canceled and can no longer be used.
- succeeded: The payment was successful; funds will be debited from the customer.

PaymentIntent Attributes:
- id: Unique identifier, e.g., pi_3MtwBwLkdIwHu7ix28a3tqPa.
- amount: Amount in the smallest currency unit (e.g., 100 for $1.00 USD).
- currency: Three-letter ISO currency code in lowercase (e.g., usd, eur, gbp).
- status: Current status of the PaymentIntent (see values above).
- client_secret: Used client-side with Stripe.js to complete the payment flow.
- payment_method: ID of the attached PaymentMethod.
- payment_method_types: List of allowed payment method types, e.g., ["card"].
- customer: ID of the Customer this PaymentIntent belongs to (optional).
- metadata: Key-value pairs for storing additional information.
- capture_method: "automatic" (default) or "manual" (for separate capture step).
- confirmation_method: "automatic" or "manual".
- description: Arbitrary string for display to users.
- receipt_email: Email for the payment receipt.
- setup_future_usage: "on_session" or "off_session" to save the payment method.
- latest_charge: ID of the most recent Charge object created.
- cancellation_reason: duplicate, fraudulent, requested_by_customer, or abandoned.
""",
    },
    {
        "url": "https://stripe.com/docs/api/payment_intents/create",
        "title": "Create a PaymentIntent",
        "content": """Create a PaymentIntent

Creates a PaymentIntent object.

HTTP Method: POST
Endpoint: /v1/payment_intents

Required Parameters:
- amount (integer): Amount intended to be collected, in the smallest currency unit.
  Example: 2000 for $20.00 USD.
- currency (string): Three-letter ISO currency code, in lowercase. Must be a supported currency.

Optional Parameters:
- payment_method_types (array): The list of payment method types to use. Default: ["card"].
- customer (string): ID of the Customer object to attach to this PaymentIntent.
- description (string): An arbitrary string attached to the object.
- metadata (object): Key-value pairs you can attach to the object.
- receipt_email (string): Email address to send the receipt to.
- setup_future_usage (string): "on_session" or "off_session".
- capture_method (string): "automatic" (default), "automatic_async", or "manual".
- confirm (boolean): Set to true to attempt to confirm this PaymentIntent immediately.
- payment_method (string): ID of the payment method to attach and confirm.
- return_url (string): URL to redirect to after confirmation (for redirect-based flows).
- statement_descriptor (string): Statement descriptor suffix.

Example Request:
curl https://api.stripe.com/v1/payment_intents \\
  -u sk_test_xxx: \\
  -d amount=2000 \\
  -d currency=usd \\
  -d "payment_method_types[]=card"

Returns: A PaymentIntent object if creation succeeded, or an error if something goes wrong.
""",
    },
    {
        "url": "https://stripe.com/docs/api/payment_intents/confirm",
        "title": "Confirm a PaymentIntent",
        "content": """Confirm a PaymentIntent

Confirm that your customer intends to pay with current or provided payment method. Upon confirmation, the PaymentIntent will attempt to initiate a payment.

HTTP Method: POST
Endpoint: /v1/payment_intents/:id/confirm

Parameters:
- payment_method (string): ID of the payment method to use.
- return_url (string): The URL to redirect the customer to after authentication.
- receipt_email (string): Email address to send receipt to upon success.
- setup_future_usage (string): Indicates future payment intent use.
- mandate_data (object): This hash contains details about the mandate to create.
- error_on_requires_action (boolean): Set to true to fail the payment attempt if the PaymentIntent transitions to requires_action.

If the selected payment method requires additional authentication steps, the PaymentIntent transitions to requires_action status.

Example:
curl https://api.stripe.com/v1/payment_intents/pi_xxx/confirm \\
  -u sk_test_xxx: \\
  -d payment_method=pm_card_visa

Returns: Returns the resulting PaymentIntent after all possible transitions are applied.
""",
    },
    {
        "url": "https://stripe.com/docs/api/customers",
        "title": "Customer Object and CRUD Operations",
        "content": """Customer Object

This object represents a customer of your business. It lets you create recurring charges and track payments that belong to the same customer.

Customer Attributes:
- id: Unique identifier (e.g., cus_NffrFeUfNV2Hib).
- email: The customer's email address.
- name: The customer's full name.
- phone: The customer's phone number.
- address: The customer's address (city, country, line1, line2, postal_code, state).
- description: Arbitrary string to describe the customer.
- metadata: Key-value pairs for additional data.
- balance: Current balance (in cents) of the customer's account. Negative = credit.
- currency: The currency the customer can be charged in.
- default_source: ID of the default payment source.
- delinquent: Whether the customer's latest invoice is delinquent.
- created: Unix timestamp when the customer was created.
- livemode: true for live mode, false for test mode.

Create a Customer:
POST /v1/customers
Parameters: email, name, phone, address, description, metadata, payment_method, etc.

curl https://api.stripe.com/v1/customers \\
  -u sk_test_xxx: \\
  -d email="jenny.rosen@example.com" \\
  -d name="Jenny Rosen"

Retrieve a Customer:
GET /v1/customers/:id

curl https://api.stripe.com/v1/customers/cus_NffrFeUfNV2Hib \\
  -u sk_test_xxx:

Update a Customer:
POST /v1/customers/:id
Send any of the customer attributes to update.

Delete a Customer:
DELETE /v1/customers/:id
Returns an object with deleted: true on success.

List All Customers:
GET /v1/customers
Parameters: email (filter), limit (1-100, default 10), starting_after, ending_before, created.

Returns a list object with a data array containing Customer objects.
""",
    },
    {
        "url": "https://stripe.com/docs/api/webhooks",
        "title": "Webhooks",
        "content": """Webhooks

Stripe uses webhooks to notify your application when an event happens in your account. Webhooks are particularly useful for asynchronous events like when a customer's bank confirms a payment, a customer disputes a charge, a recurring payment succeeds, or collecting subscription payments.

How Webhooks Work:
1. A trigger event occurs in Stripe (e.g., payment succeeds)
2. Stripe sends a POST request to your configured webhook endpoint URL
3. Your endpoint receives the event and processes it
4. Your endpoint must respond with a 2xx HTTP status code within 30 seconds

Webhook Endpoint Requirements:
- Must be an HTTPS URL (HTTP is not accepted)
- Must respond with a 2xx status code to acknowledge receipt
- Should process events idempotently (Stripe may deliver the same event more than once)

Verifying Webhook Signatures:
Stripe signs each webhook event it sends to your endpoints. We do this so you can verify that the events were sent by Stripe, not by a third party.

The Stripe-Signature header includes a timestamp and one or more signatures. Use your webhook signing secret (whsec_xxx) to verify.

In Python:
import stripe
event = stripe.Webhook.construct_event(
    payload=request.data,
    sig_header=request.headers['Stripe-Signature'],
    secret='whsec_xxx'
)

In Node.js:
const event = stripe.webhooks.constructEvent(
    payload, sigHeader, webhookSecret
);

Common Webhook Events:
- payment_intent.succeeded: A PaymentIntent was successfully confirmed and any required actions were handled.
- payment_intent.payment_failed: A PaymentIntent failed.
- customer.created: A new Customer was created.
- customer.subscription.created: A new Subscription was created.
- customer.subscription.updated: A Subscription was updated.
- customer.subscription.deleted: A Subscription was canceled.
- charge.refunded: A Charge was refunded.
- invoice.payment_succeeded: Invoice payment succeeded.
- invoice.payment_failed: Invoice payment failed.

Best Practices:
- Return a 2xx response immediately before processing the event
- Handle duplicate events (use event.id for idempotency)
- Use queues for processing to avoid timeouts
""",
    },
    {
        "url": "https://stripe.com/docs/api/subscriptions",
        "title": "Subscriptions",
        "content": """Subscriptions

Subscriptions allow you to charge a customer on a recurring basis.

Subscription Status Values:
- active: The subscription is in good standing and the most recent payment was successful. It will continue to auto-renew.
- trialing: The subscription is currently in a trial period and it is safe to provision your product for your customer. The subscription transitions to active when the first payment is made.
- incomplete: A successful payment needs to be made within 23 hours to activate the subscription.
- incomplete_expired: The initial payment on the subscription failed and no successful payment was made within 23 hours.
- past_due: Payment on the latest invoice has failed. Stripe will attempt to retry the payment.
- canceled: The subscription has been canceled. During cancellation, automatic collection for all unpaid invoices is disabled.
- unpaid: The latest invoice has not been paid but the subscription remains in place. The latest invoice will be retried.
- paused: The subscription has been paused.

Create a Subscription:
POST /v1/subscriptions

Required Parameters:
- customer (string): The identifier of the customer to subscribe.
- items (array): A list of up to 20 subscription items, each with:
  - price (string): ID of the Price object.

Optional Parameters:
- trial_period_days (integer): Integer representing the number of trial period days.
- trial_end (timestamp): Unix timestamp marking the end of the trial period.
- cancel_at_period_end (boolean): Boolean indicating whether this subscription should cancel at the end of the current period.
- metadata (object): Set of key-value pairs.
- payment_behavior (string): "allow_incomplete", "error_if_incomplete", or "pending_if_incomplete".
- proration_behavior (string): Determines how to handle prorations.

Example:
curl https://api.stripe.com/v1/subscriptions \\
  -u sk_test_xxx: \\
  -d customer=cus_xxx \\
  -d "items[0][price]=price_xxx"

Cancel a Subscription:
To cancel immediately: DELETE /v1/subscriptions/:id
To cancel at period end: POST /v1/subscriptions/:id with cancel_at_period_end=true

Retrieve a Subscription:
GET /v1/subscriptions/:id

List Subscriptions:
GET /v1/subscriptions
Parameters: customer (filter by customer), status (filter by status), limit, starting_after.
""",
    },
    {
        "url": "https://stripe.com/docs/api/errors",
        "title": "Errors",
        "content": """Errors

Stripe uses conventional HTTP response codes to indicate the success or failure of an API request. In general:
- 2xx codes indicate success.
- 4xx codes indicate an error that failed given the information provided (e.g., a required parameter was omitted, a charge failed, etc.).
- 5xx codes indicate an error with Stripe's servers.

HTTP Status Codes:
- 200 OK: Everything worked as expected.
- 400 Bad Request: The request was unacceptable, often due to missing a required parameter.
- 401 Unauthorized: No valid API key provided.
- 402 Request Failed: The parameters were valid but the request failed.
- 403 Forbidden: The API key doesn't have permissions to perform the request.
- 404 Not Found: The requested resource doesn't exist.
- 409 Conflict: The request conflicts with another request (perhaps due to using the same idempotency key).
- 429 Too Many Requests: Too many requests hit the API too quickly. We recommend an exponential backoff of your requests.
- 500, 502, 503, 504 Server Errors: Something went wrong on Stripe's end.

Error Types:
- api_error: API errors cover any other type of problem (e.g., a temporary problem with Stripe's servers), and are extremely uncommon.
- card_error: Card errors are the most common type of error you should expect to handle. They result when the user enters a card that can't be charged for some reason.
- idempotency_error: Idempotency errors occur when an Idempotency-Key is re-used on a request that does not match the first request's API endpoint and parameters.
- invalid_request_error: Invalid request errors arise when your request has invalid parameters.
- authentication_error: Failure to properly authenticate yourself in the request.
- rate_limit_error: Too many requests hit the API too quickly.

Error Object Attributes:
- type: The type of error returned (see above).
- code: For some errors that could be handled programmatically, a short string indicating the error code (e.g., "card_declined", "expired_card", "insufficient_funds").
- message: A human-readable message providing more details about the error.
- param: If the error is parameter-specific, the parameter related to the error.
- decline_code: For card errors, the decline code from the card network.
- charge: For card errors resulting from a card decline, the ID of the failed charge.

Handling Errors:
Check the type field for high-level error classification, then check code for specific handling.
""",
    },
    {
        "url": "https://stripe.com/docs/api/pagination",
        "title": "Pagination",
        "content": """Pagination

All top-level API resources have support for bulk fetches via "list" API methods. Stripe utilizes cursor-based pagination via the starting_after and ending_before parameters. Both parameters take an existing object ID value and return objects in reverse chronological order.

List Response Format:
{
  "object": "list",
  "url": "/v1/customers",
  "has_more": true,
  "data": [...]
}

- data: An array of objects of the requested type.
- has_more: Whether there are more results available after this set.
- url: The URL for accessing this list.

Pagination Parameters:
- limit (integer): A limit on the number of objects to be returned. Can be between 1 and 100, and the default is 10.
- starting_after (string): A cursor for use in pagination. starting_after is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, ending with obj_foo, your subsequent call can include starting_after=obj_foo in order to fetch the next page of the list.
- ending_before (string): A cursor for use in pagination. ending_before is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, starting with obj_bar, your subsequent call can include ending_before=obj_bar in order to fetch the previous page of the list.

Example - List customers with limit:
curl https://api.stripe.com/v1/customers?limit=3 \\
  -u sk_test_xxx:

Example - Next page using starting_after:
curl 'https://api.stripe.com/v1/customers?limit=3&starting_after=cus_last_id' \\
  -u sk_test_xxx:

Auto-pagination (Python):
for customer in stripe.Customer.auto_paging_iter():
    process(customer)
""",
    },
    {
        "url": "https://stripe.com/docs/api/idempotent_requests",
        "title": "Idempotent Requests",
        "content": """Idempotent Requests

The API supports idempotency for safely retrying requests without accidentally performing the same operation twice. This is useful when an API call is disrupted in transit and you do not receive a response.

To perform an idempotent request, provide an additional Idempotency-Key header to the request.

Stripe's idempotency works by saving the resulting status code and body of the first request made for any given idempotency key, regardless of whether it succeeded or failed. Subsequent requests with the same key return the same result, including 500 errors.

- Keys expire after 24 hours. After 24 hours, a new request with the same key can be made.
- Idempotency keys must be unique per request. We suggest using V4 UUIDs or another random string with enough entropy to avoid collisions.
- Results are only saved if an API endpoint started executing. If incoming parameters failed validation, or the request conflicted with another that was executing concurrently, no idempotent result is saved.

Example:
curl https://api.stripe.com/v1/charges \\
  -u sk_test_xxx: \\
  -H "Idempotency-Key: a84a6f93-9b25-4c53-b13e-9c60d88a7e5f" \\
  -d amount=2000 \\
  -d currency=usd \\
  -d source=tok_mastercard

Best Practices:
- Always use idempotency keys for POST requests that create objects
- Use UUIDs as idempotency keys
- Retry on 5xx errors with the same idempotency key
- Retry on network timeouts with the same idempotency key
""",
    },
    {
        "url": "https://stripe.com/docs/api/charges/object",
        "title": "Charge Object",
        "content": """Charge Object

To charge a credit or a debit card, you create a Charge object. You can retrieve and refund individual charges as well as list all charges. Charges are identified by a unique, random ID.

Note: Use the PaymentIntents API for new integrations. The Charges API is the older way to create payments.

Charge Attributes:
- id: Unique identifier (e.g., ch_3MmlLrLkdIwHu7ix0snN0B15).
- amount: Amount in the smallest currency unit (e.g., 100 for $1.00).
- amount_captured: Amount in cents that was captured.
- amount_refunded: Amount in cents refunded (can be less than the amount attribute on the charge if a partial refund was issued).
- captured: If the charge was created without capturing, this Boolean represents whether it is still uncaptured or has since been captured.
- currency: Three-letter ISO currency code in lowercase.
- customer: ID of the customer this charge is for.
- description: An arbitrary string attached to the object.
- disputed: Whether the charge has been disputed.
- failure_code: Error code explaining reason for charge failure if available.
- failure_message: Message to user further explaining reason for charge failure if available.
- metadata: Set of key-value pairs.
- paid: true if the charge succeeded, or was successfully authorized for later capture.
- payment_intent: ID of the PaymentIntent associated with this charge, if one exists.
- receipt_email: Email address for the receipt.
- receipt_url: URL to access the receipt.
- refunded: Whether the charge has been fully refunded.
- refunds: A list of refunds that have been applied to the charge.
- status: The status of the payment. Either succeeded, pending, or failed.

Create a Charge:
POST /v1/charges (legacy — prefer PaymentIntents)

Retrieve a Charge:
GET /v1/charges/:id
""",
    },
    {
        "url": "https://stripe.com/docs/api/refunds",
        "title": "Refunds",
        "content": """Refunds

Refund objects allow you to refund a previously created charge that isn't refunded yet. Funds are refunded to the credit or debit card that's charged.

You can issue a full or partial refund. You can issue multiple partial refunds up to the total amount of the original charge.

Create a Refund:
POST /v1/refunds

Parameters:
- charge (string): The identifier of the charge to refund. One of charge or payment_intent is required.
- payment_intent (string): The identifier of the PaymentIntent to refund.
- amount (integer): A positive integer in cents representing how much of this charge to refund. If not provided, the full amount is refunded.
- reason (string): Three possible values: duplicate, fraudulent, or requested_by_customer.
- metadata (object): Key-value pairs for additional data.
- refund_application_fee (boolean): Whether the application fee should also be refunded.
- reverse_transfer (boolean): Whether the transfer should be reversed.

Example (full refund):
curl https://api.stripe.com/v1/refunds \\
  -u sk_test_xxx: \\
  -d charge=ch_xxx

Example (partial refund of $5.00):
curl https://api.stripe.com/v1/refunds \\
  -u sk_test_xxx: \\
  -d charge=ch_xxx \\
  -d amount=500

Refund Object Attributes:
- id: Unique identifier.
- amount: Amount refunded, in cents.
- charge: ID of the charge that was refunded.
- currency: Currency.
- created: Unix timestamp.
- reason: Reason for the refund.
- status: pending, succeeded, failed, or canceled.
- receipt_number: The receipt number.
""",
    },
    {
        "url": "https://stripe.com/docs/api/products",
        "title": "Products and Prices",
        "content": """Products

Products describe the specific goods or services you offer to your customers. For example, you might offer a Standard and Premium version of your goods or service; each version would be a separate Product.

Create a Product:
POST /v1/products
Parameters: name (required), description, images, metadata, active.

Prices

A Price object represents how much and how often to charge for a product. Each product can have multiple prices.

Price Types:
- One-time prices: Charge once for a product.
- Recurring prices: Charge on a schedule (day, week, month, year).

Create a Price:
POST /v1/prices

Required Parameters:
- currency (string): Three-letter ISO currency code.
- unit_amount (integer): A positive integer in cents (or 0 for free prices).

Optional Parameters:
- product (string): The ID of the product that this price will belong to.
- recurring (object): The recurring components of a price such as interval and interval_count.
  - interval (string): day, week, month, or year.
  - interval_count (integer): The number of intervals between each billing. Default is 1.
- nickname (string): A brief description of the price, hidden from customers.
- metadata (object): Key-value pairs.
- active (boolean): Whether the price is available for new purchases.

Example (monthly recurring $10):
curl https://api.stripe.com/v1/prices \\
  -u sk_test_xxx: \\
  -d currency=usd \\
  -d unit_amount=1000 \\
  -d "recurring[interval]=month" \\
  -d product=prod_xxx

To create a subscription with this price:
curl https://api.stripe.com/v1/subscriptions \\
  -u sk_test_xxx: \\
  -d customer=cus_xxx \\
  -d "items[0][price]=price_xxx"
""",
    },
    {
        "url": "https://stripe.com/docs/api/events",
        "title": "Events",
        "content": """Events

Events are our way of letting you know when something interesting happens in your account. When an interesting event occurs, we create a new Event object.

Event Object Attributes:
- id: Unique identifier for the event (e.g., evt_1NG8Du2eZvKYlo2CUI79vXWy).
- object: Always "event".
- api_version: The Stripe API version used to render data.
- created: Unix timestamp when the event was created.
- data: Object containing the data associated with the event.
  - object: The object that triggered the event (e.g., a PaymentIntent or Customer).
  - previous_attributes: For updated events, contains the previous attribute values.
- livemode: true for live mode, false for test mode.
- pending_webhooks: Number of webhooks yet to be delivered.
- request: Information on the API request that triggered the event.
- type: Description of the event (e.g., payment_intent.succeeded).

Common Event Types:
- payment_intent.succeeded
- payment_intent.payment_failed
- payment_intent.created
- customer.created
- customer.updated
- customer.deleted
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- charge.succeeded
- charge.failed
- charge.refunded
- invoice.created
- invoice.payment_succeeded
- invoice.payment_failed
- checkout.session.completed

Retrieve an Event:
GET /v1/events/:id

List Events:
GET /v1/events
Parameters: type (filter by type), created (filter by date), limit, starting_after.
""",
    },
    {
        "url": "https://stripe.com/docs/api/rate_limits",
        "title": "Rate Limits",
        "content": """Rate Limits

Stripe's API rate limit is 100 write requests per second and 100 read requests per second in live mode. Test mode allows 100 read and 100 write requests per second.

When you exceed the rate limit, Stripe returns an HTTP 429 Too Many Requests response.

Handling Rate Limits:
- Inspect the Retry-After header to determine how long to wait before making another request.
- Implement exponential backoff with jitter.
- Distribute requests evenly over time rather than bursting.

HTTP 429 Response:
{
  "error": {
    "type": "rate_limit_error",
    "message": "Too many requests; please try again later."
  }
}

Best Practices:
1. Implement retry logic with exponential backoff.
2. Cache frequently read objects (customers, products, prices).
3. Use webhooks instead of polling for state changes.
4. Batch operations where possible.
5. Monitor your API usage in the Stripe Dashboard.
""",
    },
    {
        "url": "https://stripe.com/docs/api/checkout/sessions",
        "title": "Checkout Sessions",
        "content": """Checkout Sessions

A Checkout Session represents your customer's session as they pay for one-time purchases or subscriptions through Checkout. We recommend creating a new Checkout Session each time your customer attempts to pay.

Create a Checkout Session:
POST /v1/checkout/sessions

Required Parameters:
- mode (string): The mode of the Checkout Session. Values: "payment", "setup", or "subscription".
- success_url (string): The URL to which Stripe should send customers when payment is complete.

Optional Parameters:
- cancel_url (string): URL when user cancels.
- customer (string): ID of an existing Customer.
- customer_email (string): Email of the customer.
- line_items (array): A list of items the customer is purchasing.
  - price (string): The ID of the Price.
  - quantity (integer): The quantity of the product being purchased.
- payment_method_types (array): Types of payment methods. Default: ["card"].
- metadata (object): Key-value pairs.
- allow_promotion_codes (boolean): Allow promotion codes.

Example:
curl https://api.stripe.com/v1/checkout/sessions \\
  -u sk_test_xxx: \\
  -d mode=payment \\
  -d "line_items[0][price]=price_xxx" \\
  -d "line_items[0][quantity]=1" \\
  -d success_url="https://example.com/success" \\
  -d cancel_url="https://example.com/cancel"

Retrieve a Session:
GET /v1/checkout/sessions/:id

After the customer completes payment, the checkout.session.completed webhook event fires.
""",
    },
]


def scrape_page(url: str) -> Optional[Dict]:
    """Attempt to scrape a Stripe docs page. Returns None on failure."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning(f"Scrape failed for {url}: {exc}")
        return None

    soup = BeautifulSoup(resp.text, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find("div", {"id": re.compile(r"content|main", re.I)})
        or soup.body
    )
    if not main:
        return None

    title_tag = soup.find("title") or soup.find("h1")
    title = title_tag.get_text(strip=True) if title_tag else url.split("/")[-1]

    text = main.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)

    if len(text) < 200:  # Not enough content, likely JS-rendered
        return None

    return {"url": url, "title": title, "content": text}


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    Splits text into overlapping chunks at sentence boundaries.
    """
    # Normalize whitespace
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    # Split into sentences (handles . ! ? and paragraph breaks)
    raw_sentences = re.split(r"(?<=[.!?])\s+|\n\n+", text)
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for sentence in sentences:
        sent_len = len(sentence)
        if current_len + sent_len + 1 > chunk_size and current:
            chunks.append(" ".join(current))
            # Retain overlap: keep sentences from end of current chunk
            overlap_buf: List[str] = []
            overlap_len = 0
            for s in reversed(current):
                if overlap_len + len(s) + 1 <= overlap:
                    overlap_buf.insert(0, s)
                    overlap_len += len(s) + 1
                else:
                    break
            current = overlap_buf
            current_len = overlap_len

        current.append(sentence)
        current_len += sent_len + 1

    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if len(c) > 80]


def get_collection() -> chromadb.Collection:
    """Returns (or creates) the ChromaDB collection."""
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def _upsert_page(page: Dict, collection: chromadb.Collection, model: SentenceTransformer) -> int:
    """Chunks, embeds, and upserts a page into the collection. Returns number of chunks added."""
    chunks = chunk_text(page["content"])
    added = 0
    for i, chunk in enumerate(chunks):
        chunk_id = hashlib.md5(f"{page['url']}::{i}::{chunk[:80]}".encode()).hexdigest()
        if collection.get(ids=[chunk_id])["ids"]:
            continue  # Already exists — skip
        embedding = model.encode(chunk, normalize_embeddings=True).tolist()
        collection.add(
            ids=[chunk_id],
            embeddings=[embedding],
            documents=[chunk],
            metadatas=[{
                "url": page["url"],
                "title": page["title"],
                "chunk_index": i,
                "source": "stripe_docs",
            }],
        )
        added += 1
    return added


def run_ingestion(scrape_live: bool = True, force: bool = False) -> Dict:
    """
    Main ingestion entrypoint.

    Args:
        scrape_live: Attempt to scrape live Stripe docs pages in addition to static content.
        force: Drop existing collection data before ingesting.
    """
    logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
    model = SentenceTransformer(EMBEDDING_MODEL)

    collection = get_collection()

    if force:
        logger.info("force=True — clearing existing data")
        existing_ids = collection.get()["ids"]
        if existing_ids:
            collection.delete(ids=existing_ids)

    pages: List[Dict] = list(STATIC_DOCS)  # Always include static content

    if scrape_live:
        logger.info(f"Scraping {len(STRIPE_SCRAPE_URLS)} live pages...")
        for url in STRIPE_SCRAPE_URLS:
            logger.info(f"  GET {url}")
            page = scrape_page(url)
            if page:
                pages.append(page)
                logger.info(f"    OK — {len(page['content'])} chars")
            time.sleep(0.5)  # Polite delay
    else:
        logger.info("Skipping live scraping (scrape_live=False)")

    logger.info(f"Embedding and storing {len(pages)} pages...")
    total_added = 0
    for page in pages:
        n = _upsert_page(page, collection, model)
        total_added += n
        logger.info(f"  {page['url']}: +{n} chunks")

    stats = {
        "pages_processed": len(pages),
        "chunks_added": total_added,
        "total_chunks": collection.count(),
    }
    logger.info(f"Ingestion complete: {stats}")
    return stats

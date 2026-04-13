import type { QueryResult } from './api'

export const CHUNK_COUNT = 333

export const MOCK_RESULT: QueryResult = {
  question: 'How do I unsubscribe a customer from a plan?',
  k: 3,
  answerText:
    'There are two ways to cancel a subscription, depending on whether you want the cancellation to take effect immediately or at the end of the billing period.',
  methods: [
    {
      number: 1,
      title: 'Cancel immediately',
      status: 'DESTRUCTIVE',
      code: {
        verb: 'DELETE',
        path: '/v1/subscriptions/:id',
        body: null,
      },
    },
    {
      number: 2,
      title: 'Cancel at period end',
      status: 'RECOMMENDED',
      code: {
        verb: 'POST',
        path: '/v1/subscriptions/:id',
        body: 'cancel_at_period_end: true',
      },
    },
  ],
  chunks: [
    { id: 1, source: 'subscriptions', section: 'Canceling a subscription', score: 0.91 },
    { id: 2, source: 'subscriptions', section: 'Billing cycle behavior',   score: 0.84 },
    { id: 3, source: 'customers',     section: 'Deleting a customer',      score: 0.62 },
  ],
  metrics: {
    meanSimilarity: 0.79,
    scoreSpread: 0.29,
    chunksAboveThreshold: 2,
    threshold: 0.7,
    k: 3,
  },
  latency: {
    retrievalMs:  412,
    embeddingMs:  38,
    searchMs:     374,
    generationMs: 1200,
  },
  inspectorChunks: [
    {
      id: 1,
      text: 'To cancel a subscription, you can use the DELETE /v1/subscriptions/:id endpoint. This immediately cancels the subscription and stops all future invoices. The customer will not be charged again for this subscription.',
      source: 'subscriptions',
      section: 'Canceling a subscription',
      url: 'https://docs.stripe.com/api/subscriptions',
      chunkIndex: 4,
      score: 0.91,
      aboveThreshold: true,
    },
    {
      id: 2,
      text: 'When a subscription is canceled, the billing cycle determines when the cancellation takes effect. Setting cancel_at_period_end to true allows the customer to use the service until the end of the current billing period.',
      source: 'subscriptions',
      section: 'Billing cycle behavior',
      url: 'https://docs.stripe.com/api/subscriptions',
      chunkIndex: 7,
      score: 0.84,
      aboveThreshold: true,
    },
    {
      id: 3,
      text: 'Deleting a customer permanently removes them and all associated data including subscriptions, payment methods, and invoices. This action cannot be undone.',
      source: 'customers',
      section: 'Deleting a customer',
      url: 'https://docs.stripe.com/api/customers',
      chunkIndex: 12,
      score: 0.62,
      aboveThreshold: false,
    },
  ],
  assembledPrompt: {
    system: 'You are a precise technical assistant specialising in the Stripe API. Answer questions using ONLY the provided documentation context. If the context does not contain enough information to answer fully, say "The provided context does not cover this in sufficient detail." Include relevant endpoint paths, parameter names, and short code examples where present in the context. Be concise but complete.',
    user: 'Documentation context:\n\n[1] Canceling a subscription — https://docs.stripe.com/api/subscriptions\nTo cancel a subscription, you can use the DELETE /v1/subscriptions/:id endpoint...\n\n------------------------------------------------------------\n\n[2] Billing cycle behavior — https://docs.stripe.com/api/subscriptions\nWhen a subscription is canceled, the billing cycle determines when the cancellation takes effect...\n\n------------------------------------------------------------\n\n[3] Deleting a customer — https://docs.stripe.com/api/customers\nDeleting a customer permanently removes them and all associated data...\n\nQuestion: How do I unsubscribe a customer from a plan?\n\nAnswer based solely on the context above:',
  },
  tokenUsage: {
    inputTokens: 842,
    outputTokens: 156,
  },
  diagnostics: [
    { type: 'info', message: 'Chunks retrieved from 2 different source documents.' },
  ],
}

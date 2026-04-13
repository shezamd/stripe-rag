'use client'

import { Search, Loader2, ArrowRight } from 'lucide-react'
import ExampleChip from './ExampleChip'

const K_VALUES = [1, 3, 5, 10]

const EXAMPLE_CHIPS: { label: string; question: string }[] = [
  { label: 'PaymentIntent',        question: 'How do I create a PaymentIntent?' },
  { label: 'Subscription statuses',question: 'What are the possible statuses for a subscription?' },
  { label: 'Webhook signatures',   question: 'How do I verify a webhook signature?' },
  { label: 'Pagination',           question: 'How does pagination work in the Stripe API?' },
]

interface QueryCardProps {
  question:         string
  k:                number
  loading:          boolean
  onQuestionChange: (q: string) => void
  onKChange:        (k: number) => void
  onSubmit:         (q?: string) => void
}

export default function QueryCard({
  question, k, loading, onQuestionChange, onKChange, onSubmit
}: QueryCardProps) {

  const cycleK = () => {
    const idx = K_VALUES.indexOf(k)
    onKChange(K_VALUES[(idx + 1) % K_VALUES.length])
  }

  return (
    <div className="bg-surface border-hairline rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary mb-3">Query</p>

      {/* Input row */}
      <div className="
        bg-canvas border border-black/10 rounded-[8px]
        flex items-center gap-2.5 px-3 py-2.5
        focus-within:ring-2 focus-within:ring-brand/30 focus-within:ring-offset-0
        transition-all duration-150
      ">
        {loading
          ? <Loader2 className="w-[14px] h-[14px] text-tertiary flex-shrink-0 animate-spin" />
          : <Search  className="w-[14px] h-[14px] text-tertiary flex-shrink-0" />
        }

        <input
          type="text"
          value={question}
          onChange={e => onQuestionChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSubmit()}
          placeholder="Ask a question about the Stripe API…"
          disabled={loading}
          className="
            flex-1 bg-transparent text-[14px] text-primary
            placeholder:text-tertiary outline-none
            disabled:opacity-60
          "
        />

        <button
          onClick={() => onSubmit()}
          disabled={loading || !question.trim()}
          title="Submit (Enter)"
          className="
            flex-shrink-0 w-6 h-6 rounded-[5px] bg-brand
            flex items-center justify-center
            hover:opacity-80 disabled:opacity-30
            transition-opacity duration-150
          "
        >
          <ArrowRight className="w-3 h-3 text-white" />
        </button>

        {/* k chip — click to cycle through values */}
        <button
          onClick={cycleK}
          title="Retrieve top K chunks from the vector store — click to cycle"
          className="
            font-mono text-[11px] text-tertiary bg-surface
            border border-black/10 rounded px-1.5 py-0.5
            hover:border-black/20 transition-colors duration-150
            flex-shrink-0 select-none
          "
        >
          top k={k}
        </button>
      </div>

      {/* Example chips */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {EXAMPLE_CHIPS.map(({ label, question: q }) => (
          <ExampleChip
            key={label}
            label={label}
            onClick={() => onSubmit(q)}
          />
        ))}
      </div>
    </div>
  )
}

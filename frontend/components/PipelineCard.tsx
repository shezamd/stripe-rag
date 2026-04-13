interface PipelineCardProps {
  model:      string
  embeddings: string
  store:      string
}

const ROWS = ['Model', 'Embeddings', 'Store'] as const

export default function PipelineCard({ model, embeddings, store }: PipelineCardProps) {
  const values: Record<typeof ROWS[number], string> = { Model: model, Embeddings: embeddings, Store: store }

  return (
    <div className="mt-1">
      <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary mb-2">Pipeline</p>
      <div className="bg-surface border-hairline rounded-[8px] overflow-hidden">
        {ROWS.map((key, i) => (
          <div
            key={key}
            className={`flex items-center justify-between px-3.5 py-2.5 ${
              i < ROWS.length - 1 ? 'border-b border-black/[0.06]' : ''
            }`}
          >
            <span className="text-[12px] text-tertiary">{key}</span>
            <span className="font-mono text-[11px] text-secondary">{values[key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

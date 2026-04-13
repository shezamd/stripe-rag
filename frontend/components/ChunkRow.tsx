import type { Chunk } from '@/lib/api'

function scoreColor(score: number) {
  if (score >= 0.75) return '#1D9E75'
  if (score >= 0.5)  return '#BA7517'
  return '#A32D2D'
}

interface ChunkRowProps extends Chunk {
  onClick?: () => void
}

export default function ChunkRow({ id, source, section, score, onClick }: ChunkRowProps) {
  return (
    <div
      onClick={onClick}
      className="
        flex items-center gap-3 px-2 py-1.5 rounded-[6px]
        hover:bg-canvas cursor-pointer
        transition-colors duration-150
      "
      // TODO: expand to show full chunk text on click
    >
      <span className="font-mono text-[11px] text-tertiary w-5 flex-shrink-0">
        #{id}
      </span>
      <span className="flex-1 text-[13px] text-secondary truncate">
        {source}
        <span className="text-tertiary mx-1">·</span>
        {section}
      </span>
      <span className="font-mono text-[12px] flex-shrink-0" style={{ color: scoreColor(score) }}>
        {score.toFixed(2)}
      </span>
    </div>
  )
}

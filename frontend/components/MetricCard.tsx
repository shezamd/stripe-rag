interface MetricCardProps {
  label: string
  value: number
}

export default function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="bg-surface border-hairline rounded-[8px] px-3.5 py-3">
      <p className="text-[11px] text-tertiary mb-2">{label}</p>
      <p className="font-mono text-[20px] font-medium text-primary leading-none mb-3">
        {value.toFixed(3)}
      </p>
      <div className="h-[3px] bg-black/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-success-default rounded-full transition-all duration-500"
          style={{ width: `${Math.min(value * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

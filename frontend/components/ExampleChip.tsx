interface ExampleChipProps {
  label: string
  onClick: () => void
}

export default function ExampleChip({ label, onClick }: ExampleChipProps) {
  return (
    <button
      onClick={onClick}
      className="
        text-[11px] text-secondary border border-black/10 rounded-full
        px-3 py-1 leading-none
        hover:border-black/20 hover:bg-black/[0.02]
        transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-brand/30 focus:ring-offset-1
      "
    >
      {label}
    </button>
  )
}

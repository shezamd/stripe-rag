interface StatusPillProps {
  variant: 'GROUNDED' | 'DESTRUCTIVE' | 'RECOMMENDED' | 'DEPRECATED'
  label?: string
}

const STYLES: Record<StatusPillProps['variant'], string> = {
  GROUNDED:    'bg-success-bg text-success-fg',
  RECOMMENDED: 'bg-success-bg text-success-fg',
  DESTRUCTIVE: 'bg-danger-bg  text-danger-fg',
  DEPRECATED:  'bg-warning-bg text-warning-fg',
}

export default function StatusPill({ variant, label }: StatusPillProps) {
  return (
    <span className={`${STYLES[variant]} text-[11px] font-medium px-2 py-0.5 rounded-full leading-none`}>
      {label ?? variant}
    </span>
  )
}

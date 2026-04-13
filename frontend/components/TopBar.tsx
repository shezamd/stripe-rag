'use client'

type Tab = 'ask' | 'evaluate' | 'corpus' | 'inspector'

interface TopBarProps {
  activeTab:   Tab
  onTabChange: (tab: Tab) => void
  chunkCount:  number
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'ask',       label: 'Ask'       },
  { id: 'inspector', label: 'Inspector' },
  { id: 'evaluate',  label: 'Evaluate'  },
  { id: 'corpus',    label: 'Corpus'    },
]

export default function TopBar({ activeTab, onTabChange, chunkCount }: TopBarProps) {
  return (
    <div className="bg-surface border-b border-black/10 px-5 h-[52px] flex items-center justify-between">

      {/* Left: logo + wordmark */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-brand rounded-[6px] flex items-center justify-center flex-shrink-0">
          <span className="text-white font-mono text-[13px] font-medium select-none">S</span>
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-[14px] font-medium text-primary leading-none mb-[3px]">Stripe RAG</p>
          <p className="text-[11px] text-tertiary leading-none">Retrieval playground</p>
        </div>
      </div>

      {/* Center: segmented tab control */}
      <div className="bg-black/[0.05] border border-black/10 rounded-[8px] p-[3px] flex gap-[2px]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`
              px-4 py-1.5 rounded-[6px] text-[13px]
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-brand/30 focus:ring-offset-0
              ${activeTab === id
                ? 'bg-surface text-primary tab-active'
                : 'text-tertiary hover:text-secondary'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right: status indicator */}
      <div className="flex items-center gap-1.5">
        <div className="w-[6px] h-[6px] rounded-full bg-success-default flex-shrink-0" />
        <span className="font-mono text-[11px] text-tertiary">
          {chunkCount} chunks indexed
        </span>
      </div>

    </div>
  )
}

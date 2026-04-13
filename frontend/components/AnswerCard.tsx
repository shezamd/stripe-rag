import type { QueryResult } from '@/lib/api'
import type { Components } from 'react-markdown'
import StatusPill from './StatusPill'
import CodeBlock   from './CodeBlock'
import ChunkRow    from './ChunkRow'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function fmtLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

const mdComponents: Components = {
  h2: ({ children }) => (
    <h2 className="text-[15px] font-semibold text-primary mt-5 mb-2 pb-1.5 border-b border-black/[0.07] first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13px] font-semibold text-primary mt-4 mb-1.5 first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-[14px] text-primary leading-[1.7] mb-3 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 last:mb-0 flex flex-col gap-1 pl-4">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 last:mb-0 flex flex-col gap-1 pl-4 list-decimal">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-[14px] text-primary leading-[1.65] before:content-['·'] before:mr-2 before:text-tertiary">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-primary">{children}</strong>
  ),
  code: ({ children, className }) => {
    // block code — handled by `pre`
    if (className) return <code className={className}>{children}</code>
    // inline code
    return (
      <code className="font-mono text-[12.5px] bg-black/[0.06] text-primary px-1.5 py-0.5 rounded-[4px]">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-[#0A0A0F] rounded-[8px] px-4 py-3.5 overflow-x-auto mb-3 last:mb-0">
      <code className="font-mono text-[12px] text-[#B5D4F4] leading-relaxed whitespace-pre">
        {/* strip wrapping <code> element text */}
        {(children as React.ReactElement)?.props?.children}
      </code>
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3 last:mb-0 rounded-[8px] border border-black/[0.08]">
      <table className="w-full text-[13px] border-collapse">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-canvas border-b border-black/[0.08]">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-black/[0.05]">
      {children}
    </tbody>
  ),
  th: ({ children }) => (
    <th className="text-left px-3.5 py-2.5 text-[11px] font-semibold text-secondary uppercase tracking-[0.4px] whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3.5 py-2.5 text-primary align-top">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-canvas/60 transition-colors">
      {children}
    </tr>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-brand/40 pl-3 text-secondary italic mb-3 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-black/[0.07] my-4" />,
}

function confidenceLevel(result: QueryResult) {
  const topScore = result.chunks[0]?.score ?? 0
  const threshold = result.metrics.threshold
  const above = result.metrics.chunksAboveThreshold
  if (topScore >= threshold && above >= 2) return { label: 'High confidence', variant: 'GROUNDED' as const }
  if (topScore >= threshold && above >= 1) return { label: 'Medium confidence', variant: 'DEPRECATED' as const }
  return { label: 'Low confidence', variant: 'DESTRUCTIVE' as const }
}

export default function AnswerCard({ result }: { result: QueryResult }) {
  const { answerText, methods, chunks, latency } = result
  const citedCount = chunks.length
  const confidence = confidenceLevel(result)

  return (
    <div className="bg-surface border-hairline rounded-xl overflow-hidden">

      {/* ── Header strip ── */}
      <div className="
        bg-canvas border-b border-black/[0.07]
        px-4 py-2.5 flex items-center justify-between
      ">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.5px] text-tertiary">Answer</span>
          <StatusPill
            variant="GROUNDED"
            label={`GROUNDED · ${citedCount}/${citedCount} citations`}
          />
          <StatusPill
            variant={confidence.variant}
            label={confidence.label}
          />
        </div>
        <div className="font-mono text-[10px] text-tertiary">
          {fmtLatency(latency.retrievalMs)} retrieval
          <span className="mx-1.5 opacity-40">·</span>
          {fmtLatency(latency.generationMs)} generation
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-4 flex flex-col gap-4">

        {/* Answer prose */}
        <div>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {answerText}
          </ReactMarkdown>
        </div>

        {/* Methods */}
        {methods.map(method => (
          <div key={method.number} className="flex flex-col gap-2">
            {/* Method header */}
            <div className="flex items-center gap-2">
              {/* Number badge */}
              <div className="
                w-[18px] h-[18px] bg-purple-bg rounded-[4px]
                flex items-center justify-center flex-shrink-0
              ">
                <span className="font-mono text-[11px] text-purple-fg font-medium leading-none">
                  {method.number}
                </span>
              </div>
              <span className="text-[13px] font-medium text-primary">{method.title}</span>
              {method.status && <StatusPill variant={method.status} />}
            </div>
            {/* Code block */}
            <CodeBlock verb={method.code.verb} path={method.code.path} body={method.code.body} />
          </div>
        ))}

        {/* ── Retrieved chunks ── */}
        <div className="border-t border-black/[0.07] pt-4 -mx-4 px-4">
          <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary mb-2">
            Retrieved Chunks
          </p>
          <div className="flex flex-col">
            {chunks.map(chunk => (
              <ChunkRow key={chunk.id} {...chunk} />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
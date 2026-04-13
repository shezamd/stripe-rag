'use client'

import { useState } from 'react'
import type { QueryResult } from '@/lib/api'

function scoreColor(score: number) {
  if (score >= 0.75) return '#1D9E75'
  if (score >= 0.5)  return '#BA7517'
  return '#A32D2D'
}

function scoreBg(score: number) {
  if (score >= 0.75) return 'bg-success-bg text-success-fg'
  if (score >= 0.5)  return 'bg-warning-bg text-warning-fg'
  return 'bg-danger-bg text-danger-fg'
}

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

// Rough cost estimate based on Claude Haiku 4.5 pricing ($0.80/M input, $4/M output)
function estimateCost(input: number, output: number) {
  const cost = (input / 1_000_000) * 0.80 + (output / 1_000_000) * 4
  return cost < 0.01 ? `<$0.01` : `$${cost.toFixed(3)}`
}

export default function InspectorPanel({ result }: { result: QueryResult }) {
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set())
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showUserPrompt, setShowUserPrompt] = useState(false)

  const toggleChunk = (id: number) => {
    setExpandedChunks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const inspectorChunks = result.inspectorChunks ?? []
  const diagnostics = result.diagnostics ?? []
  const tokenUsage = result.tokenUsage
  const assembledPrompt = result.assembledPrompt
  const embeddingMs = result.latency.embeddingMs ?? 0
  const searchMs = result.latency.searchMs ?? 0
  const generationMs = result.latency.generationMs
  const totalMs = embeddingMs + searchMs + generationMs
  const scores = inspectorChunks.map(c => c.score)
  const maxScore = scores.length ? Math.max(...scores) : 0

  return (
    <div className="flex flex-col gap-4">

      {/* ── Query header ── */}
      <div className="bg-surface border-hairline rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary mb-2">Query</p>
        <p className="text-[16px] font-medium text-primary leading-snug">{result.question}</p>
        <div className="flex items-center gap-3 mt-3">
          <span className="font-mono text-[11px] bg-canvas px-2 py-1 rounded-[4px] text-secondary">
            k={result.k}
          </span>
          {embeddingMs > 0 && (
            <span className="font-mono text-[11px] bg-canvas px-2 py-1 rounded-[4px] text-secondary">
              embedding: {fmtMs(embeddingMs)}
            </span>
          )}
          <span className="font-mono text-[11px] bg-canvas px-2 py-1 rounded-[4px] text-secondary">
            total: {fmtMs(totalMs)}
          </span>
        </div>
      </div>

      {/* ── Diagnostics ── */}
      {diagnostics.length > 0 && (
        <div className="flex flex-col gap-2">
          {diagnostics.map((d, i) => (
            <div
              key={i}
              className={`
                rounded-[8px] px-3.5 py-2.5 text-[12px] leading-[1.5]
                ${d.type === 'warning'
                  ? 'bg-warning-bg text-warning-fg'
                  : 'bg-purple-bg text-purple-fg'}
              `}
            >
              <span className="font-medium uppercase text-[10px] tracking-[0.5px] mr-2">
                {d.type === 'warning' ? 'Warning' : 'Info'}
              </span>
              {d.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Score distribution ── */}
      {scores.length > 0 && (
        <div className="bg-surface border-hairline rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary mb-3">
            Score Distribution
          </p>
          <div className="flex flex-col gap-2">
            {inspectorChunks.map(chunk => (
              <div key={chunk.id} className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-tertiary w-5 flex-shrink-0 text-right">
                  #{chunk.id}
                </span>
                <div className="flex-1 h-[20px] bg-canvas rounded-[4px] overflow-hidden relative">
                  <div
                    className="h-full rounded-[4px] transition-all duration-500"
                    style={{
                      width: `${(chunk.score / Math.max(maxScore, 1)) * 100}%`,
                      backgroundColor: scoreColor(chunk.score),
                      opacity: 0.8,
                    }}
                  />
                  {/* Threshold line */}
                  <div
                    className="absolute top-0 bottom-0 w-[1px] bg-black/20"
                    style={{ left: `${(result.metrics.threshold / Math.max(maxScore, 1)) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[12px] flex-shrink-0 w-10 text-right" style={{ color: scoreColor(chunk.score) }}>
                  {chunk.score.toFixed(2)}
                </span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[3px] flex-shrink-0 ${scoreBg(chunk.score)}`}>
                  {chunk.aboveThreshold ? 'PASS' : 'BELOW'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[10px] text-tertiary">
            <div className="w-[12px] h-[1px] bg-black/20" />
            <span>threshold = {result.metrics.threshold}</span>
          </div>
        </div>
      )}

      {/* ── Retrieved chunks ── */}
      {inspectorChunks.length > 0 && (
        <div className="bg-surface border-hairline rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-black/[0.07] bg-canvas">
            <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">
              Retrieved Chunks ({inspectorChunks.length})
            </p>
          </div>
          <div className="divide-y divide-black/[0.04]">
            {inspectorChunks.map(chunk => (
              <div key={chunk.id}>
                <button
                  onClick={() => toggleChunk(chunk.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas/50 transition-colors text-left"
                >
                  <span className="text-[10px] text-tertiary flex-shrink-0">
                    {expandedChunks.has(chunk.id) ? '▼' : '▶'}
                  </span>
                  <span className="font-mono text-[11px] text-tertiary w-5 flex-shrink-0">
                    #{chunk.id}
                  </span>
                  <span className="flex-1 text-[12px] text-secondary truncate min-w-0">
                    {chunk.source}
                    <span className="text-tertiary mx-1">·</span>
                    {chunk.section}
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[3px] flex-shrink-0 ${scoreBg(chunk.score)}`}>
                    {chunk.score.toFixed(3)}
                  </span>
                </button>
                {expandedChunks.has(chunk.id) && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="bg-canvas rounded-[8px] p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-tertiary">Source:</span>
                        <a
                          href={chunk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-brand hover:underline truncate"
                        >
                          {chunk.url}
                        </a>
                        <span className="text-[10px] text-tertiary ml-auto flex-shrink-0">
                          chunk idx: {chunk.chunkIndex}
                        </span>
                      </div>
                      <p className="text-[12px] text-secondary leading-[1.7] font-mono whitespace-pre-wrap">
                        {chunk.text}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Assembled prompt ── */}
      {assembledPrompt && (
        <div className="bg-surface border-hairline rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-black/[0.07] bg-canvas">
            <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">
              Assembled Prompt
            </p>
          </div>
          <div className="divide-y divide-black/[0.04]">
            {/* System prompt */}
            <div>
              <button
                onClick={() => setShowSystemPrompt(p => !p)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-canvas/50 transition-colors text-left"
              >
                <span className="text-[10px] text-tertiary flex-shrink-0">
                  {showSystemPrompt ? '▼' : '▶'}
                </span>
                <span className="text-[12px] font-medium text-secondary">System Prompt</span>
                <span className="font-mono text-[10px] text-tertiary ml-auto">
                  {assembledPrompt.system.length} chars
                </span>
              </button>
              {showSystemPrompt && (
                <div className="px-4 pb-3">
                  <div className="bg-code-bg rounded-[8px] p-3 overflow-x-auto">
                    <pre className="text-[11px] text-code-path font-mono leading-[1.6] whitespace-pre-wrap">
                      {assembledPrompt.system}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            {/* User prompt */}
            <div>
              <button
                onClick={() => setShowUserPrompt(p => !p)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-canvas/50 transition-colors text-left"
              >
                <span className="text-[10px] text-tertiary flex-shrink-0">
                  {showUserPrompt ? '▼' : '▶'}
                </span>
                <span className="text-[12px] font-medium text-secondary">User Prompt (with context)</span>
                <span className="font-mono text-[10px] text-tertiary ml-auto">
                  {assembledPrompt.user.length} chars
                </span>
              </button>
              {showUserPrompt && (
                <div className="px-4 pb-3">
                  <div className="bg-code-bg rounded-[8px] p-3 overflow-x-auto max-h-[500px] overflow-y-auto">
                    <pre className="text-[11px] text-code-path font-mono leading-[1.6] whitespace-pre-wrap">
                      {assembledPrompt.user}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Timing breakdown ── */}
      <div className="bg-surface border-hairline rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary mb-3">
          Timing Breakdown
        </p>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Embedding', ms: embeddingMs, color: '#635BFF' },
            { label: 'Search', ms: searchMs, color: '#1D9E75' },
            { label: 'Generation', ms: generationMs, color: '#BA7517' },
          ].map(stage => (
            <div key={stage.label} className="flex items-center gap-3">
              <span className="text-[12px] text-secondary w-[80px] flex-shrink-0">{stage.label}</span>
              <div className="flex-1 h-[16px] bg-canvas rounded-[4px] overflow-hidden">
                <div
                  className="h-full rounded-[4px] transition-all duration-500"
                  style={{
                    width: totalMs > 0 ? `${Math.max((stage.ms / totalMs) * 100, 2)}%` : '0%',
                    backgroundColor: stage.color,
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="font-mono text-[12px] text-primary w-[60px] text-right flex-shrink-0">
                {fmtMs(stage.ms)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-black/[0.06] pt-2 mt-1">
            <span className="text-[12px] text-tertiary">Total</span>
            <span className="font-mono text-[12px] text-secondary">{fmtMs(totalMs)}</span>
          </div>
        </div>
      </div>

      {/* ── Token usage ── */}
      {tokenUsage && (
        <div className="bg-surface border-hairline rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary mb-3">
            Token Usage
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-canvas rounded-[8px] px-3 py-2.5 text-center">
              <p className="text-[10px] text-tertiary mb-1">Input</p>
              <p className="font-mono text-[18px] font-medium text-primary">
                {tokenUsage.inputTokens.toLocaleString()}
              </p>
            </div>
            <div className="bg-canvas rounded-[8px] px-3 py-2.5 text-center">
              <p className="text-[10px] text-tertiary mb-1">Output</p>
              <p className="font-mono text-[18px] font-medium text-primary">
                {tokenUsage.outputTokens.toLocaleString()}
              </p>
            </div>
            <div className="bg-canvas rounded-[8px] px-3 py-2.5 text-center">
              <p className="text-[10px] text-tertiary mb-1">Est. Cost</p>
              <p className="font-mono text-[18px] font-medium text-primary">
                {estimateCost(tokenUsage.inputTokens, tokenUsage.outputTokens)}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

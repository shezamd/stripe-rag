'use client'

import { useState, useEffect, useCallback } from 'react'
import TopBar from '@/components/TopBar'
import QueryCard from '@/components/QueryCard'
import AnswerCard from '@/components/AnswerCard'
import MetricCard from '@/components/MetricCard'
import PipelineCard from '@/components/PipelineCard'
import InspectorPanel from '@/components/InspectorPanel'
import { MOCK_RESULT, CHUNK_COUNT } from '@/lib/mock'
import {
  queryAPI,
  evaluateAPI,
  corpusAPI,
  type QueryResult,
  type EvaluateResult,
  type EvaluateRequest,
  type CorpusResult,
} from '@/lib/api'

type Tab = 'ask' | 'evaluate' | 'corpus' | 'inspector'

export default function Home() {
  const [activeTab, setActiveTab]   = useState<Tab>('ask')
  const [question, setQuestion]     = useState('')
  const [k, setK]                   = useState(3)
  const [result, setResult]         = useState<QueryResult | null>(null)
  const [loading, setLoading]       = useState(false)

  // ── Evaluate state ────────────────────────────────────────────────────────
  const [evalConfig, setEvalConfig] = useState<EvaluateRequest>({
    k_values: [1, 3, 5],
    score_faithfulness: true,
    n_questions: 5,
  })
  const [evalResult, setEvalResult] = useState<EvaluateResult | null>(null)
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalError, setEvalError]   = useState<string | null>(null)

  // ── Corpus state ──────────────────────────────────────────────────────────
  const [corpusData, setCorpusData]   = useState<CorpusResult | null>(null)
  const [corpusLoading, setCorpusLoading] = useState(false)
  const [corpusSearch, setCorpusSearch]   = useState('')
  const [corpusError, setCorpusError]     = useState<string | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSubmit = async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim()
    if (!q || loading) return
    if (overrideQuestion) setQuestion(overrideQuestion)
    setLoading(true)
    try {
      const data = await queryAPI({ question: q, k })
      setResult(data)
    } catch {
      setResult({ ...MOCK_RESULT, question: q, k })
    } finally {
      setLoading(false)
    }
  }

  const handleRunEval = async () => {
    setEvalLoading(true)
    setEvalError(null)
    try {
      const data = await evaluateAPI(evalConfig)
      setEvalResult(data)
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : 'Evaluation failed')
    } finally {
      setEvalLoading(false)
    }
  }

  const fetchCorpus = useCallback(async (search: string) => {
    setCorpusLoading(true)
    setCorpusError(null)
    try {
      const data = await corpusAPI(search)
      setCorpusData(data)
    } catch (e) {
      setCorpusError(e instanceof Error ? e.message : 'Failed to load corpus')
    } finally {
      setCorpusLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'corpus' && !corpusData) {
      fetchCorpus('')
    }
  }, [activeTab, corpusData, fetchCorpus])

  const handleCorpusSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCorpus(corpusSearch)
  }

  // ── K-values toggle helper ─────────────────────────────────────────────────
  const toggleKValue = (v: number) => {
    setEvalConfig(prev => ({
      ...prev,
      k_values: prev.k_values.includes(v)
        ? prev.k_values.filter(x => x !== v)
        : [...prev.k_values, v].sort((a, b) => a - b),
    }))
  }

  // Extract k_values from eval result for display
  const evalKVals = evalResult
    ? Array.from(new Set(
        Object.keys(evalResult.aggregated)
          .filter(k => k.startsWith('mean_precision@'))
          .map(k => parseInt(k.split('@')[1]))
      )).sort((a, b) => a - b)
    : []

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar activeTab={activeTab} onTabChange={setActiveTab} chunkCount={CHUNK_COUNT} />

      <div className="mx-auto max-w-[1100px] px-5 py-5 flex gap-5 items-start">

        {/* ── Main column ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Ask tab */}
          {activeTab === 'ask' && (
            <>
              <QueryCard
                question={question}
                k={k}
                loading={loading}
                onQuestionChange={setQuestion}
                onKChange={setK}
                onSubmit={handleSubmit}
              />
              {result && <AnswerCard result={result} />}
            </>
          )}

          {/* Inspector tab */}
          {activeTab === 'inspector' && (
            result
              ? <InspectorPanel result={result} />
              : <div className="bg-surface border-hairline rounded-xl p-8 text-center text-[13px] text-tertiary">
                  Run a query on the Ask tab first, then come back here to inspect the retrieval pipeline.
                </div>
          )}

          {/* Evaluate tab */}
          {activeTab === 'evaluate' && (
            <div className="flex flex-col gap-4">

              {/* Config card */}
              <div className="bg-surface border-hairline rounded-xl p-4 flex flex-col gap-4">
                <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">Evaluation Config</p>

                {/* k values */}
                <div>
                  <p className="text-[12px] text-secondary mb-2">k values</p>
                  <div className="flex gap-2">
                    {[1, 3, 5, 10].map(v => (
                      <button
                        key={v}
                        onClick={() => toggleKValue(v)}
                        className={`
                          font-mono text-[12px] px-3 py-1 rounded-[6px] border transition-colors
                          ${evalConfig.k_values.includes(v)
                            ? 'bg-brand text-white border-brand'
                            : 'bg-canvas text-secondary border-black/[0.1] hover:border-brand/50'}
                        `}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generation metrics toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evalConfig.score_faithfulness}
                    onChange={e => setEvalConfig(p => ({ ...p, score_faithfulness: e.target.checked }))}
                    className="accent-brand"
                  />
                  <span className="text-[12px] text-secondary">Score generation metrics (adds API calls)</span>
                </label>

                {/* n_questions */}
                <div>
                  <p className="text-[12px] text-secondary mb-1">
                    Questions: <span className="font-mono text-primary">{evalConfig.n_questions}</span>
                  </p>
                  <input
                    type="range"
                    min={1} max={20}
                    value={evalConfig.n_questions}
                    onChange={e => setEvalConfig(p => ({ ...p, n_questions: parseInt(e.target.value) }))}
                    className="w-full accent-brand"
                  />
                </div>

                <button
                  onClick={handleRunEval}
                  disabled={evalLoading || evalConfig.k_values.length === 0}
                  className="
                    bg-brand text-white text-[13px] font-medium
                    px-4 py-2 rounded-[8px] self-start
                    hover:opacity-90 disabled:opacity-40 transition-opacity
                  "
                >
                  {evalLoading ? 'Running…' : '▶ Run Evaluation'}
                </button>

                {evalError && (
                  <p className="text-[12px] text-danger-fg bg-danger-bg rounded-[6px] px-3 py-2">
                    {evalError}
                  </p>
                )}
              </div>

              {/* Results */}
              {evalResult && (
                <>
                  {/* Aggregate metrics */}
                  <div className="bg-surface border-hairline rounded-xl p-4 flex flex-col gap-4">
                    <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">
                      Aggregate Metrics — {evalResult.num_questions} questions
                    </p>

                    {/* Context Metrics group */}
                    <div>
                      <p className="text-[11px] font-medium text-secondary mb-2">Context Metrics</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {evalKVals.map(kv => (
                          <div key={kv} className="contents">
                            <div className="bg-canvas rounded-[8px] px-3 py-2.5">
                              <p className="text-[11px] text-tertiary mb-1">Context Precision@{kv}</p>
                              <p className="font-mono text-[18px] font-medium text-primary">
                                {((evalResult.aggregated[`mean_precision@${kv}`] ?? 0) as number).toFixed(3)}
                              </p>
                            </div>
                            <div className="bg-canvas rounded-[8px] px-3 py-2.5">
                              <p className="text-[11px] text-tertiary mb-1">Context Recall@{kv}</p>
                              <p className="font-mono text-[18px] font-medium text-primary">
                                {((evalResult.aggregated[`mean_recall@${kv}`] ?? 0) as number).toFixed(3)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Generation Metrics group */}
                    {(evalResult.aggregated.mean_faithfulness != null ||
                      evalResult.aggregated.mean_answer_relevance != null ||
                      evalResult.aggregated.mean_answer_correctness != null) && (
                      <div>
                        <p className="text-[11px] font-medium text-secondary mb-2">Generation Metrics</p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {evalResult.aggregated.mean_faithfulness != null && (
                            <div className="bg-canvas rounded-[8px] px-3 py-2.5">
                              <p className="text-[11px] text-tertiary mb-1">Faithfulness</p>
                              <p className="font-mono text-[18px] font-medium text-primary">
                                {(evalResult.aggregated.mean_faithfulness as number).toFixed(3)}
                              </p>
                            </div>
                          )}
                          {evalResult.aggregated.mean_answer_relevance != null && (
                            <div className="bg-canvas rounded-[8px] px-3 py-2.5">
                              <p className="text-[11px] text-tertiary mb-1">Answer Relevance</p>
                              <p className="font-mono text-[18px] font-medium text-primary">
                                {(evalResult.aggregated.mean_answer_relevance as number).toFixed(3)}
                              </p>
                            </div>
                          )}
                          {evalResult.aggregated.mean_answer_correctness != null && (
                            <div className="bg-canvas rounded-[8px] px-3 py-2.5">
                              <p className="text-[11px] text-tertiary mb-1">Answer Correctness</p>
                              <p className="font-mono text-[18px] font-medium text-primary">
                                {(evalResult.aggregated.mean_answer_correctness as number).toFixed(3)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Per-question table */}
                  <div className="bg-surface border-hairline rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-black/[0.07] bg-canvas">
                      <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">Per-Question Results</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          {/* Group header row */}
                          <tr className="border-b border-black/[0.04]">
                            <th colSpan={3} />
                            <th
                              colSpan={evalKVals.length * 2}
                              className="px-3 py-1 text-[10px] uppercase tracking-[0.5px] text-brand/70 font-medium text-center border-l border-black/[0.06]"
                            >
                              Context Metrics
                            </th>
                            {evalResult.per_question[0]?.faithfulness_score != null && (
                              <th
                                colSpan={3}
                                className="px-3 py-1 text-[10px] uppercase tracking-[0.5px] text-purple-500/70 font-medium text-center border-l border-black/[0.06]"
                              >
                                Generation Metrics
                              </th>
                            )}
                          </tr>
                          <tr className="border-b border-black/[0.07]">
                            <th className="text-left px-4 py-2 text-tertiary font-normal">ID</th>
                            <th className="text-left px-4 py-2 text-tertiary font-normal">Category</th>
                            <th className="text-left px-4 py-2 text-tertiary font-normal">Question</th>
                            {evalKVals.map(kv => (
                              <th key={`p-${kv}`} className="text-right px-3 py-2 text-tertiary font-normal whitespace-nowrap border-l border-black/[0.06]">
                                Prec@{kv}
                              </th>
                            ))}
                            {evalKVals.map(kv => (
                              <th key={`r-${kv}`} className="text-right px-3 py-2 text-tertiary font-normal whitespace-nowrap">
                                Rec@{kv}
                              </th>
                            ))}
                            {evalResult.per_question[0]?.faithfulness_score != null && (
                              <>
                                <th className="text-right px-3 py-2 text-tertiary font-normal whitespace-nowrap border-l border-black/[0.06]">Faith.</th>
                                <th className="text-right px-3 py-2 text-tertiary font-normal whitespace-nowrap">Ans. Rel.</th>
                                <th className="text-right px-3 py-2 text-tertiary font-normal whitespace-nowrap">Ans. Corr.</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {evalResult.per_question.map(row => (
                            <tr key={row.question_id} className="border-b border-black/[0.04] hover:bg-canvas/50">
                              <td className="px-4 py-2 font-mono text-tertiary">{row.question_id}</td>
                              <td className="px-4 py-2 text-secondary">{row.category}</td>
                              <td className="px-4 py-2 text-primary max-w-[240px] truncate">{row.question}</td>
                              {evalKVals.map((kv, i) => (
                                <td key={`p-${kv}`} className={`px-3 py-2 font-mono text-right text-secondary${i === 0 ? ' border-l border-black/[0.06]' : ''}`}>
                                  {((row[`precision@${kv}`] as number) ?? 0).toFixed(2)}
                                </td>
                              ))}
                              {evalKVals.map(kv => (
                                <td key={`r-${kv}`} className="px-3 py-2 font-mono text-right text-secondary">
                                  {((row[`recall@${kv}`] as number) ?? 0).toFixed(2)}
                                </td>
                              ))}
                              {row.faithfulness_score != null && (
                                <>
                                  <td className="px-3 py-2 font-mono text-right text-secondary border-l border-black/[0.06]">
                                    {row.faithfulness_score.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-right text-secondary">
                                    {row.answer_relevance_score != null ? row.answer_relevance_score.toFixed(2) : '—'}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-right text-secondary">
                                    {row.answer_correctness_score != null ? row.answer_correctness_score.toFixed(2) : '—'}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Corpus tab */}
          {activeTab === 'corpus' && (
            <div className="flex flex-col gap-4">

              {/* Stats */}
              {corpusData && (
                <div className="bg-surface border-hairline rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-[11px] uppercase tracking-[0.5px] text-tertiary">Total chunks</span>
                  <span className="font-mono text-[20px] font-medium text-primary">{corpusData.total}</span>
                </div>
              )}

              {/* Source breakdown */}
              {corpusData && corpusData.sources.length > 0 && (
                <div className="bg-surface border-hairline rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-black/[0.07] bg-canvas">
                    <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">
                      Sources ({corpusData.sources.length})
                    </p>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {corpusData.sources.slice(0, 30).map(s => {
                      const maxChunks = corpusData.sources[0]?.chunks ?? 1
                      const pct = (s.chunks / maxChunks) * 100
                      const slug = s.url.replace(/\/$/, '').split('/').slice(-2).join('/')
                      return (
                        <div key={s.url} className="flex items-center gap-3 px-4 py-2 border-b border-black/[0.04] last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-secondary truncate" title={s.url}>{slug || s.url}</p>
                            <div className="mt-1 h-[2px] bg-black/[0.06] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="font-mono text-[11px] text-tertiary flex-shrink-0">{s.chunks}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Chunk browser */}
              <div className="bg-surface border-hairline rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-black/[0.07] bg-canvas flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">Browse Chunks</p>
                  <form onSubmit={handleCorpusSearch} className="flex gap-2">
                    <input
                      type="text"
                      value={corpusSearch}
                      onChange={e => setCorpusSearch(e.target.value)}
                      placeholder="Search chunk text…"
                      className="
                        text-[12px] bg-canvas border border-black/[0.1] rounded-[6px]
                        px-3 py-1.5 w-[220px] text-primary placeholder:text-tertiary
                        focus:outline-none focus:border-brand/50
                      "
                    />
                    <button
                      type="submit"
                      className="text-[12px] bg-brand text-white px-3 py-1.5 rounded-[6px] hover:opacity-90"
                    >
                      Search
                    </button>
                  </form>
                </div>

                {corpusLoading && (
                  <div className="px-4 py-8 text-center text-[12px] text-tertiary">Loading…</div>
                )}
                {corpusError && (
                  <div className="px-4 py-4 text-[12px] text-danger-fg">{corpusError}</div>
                )}

                {!corpusLoading && corpusData && (
                  <div className="divide-y divide-black/[0.04]">
                    {corpusData.chunks.length === 0 && (
                      <p className="px-4 py-6 text-[12px] text-tertiary text-center">No chunks found.</p>
                    )}
                    {corpusData.chunks.map(chunk => (
                      <details key={chunk.id} className="group">
                        <summary className="
                          flex items-center gap-3 px-4 py-2.5 cursor-pointer
                          hover:bg-canvas list-none
                        ">
                          <span className="text-[10px] text-tertiary font-mono flex-shrink-0">▶</span>
                          <span className="flex-1 text-[12px] text-primary truncate">
                            {chunk.title || chunk.url.split('/').slice(-2).join('/')}
                          </span>
                          <span className="text-[11px] text-tertiary font-mono flex-shrink-0">
                            idx {chunk.chunk_index}
                          </span>
                        </summary>
                        <div className="px-4 pb-3 pt-1">
                          <p className="text-[11px] text-tertiary mb-1 truncate">{chunk.url}</p>
                          <p className="text-[12px] text-secondary leading-[1.6] font-mono whitespace-pre-wrap">
                            {chunk.text}
                          </p>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ── Right sidebar ── */}
        <div className="w-[240px] flex-shrink-0 flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-[0.5px] text-tertiary">
            Runtime Signals
          </p>

          {result ? (
            <>
              {/* Retrieval confidence — derived from top score + chunks above threshold */}
              {(() => {
                const { chunksAboveThreshold, threshold, k } = result.metrics
                const topScore = result.chunks[0]?.score ?? 0
                const isHigh = topScore >= threshold && chunksAboveThreshold >= 2
                const isMed  = topScore >= threshold && chunksAboveThreshold >= 1
                const level  = isHigh ? 'High' : isMed ? 'Medium' : 'Low'
                const color  = isHigh ? 'bg-success-bg text-success-fg' : isMed ? 'bg-warning-bg text-warning-fg' : 'bg-danger-bg text-danger-fg'
                return (
                  <div className="bg-surface border-hairline rounded-[8px] px-3.5 py-3">
                    <p className="text-[11px] text-tertiary mb-2">Retrieval Confidence</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full leading-none ${color}`}>
                        {level}
                      </span>
                    </div>
                    <p className="text-[11px] text-tertiary leading-[1.5]">
                      {isHigh
                        ? `Top score ${topScore.toFixed(2)} with ${chunksAboveThreshold}/${k} chunks above ${threshold} — coherent relevant cluster.`
                        : isMed
                        ? `Top score ${topScore.toFixed(2)} but only ${chunksAboveThreshold}/${k} chunk${chunksAboveThreshold > 1 ? 's' : ''} above ${threshold} — limited supporting context.`
                        : `Top score ${topScore.toFixed(2)} is below ${threshold} — no chunks passed relevance threshold.`}
                    </p>
                  </div>
                )
              })()}

              <MetricCard label={`Avg Similarity@${result.metrics.k}`} value={result.metrics.meanSimilarity} />

              {/* Score consistency — interprets spread relative to absolute scores */}
              {(() => {
                const { meanSimilarity, scoreSpread } = result.metrics
                const tightAtHigh = scoreSpread < 0.1 && meanSimilarity >= 0.7
                const tightAtLow  = scoreSpread < 0.1 && meanSimilarity < 0.7
                const label = tightAtHigh ? 'Consistent (strong)' : tightAtLow ? 'Consistent (weak)' : scoreSpread > 0.25 ? 'Wide spread' : 'Moderate spread'
                const barColor = tightAtHigh ? 'bg-success-default' : tightAtLow ? 'bg-danger-fg' : scoreSpread > 0.25 ? 'bg-warning-fg' : 'bg-brand'
                return (
                  <div className="bg-surface border-hairline rounded-[8px] px-3.5 py-3">
                    <p className="text-[11px] text-tertiary mb-2">Score Spread</p>
                    <p className="font-mono text-[20px] font-medium text-primary leading-none mb-1">
                      {scoreSpread.toFixed(3)}
                    </p>
                    <p className="text-[10px] text-secondary mb-2">{label}</p>
                    <div className="h-[3px] bg-black/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(scoreSpread * 200, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })()}

              {/* Chunks above threshold */}
              <div className="bg-surface border-hairline rounded-[8px] px-3.5 py-3">
                <p className="text-[11px] text-tertiary mb-2">
                  Chunks ≥ {result.metrics.threshold}
                </p>
                <p className="font-mono text-[20px] font-medium text-primary leading-none mb-3">
                  {result.metrics.chunksAboveThreshold}
                  <span className="text-[13px] text-tertiary font-normal"> / {result.metrics.k}</span>
                </p>
                <div className="h-[3px] bg-black/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success-default rounded-full transition-all duration-500"
                    style={{ width: `${(result.metrics.chunksAboveThreshold / result.metrics.k) * 100}%` }}
                  />
                </div>
              </div>

              {/* Timing */}
              <div className="bg-surface border-hairline rounded-[8px] px-3.5 py-3 flex flex-col gap-1.5">
                <p className="text-[11px] text-tertiary mb-1">Latency</p>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-secondary">Retrieval</span>
                  <span className="font-mono text-[12px] text-primary">{result.latency.retrievalMs}ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-secondary">Generation</span>
                  <span className="font-mono text-[12px] text-primary">{result.latency.generationMs}ms</span>
                </div>
                <div className="flex items-center justify-between border-t border-black/[0.06] pt-1.5 mt-0.5">
                  <span className="text-[12px] text-tertiary">Total</span>
                  <span className="font-mono text-[12px] text-secondary">
                    {result.latency.retrievalMs + result.latency.generationMs}ms
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-surface border-hairline rounded-[8px] p-4 text-[12px] text-tertiary">
              Run a query to see signals.
            </div>
          )}

          <PipelineCard model="haiku-4.5" embeddings="MiniLM-L6" store="ChromaDB" />
        </div>

      </div>
    </div>
  )
}

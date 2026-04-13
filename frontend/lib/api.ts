export interface CodeSnippet {
  verb: string
  path: string
  body: string | null
}

export interface Method {
  number: number
  title: string
  status: 'DESTRUCTIVE' | 'RECOMMENDED' | 'DEPRECATED' | null
  code: CodeSnippet
}

export interface Chunk {
  id: number
  source: string
  section: string
  score: number
}

export interface InspectorChunk {
  id: number
  text: string
  source: string
  section: string
  url: string
  chunkIndex: number
  score: number
  aboveThreshold: boolean
}

export interface Diagnostic {
  type: 'warning' | 'info'
  message: string
}

export interface QueryResult {
  question: string
  k: number
  answerText: string
  methods: Method[]
  chunks: Chunk[]
  metrics: {
    meanSimilarity: number
    scoreSpread: number
    chunksAboveThreshold: number
    threshold: number
    k: number
  }
  latency: {
    retrievalMs: number
    embeddingMs?: number
    searchMs?: number
    generationMs: number
  }
  inspectorChunks?: InspectorChunk[]
  assembledPrompt?: { system: string; user: string }
  tokenUsage?: { inputTokens: number; outputTokens: number }
  diagnostics?: Diagnostic[]
}

export interface QueryRequest {
  question: string
  k: number
}

export async function queryAPI(req: QueryRequest): Promise<QueryResult> {
  const res = await fetch('http://localhost:8000/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ── Evaluate ──────────────────────────────────────────────────────────────────

export interface EvaluateRequest {
  k_values: number[]
  score_faithfulness: boolean
  n_questions: number
}

export interface PerQuestionResult {
  question_id: string
  question: string
  category: string
  generated_answer: string
  ground_truth: string
  faithfulness_score: number | null
  faithfulness_explanation?: string
  answer_relevance_score: number | null
  answer_relevance_explanation?: string
  answer_correctness_score: number | null
  answer_correctness_explanation?: string
  [key: string]: unknown // precision@k, recall@k etc.
}

export interface EvaluateResult {
  aggregated: Record<string, number | null>
  per_question: PerQuestionResult[]
  num_questions: number
}

export async function evaluateAPI(req: EvaluateRequest): Promise<EvaluateResult> {
  const res = await fetch('http://localhost:8000/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ── Corpus ────────────────────────────────────────────────────────────────────

export interface CorpusChunk {
  id: string
  text: string
  url: string
  title: string
  chunk_index: number
}

export interface CorpusResult {
  total: number
  sources: Array<{ url: string; chunks: number }>
  chunks: CorpusChunk[]
}

export async function corpusAPI(search = ''): Promise<CorpusResult> {
  const url = new URL('http://localhost:8000/api/corpus')
  if (search) url.searchParams.set('search', search)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

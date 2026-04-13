'use client'

import { useState } from 'react'

const VERB_COLOR: Record<string, string> = {
  DELETE: '#A78BFA',
  GET:    '#4DC77A',
  POST:   '#4DC77A',
  PUT:    '#EF9F27',
  PATCH:  '#EF9F27',
}

interface CodeBlockProps {
  verb: string
  path: string
  body: string | null
}

function parseBody(raw: string): { key: string; value: string } | null {
  const m = raw.match(/^(.+?):\s*(.+)$/)
  return m ? { key: m[1], value: m[2] } : null
}

export default function CodeBlock({ verb, path, body }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const fullText = body ? `${verb} ${path}\n  ${body}` : `${verb} ${path}`

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const parsed = body ? parseBody(body) : null

  return (
    <div className="relative bg-code-bg rounded-[8px] px-4 py-3.5 font-mono text-[12px] leading-relaxed">
      {/* COPY button */}
      <button
        onClick={handleCopy}
        className="
          absolute top-2.5 right-3 text-[9px] uppercase tracking-wide text-code-muted
          hover:text-white/60 transition-colors duration-150
        "
      >
        {copied ? 'copied' : 'copy'}
      </button>

      {/* Line 1: verb + path */}
      <div>
        <span style={{ color: VERB_COLOR[verb] ?? '#ffffff' }}>{verb}</span>
        {' '}
        <span style={{ color: '#B5D4F4' }}>{path}</span>
      </div>

      {/* Line 2: body params (if any) */}
      {parsed && (
        <div className="mt-0.5 pl-4">
          <span className="text-white/80">{parsed.key}</span>
          <span className="text-white/40">{': '}</span>
          <span style={{ color: '#EF9F27' }}>{parsed.value}</span>
        </div>
      )}
    </div>
  )
}

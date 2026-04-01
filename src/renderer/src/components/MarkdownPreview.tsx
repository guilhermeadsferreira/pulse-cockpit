import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'

interface Props {
  content: string
  maxHeight?: number
}

function LiRenderer({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : ''
  const isLowConfidence = text.includes('(baixa confiança)')
  return (
    <li {...props} style={isLowConfidence ? { opacity: 0.65, fontStyle: 'italic' } : undefined}>
      {children}
    </li>
  )
}

export function MarkdownPreview({ content, maxHeight }: Props) {
  return (
    <div
      className="md-preview"
      style={{
        fontSize: 13,
        lineHeight: 1.75,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font)',
        overflowY: maxHeight ? 'auto' : undefined,
        maxHeight,
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ li: LiRenderer }}>{content}</ReactMarkdown>
    </div>
  )
}

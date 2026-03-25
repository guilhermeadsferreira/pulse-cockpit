import { useState, useEffect, useRef } from 'react'
import { Trash2, FileText, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DocItem } from '../types/ipc'

function formatDate(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function displayName(fileName: string): string {
  // Remove YYYY-MM-DD- prefix and .md extension
  return fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')
}

export function RefinamentosView() {
  const [docs, setDocs]           = useState<DocItem[]>([])
  const [selected, setSelected]   = useState<DocItem | null>(null)
  const [content, setContent]     = useState<string>('')
  const [isDragging, setDragging] = useState(false)
  const [loading, setLoading]     = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const list = await window.api.refinamentos.list()
      setDocs(list)
    } catch { /* workspace não pronto */ }
  }

  useEffect(() => { load() }, [])

  async function openDoc(doc: DocItem) {
    setSelected(doc)
    setLoading(true)
    try {
      const text = await window.api.refinamentos.read(doc.filePath)
      setContent(text)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(doc: DocItem, e: React.MouseEvent) {
    e.stopPropagation()
    await window.api.refinamentos.delete(doc.filePath)
    if (selected?.filePath === doc.filePath) {
      setSelected(null)
      setContent('')
    }
    load()
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.md')) continue
      const srcPath = window.api.getFilePath(file)
      await window.api.refinamentos.save(srcPath)
    }
    load()
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Sidebar lista ── */}
      <div style={{
        width: 280, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
            Refinamentos
          </div>

          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            style={{
              border: `1.5px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '14px 12px',
              textAlign: 'center',
              cursor: 'default',
              background: isDragging ? 'var(--accent-dim)' : 'transparent',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <FileText size={16} style={{ color: 'var(--text-muted)', marginBottom: 4 }} />
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Arraste arquivos <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>.md</span> aqui
            </div>
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {docs.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Nenhum documento ainda
            </div>
          ) : (
            docs.map((doc) => (
              <button
                key={doc.filePath}
                onClick={() => openDoc(doc)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: selected?.filePath === doc.filePath ? 'var(--surface-3)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (selected?.filePath !== doc.filePath)
                    e.currentTarget.style.background = 'var(--surface-2)'
                }}
                onMouseLeave={(e) => {
                  if (selected?.filePath !== doc.filePath)
                    e.currentTarget.style.background = 'transparent'
                }}
              >
                <FileText size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {displayName(doc.fileName)}
                  </div>
                  {doc.date && (
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                      {formatDate(doc.date)}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(doc, e)}
                  title="Excluir"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2, borderRadius: 4,
                    display: 'flex', alignItems: 'center', flexShrink: 0,
                    opacity: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  onFocus={(e) => { e.currentTarget.style.opacity = '1' }}
                  onBlur={(e) => { e.currentTarget.style.opacity = '0' }}
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Preview ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            <div style={{
              padding: '14px 24px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {displayName(selected.fileName)}
                </div>
                {selected.date && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDate(selected.date)}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setSelected(null); setContent('') }}
                title="Fechar"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
              {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Carregando…</div>
              ) : (
                <div className="markdown-body" style={{
                  fontSize: 13.5, lineHeight: 1.7,
                  color: 'var(--text-primary)',
                  maxWidth: 760,
                }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 12,
          }}>
            Selecione um documento para visualizar
          </div>
        )}
      </div>
    </div>
  )
}

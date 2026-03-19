import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from '../router'
import type { ArtifactFeedItem } from '../types/ipc'
import { labelTipo, fmtDate } from '../lib/utils'
import { MarkdownPreview } from '../components/MarkdownPreview'

const TIPO_OPTIONS = ['todos', '1on1', 'reuniao', 'daily', 'planning', 'retro', 'feedback', 'outro'] as const

export function MeetingsFeedView() {
  const { navigate } = useRouter()
  const [feed,      setFeed]      = useState<ArtifactFeedItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tipoFilter, setTipoFilter] = useState<string>('todos')
  const [search,    setSearch]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = await window.api.artifacts.feed()
      setFeed(items)
    } catch {
      setFeed([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    window.api.ingestion.onCompleted(() => load())
    window.addEventListener('settings:saved', load)
    return () => {
      window.api.ingestion.removeListeners()
      window.removeEventListener('settings:saved', load)
    }
  }, [load])

  const filtered = feed.filter((item) => {
    if (tipoFilter !== 'todos' && item.tipo !== tipoFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !item.personNome.toLowerCase().includes(q) &&
        !item.resumo.toLowerCase().includes(q) &&
        !item.fileName.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  // Group by month
  const grouped = groupByMonth(filtered)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '28px 40px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Histórico
          </div>
          <h1 style={{ fontFamily: 'var(--font)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Feed de Reuniões
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
            {loading ? '…' : `${filtered.length} artefato${filtered.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12.5,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none',
              width: 160,
            }}
          />
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12.5,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none',
              cursor: 'pointer',
            }}
          >
            {TIPO_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === 'todos' ? 'Todos os tipos' : labelTipo(t)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px', flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyFeed hasItems={feed.length > 0} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {grouped.map(({ month, items }) => (
              <div key={month}>
                <div style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--text-muted)',
                  marginBottom: 12, paddingBottom: 6,
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  {month}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((item, i) => (
                    <FeedCard
                      key={i}
                      item={item}
                      onViewPerson={() => navigate('person', { slug: item.personSlug })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FeedCard({ item, onViewPerson }: { item: ArtifactFeedItem; onViewPerson: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [content,  setContent]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function toggle() {
    if (!expanded && content === null) {
      setLoading(true)
      const raw = await window.api.artifacts.read(item.path)
      setContent(raw.replace(/^---\n[\s\S]*?\n---\n\n?/, '').trim())
      setLoading(false)
    }
    setExpanded((v) => !v)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div
        onClick={toggle}
        style={{
          padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
          background: expanded ? 'var(--surface-2)' : 'transparent',
          transition: 'background 0.12s',
        }}
      >
        {/* Tipo badge */}
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 20,
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {labelTipo(item.tipo)}
        </span>

        {/* Date */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmtDate(item.date)}
        </span>

        {/* Person name — clickable (not for collective) */}
        {item.personSlug === '_coletivo' ? (
          <span style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {item.personNome}
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onViewPerson() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 12.5, fontWeight: 600, color: 'var(--accent)',
              whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'var(--font)',
            }}
          >
            {item.personNome}
          </button>
        )}

        {/* Título / resumo preview */}
        <span style={{
          flex: 1, fontSize: 12.5, color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.titulo || item.resumo || item.fileName}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {loading && <Loader2 size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
          <span style={{
            fontSize: 10, color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s', display: 'flex',
          }}>▾</span>
        </div>
      </div>

      {expanded && content !== null && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          <MarkdownPreview content={content} maxHeight={480} />
        </div>
      )}
    </div>
  )
}

function EmptyFeed({ hasItems }: { hasItems: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 40px' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '-0.02em', fontFamily: 'var(--font)' }}>
        {hasItems ? 'Nenhum artefato encontrado' : 'Nenhum artefato processado ainda'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {hasItems
          ? 'Tente ajustar os filtros.'
          : 'Arraste arquivos para o Inbox para começar a popular o feed.'}
      </div>
    </div>
  )
}

function groupByMonth(items: ArtifactFeedItem[]): Array<{ month: string; items: ArtifactFeedItem[] }> {
  const map = new Map<string, ArtifactFeedItem[]>()
  for (const item of items) {
    const key = item.date.slice(0, 7) // YYYY-MM
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      month: formatMonth(key),
      items,
    }))
}

function formatMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-')
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${months[parseInt(m) - 1]} ${y}`
}

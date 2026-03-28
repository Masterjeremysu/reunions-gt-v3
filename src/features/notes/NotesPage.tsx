import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from './useNotes'
import { useMeetings } from '../meetings/useMeetings'
import { Spinner } from '../../components/ui'
import { fDate, fRelative } from '../../utils'
import {
  FileText, Plus, Search, X, Archive, Trash2,
  CalendarDays, Edit3, Loader2, Clock, BookOpen,
  CheckSquare, Eye, LayoutGrid, List,
  Bold, Italic, Hash, Minus, AlignLeft,
  ChevronRight, Copy,
} from 'lucide-react'
import { isAfter, isBefore, addDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

// ─── Constants ────────────────────────────────────────────────────────────────
const TAG_PRESETS = [
  { label: 'Important', color: '#E24B4A' },
  { label: 'À faire',   color: '#EF9F27' },
  { label: 'Idée',      color: '#7F77DD' },
  { label: 'Suivi',     color: '#378ADD' },
  { label: 'RH',        color: '#D4537E' },
  { label: 'Technique', color: '#1D9E75' },
]

const TEMPLATES = [
  {
    label: '📋 Réunion',
    content: `# Ordre du jour\n\n## Participants\n☐ \n\n## Points à aborder\n☐ \n☐ \n☐ \n\n## Décisions prises\n\n## Actions\n☐ \n☐ \n\n## Prochaine réunion\n`,
  },
  {
    label: '📝 Compte-rendu',
    content: `# Compte-rendu\n\n**Date :** \n**Présents :** \n\n## Résumé\n\n## Décisions\n\n## Actions à suivre\n☐ \n☐ \n`,
  },
  {
    label: '💡 Idée',
    content: `# Idée\n\n## Description\n\n## Bénéfices\n\n## Prochaines étapes\n☐ \n☐ \n`,
  },
  {
    label: '👤 Suivi client',
    content: `# Suivi client\n\n**Client :** \n**Contact :** \n\n## Contexte\n\n## Actions en cours\n☐ \n☐ \n\n## Notes\n`,
  },
]

const SLASH_ITEMS = [
  { label: 'Titre 1',       icon: '#',  insert: '# ',    desc: 'Grand titre' },
  { label: 'Titre 2',       icon: '##', insert: '## ',   desc: 'Sous-titre' },
  { label: 'Case à cocher', icon: '☐',  insert: '☐ ',   desc: 'Todo item' },
  { label: 'Liste',         icon: '▸',  insert: '- ',    desc: 'Élément de liste' },
  { label: 'Citation',      icon: '❝',  insert: '> ',    desc: 'Bloc citation' },
  { label: 'Séparateur',    icon: '—',  insert: '---\n', desc: 'Ligne de séparation', offset: 0 },
  { label: 'Gras',          icon: 'B',  insert: '****',  desc: 'Texte en gras', offset: 2 },
]

const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Syne:wght@600;700;800&display=swap');
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(8px) } to { opacity: 1; transform: none } }
  * { box-sizing: border-box }
  ::-webkit-scrollbar { width: 4px; height: 4px }
  ::-webkit-scrollbar-track { background: transparent }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15) }
  .note-textarea { caret-color: #1D9E75; }
  .note-textarea::placeholder { color: rgba(255,255,255,0.15); font-style: italic }
  .note-card-btn:focus-visible { outline: 2px solid #1D9E75; outline-offset: -2px }
  .tag-pill-hover:hover { opacity: 1 !important }
  .action-btn { transition: all 0.13s ease }
  .action-btn:hover { background: rgba(255,255,255,0.07) !important; color: #fff !important }
  .toolbar-btn { transition: all 0.1s; padding: 5px 7px; border-radius: 5px; border: none; background: transparent; cursor: pointer; color: rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; }
  .toolbar-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); }
  .toolbar-btn.active { background: rgba(29,158,117,0.15); color: #1D9E75; }
  .slash-menu { animation: fadeIn 0.15s ease; }
  .slash-item:hover { background: rgba(255,255,255,0.05) !important; }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
function wordCount(s: string) { return s.trim() ? s.trim().split(/\s+/).length : 0 }

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} style={{ background: '#EF9F2740', color: '#EF9F27', borderRadius: 2 }}>{p}</mark>
          : p
      )}
    </>
  )
}

function TagPill({ label, color, onRemove, small }: {
  label: string; color: string; onRemove?: () => void; small?: boolean
}) {
  return (
    <span className="tag-pill-hover" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '1px 6px' : '2px 8px',
      background: `${color}15`, border: `1px solid ${color}35`,
      borderRadius: 4, fontSize: small ? 9 : 10,
      color, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
      opacity: small ? 0.85 : 1,
    }}>
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color, display: 'flex', padding: 0, opacity: 0.6 }}>
          <X style={{ width: 8, height: 8 }} />
        </button>
      )}
    </span>
  )
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────
function renderMarkdown(content: string, onToggle?: (i: number) => void) {
  if (!content) return null
  return content.split('\n').map((line, i) => {
    if (line.startsWith('☐ ') || line.startsWith('☑ ')) {
      const checked = line.startsWith('☑')
      return (
        <div key={i} onClick={() => onToggle?.(i)}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4, cursor: onToggle ? 'pointer' : 'default', padding: '3px 6px', borderRadius: 6, transition: 'background 0.1s' }}
          onMouseEnter={e => onToggle && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
          <span style={{ fontSize: 15, color: checked ? '#1D9E75' : 'rgba(255,255,255,0.3)', flexShrink: 0, marginTop: 2, userSelect: 'none' }}>{checked ? '☑' : '☐'}</span>
          <span style={{ fontSize: 13.5, color: checked ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.75)', textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.65, fontFamily: "'IBM Plex Mono', monospace", userSelect: 'none' }}>
            {line.slice(2)}
          </span>
        </div>
      )
    }
    if (line.startsWith('# ')) return <h2 key={i} style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '18px 0 6px', fontFamily: "'Syne', sans-serif", letterSpacing: '-0.02em' }}>{line.slice(2)}</h2>
    if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)', margin: '14px 0 4px', fontFamily: "'Syne', sans-serif" }}>{line.slice(3)}</h3>
    if (line.startsWith('### ')) return <h4 key={i} style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', margin: '10px 0 3px', fontFamily: "'Syne', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>{line.slice(4)}</h4>
    if (line.startsWith('---')) return <hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '14px 0' }} />
    if (line.startsWith('> ')) return (
      <div key={i} style={{ borderLeft: '3px solid #378ADD', paddingLeft: 12, margin: '6px 0', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
        {line.slice(2)}
      </div>
    )
    if (line.startsWith('- ') || line.startsWith('* ')) return (
      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, paddingLeft: 4 }}>
        <span style={{ color: '#1D9E75', fontSize: 12, marginTop: 4, flexShrink: 0 }}>▸</span>
        <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, fontFamily: "'IBM Plex Mono', monospace" }}>{line.slice(2)}</span>
      </div>
    )
    if (line === '') return <div key={i} style={{ height: 8 }} />
    const boldParts = line.split(/(\*\*[^*]+\*\*)/)
    const rendered = boldParts.map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j} style={{ color: '#fff', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
        : part
    )
    return <p key={i} style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.68)', margin: '0 0 4px', lineHeight: 1.75, fontFamily: "'IBM Plex Mono', monospace" }}>{rendered}</p>
  })
}

// ─── Editor Toolbar ───────────────────────────────────────────────────────────
function EditorToolbar({ onInsert, onTemplate, showPreview, onTogglePreview }: {
  onInsert: (text: string, offset?: number) => void
  onTemplate: (content: string) => void
  showPreview: boolean
  onTogglePreview: () => void
}) {
  const [showTemplates, setShowTemplates] = useState(false)
  return (
    <div style={{
      padding: '4px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
      background: 'rgba(255,255,255,0.01)',
    }}>
      <button className="toolbar-btn" title="Gras (⌘B)" onClick={() => onInsert('****', 2)}>
        <Bold style={{ width: 12, height: 12 }} />
      </button>
      <button className="toolbar-btn" title="Titre 1" onClick={() => onInsert('# ')}>
        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>H1</span>
      </button>
      <button className="toolbar-btn" title="Titre 2" onClick={() => onInsert('## ')}>
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>H2</span>
      </button>
      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
      <button className="toolbar-btn" title="Case à cocher" onClick={() => onInsert('☐ ')}>
        <CheckSquare style={{ width: 12, height: 12 }} />
      </button>
      <button className="toolbar-btn" title="Liste" onClick={() => onInsert('- ')}>
        <AlignLeft style={{ width: 12, height: 12 }} />
      </button>
      <button className="toolbar-btn" title="Citation" onClick={() => onInsert('> ')}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>❝</span>
      </button>
      <button className="toolbar-btn" title="Séparateur" onClick={() => onInsert('---\n', 0)}>
        <Minus style={{ width: 12, height: 12 }} />
      </button>
      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
      <div style={{ position: 'relative' }}>
        <button className="toolbar-btn" onClick={() => setShowTemplates(p => !p)} style={{ gap: 4, display: 'flex', alignItems: 'center' }}>
          <FileText style={{ width: 12, height: 12 }} />
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>Templates</span>
          <ChevronRight style={{ width: 9, height: 9, transform: showTemplates ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {showTemplates && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, background: '#151820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'fadeIn 0.15s ease' }}>
            {TEMPLATES.map(t => (
              <button key={t.label} className="slash-item"
                onClick={() => { onTemplate(t.content); setShowTemplates(false) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginLeft: 'auto' }}>
        <button className={`toolbar-btn ${showPreview ? 'active' : ''}`} onClick={onTogglePreview} style={{ gap: 4, display: 'flex', alignItems: 'center' }}>
          <Eye style={{ width: 12, height: 12 }} />
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>{showPreview ? 'Éditer' : 'Aperçu'}</span>
        </button>
      </div>
    </div>
  )
}

// ─── Note Editor ──────────────────────────────────────────────────────────────
function NoteEditor({ note, meetings, onSave, onClose }: {
  note?: any; meetings: any[]; onSave: (data: any) => Promise<void>; onClose: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [forDate, setForDate] = useState(note?.for_meeting_date ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [slashMenu, setSlashMenu] = useState<{ visible: boolean; query: string; lineStart: number }>({ visible: false, query: '', lineStart: 0 })
  const [slashIndex, setSlashIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); setShowPreview(p => !p) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [title, content, tags, forDate])

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Titre requis'); return }
    setSaving(true)
    try {
      await onSave({ title: title.trim(), content: content || null, for_meeting_date: forDate || null, tags, is_archived: note?.is_archived ?? false })
      onClose()
    } finally { setSaving(false) }
  }

  const addTag = (label: string) => { if (!tags.includes(label)) setTags([...tags, label]); setTagInput('') }
  const removeTag = (label: string) => setTags(tags.filter(t => t !== label))

  const insertAtCursor = useCallback((text: string, cursorOffset?: number) => {
    const ta = textareaRef.current
    if (!ta) { setContent((c: string) => c + text); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = content.slice(0, start)
    const after = content.slice(end)
    const blockPrefixes = ['# ', '## ', '### ', '- ', '> ', '☐ ', '---\n']
    const needsNewline = blockPrefixes.some(p => text.startsWith(p)) && before.length > 0 && !before.endsWith('\n')
    const prefix = needsNewline ? '\n' : ''
    const newContent = before + prefix + text + after
    setContent(newContent)
    const newPos = start + prefix.length + text.length - (cursorOffset ?? 0)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = newPos; ta.focus() }, 0)
  }, [content])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenu.visible) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, filteredSlash.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter') { e.preventDefault(); applySlashItem(filteredSlash[slashIndex]); return }
      if (e.key === 'Escape') { setSlashMenu({ visible: false, query: '', lineStart: 0 }); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !slashMenu.visible) {
      const ta = textareaRef.current
      if (!ta) return
      const pos = ta.selectionStart
      const lineStart = content.lastIndexOf('\n', pos - 1) + 1
      const line = content.slice(lineStart, pos)
      if (line === '☐ ' || line === '☑ ') {
        e.preventDefault()
        const newContent = content.slice(0, lineStart) + '\n' + content.slice(pos)
        setContent(newContent)
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart + 1; ta.focus() }, 0)
        return
      }
      if (line.startsWith('☐ ') || line.startsWith('☑ ')) { e.preventDefault(); insertAtCursor('\n☐ ', 0); return }
      if (line === '- ') {
        e.preventDefault()
        const newContent = content.slice(0, lineStart) + '\n' + content.slice(pos)
        setContent(newContent)
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart + 1; ta.focus() }, 0)
        return
      }
      if (line.startsWith('- ')) { e.preventDefault(); insertAtCursor('\n- ', 0); return }
    }
    if (e.key === 'Tab') { e.preventDefault(); insertAtCursor('  ', 0) }
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); insertAtCursor('****', 2) }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setContent(val)
    const pos = e.target.selectionStart
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1
    const lineUpToCursor = val.slice(lineStart, pos)
    if (lineUpToCursor === '/') {
      setSlashMenu({ visible: true, query: '', lineStart })
      setSlashIndex(0)
    } else if (slashMenu.visible && lineUpToCursor.startsWith('/')) {
      setSlashMenu(m => ({ ...m, query: lineUpToCursor.slice(1).toLowerCase() }))
      setSlashIndex(0)
    } else {
      setSlashMenu({ visible: false, query: '', lineStart: 0 })
    }
  }

  const filteredSlash = SLASH_ITEMS.filter(s =>
    !slashMenu.query || s.label.toLowerCase().includes(slashMenu.query)
  )

  const applySlashItem = (item: typeof SLASH_ITEMS[0]) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const lineStart = content.lastIndexOf('\n', pos - 1) + 1
    const before = content.slice(0, lineStart)
    const after = content.slice(pos)
    const newContent = before + item.insert + after
    setContent(newContent)
    const offset = item.offset ?? 0
    const newPos = lineStart + item.insert.length - offset
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = newPos; ta.focus() }, 0)
    setSlashMenu({ visible: false, query: '', lineStart: 0 })
  }

  const linked = meetings.find(m => m.date?.startsWith(forDate))
  const wc = wordCount(content)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '0 20px', height: 52, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'rgba(255,255,255,0.01)' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la note..."
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 15, fontWeight: 700, color: '#fff', outline: 'none', fontFamily: "'Syne', sans-serif", letterSpacing: '-0.02em' }} />
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button type="button" onClick={onClose} className="action-btn"
            style={{ padding: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex' }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !title.trim()}
            style={{ padding: '7px 16px', background: title.trim() ? '#1D9E75' : 'rgba(29,158,117,0.3)', border: 'none', borderRadius: 7, cursor: title.trim() ? 'pointer' : 'not-allowed', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            {saving ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : null}
            {note ? 'Sauvegarder' : 'Créer'}
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ padding: '7px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarDays style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.25)' }} />
          <input type="date" value={forDate} onChange={e => setForDate(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#fff', outline: 'none', fontFamily: "'IBM Plex Mono', monospace" }} />
          {linked && <span style={{ fontSize: 10, color: '#1D9E75', fontFamily: "'IBM Plex Mono', monospace" }}>→ {linked.title}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {tags.map(t => {
            const preset = TAG_PRESETS.find(p => p.label === t)
            return <TagPill key={t} label={t} color={preset?.color ?? '#8b90a4'} onRemove={() => removeTag(t)} />
          })}
          <input value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) addTag(tagInput.trim()) }}
            placeholder="+ Tag"
            style={{ width: 55, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '2px 7px', fontSize: 10, color: 'rgba(255,255,255,0.5)', outline: 'none', fontFamily: "'IBM Plex Mono', monospace" }} />
          {TAG_PRESETS.filter(p => !tags.includes(p.label)).slice(0, 4).map(p => (
            <button key={p.label} type="button" onClick={() => addTag(p.label)}
              style={{ padding: '2px 7px', background: `${p.color}10`, border: `1px solid ${p.color}25`, borderRadius: 4, fontSize: 10, color: p.color, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", opacity: 0.55 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.55'}>
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <EditorToolbar onInsert={insertAtCursor} onTemplate={c => setContent(c)} showPreview={showPreview} onTogglePreview={() => setShowPreview(p => !p)} />

      {/* Editor / Preview */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {showPreview ? (
          <div style={{ height: '100%', overflowY: 'auto', padding: '24px 28px', maxWidth: 720 }}>
            {content ? renderMarkdown(content) : (
              <p style={{ color: 'rgba(255,255,255,0.15)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>Rien à afficher…</p>
            )}
          </div>
        ) : (
          <>
            <textarea ref={textareaRef} className="note-textarea" value={content}
              onChange={handleChange} onKeyDown={handleKeyDown}
              placeholder={`Commencez à écrire…\n\nTapez / pour les commandes rapides\n# Titre  ## Sous-titre  ☐ Action\n- Liste  > Citation  ---\n\n⌘+Enter sauvegarder · ⌘+P aperçu`}
              style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', padding: '20px 24px', fontSize: 13.5, color: 'rgba(255,255,255,0.82)', outline: 'none', resize: 'none', lineHeight: 1.8, fontFamily: "'IBM Plex Mono', monospace", zIndex: 2, width: '100%', height: '100%' }}
            />
            {/* Slash menu */}
            {slashMenu.visible && filteredSlash.length > 0 && (
              <div className="slash-menu" style={{ position: 'absolute', bottom: 60, left: 24, zIndex: 20, background: '#151820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", padding: '4px 10px 6px', letterSpacing: '0.08em' }}>
                  COMMANDES · ↑↓ naviguer · ↵ insérer
                </div>
                {filteredSlash.map((item, idx) => (
                  <button key={item.label} className="slash-item"
                    onClick={() => applySlashItem(item)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '7px 10px', background: idx === slashIndex ? 'rgba(29,158,117,0.12)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: idx === slashIndex ? '#1D9E75' : 'rgba(255,255,255,0.6)' }}>
                    <span style={{ width: 22, fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: idx === slashIndex ? '#1D9E75' : 'rgba(255,255,255,0.3)', textAlign: 'center' }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 20px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'rgba(255,255,255,0.01)' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: "'IBM Plex Mono', monospace" }}>{wc} mot{wc !== 1 ? 's' : ''}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: "'IBM Plex Mono', monospace" }}>{content.length} car.</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.1)', fontFamily: "'IBM Plex Mono', monospace", marginLeft: 'auto' }}>
          / commandes · ⌘B gras · ⌘P aperçu · ⌘↵ sauvegarder
        </span>
      </div>
    </div>
  )
}

// ─── Note Card ────────────────────────────────────────────────────────────────
function NoteCard({ note, meetings, isSelected, onClick, search }: {
  note: any; meetings: any[]; isSelected: boolean; onClick: () => void; search: string
}) {
  const linked = note.for_meeting_date ? meetings.find((m: any) => m.date?.startsWith(note.for_meeting_date)) : null
  const preview = note.content?.replace(/[☐☑]/g, '').replace(/^[#>*-]+\s/gm, '').replace(/\*\*/g, '').trim().slice(0, 90) ?? ''
  const checked = (note.content ?? '').match(/☑/g)?.length ?? 0
  const total = ((note.content ?? '').match(/[☐☑]/g) ?? []).length
  const hasSoon = note.for_meeting_date && isBefore(new Date(), addDays(new Date(note.for_meeting_date), 1)) && isAfter(new Date(note.for_meeting_date), new Date())

  return (
    <button className="note-card-btn" onClick={onClick} style={{ width: '100%', textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: `2px solid ${isSelected ? '#1D9E75' : 'transparent'}`, background: isSelected ? 'rgba(29,158,117,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.1s', display: 'block' }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)' }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: note.is_archived ? 'rgba(255,255,255,0.3)' : isSelected ? '#fff' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: note.is_archived ? 'italic' : 'normal', fontFamily: "'Syne', sans-serif", flex: 1 }}>
            {search ? <Highlight text={note.title} query={search} /> : note.title}
          </span>
          {hasSoon && <span style={{ fontSize: 8, color: '#1D9E75', background: '#1D9E7515', borderRadius: 3, padding: '1px 5px', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>BIENTÔT</span>}
        </div>
        {preview && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4, fontFamily: "'IBM Plex Mono', monospace" }}>
            {search ? <Highlight text={preview} query={search} /> : preview}
          </p>
        )}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.18)', fontFamily: "'IBM Plex Mono', monospace" }}>{fRelative(note.created_at)}</span>
          {linked && <span style={{ fontSize: 9, color: '#378ADD', background: '#378ADD10', borderRadius: 3, padding: '1px 5px', fontFamily: "'IBM Plex Mono', monospace" }}>📅 {linked.title?.slice(0, 18)}</span>}
          {total > 0 && <span style={{ fontSize: 9, color: checked === total ? '#1D9E75' : '#EF9F27', fontFamily: "'IBM Plex Mono', monospace" }}>☑ {checked}/{total}</span>}
          {(note.tags ?? []).slice(0, 2).map((t: string) => {
            const p = TAG_PRESETS.find(x => x.label === t)
            return <TagPill key={t} label={t} color={p?.color ?? '#8b90a4'} small />
          })}
        </div>
      </div>
    </button>
  )
}

// ─── Note Viewer ──────────────────────────────────────────────────────────────
function NoteViewer({ note, meetings, onEdit, onArchive, onDelete, onToggleCheckbox }: {
  note: any; meetings: any[]
  onEdit: () => void; onArchive: () => void; onDelete: () => void
  onToggleCheckbox: (lineIndex: number) => void
}) {
  const linkedMeeting = note.for_meeting_date ? meetings.find((m: any) => m.date?.startsWith(note.for_meeting_date)) : null
  const checked = (note.content ?? '').match(/☑/g)?.length ?? 0
  const total = ((note.content ?? '').match(/[☐☑]/g) ?? []).length
  const progress = total > 0 ? (checked / total) * 100 : 0
  const wc = wordCount(note.content ?? '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, background: 'linear-gradient(180deg, rgba(29,158,117,0.03) 0%, transparent 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.03em', fontFamily: "'Syne', sans-serif", lineHeight: 1.2 }}>{note.title}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock style={{ width: 10, height: 10 }} /> {fRelative(note.created_at)}
              </span>
              {note.updated_at && note.updated_at !== note.created_at && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }}>· modifié {fRelative(note.updated_at)}</span>
              )}
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }}>· {wc} mots</span>
              {linkedMeeting && (
                <span style={{ fontSize: 10, color: '#378ADD', background: '#378ADD12', border: '1px solid #378ADD25', borderRadius: 4, padding: '1px 7px', fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CalendarDays style={{ width: 9, height: 9 }} /> {fDate(note.for_meeting_date)}
                </span>
              )}
              {(note.tags ?? []).map((t: string) => {
                const p = TAG_PRESETS.find(x => x.label === t)
                return <TagPill key={t} label={t} color={p?.color ?? '#8b90a4'} />
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            {[
              { icon: Copy, onClick: () => { navigator.clipboard.writeText(`${note.title}\n\n${note.content ?? ''}`); toast.success('Copié !') }, title: 'Copier', hoverColor: '#7F77DD' },
              { icon: Edit3, onClick: onEdit, title: 'Modifier', hoverColor: '#fff' },
              { icon: Archive, onClick: onArchive, title: note.is_archived ? 'Désarchiver' : 'Archiver', hoverColor: '#EF9F27' },
              { icon: Trash2, onClick: onDelete, title: 'Supprimer', hoverColor: '#E24B4A' },
            ].map(({ icon: Icon, onClick, title, hoverColor }) => (
              <button key={title} onClick={onClick} title={title} className="action-btn"
                style={{ padding: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = hoverColor; (e.currentTarget as HTMLElement).style.borderColor = `${hoverColor}40` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
                <Icon style={{ width: 13, height: 13 }} />
              </button>
            ))}
          </div>
        </div>
        {total > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: progress === 100 ? '#1D9E75' : 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>{checked}/{total} tâches</span>
              {progress === 100 && <span style={{ fontSize: 9, color: '#1D9E75', background: '#1D9E7515', borderRadius: 3, padding: '1px 5px', fontFamily: "'IBM Plex Mono', monospace" }}>TERMINÉ ✓</span>}
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#1D9E75' : '#EF9F27', borderRadius: 99, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {note.content ? (
          <div style={{ maxWidth: 720 }}>{renderMarkdown(note.content, onToggleCheckbox)}</div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.12)' }}>
            <BookOpen style={{ width: 36, height: 36, margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
            <p style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>Note vide — cliquez sur Modifier</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function NotesPage() {
  const { data: notes, isLoading } = useNotes()
  const { data: meetings } = useMeetings()
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'kanban'>('list')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !creating && !editing) {
        e.preventDefault(); setCreating(true); setSelectedId(null); setEditing(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [creating, editing])

  const filtered = useMemo(() => {
    if (!notes) return []
    return notes.filter((n: any) => {
      if (n.is_archived !== showArchived) return false
      if (filterTag && !(n.tags ?? []).includes(filterTag)) return false
      if (!search) return true
      const q = search.toLowerCase()
      return n.title.toLowerCase().includes(q) || (n.content ?? '').toLowerCase().includes(q) || (n.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
    })
  }, [notes, search, filterTag, showArchived])

  const selected = notes?.find((n: any) => n.id === selectedId) ?? filtered[0] ?? null

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    notes?.forEach((n: any) => (n.tags ?? []).forEach((t: string) => tagSet.add(t)))
    return Array.from(tagSet)
  }, [notes])

  const stats = useMemo(() => ({
    total: notes?.filter((n: any) => !n.is_archived).length ?? 0,
    archived: notes?.filter((n: any) => n.is_archived).length ?? 0,
    withMeeting: notes?.filter((n: any) => !n.is_archived && n.for_meeting_date).length ?? 0,
  }), [notes])

  const handleCreate = async (data: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    const created = await createNote.mutateAsync({ ...data, user_id: user?.id ?? '' })
    setCreating(false)
    if (created?.id) setSelectedId(created.id)
  }

  const handleUpdate = async (data: any) => {
    if (!selected) return
    await updateNote.mutateAsync({ id: selected.id, ...data })
    setEditing(false)
  }

  const handleDelete = async (id: string) => {
    await deleteNote.mutateAsync(id)
    setDeleteConfirm(null)
    if (selectedId === id) setSelectedId(null)
  }

  const toggleArchive = async () => {
    if (!selected) return
    await updateNote.mutateAsync({ id: selected.id, is_archived: !selected.is_archived })
  }

  const handleToggleCheckbox = async (lineIndex: number) => {
    if (!selected || !selected.content) return
    const lines = selected.content.split('\n')
    const line = lines[lineIndex]
    if (line.startsWith('☐ ')) lines[lineIndex] = '☑ ' + line.slice(2)
    else if (line.startsWith('☑ ')) lines[lineIndex] = '☐ ' + line.slice(2)
    else return
    await updateNote.mutateAsync({ id: selected.id, content: lines.join('\n') })
  }

  const kanbanColumns = useMemo(() => {
    if (!notes) return []
    const tagGroups: Record<string, any[]> = { 'Sans tag': [] }
    TAG_PRESETS.forEach(t => { tagGroups[t.label] = [] })
    filtered.forEach((n: any) => {
      const tags = n.tags ?? []
      if (tags.length === 0) { tagGroups['Sans tag'].push(n); return }
      tags.forEach((t: string) => { if (tagGroups[t]) tagGroups[t].push(n) })
    })
    return Object.entries(tagGroups)
      .map(([label, notes]) => ({ label, notes, color: TAG_PRESETS.find(t => t.label === label)?.color ?? '#8b90a4' }))
      .filter(col => col.notes.length > 0)
  }, [filtered])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#090b12', overflow: 'hidden', fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{GLOBAL_STYLES}</style>

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#131620', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%', margin: '0 16px', animation: 'fadeIn 0.15s ease' }}>
            <div style={{ width: 36, height: 36, background: '#E24B4A15', border: '1px solid #E24B4A30', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Trash2 style={{ width: 16, height: 16, color: '#E24B4A' }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6, fontFamily: "'Syne', sans-serif" }}>Supprimer cette note ?</h3>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>Cette action est irréversible.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '9px 0', fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700, color: '#fff', background: '#E24B4A', border: 'none', borderRadius: 9, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Topbar */}
      <div style={{ flexShrink: 0, padding: '0 20px', height: 50, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(9,11,18,0.95)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Syne', sans-serif", letterSpacing: '-0.02em' }}>Notes</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { label: `${stats.total}`, suffix: ' notes', color: '#1D9E75' },
            stats.withMeeting > 0 && { label: `${stats.withMeeting}`, suffix: ' liées', color: '#378ADD' },
            stats.archived > 0 && { label: `${stats.archived}`, suffix: ' archivées', color: '#565c75' },
          ].filter(Boolean).map((s: any, i) => (
            <span key={i} style={{ fontSize: 10, color: s.color, background: `${s.color}12`, borderRadius: 4, padding: '2px 7px', fontFamily: "'IBM Plex Mono', monospace" }}>
              {s.label}<span style={{ opacity: 0.6 }}>{s.suffix}</span>
            </span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, overflow: 'hidden' }}>
            {([['list', List], ['kanban', LayoutGrid]] as const).map(([v, Icon]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '5px 9px', background: view === v ? 'rgba(255,255,255,0.09)' : 'transparent', border: 'none', cursor: 'pointer', color: view === v ? '#fff' : 'rgba(255,255,255,0.35)', display: 'flex', transition: 'all 0.12s' }}>
                <Icon style={{ width: 12, height: 12 }} />
              </button>
            ))}
          </div>
          <button onClick={() => setShowArchived(!showArchived)} className="action-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: showArchived ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
            <Archive style={{ width: 11, height: 11 }} />
            {showArchived ? 'Actives' : 'Archivées'}
          </button>
          <button onClick={() => { setCreating(true); setSelectedId(null); setEditing(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#1D9E75', border: 'none', borderRadius: 7, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
            <Plus style={{ width: 11, height: 11 }} /> Nouvelle <span style={{ opacity: 0.6, fontSize: 9 }}>⌘N</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left panel */}
        <div style={{ width: 270, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: '#0b0d15' }}>
          <div style={{ padding: '10px 10px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '0 10px', height: 32 }}>
              <Search style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 11.5, color: '#fff', outline: 'none', fontFamily: "'IBM Plex Mono', monospace" }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}><X style={{ width: 10, height: 10 }} /></button>}
            </div>
          </div>
          {allTags.length > 0 && (
            <div style={{ padding: '0 10px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => setFilterTag(null)}
                style={{ padding: '2px 7px', background: !filterTag ? 'rgba(255,255,255,0.08)' : 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, fontSize: 9.5, color: filterTag ? 'rgba(255,255,255,0.3)' : '#e8eaf0', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace" }}>
                Toutes
              </button>
              {allTags.map(t => {
                const p = TAG_PRESETS.find(x => x.label === t)
                const active = filterTag === t
                return (
                  <button key={t} onClick={() => setFilterTag(active ? null : t)}
                    style={{ padding: '2px 7px', background: active ? `${p?.color ?? '#8b90a4'}18` : 'transparent', border: `1px solid ${active ? (p?.color ?? '#8b90a4') + '50' : 'rgba(255,255,255,0.07)'}`, borderRadius: 4, fontSize: 9.5, color: p?.color ?? '#8b90a4', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {t}
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
            {!isLoading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '56px 16px', color: 'rgba(255,255,255,0.18)', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
                {search || filterTag ? 'Aucun résultat' : showArchived ? 'Aucune note archivée' : 'Aucune note'}
              </div>
            )}
            {filtered.map((n: any) => (
              <NoteCard key={n.id} note={n} meetings={meetings ?? []} search={search}
                isSelected={(selectedId ?? filtered[0]?.id) === n.id}
                onClick={() => { setSelectedId(n.id); setCreating(false); setEditing(false) }}
              />
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#0c0f18', overflow: 'hidden' }}>
          {creating ? (
            <NoteEditor meetings={meetings ?? []} onSave={handleCreate} onClose={() => setCreating(false)} />
          ) : editing && selected ? (
            <NoteEditor note={selected} meetings={meetings ?? []} onSave={handleUpdate} onClose={() => setEditing(false)} />
          ) : selected && view === 'list' ? (
            <NoteViewer note={selected} meetings={meetings ?? []} onEdit={() => setEditing(true)} onArchive={toggleArchive} onDelete={() => setDeleteConfirm(selected.id)} onToggleCheckbox={handleToggleCheckbox} />
          ) : selected === null && view === 'list' ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <FileText style={{ width: 44, height: 44, opacity: 0.1 }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 14, margin: '0 0 6px', fontFamily: "'Syne', sans-serif", color: 'rgba(255,255,255,0.25)' }}>Sélectionnez une note</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)', fontFamily: "'IBM Plex Mono', monospace" }}>ou créez-en une nouvelle avec ⌘N</p>
              </div>
              <button onClick={() => setCreating(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: '#1D9E75', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Plus style={{ width: 12, height: 12 }} /> Nouvelle note
              </button>
            </div>
          ) : view === 'kanban' ? (
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', padding: '20px', height: '100%' }}>
              {kanbanColumns.map(col => (
                <div key={col.label} style={{ width: 240, flexShrink: 0, marginRight: 14, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: col.color }} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: col.color, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}>{col.label.toUpperCase()}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 5px', marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace" }}>{col.notes.length}</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.notes.map((n: any) => (
                      <button key={n.id}
                        onClick={() => { setView('list'); setSelectedId(n.id); setCreating(false); setEditing(false) }}
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.13s', display: 'block', width: '100%' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = `${col.color}30` }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 5, fontFamily: "'Syne', sans-serif", lineHeight: 1.3 }}>{n.title}</div>
                        {n.content && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontFamily: "'IBM Plex Mono', monospace" }}>
                          {n.content.replace(/[☐☑#*>-]/g, '').trim()}
                        </div>}
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }}>{fRelative(n.created_at)}</span>
                          {(() => { const ch = (n.content ?? '').match(/☑/g)?.length ?? 0; const tot = ((n.content ?? '').match(/[☐☑]/g) ?? []).length; return tot > 0 ? <span style={{ fontSize: 9, color: ch === tot ? '#1D9E75' : '#EF9F27', fontFamily: "'IBM Plex Mono', monospace", marginLeft: 'auto' }}>☑ {ch}/{tot}</span> : null })()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {kanbanColumns.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
                  Aucune note à afficher
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

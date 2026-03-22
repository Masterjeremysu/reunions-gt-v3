import { useState, useMemo, useRef } from 'react'
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from './useNotes'
import { useMeetings } from '../meetings/useMeetings'
import { Spinner } from '../../components/ui'
import { fDate, fRelative } from '../../utils'
import {
  FileText, Plus, Search, X, Archive, Trash2,
  Pin, Tag, CalendarDays, ChevronRight, Edit3,
  Loader2, Clock, BookOpen, Sparkles, CheckSquare,
  Hash, Star, Eye, EyeOff, Filter, MoreHorizontal
} from 'lucide-react'
import { format, isAfter, isBefore, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

// ─── Tag system ───────────────────────────────────────────────────────────────
const TAG_PRESETS = [
  { label: 'Important', color: '#E24B4A' },
  { label: 'À faire',   color: '#EF9F27' },
  { label: 'Idée',      color: '#7F77DD' },
  { label: 'Suivi',     color: '#378ADD' },
  { label: 'RH',        color: '#D4537E' },
  { label: 'Technique', color: '#1D9E75' },
]

function TagPill({ label, color, onRemove, small }: { label: string; color: string; onRemove?: () => void; small?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: small ? '1px 6px' : '2px 8px', background: `${color}18`, border: `1px solid ${color}30`, borderRadius: 20, fontSize: small ? 9 : 10, color, fontFamily: 'monospace', fontWeight: 600 }}>
      {label}
      {onRemove && <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color, display: 'flex', padding: 0, opacity: 0.7 }}><X style={{ width: 8, height: 8 }} /></button>}
    </span>
  )
}

// ─── Word count ───────────────────────────────────────────────────────────────
function wordCount(s: string) { return s.trim() ? s.trim().split(/\s+/).length : 0 }

// ─── Note editor ──────────────────────────────────────────────────────────────
function NoteEditor({ note, meetings, onSave, onClose }: {
  note?: any; meetings: any[]; onSave: (data: any) => Promise<void>; onClose: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [forDate, setForDate] = useState(note?.for_meeting_date ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Titre requis'); return }
    setSaving(true)
    await onSave({ title: title.trim(), content: content || null, for_meeting_date: forDate || null, tags, is_archived: note?.is_archived ?? false })
    setSaving(false)
    onClose()
  }

  const addTag = (label: string) => {
    if (!tags.includes(label)) setTags([...tags, label])
    setTagInput('')
  }
  const removeTag = (label: string) => setTags(tags.filter(t => t !== label))

  const insertCheckbox = () => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const before = content.slice(0, pos); const after = content.slice(pos)
    const newContent = before + '☐ ' + after
    setContent(newContent)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + 2; ta.focus() }, 0)
  }

  const wc = wordCount(content)
  const linked = meetings.find(m => m.date.startsWith(forDate))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Editor topbar */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la note..."
            style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 16, fontWeight: 700, color: '#fff', outline: 'none', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={insertCheckbox} title="Insérer une case à cocher"
            style={{ padding: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
            <CheckSquare style={{ width: 13, height: 13 }} />
          </button>
          <button type="button" onClick={onClose}
            style={{ padding: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !title.trim()}
            style={{ padding: '7px 14px', background: '#1D9E75', border: 'none', borderRadius: 7, cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, opacity: title.trim() ? 1 : 0.4 }}>
            {saving ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : null}
            {note ? 'Sauvegarder' : 'Créer'}
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarDays style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>Lier à la réunion du</span>
          <input type="date" value={forDate} onChange={e => setForDate(e.target.value)}
            style={{ background: '#1e2535', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#fff', outline: 'none', fontFamily: 'monospace' }} />
          {linked && <span style={{ fontSize: 10, color: '#1D9E75', fontFamily: 'monospace' }}>→ {linked.title}</span>}
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {tags.map(t => {
            const preset = TAG_PRESETS.find(p => p.label === t)
            return <TagPill key={t} label={t} color={preset?.color ?? '#8b90a4'} onRemove={() => removeTag(t)} />
          })}
          <div style={{ position: 'relative' }}>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) addTag(tagInput.trim()) }}
              placeholder="+ Tag"
              style={{ width: 60, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '2px 8px', fontSize: 10, color: 'rgba(255,255,255,0.5)', outline: 'none', fontFamily: 'monospace' }} />
          </div>
          {TAG_PRESETS.filter(p => !tags.includes(p.label)).slice(0, 3).map(p => (
            <button key={p.label} type="button" onClick={() => addTag(p.label)}
              style={{ padding: '2px 7px', background: `${p.color}10`, border: `1px solid ${p.color}25`, borderRadius: 20, fontSize: 10, color: p.color, cursor: 'pointer', fontFamily: 'monospace', opacity: 0.6 }}>
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={content} onChange={e => setContent(e.target.value)}
          placeholder={`Commencez à écrire...\n\nAstuce : Ctrl+Enter pour sauvegarder · Utilisez ☐ pour les cases à cocher`}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSave() }}
          style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', padding: '20px', fontSize: 14, color: 'rgba(255,255,255,0.8)', outline: 'none', resize: 'none', lineHeight: 1.7, fontFamily: "'DM Mono', 'JetBrains Mono', monospace", boxSizing: 'border-box' }}
        />
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 20px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{wc} mot{wc > 1 ? 's' : ''}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{content.length} car.</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', marginLeft: 'auto' }}>Ctrl+Enter pour sauvegarder</span>
      </div>
    </div>
  )
}

// ─── Note card (list) ─────────────────────────────────────────────────────────
function NoteCard({ note, meetings, isSelected, onClick }: { note: any; meetings: any[]; isSelected: boolean; onClick: () => void }) {
  const linked = note.for_meeting_date ? meetings.find(m => m.date?.startsWith(note.for_meeting_date)) : null
  const preview = note.content?.replace(/[☐☑]/g, '').trim().slice(0, 80) ?? ''
  const checkboxes = (note.content ?? '').match(/[☐☑]/g)
  const checked = (note.content ?? '').match(/☑/g)?.length ?? 0
  const total = checkboxes?.length ?? 0
  const hasSoon = note.for_meeting_date && isBefore(new Date(), addDays(new Date(note.for_meeting_date), 1)) && isAfter(new Date(note.for_meeting_date), new Date())

  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '13px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      borderLeft: `3px solid ${isSelected ? '#1D9E75' : 'transparent'}`,
      background: isSelected ? '#1D9E7508' : 'transparent',
      cursor: 'pointer', transition: 'all 0.12s',
    }}
    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: note.is_archived ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: note.is_archived ? 'italic' : 'normal' }}>
              {note.title}
            </span>
            {hasSoon && <span style={{ fontSize: 9, color: '#1D9E75', background: '#1D9E7515', borderRadius: 20, padding: '1px 5px', fontFamily: 'monospace', flexShrink: 0 }}>Bientôt</span>}
          </div>
          {preview && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4, fontFamily: 'monospace' }}>{preview}...</p>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{fRelative(note.created_at)}</span>
            {linked && <span style={{ fontSize: 9, color: '#378ADD', background: '#378ADD12', borderRadius: 20, padding: '1px 5px', fontFamily: 'monospace' }}>📅 {linked.title.slice(0, 20)}</span>}
            {total > 0 && <span style={{ fontSize: 9, color: checked === total ? '#1D9E75' : '#EF9F27', fontFamily: 'monospace' }}>☑ {checked}/{total}</span>}
            {(note.tags ?? []).slice(0, 2).map((t: string) => {
              const p = TAG_PRESETS.find(x => x.label === t)
              return <TagPill key={t} label={t} color={p?.color ?? '#8b90a4'} small />
            })}
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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

  const filtered = useMemo(() => {
    if (!notes) return []
    return notes.filter(n => {
      if (n.is_archived !== showArchived) return false
      if (filterTag && !(n.tags ?? []).includes(filterTag)) return false
      if (!search) return true
      return n.title.toLowerCase().includes(search.toLowerCase()) ||
        (n.content ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (n.tags ?? []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
    })
  }, [notes, search, filterTag, showArchived])

  const selected = notes?.find(n => n.id === selectedId) ?? filtered[0] ?? null

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    notes?.forEach(n => (n.tags ?? []).forEach((t: string) => tagSet.add(t)))
    return Array.from(tagSet)
  }, [notes])

  const handleCreate = async (data: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    await createNote.mutateAsync({ ...data, user_id: user?.id ?? '' })
    setCreating(false)
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

  const stats = useMemo(() => ({
    total: notes?.filter(n => !n.is_archived).length ?? 0,
    archived: notes?.filter(n => n.is_archived).length ?? 0,
    withMeeting: notes?.filter(n => !n.is_archived && n.for_meeting_date).length ?? 0,
    tagged: notes?.filter(n => !n.is_archived && (n.tags ?? []).length > 0).length ?? 0,
  }), [notes])

  // Render note content with checkbox support
  const renderContent = (content: string) => {
    if (!content) return null
    return content.split('\n').map((line, i) => {
      if (line.startsWith('☐ ') || line.startsWith('☑ ')) {
        const checked = line.startsWith('☑')
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, color: checked ? '#1D9E75' : 'rgba(255,255,255,0.4)', flexShrink: 0, marginTop: 1 }}>{checked ? '☑' : '☐'}</span>
            <span style={{ fontSize: 14, color: checked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)', textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.6 }}>{line.slice(2)}</span>
          </div>
        )
      }
      if (line.startsWith('# ')) return <p key={i} style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '12px 0 4px' }}>{line.slice(2)}</p>
      if (line.startsWith('## ')) return <p key={i} style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', margin: '10px 0 3px' }}>{line.slice(3)}</p>
      if (line === '') return <div key={i} style={{ height: 8 }} />
      return <p key={i} style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px', lineHeight: 1.65, fontFamily: "'DM Mono', monospace" }}>{line}</p>
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0c12', overflow: 'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
          <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, maxWidth: 340, width: '100%', margin: '0 16px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Supprimer cette note ?</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Irréversible.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '9px 0', fontSize: 13, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 600, color: '#fff', background: '#E24B4A', border: 'none', borderRadius: 10, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Topbar */}
      <div style={{ flexShrink: 0, padding: '0 24px', height: 52, borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#0e1118', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 }}>Notes de préparation</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: `${stats.total} notes`, color: '#1D9E75' },
            stats.withMeeting > 0 && { label: `${stats.withMeeting} liées`, color: '#378ADD' },
            stats.archived > 0 && { label: `${stats.archived} archivées`, color: '#565c75' },
          ].filter(Boolean).map((s: any, i) => (
            <span key={i} style={{ fontSize: 10, color: s.color, background: `${s.color}12`, borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace' }}>{s.label}</span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowArchived(!showArchived)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: showArchived ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
            {showArchived ? <Eye style={{ width: 12, height: 12 }} /> : <Archive style={{ width: 12, height: 12 }} />}
            {showArchived ? 'Actives' : 'Archivées'}
          </button>
          <button onClick={() => { setCreating(true); setSelectedId(null); setEditing(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#1D9E75', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus style={{ width: 12, height: 12 }} /> Nouvelle note
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── Left list ── */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
          {/* Search + tags */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '0 10px', height: 32 }}>
              <Search style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dans les notes..."
                style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 12, color: '#fff', outline: 'none' }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}><X style={{ width: 10, height: 10 }} /></button>}
            </div>
            {allTags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button onClick={() => setFilterTag(null)}
                  style={{ padding: '2px 8px', background: !filterTag ? 'rgba(255,255,255,0.08)' : 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, fontSize: 10, color: filterTag ? 'rgba(255,255,255,0.3)' : '#e8eaf0', cursor: 'pointer', fontFamily: 'monospace' }}>
                  Toutes
                </button>
                {allTags.map(t => {
                  const p = TAG_PRESETS.find(x => x.label === t)
                  return (
                    <button key={t} onClick={() => setFilterTag(filterTag === t ? null : t)}
                      style={{ padding: '2px 8px', background: filterTag === t ? `${p?.color ?? '#8b90a4'}20` : 'transparent', border: `1px solid ${filterTag === t ? (p?.color ?? '#8b90a4') : 'rgba(255,255,255,0.07)'}30`, borderRadius: 20, fontSize: 10, color: p?.color ?? '#8b90a4', cursor: 'pointer', fontFamily: 'monospace' }}>
                      {t}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>}
            {!isLoading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                {search || filterTag ? 'Aucun résultat' : showArchived ? 'Aucune note archivée' : 'Aucune note'}
              </div>
            )}
            {filtered.map(n => (
              <NoteCard key={n.id} note={n} meetings={meetings ?? []} isSelected={(selectedId ?? filtered[0]?.id) === n.id}
                onClick={() => { setSelectedId(n.id); setCreating(false); setEditing(false) }} />
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#0c0f18' }}>
          {creating ? (
            <NoteEditor meetings={meetings ?? []} onSave={handleCreate} onClose={() => setCreating(false)} />
          ) : editing && selected ? (
            <NoteEditor note={selected} meetings={meetings ?? []} onSave={handleUpdate} onClose={() => setEditing(false)} />
          ) : selected ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Note header */}
              <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, background: 'linear-gradient(180deg, rgba(29,158,117,0.04) 0%, transparent 100%)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>{selected.title}</h2>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock style={{ width: 10, height: 10 }} /> {fRelative(selected.created_at)}
                      </span>
                      {selected.for_meeting_date && (
                        <span style={{ fontSize: 10, color: '#378ADD', background: '#378ADD12', border: '1px solid #378ADD25', borderRadius: 20, padding: '1px 7px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CalendarDays style={{ width: 9, height: 9 }} />
                          Réunion du {fDate(selected.for_meeting_date)}
                        </span>
                      )}
                      {(selected.tags ?? []).map((t: string) => {
                        const p = TAG_PRESETS.find(x => x.label === t)
                        return <TagPill key={t} label={t} color={p?.color ?? '#8b90a4'} />
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditing(true)} title="Modifier"
                      style={{ padding: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
                      <Edit3 style={{ width: 13, height: 13 }} />
                    </button>
                    <button onClick={toggleArchive} title={selected.is_archived ? 'Désarchiver' : 'Archiver'}
                      style={{ padding: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', transition: 'all 0.15s' }}>
                      <Archive style={{ width: 13, height: 13 }} />
                    </button>
                    <button onClick={() => setDeleteConfirm(selected.id)} title="Supprimer"
                      style={{ padding: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#E24B4A'; (e.currentTarget as HTMLElement).style.borderColor = '#E24B4A30' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Note content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                {selected.content ? (
                  <div style={{ maxWidth: 680 }}>
                    {renderContent(selected.content)}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.15)' }}>
                    <BookOpen style={{ width: 32, height: 32, margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
                    <p style={{ fontSize: 13 }}>Note vide — cliquez sur Modifier pour ajouter du contenu</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'rgba(255,255,255,0.15)' }}>
              <FileText style={{ width: 40, height: 40, opacity: 0.2 }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 14, margin: '0 0 6px' }}>Sélectionnez une note</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.1)' }}>ou créez-en une nouvelle</p>
              </div>
              <button onClick={() => setCreating(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1D9E75', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                <Plus style={{ width: 13, height: 13 }} /> Nouvelle note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

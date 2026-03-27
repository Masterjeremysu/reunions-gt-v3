import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from './useNotes'
import { useMeetings } from '../meetings/useMeetings'
import { Spinner } from '../../components/ui'
import { fDate, fRelative } from '../../utils'
import {
  FileText, Plus, Search, X, Archive, Trash2,
  CalendarDays, Edit3, Loader2, Clock, BookOpen,
  Sparkles, CheckSquare, Hash, Eye, Filter, MoreHorizontal,
  Wand2, ListChecks, Tags, AlignLeft, Keyboard,
  LayoutGrid, List, ChevronDown, Send, StopCircle,
  Lightbulb, ArrowRight, Zap,
} from 'lucide-react'
import { format, isAfter, isBefore, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
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

const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Syne:wght@600;700;800&display=swap');
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(8px) } to { opacity: 1; transform: none } }
  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
  @keyframes shimmer {
    0% { background-position: -200% 0 }
    100% { background-position: 200% 0 }
  }
  * { box-sizing: border-box }
  ::-webkit-scrollbar { width: 4px; height: 4px }
  ::-webkit-scrollbar-track { background: transparent }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15) }
  .note-textarea::placeholder { color: rgba(255,255,255,0.18); font-style: italic }
  .note-card-btn:focus-visible { outline: 2px solid #1D9E75; outline-offset: -2px }
  .ai-thinking { animation: pulse 1.4s ease-in-out infinite }
  .tag-pill-hover:hover { opacity: 1 !important }
  .action-btn { transition: all 0.13s ease }
  .action-btn:hover { background: rgba(255,255,255,0.07) !important; color: #fff !important }
`

// ─── Gemini API helper (via proxy Vercel) ──────────────────────────────────────
async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  })
  if (!response.ok) throw new Error('Erreur API Gemini')
  const data = await response.json()
  return data.text ?? ''
}

// ─── AI actions ────────────────────────────────────────────────────────────────
type AIAction = 'summarize' | 'actions' | 'improve' | 'autotag' | 'title' | 'complete'

async function runAIAction(action: AIAction, content: string, title: string): Promise<string> {
  const noteCtx = `Titre: "${title}"\n\nContenu:\n${content || '(vide)'}`

  if (action === 'summarize') {
    return callClaude(
      'Tu es un assistant de réunion. Réponds en français. Sois concis (3 phrases max).',
      `Résume cette note de préparation de réunion en 2-3 phrases clés:\n\n${noteCtx}`
    )
  }
  if (action === 'actions') {
    return callClaude(
      'Tu es un assistant de réunion. Réponds en français. Extrais uniquement les actions concrètes.',
      `Extrais les actions à faire depuis cette note. Format: une action par ligne, commence chaque ligne par "☐ ". Si aucune action, réponds "Aucune action détectée."\n\n${noteCtx}`
    )
  }
  if (action === 'improve') {
    return callClaude(
      'Tu es un assistant de rédaction. Réponds en français. Améliore le texte en gardant le même format (markdown simple, ☐ pour les cases).',
      `Améliore la clarté et la concision de cette note de réunion. Conserve toute l'information. Réponds UNIQUEMENT avec le contenu amélioré, sans explication.\n\n${noteCtx}`
    )
  }
  if (action === 'autotag') {
    const available = TAG_PRESETS.map(t => t.label).join(', ')
    return callClaude(
      `Tu es un assistant de classification. Réponds en JSON uniquement, sans markdown, sans backticks, sans explication. Format exact: {"tags": ["tag1", "tag2"]}`,
      `Depuis ces tags disponibles: ${available}\n\nSélectionne les tags pertinents (0-3 max) pour cette note. Réponds UNIQUEMENT avec le JSON, rien d'autre.\n\n${noteCtx}`
    )
  }
  if (action === 'title') {
    return callClaude(
      'Tu es un assistant de rédaction. Réponds en français. Donne UNIQUEMENT le titre, sans ponctuation finale, sans guillemets, sans explication.',
      `Génère un titre court (5-7 mots max) et percutant pour cette note de réunion. UNIQUEMENT le titre.\n\n${noteCtx}`
    )
  }
  if (action === 'complete') {
    return callClaude(
      'Tu es un assistant de rédaction. Continue le texte naturellement en français. Réponds uniquement avec la continuation (pas le début).',
      `Continue naturellement ce texte de note de réunion (2-3 phrases max):\n\n${content}`
    )
  }
  return ''
}

// ─── Sub-components ───────────────────────────────────────────────────────────
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
        <button type="button" onClick={onRemove} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color, display: 'flex', padding: 0, opacity: 0.6,
        }}>
          <X style={{ width: 8, height: 8 }} />
        </button>
      )}
    </span>
  )
}

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

// ─── AI Panel ─────────────────────────────────────────────────────────────────
function AIPanel({ title, content, onInsert, onReplaceContent, onSetTitle, onAddTags }: {
  title: string
  content: string
  onInsert: (text: string) => void
  onReplaceContent: (text: string) => void
  onSetTitle: (t: string) => void
  onAddTags: (tags: string[]) => void
}) {
  const [loading, setLoading] = useState<AIAction | null>(null)
  const [result, setResult] = useState<{ action: AIAction; text: string } | null>(null)

  // FIX 1 : le résultat s'affiche toujours avant d'appliquer
  const run = async (action: AIAction) => {
    setLoading(action)
    setResult(null)
    try {
      const text = await runAIAction(action, content, title)
      if (!text || text.trim() === '') {
        toast.error('Réponse vide — essaie avec plus de contenu dans la note')
        return
      }
      // On stocke toujours le résultat pour affichage, même pour title/autotag
      setResult({ action, text })
    } catch (e: any) {
      toast.error('Erreur IA : ' + e.message)
    } finally {
      setLoading(null)
    }
  }

  // FIX 2 : applyResult corrigé pour chaque action
  const applyResult = () => {
    if (!result) return

    if (result.action === 'autotag') {
      // FIX 3 : nettoyage JSON robuste avant parse
      try {
        const cleaned = result.text
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim()
        const parsed = JSON.parse(cleaned)
        if (parsed.tags && Array.isArray(parsed.tags)) {
          onAddTags(parsed.tags)
          toast.success(`${parsed.tags.length} tag(s) ajouté(s)`)
        } else {
          toast.error('Format de tags inattendu')
        }
      } catch {
        toast.error('Impossible de parser les tags')
      }
    } else if (result.action === 'improve') {
      // Améliorer = remplace le contenu
      onReplaceContent(result.text)
      toast.success('Contenu amélioré')
    } else if (result.action === 'actions') {
      // FIX 4 : Extraire actions = insère EN DESSOUS, ne remplace pas
      onInsert('\n\n---\n📋 Actions extraites :\n' + result.text)
      toast.success('Actions insérées dans la note')
    } else if (result.action === 'title') {
      // FIX : titre = applique proprement sans guillemets parasites
      const cleanTitle = result.text.replace(/^["«\s]+|["»\s]+$/g, '').trim()
      onSetTitle(cleanTitle)
      toast.success('Titre mis à jour')
    } else {
      // summarize, complete = insère en dessous
      onInsert('\n\n---\n' + result.text)
      toast.success('Inséré dans la note')
    }
    setResult(null)
  }

  const AI_ACTIONS = [
    { id: 'summarize' as AIAction, label: 'Résumer', icon: AlignLeft, desc: 'Résumé en 3 phrases' },
    { id: 'actions' as AIAction, label: 'Extraire actions', icon: ListChecks, desc: 'Todo list depuis le texte' },
    { id: 'improve' as AIAction, label: 'Améliorer', icon: Wand2, desc: 'Réécriture plus claire' },
    { id: 'autotag' as AIAction, label: 'Auto-tags', icon: Tags, desc: 'Tags suggérés par IA' },
    { id: 'title' as AIAction, label: 'Titre IA', icon: Lightbulb, desc: 'Générer un titre' },
    { id: 'complete' as AIAction, label: 'Continuer', icon: ArrowRight, desc: 'Complétion du texte' },
  ]

  // Aperçu lisible selon le type d'action
  const getResultPreview = () => {
    if (!result) return ''
    if (result.action === 'autotag') {
      try {
        const cleaned = result.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
        const p = JSON.parse(cleaned)
        return (p.tags ?? []).join(', ') || 'Aucun tag suggéré'
      } catch { return result.text }
    }
    if (result.action === 'title') {
      return result.text.replace(/^["«\s]+|["»\s]+$/g, '').trim()
    }
    return result.text.slice(0, 220) + (result.text.length > 220 ? '…' : '')
  }

  return (
    <div style={{
      width: 240, borderLeft: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(10,12,20,0.95)', display: 'flex',
      flexDirection: 'column', animation: 'slideIn 0.2s ease',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <Sparkles style={{ width: 12, height: 12, color: '#7F77DD' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>
          IA ASSISTANT
        </span>
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {AI_ACTIONS.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => run(id)}
            disabled={!!loading}
            className="action-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', background: loading === id ? 'rgba(127,119,221,0.1)' : 'transparent',
              border: '1px solid', borderColor: loading === id ? 'rgba(127,119,221,0.3)' : 'rgba(255,255,255,0.05)',
              borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
              textAlign: 'left', opacity: loading && loading !== id ? 0.4 : 1,
            }}
          >
            {loading === id
              ? <Loader2 className="ai-thinking" style={{ width: 12, height: 12, color: '#7F77DD', flexShrink: 0 }} />
              : <Icon style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
            }
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: loading === id ? '#7F77DD' : 'rgba(255,255,255,0.7)' }}>{label}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace" }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Result — s'affiche toujours avant d'appliquer */}
      {result && (
        <div style={{
          margin: '0 10px 10px', padding: 12,
          background: 'rgba(127,119,221,0.08)', border: '1px solid rgba(127,119,221,0.2)',
          borderRadius: 10, animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ fontSize: 10, color: '#7F77DD', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6, fontWeight: 600 }}>
            {AI_ACTIONS.find(a => a.id === result.action)?.label} · aperçu
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap', fontFamily: "'IBM Plex Mono', monospace" }}>
            {getResultPreview()}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={applyResult} style={{
              flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 600,
              color: '#fff', background: '#7F77DD', border: 'none',
              borderRadius: 6, cursor: 'pointer',
            }}>
              ✓ Appliquer
            </button>
            <button onClick={() => setResult(null)} style={{
              padding: '6px 8px', fontSize: 10, color: 'rgba(255,255,255,0.3)',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6, cursor: 'pointer',
            }}>
              <X style={{ width: 10, height: 10 }} />
            </button>
          </div>
        </div>
      )}

      {/* Hint */}
      <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Keyboard style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }}>Cmd+K pour ouvrir / fermer</span>
        </div>
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
  const [showAI, setShowAI] = useState(false)
  const [aiCompletion, setAiCompletion] = useState('')
  const [completionLoading, setCompletionLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Global keyboard shortcut Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowAI(p => !p) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
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

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current
    if (!ta) { setContent(c => c + text); return }
    const pos = ta.selectionStart
    const newContent = content.slice(0, pos) + text + content.slice(pos)
    setContent(newContent)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + text.length; ta.focus() }, 0)
  }

  const insertCheckbox = () => insertAtCursor('☐ ')

  // Tab autocomplete
  const handleTabComplete = async () => {
    if (completionLoading) return
    setCompletionLoading(true)
    try {
      const completion = await runAIAction('complete', content, title)
      setAiCompletion(completion)
    } catch {} finally { setCompletionLoading(false) }
  }

  const acceptCompletion = () => {
    if (!aiCompletion) return
    setContent(c => c + aiCompletion)
    setAiCompletion('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      if (aiCompletion) { acceptCompletion(); return }
      handleTabComplete()
    }
    if (e.key === 'Escape' && aiCompletion) { setAiCompletion(''); return }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Enter') setAiCompletion('')
  }

  const wc = wordCount(content)
  const linked = meetings.find(m => m.date?.startsWith(forDate))

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Main editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{
          padding: '0 20px', height: 52, borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          background: 'rgba(255,255,255,0.01)',
        }}>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Titre de la note..."
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 15, fontWeight: 700, color: '#fff', outline: 'none',
              fontFamily: "'Syne', sans-serif", letterSpacing: '-0.02em',
            }}
          />
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button type="button" onClick={insertCheckbox} title="Case à cocher (☐)"
              className="action-btn"
              style={{ padding: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex' }}>
              <CheckSquare style={{ width: 13, height: 13 }} />
            </button>
            <button type="button" onClick={() => setShowAI(p => !p)} title="Assistant IA (Cmd+K)"
              className="action-btn"
              style={{ padding: 7, background: showAI ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${showAI ? 'rgba(127,119,221,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 7, cursor: 'pointer', color: showAI ? '#7F77DD' : 'rgba(255,255,255,0.35)', display: 'flex', gap: 4, alignItems: 'center' }}>
              <Sparkles style={{ width: 13, height: 13 }} />
            </button>
            <button type="button" onClick={onClose}
              className="action-btn"
              style={{ padding: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex' }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !title.trim()}
              style={{
                padding: '7px 16px', background: title.trim() ? '#1D9E75' : 'rgba(29,158,117,0.3)',
                border: 'none', borderRadius: 7, cursor: title.trim() ? 'pointer' : 'not-allowed',
                color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex',
                alignItems: 'center', gap: 5, transition: 'all 0.15s',
              }}>
              {saving ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : null}
              {note ? 'Sauvegarder' : 'Créer'}
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div style={{
          padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap',
        }}>
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
            <div style={{ position: 'relative' }}>
              <input
                value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) addTag(tagInput.trim()) }}
                placeholder="+ Tag"
                style={{ width: 55, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '2px 7px', fontSize: 10, color: 'rgba(255,255,255,0.5)', outline: 'none', fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
            {TAG_PRESETS.filter(p => !tags.includes(p.label)).slice(0, 4).map(p => (
              <button key={p.label} type="button" onClick={() => addTag(p.label)}
                style={{ padding: '2px 7px', background: `${p.color}10`, border: `1px solid ${p.color}25`, borderRadius: 4, fontSize: 10, color: p.color, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", opacity: 0.55, transition: 'opacity 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.55'}>
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea with ghost completion */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={content}
            onChange={e => { setContent(e.target.value); setAiCompletion('') }}
            onKeyDown={handleKeyDown}
            placeholder={`Commencez à écrire...\n\n# Titre de section\n## Sous-titre\n☐ Action à faire\n\nTab → complétion IA · Cmd+K → assistant`}
            style={{
              position: 'absolute', inset: 0,
              background: 'transparent', border: 'none',
              padding: '20px 24px', fontSize: 13.5, color: 'rgba(255,255,255,0.82)',
              outline: 'none', resize: 'none', lineHeight: 1.75,
              fontFamily: "'IBM Plex Mono', monospace", zIndex: 2,
              width: '100%', height: '100%',
            }}
          />
          {/* Ghost text overlay for AI completion */}
          {aiCompletion && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '0 24px 12px',
              pointerEvents: 'none', zIndex: 1,
            }}>
              <div style={{
                background: 'rgba(127,119,221,0.08)', border: '1px solid rgba(127,119,221,0.2)',
                borderRadius: 8, padding: '8px 12px', animation: 'fadeIn 0.15s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Sparkles style={{ width: 10, height: 10, color: '#7F77DD' }} />
                  <span style={{ fontSize: 9, color: 'rgba(127,119,221,0.8)', fontFamily: "'IBM Plex Mono', monospace" }}>Suggestion IA · Tab pour accepter · Esc pour ignorer</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'rgba(127,119,221,0.65)', fontFamily: "'IBM Plex Mono', monospace", margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {aiCompletion}
                </p>
              </div>
            </div>
          )}
          {completionLoading && (
            <div style={{
              position: 'absolute', bottom: 12, left: 24,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', background: 'rgba(127,119,221,0.08)',
              border: '1px solid rgba(127,119,221,0.15)', borderRadius: 6,
            }}>
              <Loader2 className="ai-thinking" style={{ width: 10, height: 10, color: '#7F77DD' }} />
              <span style={{ fontSize: 10, color: 'rgba(127,119,221,0.6)', fontFamily: "'IBM Plex Mono', monospace" }}>Génération…</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 20px', borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          background: 'rgba(255,255,255,0.01)',
        }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: "'IBM Plex Mono', monospace" }}>{wc} mot{wc !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: "'IBM Plex Mono', monospace" }}>{content.length} car.</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.12)', fontFamily: "'IBM Plex Mono', monospace", marginLeft: 'auto' }}>
            Cmd+Enter sauvegarder · Tab complétion IA · Cmd+K assistant
          </span>
        </div>
      </div>

      {/* AI Panel (conditionally shown) */}
      {showAI && (
        <AIPanel
          title={title}
          content={content}
          onInsert={text => setContent(c => c + text)}
          onReplaceContent={setContent}
          onSetTitle={setTitle}
          onAddTags={newTags => {
            setTags(prev => {
              const merged = [...prev]
              newTags.forEach((t: string) => { if (!merged.includes(t)) merged.push(t) })
              return merged
            })
          }}
        />
      )}
    </div>
  )
}

// ─── Note Card ────────────────────────────────────────────────────────────────
function NoteCard({ note, meetings, isSelected, onClick, search }: {
  note: any; meetings: any[]; isSelected: boolean; onClick: () => void; search: string
}) {
  const linked = note.for_meeting_date ? meetings.find(m => m.date?.startsWith(note.for_meeting_date)) : null
  const preview = note.content?.replace(/[☐☑]/g, '').replace(/^[#]+\s/gm, '').trim().slice(0, 85) ?? ''
  const checked = (note.content ?? '').match(/☑/g)?.length ?? 0
  const total = ((note.content ?? '').match(/[☐☑]/g) ?? []).length
  const hasSoon = note.for_meeting_date && isBefore(new Date(), addDays(new Date(note.for_meeting_date), 1)) && isAfter(new Date(note.for_meeting_date), new Date())

  return (
    <button
      className="note-card-btn"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        borderLeft: `2px solid ${isSelected ? '#1D9E75' : 'transparent'}`,
        background: isSelected ? 'rgba(29,158,117,0.06)' : 'transparent',
        cursor: 'pointer', transition: 'all 0.1s', display: 'block',
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)' }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <span style={{
              fontSize: 12.5, fontWeight: 600,
              color: note.is_archived ? 'rgba(255,255,255,0.3)' : isSelected ? '#fff' : 'rgba(255,255,255,0.8)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontStyle: note.is_archived ? 'italic' : 'normal',
              fontFamily: "'Syne', sans-serif",
            }}>
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
  const renderContent = (content: string) => {
    if (!content) return null
    return content.split('\n').map((line, i) => {
      if (line.startsWith('☐ ') || line.startsWith('☑ ')) {
        const isChecked = line.startsWith('☑')
        return (
          <div key={i} onClick={() => onToggleCheckbox(i)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 5, cursor: 'pointer', padding: '3px 6px', borderRadius: 6, transition: 'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <span style={{ fontSize: 15, color: isChecked ? '#1D9E75' : 'rgba(255,255,255,0.35)', flexShrink: 0, marginTop: 1, userSelect: 'none' }}>{isChecked ? '☑' : '☐'}</span>
            <span style={{ fontSize: 14, color: isChecked ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.75)', textDecoration: isChecked ? 'line-through' : 'none', lineHeight: 1.65, fontFamily: "'IBM Plex Mono', monospace", userSelect: 'none' }}>
              {line.slice(2)}
            </span>
          </div>
        )
      }
      if (line.startsWith('# ')) return <h2 key={i} style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '20px 0 6px', fontFamily: "'Syne', sans-serif", letterSpacing: '-0.02em' }}>{line.slice(2)}</h2>
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.7)', margin: '14px 0 5px', fontFamily: "'Syne', sans-serif" }}>{line.slice(3)}</h3>
      if (line === '') return <div key={i} style={{ height: 10 }} />
      return <p key={i} style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.68)', margin: '0 0 4px', lineHeight: 1.75, fontFamily: "'IBM Plex Mono', monospace" }}>{line}</p>
    })
  }

  const linkedMeeting = note.for_meeting_date ? meetings.find(m => m.date?.startsWith(note.for_meeting_date)) : null
  const checked = (note.content ?? '').match(/☑/g)?.length ?? 0
  const total = ((note.content ?? '').match(/[☐☑]/g) ?? []).length
  const progress = total > 0 ? (checked / total) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '22px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0, background: 'linear-gradient(180deg, rgba(29,158,117,0.03) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.03em', fontFamily: "'Syne', sans-serif", lineHeight: 1.2 }}>
              {note.title}
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock style={{ width: 10, height: 10 }} /> {fRelative(note.created_at)}
              </span>
              {note.updated_at && note.updated_at !== note.created_at && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  · modifié {fRelative(note.updated_at)}
                </span>
              )}
              {linkedMeeting && (
                <span style={{ fontSize: 10, color: '#378ADD', background: '#378ADD12', border: '1px solid #378ADD25', borderRadius: 4, padding: '1px 7px', fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CalendarDays style={{ width: 9, height: 9 }} />
                  {fDate(note.for_meeting_date)}
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
              { icon: Edit3, onClick: onEdit, title: 'Modifier', hoverColor: '#fff' },
              { icon: Archive, onClick: onArchive, title: note.is_archived ? 'Désarchiver' : 'Archiver', hoverColor: '#EF9F27' },
              { icon: Trash2, onClick: onDelete, title: 'Supprimer', hoverColor: '#E24B4A' },
            ].map(({ icon: Icon, onClick, title, hoverColor }) => (
              <button key={title} onClick={onClick} title={title}
                className="action-btn"
                style={{ padding: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = hoverColor; (e.currentTarget as HTMLElement).style.borderColor = `${hoverColor}40` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
                <Icon style={{ width: 13, height: 13 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar for checkboxes */}
        {total > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: progress === 100 ? '#1D9E75' : 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {checked}/{total} tâches complétées
              </span>
              {progress === 100 && <span style={{ fontSize: 9, color: '#1D9E75', background: '#1D9E7515', borderRadius: 3, padding: '1px 5px', fontFamily: "'IBM Plex Mono', monospace" }}>TERMINÉ ✓</span>}
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#1D9E75' : '#EF9F27', borderRadius: 99, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {note.content ? (
          <div style={{ maxWidth: 700 }}>
            {renderContent(note.content)}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.12)' }}>
            <BookOpen style={{ width: 36, height: 36, margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
            <p style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>Note vide — cliquez sur Modifier pour ajouter du contenu</p>
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

  // Global keyboard shortcut: Cmd+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !creating && !editing) {
        e.preventDefault()
        setCreating(true); setSelectedId(null); setEditing(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [creating, editing])

  const filtered = useMemo(() => {
    if (!notes) return []
    return notes.filter(n => {
      if (n.is_archived !== showArchived) return false
      if (filterTag && !(n.tags ?? []).includes(filterTag)) return false
      if (!search) return true
      const q = search.toLowerCase()
      return n.title.toLowerCase().includes(q) ||
        (n.content ?? '').toLowerCase().includes(q) ||
        (n.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
    })
  }, [notes, search, filterTag, showArchived])

  const selected = notes?.find(n => n.id === selectedId) ?? filtered[0] ?? null

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    notes?.forEach(n => (n.tags ?? []).forEach((t: string) => tagSet.add(t)))
    return Array.from(tagSet)
  }, [notes])

  const stats = useMemo(() => ({
    total: notes?.filter(n => !n.is_archived).length ?? 0,
    archived: notes?.filter(n => n.is_archived).length ?? 0,
    withMeeting: notes?.filter(n => !n.is_archived && n.for_meeting_date).length ?? 0,
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
    filtered.forEach(n => {
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

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#131620', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%', margin: '0 16px', animation: 'fadeIn 0.15s ease' }}>
            <div style={{ width: 36, height: 36, background: '#E24B4A15', border: '1px solid #E24B4A30', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Trash2 style={{ width: 16, height: 16, color: '#E24B4A' }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6, fontFamily: "'Syne', sans-serif" }}>Supprimer cette note ?</h3>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>Cette action est irréversible.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '9px 0', fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700, color: '#fff', background: '#E24B4A', border: 'none', borderRadius: 9, cursor: 'pointer' }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topbar */}
      <div style={{
        flexShrink: 0, padding: '0 20px', height: 50,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(9,11,18,0.95)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Syne', sans-serif", letterSpacing: '-0.02em' }}>
          Notes
        </span>
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

          <button onClick={() => setShowArchived(!showArchived)}
            className="action-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: showArchived ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
            <Archive style={{ width: 11, height: 11 }} />
            {showArchived ? 'Actives' : 'Archivées'}
          </button>
          <button onClick={() => { setCreating(true); setSelectedId(null); setEditing(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#1D9E75', border: 'none', borderRadius: 7, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.12s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
            <Plus style={{ width: 11, height: 11 }} /> Nouvelle <span style={{ opacity: 0.6, fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}>⌘N</span>
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
            {filtered.map(n => (
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
            <NoteViewer
              note={selected}
              meetings={meetings ?? []}
              onEdit={() => setEditing(true)}
              onArchive={toggleArchive}
              onDelete={() => setDeleteConfirm(selected.id)}
              onToggleCheckbox={handleToggleCheckbox}
            />
          ) : selected === null && view === 'list' ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'rgba(255,255,255,0.12)' }}>
              <FileText style={{ width: 44, height: 44, opacity: 0.15 }} />
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
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', gap: 0, padding: '20px', height: '100%' }}>
              {kanbanColumns.map(col => (
                <div key={col.label} style={{ width: 240, flexShrink: 0, marginRight: 14, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: col.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: col.color, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}>
                      {col.label.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 5px', marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace" }}>{col.notes.length}</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.notes.map(n => (
                      <button key={n.id}
                        onClick={() => { setView('list'); setSelectedId(n.id); setCreating(false); setEditing(false) }}
                        style={{
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                          textAlign: 'left', transition: 'all 0.13s', display: 'block', width: '100%',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = `${col.color}30` }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 5, fontFamily: "'Syne', sans-serif", lineHeight: 1.3 }}>{n.title}</div>
                        {n.content && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontFamily: "'IBM Plex Mono', monospace" }}>
                          {n.content.replace(/[☐☑#]/g, '').trim()}
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

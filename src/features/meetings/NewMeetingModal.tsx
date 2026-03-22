import { useState, useEffect } from 'react'
import { useMeetings, useCreateMeeting } from './useMeetings'
import { useColleagues } from '../colleagues/useColleagues'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  X, Check, Plus, ChevronRight,
  ThumbsUp, ThumbsDown, AlertCircle, Heart,
  Users, CalendarDays, Clock, FileText, Loader2, Trash2
} from 'lucide-react'
import { Avatar } from '../../components/ui'
import { toast } from 'sonner'

// ─── Auto-title generator ─────────────────────────────────────────────────────
function useNextMeetingTitle(meetings: any[] | undefined) {
  const today = format(new Date(), 'dd/MM/yyyy', { locale: fr })
  if (!meetings || meetings.length === 0) return `Réunion GT Hebdo — ${today}`

  // Count meetings with same base pattern this week
  const weekNum = format(new Date(), "'S'ww", { locale: fr })
  return `Réunion GT Hebdo — ${today}`
}

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { id: 'info',       label: 'Infos',         icon: FileText,    short: 'Informations générales'  },
  { id: 'people',     label: 'Équipe',         icon: Users,       short: 'Participants présents'   },
  { id: 'successes',  label: 'Succès',         icon: ThumbsUp,    short: 'Points positifs'         },
  { id: 'failures',   label: 'Défauts',        icon: ThumbsDown,  short: 'Points à améliorer'      },
  { id: 'sensitive',  label: 'Sensibles',      icon: AlertCircle, short: 'Points de vigilance'     },
  { id: 'relational', label: 'Relationnels',   icon: Heart,       short: 'Dynamique d\'équipe'     },
]

const STEP_COLORS: Record<string, string> = {
  info:       '#1D9E75',
  people:     '#378ADD',
  successes:  '#1D9E75',
  failures:   '#E24B4A',
  sensitive:  '#EF9F27',
  relational: '#7F77DD',
}

const STEP_DOT: Record<string, string> = {
  successes:  'bg-teal-400',
  failures:   'bg-red-400',
  sensitive:  'bg-amber-400',
  relational: 'bg-purple-400',
}

// ─── List editor ──────────────────────────────────────────────────────────────
function ListEditor({
  items, onChange, placeholder, accentColor,
}: {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
  accentColor: string
}) {
  const update = (i: number, val: string) => {
    const next = [...items]; next[i] = val; onChange(next)
  }
  const add = () => onChange([...items, ''])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <div
            className="w-1 h-full min-h-[36px] rounded-full flex-shrink-0 transition-opacity"
            style={{ background: accentColor, opacity: item.trim() ? 1 : 0.3 }}
          />
          <input
            value={item}
            onChange={e => update(i, e.target.value)}
            placeholder={`${placeholder} ${i + 1}`}
            autoFocus={i === items.length - 1 && items.length > 1}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); add() }
              if (e.key === 'Backspace' && !item && items.length > 1) {
                e.preventDefault(); remove(i)
              }
            }}
            className="flex-1 bg-transparent border-b border-white/[0.08] py-2 text-sm text-white placeholder:text-white/20 outline-none transition-all focus:border-white/30"
            style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace", fontSize: '13px' }}
          />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-red-400 transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 mt-1 text-xs transition-colors"
        style={{ color: accentColor, opacity: 0.7 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
      >
        <div className="w-4 h-4 rounded border flex items-center justify-center" style={{ borderColor: accentColor }}>
          <Plus className="w-2.5 h-2.5" />
        </div>
        Ajouter une ligne
      </button>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export function NewMeetingModal({ onClose }: { onClose: () => void }) {
  const { data: meetings } = useMeetings()
  const { data: colleagues } = useColleagues()
  const createMeeting = useCreateMeeting()
  const defaultTitle = useNextMeetingTitle(meetings)

  const [step, setStep] = useState(0)
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState('09:00')
  const [selectedColleagues, setSelectedColleagues] = useState<string[]>([])
  const [successes, setSuccesses] = useState([''])
  const [failures, setFailures] = useState([''])
  const [sensitive, setSensitive] = useState([''])
  const [relational, setRelational] = useState([''])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const toggleColleague = (id: string) =>
    setSelectedColleagues(p => p.includes(id) ? p.filter(c => c !== id) : [...p, id])

  const clean = (arr: string[]) => arr.map(s => s.trim()).filter(Boolean)

  const canNext = () => {
    if (step === 0) return title.trim().length > 0
    return true
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Le titre est obligatoire'); setStep(0); return }
    await createMeeting.mutateAsync({
      title: title.trim(),
      description: description || null,
      date: `${date}T${time}:00`,
      colleagues_ids: selectedColleagues.length > 0 ? selectedColleagues : null,
      successes: clean(successes),
      failures: clean(failures),
      sensitive_points: clean(sensitive),
      relational_points: clean(relational),
      created_by_user_id: null,
    })
    onClose()
  }

  const currentStep = STEPS[step]
  const accentColor = STEP_COLORS[currentStep.id]
  const progress = ((step) / (STEPS.length - 1)) * 100

  const stepContent: Record<string, React.ReactNode> = {
    info: (
      <div className="flex flex-col gap-6">
        <div>
          <label className="block text-[10px] tracking-[0.15em] text-white/40 uppercase mb-2"
            style={{ fontFamily: "'DM Mono', monospace" }}>
            Titre de la réunion
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Réunion GT Hebdo — 22/03/2025"
            autoFocus
            className="w-full bg-transparent border-b-2 pb-2 text-white text-lg outline-none transition-colors placeholder:text-white/15"
            style={{ borderColor: accentColor, fontFamily: "'DM Mono', monospace" }}
          />
        </div>
        <div>
          <label className="block text-[10px] tracking-[0.15em] text-white/40 uppercase mb-2"
            style={{ fontFamily: "'DM Mono', monospace" }}>
            Description / ordre du jour
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Contexte, objectifs, points à aborder..."
            rows={3}
            className="w-full bg-transparent border-b pb-2 text-sm text-white/80 outline-none resize-none placeholder:text-white/15 transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.1)', fontFamily: "'DM Mono', monospace", fontSize: '13px' }}
          />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] tracking-[0.15em] text-white/40 uppercase mb-2"
              style={{ fontFamily: "'DM Mono', monospace" }}>
              Date
            </label>
            <div className="flex items-center gap-3 border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <CalendarDays className="w-4 h-4 text-white/30 flex-shrink-0" />
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white outline-none"
                style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.15em] text-white/40 uppercase mb-2"
              style={{ fontFamily: "'DM Mono', monospace" }}>
              Heure de début
            </label>
            <div className="flex items-center gap-3 border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <Clock className="w-4 h-4 text-white/30 flex-shrink-0" />
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white outline-none"
                style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
          </div>
        </div>
      </div>
    ),

    people: (
      <div className="flex flex-col gap-2">
        {(colleagues ?? []).length === 0 && (
          <p className="text-sm text-white/30 text-center py-8">Aucun collègue enregistré</p>
        )}
        {(colleagues ?? []).map(c => {
          const selected = selectedColleagues.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleColleague(c.id)}
              className="flex items-center gap-4 p-3 rounded-xl border transition-all text-left"
              style={{
                borderColor: selected ? accentColor + '60' : 'rgba(255,255,255,0.06)',
                background: selected ? accentColor + '10' : 'transparent',
              }}
            >
              <Avatar name={c.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{c.name}</p>
                <p className="text-xs text-white/40" style={{ fontFamily: "'DM Mono', monospace" }}>{c.post}</p>
              </div>
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0"
                style={{
                  borderColor: selected ? accentColor : 'rgba(255,255,255,0.15)',
                  background: selected ? accentColor : 'transparent',
                }}
              >
                {selected && <Check className="w-3 h-3 text-white" />}
              </div>
            </button>
          )
        })}
        {selectedColleagues.length > 0 && (
          <p className="text-xs text-center mt-2" style={{ color: accentColor, fontFamily: "'DM Mono', monospace" }}>
            {selectedColleagues.length} participant{selectedColleagues.length > 1 ? 's' : ''} sélectionné{selectedColleagues.length > 1 ? 's' : ''}
          </p>
        )}
      </div>
    ),

    successes: (
      <ListEditor items={successes} onChange={setSuccesses}
        placeholder="Succès" accentColor={accentColor} />
    ),
    failures: (
      <ListEditor items={failures} onChange={setFailures}
        placeholder="Défaut" accentColor={accentColor} />
    ),
    sensitive: (
      <ListEditor items={sensitive} onChange={setSensitive}
        placeholder="Point sensible" accentColor={accentColor} />
    ),
    relational: (
      <ListEditor items={relational} onChange={setRelational}
        placeholder="Point relationnel" accentColor={accentColor} />
    ),
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="h-full w-full max-w-[520px] flex flex-col overflow-hidden"
        style={{ background: '#0d1018', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 px-8 pt-7 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <p
                className="text-[10px] tracking-[0.2em] uppercase mb-1"
                style={{ color: accentColor, fontFamily: "'DM Mono', monospace" }}
              >
                Nouvelle réunion · étape {step + 1}/{STEPS.length}
              </p>
              <h2 className="text-xl font-medium text-white tracking-tight">{currentStep.short}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-5 relative">
            <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div
              className="absolute top-0 left-0 h-px transition-all duration-500"
              style={{ width: `${progress}%`, background: accentColor }}
            />
            {/* Step dots */}
            <div className="flex justify-between mt-3">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const done = i < step
                const active = i === step
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    className="flex flex-col items-center gap-1 transition-all"
                    style={{ cursor: i < step ? 'pointer' : 'default' }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                      style={{
                        background: done ? accentColor : active ? accentColor + '20' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${done || active ? accentColor : 'rgba(255,255,255,0.1)'}`,
                      }}
                    >
                      {done
                        ? <Check className="w-3 h-3 text-white" />
                        : <Icon className="w-3 h-3" style={{ color: active ? accentColor : 'rgba(255,255,255,0.25)' }} />
                      }
                    </div>
                    <span
                      className="text-[9px] tracking-wide"
                      style={{
                        color: active ? accentColor : done ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)',
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {s.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {stepContent[currentStep.id]}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 px-8 py-5 flex items-center gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2.5 text-sm rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              ← Retour
            </button>
          )}

          <div className="flex-1" />

          {/* Skip label for optional steps */}
          {step > 1 && (
            <button
              type="button"
              onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : handleSubmit()}
              className="text-xs transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Mono', monospace" }}
            >
              Passer
            </button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all disabled:opacity-30"
              style={{ background: accentColor, color: '#fff' }}
            >
              Suivant
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMeeting.isPending}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
              style={{ background: accentColor, color: '#fff' }}
            >
              {createMeeting.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Création...</>
                : <><Check className="w-3.5 h-3.5" /> Créer la réunion</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useMeetings, useDeleteMeeting } from './useMeetings'
import { useActions, useCreateAction } from '../actions/useActions'
import { useColleagues } from '../colleagues/useColleagues'
import { Badge, Spinner, Avatar, EmptyState } from '../../components/ui'
import { fDate, fDateTime, isOverdue } from '../../utils'
import { ACTION_STATUS } from '../../constants'
import { NewMeetingModal } from './NewMeetingModal'
import { EditMeetingModal } from './EditMeetingModal'
import { exportMeetingPDF } from './usePDFExport'
import {
  CalendarDays, Plus, Search, Trash2, Pencil, FileDown,
  ThumbsUp, ThumbsDown, AlertCircle, Heart,
  X, Users, Check, FileText, Clock
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Hook cr_items avec attributions ─────────────────────────────────────────
function useCRItems(meetingId: string | null) {
  return useQuery({
    queryKey: ['cr_items', meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cr_items')
        .select('*, colleagues(id, name, post)')
        .eq('meeting_id', meetingId!)
        .order('order_index', { ascending: true })
      if (error) return []
      return data ?? []
    },
    staleTime: 1000 * 60 * 2,
  })
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function parseItem(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const match = t.match(/^[0-9a-f\-]{36}::(.+)$/i)
  if (match) return match[1].trim() || null
  if (isUUID(t)) return null
  return t
}

function parseItems(arr: string[] | null | undefined): string[] {
  return (arr ?? []).map(parseItem).filter(Boolean) as string[]
}

// ─── CR config ────────────────────────────────────────────────────────────────
const CR_CONF = [
  { key: 'successes',         label: 'Succès',       icon: ThumbsUp,    color: '#1D9E75', light: '#1D9E7515', border: '#1D9E7725' },
  { key: 'failures',          label: 'Défauts',      icon: ThumbsDown,  color: '#E24B4A', light: '#E24B4A15', border: '#E24B4A25' },
  { key: 'sensitive_points',  label: 'Sensibles',    icon: AlertCircle, color: '#EF9F27', light: '#EF9F2715', border: '#EF9F2725' },
  { key: 'relational_points', label: 'Relationnels', icon: Heart,       color: '#7F77DD', light: '#7F77DD15', border: '#7F77DD25' },
] as const

type MeetingRow = any

// ─── Main ─────────────────────────────────────────────────────────────────────
export function MeetingsPage() {
  const { data: meetings, isLoading } = useMeetings()
  const { data: colleagues } = useColleagues()
  const deleteMeeting = useDeleteMeeting()

  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [showModal,     setShowModal]     = useState(false)
  const [editMeeting,   setEditMeeting]   = useState<MeetingRow | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [crSearch,      setCrSearch]      = useState('')

  const filtered = useMemo(() => {
    if (!meetings) return []
    const q = search.toLowerCase().trim()
    if (!q) return meetings
    return meetings.filter(m => {
      if (m.title.toLowerCase().includes(q)) return true
      const allText = [
        ...parseItems(m.successes), ...parseItems(m.failures),
        ...parseItems(m.sensitive_points), ...parseItems(m.relational_points),
      ].join(' ').toLowerCase()
      return allText.includes(q)
    })
  }, [meetings, search])

  const selected: MeetingRow | null = meetings?.find(m => m.id === selectedId) ?? filtered[0] ?? null
  const getColleague = (id: string) => colleagues?.find(c => c.id === id)

  const filteredCR = useMemo(() => {
    const q = crSearch.toLowerCase().trim()
    if (!q) return null
    const result: Record<string, string[]> = {}
    for (const conf of CR_CONF) {
      const items = parseItems(selected?.[conf.key])
      result[conf.key] = items.filter(s => s.toLowerCase().includes(q))
    }
    return result
  }, [crSearch, selected])

  const handleDelete = async (id: string) => {
    await deleteMeeting.mutateAsync(id)
    setDeleteConfirm(null)
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0c12', overflow: 'hidden' }}>

      {showModal   && <NewMeetingModal onClose={() => setShowModal(false)} />}
      {editMeeting && <EditMeetingModal meeting={editMeeting} onClose={() => setEditMeeting(null)} />}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
          <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', margin: '0 16px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 500, color: '#fff', marginBottom: 8 }}>Supprimer cette réunion ?</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Cette action est irréversible. Les points d'action liés seront supprimés.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '9px 0', fontSize: 13, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 500, color: '#fff', background: '#E24B4A', border: 'none', borderRadius: 10, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Topbar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', height: 52, borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#0e1118' }}>
        <h1 style={{ fontSize: 14, fontWeight: 500, color: '#fff', margin: 0 }}>Réunions</h1>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{meetings?.length ?? 0}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#1D9E75', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <Plus style={{ width: 13, height: 13 }} /> Nouvelle réunion
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left list ── */}
        <div style={{ width: 270, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: '#0a0c12' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '0 10px', height: 32 }}>
              <Search style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
                style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 12, color: '#fff', outline: 'none' }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}><X style={{ width: 11, height: 11 }} /></button>}
            </div>
            {search && filtered.length > 0 && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6, fontFamily: 'monospace' }}>{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</p>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>}
            {!isLoading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                {search ? `Aucun résultat pour "${search}"` : 'Aucune réunion'}
              </div>
            )}
            {filtered.map(m => {
              const isSelected = (selectedId ?? filtered[0]?.id) === m.id
              const d = new Date(m.date)
              const sc = parseItems(m.successes).length
              const fc = parseItems(m.failures).length
              const pc = parseItems(m.sensitive_points).length
              const rc = parseItems(m.relational_points).length
              const hasMatch = search && [
                ...parseItems(m.successes), ...parseItems(m.failures),
                ...parseItems(m.sensitive_points), ...parseItems(m.relational_points),
              ].some(s => s.toLowerCase().includes(search.toLowerCase()))

              return (
                <button key={m.id} onClick={() => setSelectedId(m.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: isSelected ? '2px solid #1D9E75' : '2px solid transparent', background: isSelected ? 'rgba(29,158,117,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.12s' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 32, flexShrink: 0, textAlign: 'center', paddingTop: 2 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: isSelected ? '#1D9E75' : '#fff', lineHeight: 1 }}>{format(d, 'd')}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginTop: 2, letterSpacing: '0.05em' }}>{format(d, 'MMM', { locale: fr })}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: isSelected ? '#e8eaf0' : 'rgba(255,255,255,0.8)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.title}
                        {hasMatch && !m.title.toLowerCase().includes(search.toLowerCase()) && (
                          <span style={{ marginLeft: 6, fontSize: 9, color: '#1D9E75', fontFamily: 'monospace' }}>dans le CR</span>
                        )}
                      </p>
                      {format(d, 'HH:mm') !== '00:00' && (
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', margin: '2px 0 0', fontFamily: 'monospace' }}>{format(d, 'HH:mm')}</p>
                      )}
                      {(sc + fc + pc + rc) > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                          {sc > 0 && <Pill color="#1D9E75">{sc} succès</Pill>}
                          {fc > 0 && <Pill color="#E24B4A">{fc} défaut{fc > 1 ? 's' : ''}</Pill>}
                          {pc > 0 && <Pill color="#EF9F27">{pc} sensible{pc > 1 ? 's' : ''}</Pill>}
                          {rc > 0 && <Pill color="#7F77DD">{rc} rel.</Pill>}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right detail ── */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#0c0f18' }}>
          {!selected ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 13 }}>
              Sélectionnez une réunion
            </div>
          ) : (
            <DetailPanel
              meeting={selected}
              colleagues={colleagues ?? []}
              getColleague={getColleague}
              onDelete={() => setDeleteConfirm(selected.id)}
              onEdit={() => setEditMeeting(selected)}
              crSearch={crSearch}
              setCrSearch={setCrSearch}
              filteredCR={filteredCR}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ meeting, colleagues, getColleague, onDelete, onEdit, crSearch, setCrSearch, filteredCR }: {
  meeting: MeetingRow; colleagues: any[]; getColleague: (id: string) => any
  onDelete: () => void; onEdit: () => void
  crSearch: string; setCrSearch: (v: string) => void
  filteredCR: Record<string, string[]> | null
}) {
  const d = new Date(meeting.date)
  const participantIds = meeting.colleagues_ids ?? []
  const [exporting, setExporting] = useState(false)

  const { data: crItemsRaw } = useCRItems(meeting.id)
  const { data: actions } = useActions(meeting.id)

  const crAttributionMap = useMemo(() => {
    const map: Record<string, any> = {}
    ;(crItemsRaw ?? []).forEach((item: any) => {
      if (item.content && item.colleagues) map[item.content.trim()] = item.colleagues
    })
    return map
  }, [crItemsRaw])

  const stats = CR_CONF.map(c => ({ ...c, items: parseItems(meeting[c.key]) }))
  const totalPoints = stats.reduce((a, b) => a + b.items.length, 0)

  const handleExport = async () => {
    setExporting(true)
    await exportMeetingPDF(meeting, colleagues, crItemsRaw ?? [], actions ?? [])
    setExporting(false)
  }

  return (
    <div>
      {/* Hero header */}
      <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative', background: 'linear-gradient(180deg, rgba(29,158,117,0.04) 0%, transparent 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          {/* Big date block */}
          <div style={{ width: 56, height: 56, flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{format(d, 'd')}</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{format(d, 'MMM yyyy', { locale: fr })}</span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', margin: 0, lineHeight: 1.2, letterSpacing: '-0.02em' }}>{meeting.title}</h2>
            {meeting.description && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0' }}>{meeting.description}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                <Clock style={{ width: 11, height: 11 }} />
                {format(d, 'HH:mm') !== '00:00' ? format(d, "EEEE d MMMM yyyy '·' HH:mm", { locale: fr }) : format(d, 'EEEE d MMMM yyyy', { locale: fr })}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {/* Export PDF */}
            <button onClick={handleExport} disabled={exporting} title="Exporter en PDF"
              style={{ padding: '7px 12px', background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.25)', borderRadius: 8, cursor: exporting ? 'wait' : 'pointer', color: '#5DCAA5', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, transition: 'all 0.15s', opacity: exporting ? 0.6 : 1 }}
              onMouseEnter={e => { if (!exporting) { (e.currentTarget as HTMLElement).style.background = 'rgba(29,158,117,0.18)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(29,158,117,0.1)' }}>
              <FileDown style={{ width: 13, height: 13 }} />
              {exporting ? 'Export...' : 'PDF'}
            </button>
            {/* Éditer */}
            <button onClick={onEdit} title="Modifier la réunion"
              style={{ padding: 8, background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.2)', borderRadius: 8, cursor: 'pointer', color: '#FAC775', display: 'flex', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,159,39,0.16)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,159,39,0.08)' }}>
              <Pencil style={{ width: 13, height: 13 }} />
            </button>
            {/* Supprimer */}
            <button onClick={onDelete} title="Supprimer la réunion"
              style={{ padding: 8, background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.2)', display: 'flex', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#E24B4A'; (e.currentTarget as HTMLElement).style.borderColor = '#E24B4A30'; (e.currentTarget as HTMLElement).style.background = '#E24B4A10' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <Trash2 style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        {totalPoints > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.filter(s => s.items.length > 0).map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: s.light, border: `1px solid ${s.border}` }}>
                <s.icon style={{ width: 10, height: 10, color: s.color }} />
                <span style={{ fontSize: 11, color: s.color, fontFamily: 'monospace' }}>{s.items.length} {s.label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Participants */}
      {participantIds.length > 0 && (
        <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <SectionTitle icon={Users} label={`Participants · ${participantIds.length}`} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {participantIds.map((id: string) => {
              const c = getColleague(id)
              if (!c) return null
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Avatar name={c.name} size="sm" />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: '#fff', margin: 0 }}>{c.name}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0, fontFamily: 'monospace' }}>{c.post}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Compte-rendu */}
      {totalPoints > 0 && (
        <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionTitle icon={FileText} label="Compte-rendu" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '4px 10px', height: 28 }}>
              <Search style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <input value={crSearch} onChange={e => setCrSearch(e.target.value)} placeholder="Filtrer le CR..."
                style={{ background: 'transparent', border: 'none', fontSize: 11, color: '#fff', outline: 'none', width: 120 }} />
              {crSearch && <button onClick={() => setCrSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}><X style={{ width: 10, height: 10 }} /></button>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CR_CONF.map(conf => {
              const rawItems = parseItems(meeting[conf.key])
              const items = filteredCR ? (filteredCR[conf.key] ?? []) : rawItems
              if (rawItems.length === 0) return null
              const Icon = conf.icon
              return (
                <div key={conf.key} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${conf.border}`, background: conf.light }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderBottom: `1px solid ${conf.border}`, background: `${conf.color}10` }}>
                    <Icon style={{ width: 11, height: 11, color: conf.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: conf.color, fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{conf.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: conf.color, opacity: 0.6, fontFamily: 'monospace' }}>{rawItems.length}</span>
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.length === 0 && crSearch ? (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', margin: 0 }}>Aucun résultat</p>
                    ) : items.map((item, i) => {
                      const attributed = crAttributionMap[item.trim()]
                      const initials = attributed?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? ''
                      const avatarColors = [
                        { bg: '#1D9E7520', color: '#5DCAA5' }, { bg: '#7F77DD20', color: '#AFA9EC' },
                        { bg: '#378ADD20', color: '#85B7EB' }, { bg: '#EF9F2720', color: '#FAC775' },
                        { bg: '#E24B4A20', color: '#F09595' }, { bg: '#D4537E20', color: '#ED93B1' },
                      ]
                      const ac = attributed ? avatarColors[attributed.name.charCodeAt(0) % avatarColors.length] : null
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: conf.color, flexShrink: 0, marginTop: 6, opacity: 0.8 }} />
                          <p style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.5, ...(crSearch && item.toLowerCase().includes(crSearch.toLowerCase()) ? { background: `${conf.color}25`, borderRadius: 4, padding: '0 3px' } : {}) }}>
                            {crSearch && item.toLowerCase().includes(crSearch.toLowerCase()) ? highlightText(item, crSearch, conf.color) : item}
                          </p>
                          {attributed && ac && (
                            <div title={`Attribué à ${attributed.name}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: '1px 7px', borderRadius: 20, background: ac.bg, border: `1px solid ${ac.color}30` }}>
                              <div style={{ width: 14, height: 14, borderRadius: '50%', background: ac.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: ac.color, flexShrink: 0 }}>
                                {initials}
                              </div>
                              <span style={{ fontSize: 10, color: ac.color, fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {attributed.name.split(' ')[0]}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '20px 32px 32px' }}>
        <MeetingActionsPanel meetingId={meeting.id} />
      </div>
    </div>
  )
}

function highlightText(text: string, query: string, color: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>{text.slice(0, idx)}<mark style={{ background: color + '40', color: '#fff', borderRadius: 2, padding: '0 1px' }}>{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>
  )
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, color, background: color + '15', border: `1px solid ${color}25`, borderRadius: 20, padding: '2px 7px', fontFamily: 'monospace' }}>{children}</span>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Icon style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.3)' }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace' }}>{label}</span>
    </div>
  )
}

function MeetingActionsPanel({ meetingId }: { meetingId: string }) {
  const { data: actions, isLoading } = useActions(meetingId)
  const { data: colleagues } = useColleagues()
  const createAction = useCreateAction()
  const [showAdd, setShowAdd] = useState(false)
  const [desc, setDesc] = useState(''); const [assignTo, setAssignTo] = useState(''); const [dueDate, setDueDate] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); if (!desc.trim()) return
    await createAction.mutateAsync({ description: desc.trim(), assigned_to_colleague_id: assignTo || null, due_date: dueDate || null, meeting_id: meetingId, status: 'pending' })
    setDesc(''); setAssignTo(''); setDueDate(''); setShowAdd(false)
  }

  if (isLoading) return <Spinner />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionTitle icon={Check} label={`Actions · ${actions?.length ?? 0}`} />
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}>
          <Plus style={{ width: 11, height: 11 }} /> Ajouter
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ marginBottom: 12, padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description de l'action..." required autoFocus
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#fff', outline: 'none' }}>
              <option value="">Assigner à...</option>
              {colleagues?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#fff', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, color: '#fff', background: '#1D9E75', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Créer</button>
          </div>
        </form>
      )}

      {(actions?.length ?? 0) === 0 && !showAdd && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)', textAlign: 'center', padding: '16px 0' }}>Aucune action liée à cette réunion</p>
      )}

      {(actions?.length ?? 0) > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          {actions!.map((a: any, i: number) => {
            const c = colleagues?.find((col: any) => col.id === a.assigned_to_colleague_id)
            const late = a.due_date ? isOverdue(a.due_date) && a.status !== 'completed' : false
            const done = a.status === 'completed'
            const st = ACTION_STATUS[a.status]
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < actions!.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: done ? '#1D9E75' : late ? '#E24B4A' : '#EF9F27' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: done ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)', margin: 0, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</p>
                  <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                    {c && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{c.name}</span>}
                    {a.due_date && <span style={{ fontSize: 10, color: late ? '#E24B4A' : 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{fDate(a.due_date)}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: st?.color === 'teal' ? '#1D9E75' : st?.color === 'red' ? '#E24B4A' : st?.color === 'amber' ? '#EF9F27' : 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace', flexShrink: 0 }}>{st?.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useColleagues, useCreateColleague, useDeleteColleague } from './useColleagues'
import { useActions } from '../actions/useActions'
import { useMeetings } from '../meetings/useMeetings'
import { useConsumables } from '../consumables/useConsumables'
import { Spinner } from '../../components/ui'
import { fDate, fDateTime, isOverdue } from '../../utils'
import { ACTION_STATUS } from '../../constants'
import {
  Users, Plus, Search, Trash2, X, Check,
  CalendarDays, CheckSquare, ShoppingCart,
  TrendingUp, Clock, AlertTriangle, Star,
  Edit2, Loader2, ChevronRight, Activity,
  Award, Zap, BarChart2, Eye, Mail, Phone,
  MessageSquare, UserCheck, UserX
} from 'lucide-react'
import { format, differenceInDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { QK } from '../../constants'
import { toast } from 'sonner'

// ─── Extended colleague hook with update ──────────────────────────────────────
function useUpdateColleague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name?: string; post?: string }) => {
      const { data, error } = await supabase.from('colleagues').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK.COLLEAGUES }); toast.success('Mis à jour') },
    onError: (e: any) => toast.error(e.message),
  })
}

// ─── Stat computations per colleague ─────────────────────────────────────────
function useColleagueStats(colleagueId: string | null, actions: any[], meetings: any[], consumables: any[]) {
  return useMemo(() => {
    if (!colleagueId) return null
    const myActions = actions.filter(a => a.assigned_to_colleague_id === colleagueId)
    const myMeetings = meetings.filter(m => m.colleagues_ids?.includes(colleagueId))
    const myConsumables = consumables.filter(c => c.requested_by_colleague_id === colleagueId)
    const lateActions = myActions.filter(a => a.due_date && isOverdue(a.due_date) && a.status !== 'completed' && a.status !== 'cancelled')
    const completedActions = myActions.filter(a => a.status === 'completed')
    const completionRate = myActions.length > 0 ? Math.round((completedActions.length / myActions.length) * 100) : 0
    const lastMeeting = myMeetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    const daysSinceLastMeeting = lastMeeting ? differenceInDays(new Date(), new Date(lastMeeting.date)) : null
    const thisMonth = meetings.filter(m => {
      const d = new Date(m.date)
      const now = new Date()
      return d >= startOfMonth(now) && d <= endOfMonth(now) && m.colleagues_ids?.includes(colleagueId)
    }).length
    // Engagement score (0-100)
    const engagementScore = Math.min(100, Math.round(
      (completionRate * 0.4) +
      (Math.min(thisMonth * 20, 40)) +
      (lateActions.length === 0 ? 20 : Math.max(0, 20 - lateActions.length * 10))
    ))
    return {
      myActions, myMeetings, myConsumables, lateActions,
      completedActions, completionRate, lastMeeting,
      daysSinceLastMeeting, thisMonth, engagementScore,
      openActions: myActions.filter(a => a.status !== 'completed' && a.status !== 'cancelled'),
    }
  }, [colleagueId, actions, meetings, consumables])
}

// ─── Engagement ring ──────────────────────────────────────────────────────────
function EngagementRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = score >= 70 ? '#1D9E75' : score >= 40 ? '#EF9F27' : '#E24B4A'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fill: color, fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
        {score}
      </text>
    </svg>
  )
}

// ─── Avatar with initials ─────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: '#1D9E7520', color: '#5DCAA5' },
  { bg: '#7F77DD20', color: '#AFA9EC' },
  { bg: '#378ADD20', color: '#85B7EB' },
  { bg: '#EF9F2720', color: '#FAC775' },
  { bg: '#E24B4A20', color: '#F09595' },
  { bg: '#D4537E20', color: '#ED93B1' },
]
function ColleagueAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  const { bg, color } = AVATAR_COLORS[idx]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 700, color, flexShrink: 0, letterSpacing: '-0.02em' }}>
      {initials}
    </div>
  )
}

// ─── Inline editable field ────────────────────────────────────────────────────
function EditableField({ value, onSave, style: s }: { value: string; onSave: (v: string) => void; style?: any }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const save = () => { if (val.trim() && val !== value) onSave(val.trim()); setEditing(false) }
  if (editing) return (
    <input value={val} onChange={e => setVal(e.target.value)} autoFocus onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value); setEditing(false) } }}
      style={{ background: '#1e2535', border: '1px solid #1D9E75', borderRadius: 6, padding: '2px 8px', fontSize: 'inherit', color: '#fff', outline: 'none', fontFamily: 'inherit', ...s }} />
  )
  return (
    <span onClick={() => setEditing(true)} style={{ cursor: 'text', borderBottom: '1px dashed transparent', ...s }}
      onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.2)')}
      onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}>
      {value}
    </span>
  )
}

// ─── Activity timeline ────────────────────────────────────────────────────────
function ActivityTimeline({ meetings, actions }: { meetings: any[]; actions: any[] }) {
  const events = useMemo(() => {
    const m = meetings.slice(0, 5).map(mt => ({
      type: 'meeting', date: new Date(mt.date), label: mt.title, id: mt.id
    }))
    const a = actions.filter(ac => ac.status === 'completed' && ac.due_date).slice(0, 5).map(ac => ({
      type: 'action', date: new Date(ac.due_date), label: ac.description, id: ac.id
    }))
    return [...m, ...a].sort((x, y) => y.date.getTime() - x.date.getTime()).slice(0, 8)
  }, [meetings, actions])

  if (!events.length) return (
    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '16px 0' }}>Aucune activité récente</p>
  )

  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 1, background: 'rgba(255,255,255,0.07)' }} />
      {events.map((e, i) => (
        <div key={e.id + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, position: 'relative' }}>
          <div style={{ position: 'absolute', left: -13, top: 4, width: 8, height: 8, borderRadius: '50%', background: e.type === 'meeting' ? '#1D9E75' : '#378ADD', border: '2px solid #0a0c12', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', fontFamily: 'monospace' }}>
              {e.type === 'meeting' ? '📅 ' : '✓ '}
              {format(e.date, 'd MMM yyyy', { locale: fr })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Detail panel tabs ────────────────────────────────────────────────────────
type Tab = 'overview' | 'actions' | 'meetings' | 'consumables'

// ─── Main ─────────────────────────────────────────────────────────────────────
export function ColleaguesPage() {
  const { data: colleagues, isLoading } = useColleagues()
  const { data: actions } = useActions()
  const { data: meetings } = useMeetings()
  const { data: consumables } = useConsumables()
  const createColleague = useCreateColleague()
  const deleteColleague = useDeleteColleague()
  const updateColleague = useUpdateColleague()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPost, setNewPost] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'meetings' | 'actions' | 'engagement'>('name')

  const selectedColleague = colleagues?.find(c => c.id === selectedId) ?? colleagues?.[0] ?? null
  const stats = useColleagueStats(selectedColleague?.id ?? null, actions ?? [], meetings ?? [], (consumables ?? []) as any[])

  const filtered = useMemo(() => {
    if (!colleagues) return []
    let list = colleagues.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.post.toLowerCase().includes(search.toLowerCase()))
    return list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      const getMeetings = (id: string) => meetings?.filter(m => m.colleagues_ids?.includes(id)).length ?? 0
      const getActions = (id: string) => actions?.filter(ac => ac.assigned_to_colleague_id === id).length ?? 0
      if (sortBy === 'meetings') return getMeetings(b.id) - getMeetings(a.id)
      if (sortBy === 'actions') return getActions(b.id) - getActions(a.id)
      return 0
    })
  }, [colleagues, search, sortBy, meetings, actions])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newPost.trim()) return
    await createColleague.mutateAsync({ name: newName.trim(), post: newPost.trim() })
    setNewName(''); setNewPost(''); setShowCreate(false)
  }

  const TABS: { key: Tab; label: string; icon: typeof Activity; count?: number }[] = [
    { key: 'overview',    label: 'Vue d\'ensemble', icon: Activity },
    { key: 'actions',     label: 'Actions',         icon: CheckSquare, count: stats?.openActions.length },
    { key: 'meetings',    label: 'Réunions',        icon: CalendarDays, count: stats?.myMeetings.length },
    { key: 'consumables', label: 'Consommables',    icon: ShoppingCart, count: stats?.myConsumables.length },
  ]

  const idx = selectedColleague ? selectedColleague.name.charCodeAt(0) % AVATAR_COLORS.length : 0
  const accentColor = selectedColleague ? AVATAR_COLORS[idx].color : '#1D9E75'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0c12', overflow: 'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .colleague-item:hover{background:rgba(255,255,255,0.025)!important}`}</style>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
          <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, maxWidth: 340, width: '100%', margin: '0 16px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Supprimer ce collègue ?</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Les actions et consommables associés ne seront pas supprimés.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '9px 0', fontSize: 13, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer' }}>Annuler</button>
              <button onClick={async () => { await deleteColleague.mutateAsync(deleteConfirm); setDeleteConfirm(null); if (selectedId === deleteConfirm) setSelectedId(null) }}
                style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 600, color: '#fff', background: '#E24B4A', border: 'none', borderRadius: 10, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Topbar */}
      <div style={{ flexShrink: 0, padding: '0 24px', height: 52, borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#0e1118', display: 'flex', alignItems: 'center', gap: 16 }}>
        <h1 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 }}>Équipe</h1>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{colleagues?.length ?? 0} membre{(colleagues?.length ?? 0) > 1 ? 's' : ''}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#1D9E75', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            <Plus style={{ width: 12, height: 12 }} /> Ajouter
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left list ── */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: '#0a0c12' }}>

          {/* Search + sort */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '0 10px', height: 32 }}>
              <Search style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
                style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 12, color: '#fff', outline: 'none' }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}><X style={{ width: 11, height: 11 }} /></button>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([['name', 'A-Z'], ['meetings', 'Réunions'], ['actions', 'Actions']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key)}
                  style={{ flex: 1, padding: '3px 0', fontSize: 10, fontFamily: 'monospace', background: sortBy === key ? 'rgba(255,255,255,0.08)' : 'transparent', border: `1px solid ${sortBy === key ? 'rgba(255,255,255,0.15)' : 'transparent'}`, borderRadius: 6, color: sortBy === key ? '#e8eaf0' : 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Create form */}
          {showCreate && (
            <form onSubmit={handleCreate} style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0e1118', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom complet" required autoFocus
                style={{ background: '#1e2535', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#fff', outline: 'none' }} />
              <input value={newPost} onChange={e => setNewPost(e.target.value)} placeholder="Poste / Fonction" required
                style={{ background: '#1e2535', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#fff', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '7px 0', fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={!newName.trim() || !newPost.trim() || createColleague.isPending}
                  style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500, color: '#fff', background: '#1D9E75', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: newName.trim() && newPost.trim() ? 1 : 0.4 }}>
                  {createColleague.isPending ? '...' : 'Créer'}
                </button>
              </div>
            </form>
          )}

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>}
            {!isLoading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                {search ? `Aucun résultat` : 'Aucun collègue'}
              </div>
            )}
            {filtered.map(c => {
              const isSelected = (selectedId ?? filtered[0]?.id) === c.id
              const cMeetings = meetings?.filter(m => m.colleagues_ids?.includes(c.id)).length ?? 0
              const cActions = actions?.filter(a => a.assigned_to_colleague_id === c.id) ?? []
              const cLate = cActions.filter(a => a.due_date && isOverdue(a.due_date) && a.status !== 'completed').length
              const cOpen = cActions.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length
              const cIdx = c.name.charCodeAt(0) % AVATAR_COLORS.length
              const cColor = AVATAR_COLORS[cIdx].color

              return (
                <button key={c.id} onClick={() => { setSelectedId(c.id); setActiveTab('overview') }}
                  className="colleague-item"
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.035)',
                    borderLeft: `3px solid ${isSelected ? cColor : 'transparent'}`,
                    background: isSelected ? `${cColor}08` : 'transparent',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ColleagueAvatar name={c.name} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#e8eaf0' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        {cLate > 0 && (
                          <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#E24B4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{cLate}</span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.post}</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CalendarDays style={{ width: 9, height: 9 }} />{cMeetings}
                        </span>
                        <span style={{ fontSize: 10, color: cOpen > 0 ? '#EF9F27' : 'rgba(255,255,255,0.25)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CheckSquare style={{ width: 9, height: 9 }} />{cOpen}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right detail ── */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#0c0f18' }}>
          {!selectedColleague ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'rgba(255,255,255,0.15)' }}>
              <Users style={{ width: 40, height: 40, opacity: 0.2 }} />
              <span style={{ fontSize: 13 }}>Sélectionnez un collègue</span>
            </div>
          ) : (
            <div>
              {/* Hero */}
              <div style={{
                padding: '28px 32px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 60%)`,
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 16 }}>
                  <ColleagueAvatar name={selectedColleague.name} size={56} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <EditableField
                        value={selectedColleague.name}
                        onSave={v => updateColleague.mutate({ id: selectedColleague.id, name: v })}
                        style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}
                      />
                      {stats?.lateActions && stats.lateActions.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#F09595', background: '#E24B4A15', border: '1px solid #E24B4A30', borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace' }}>
                          <AlertTriangle style={{ width: 9, height: 9 }} />
                          {stats.lateActions.length} en retard
                        </span>
                      )}
                    </div>
                    <EditableField
                      value={selectedColleague.post}
                      onSave={v => updateColleague.mutate({ id: selectedColleague.id, post: v })}
                      style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}
                    />
                    {stats?.lastMeeting && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: '6px 0 0', fontFamily: 'monospace' }}>
                        Dernière réunion : {stats.daysSinceLastMeeting === 0 ? "aujourd'hui" : stats.daysSinceLastMeeting === 1 ? 'hier' : `il y a ${stats.daysSinceLastMeeting}j`}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    {stats && <EngagementRing score={stats.engagementScore} size={52} />}
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>Engagement</span>
                  </div>

                  <button onClick={() => setDeleteConfirm(selectedColleague.id)}
                    style={{ padding: 8, background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.2)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#E24B4A'; (e.currentTarget as HTMLElement).style.borderColor = '#E24B4A30'; (e.currentTarget as HTMLElement).style.background = '#E24B4A10' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>

                {/* Quick stats row */}
                {stats && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Réunions', value: stats.myMeetings.length, icon: CalendarDays, color: '#1D9E75' },
                      { label: 'Actions', value: stats.myActions.length, icon: CheckSquare, color: '#378ADD' },
                      { label: 'Taux complétion', value: `${stats.completionRate}%`, icon: TrendingUp, color: stats.completionRate >= 70 ? '#1D9E75' : '#EF9F27' },
                      { label: 'Ce mois', value: stats.thisMonth, icon: Zap, color: '#7F77DD' },
                    ].map(s => (
                      <div key={s.label} style={{ background: `${s.color}08`, border: `1px solid ${s.color}18`, borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <s.icon style={{ width: 11, height: 11, color: s.color }} />
                          <span style={{ fontSize: 9, color: s.color, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                        </div>
                        <span style={{ fontSize: 20, fontWeight: 700, color: '#e8eaf0', fontFamily: 'monospace' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 32px' }}>
                {TABS.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '12px 16px', fontSize: 12, border: 'none', cursor: 'pointer',
                      background: 'transparent', borderBottom: `2px solid ${activeTab === tab.key ? accentColor : 'transparent'}`,
                      color: activeTab === tab.key ? accentColor : 'rgba(255,255,255,0.35)',
                      transition: 'all 0.15s', marginBottom: -1,
                    }}>
                    <tab.icon style={{ width: 12, height: 12 }} />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span style={{ fontSize: 9, background: `${accentColor}20`, color: accentColor, borderRadius: 20, padding: '1px 5px', fontFamily: 'monospace' }}>{tab.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: '20px 32px' }}>

                {/* Overview */}
                {activeTab === 'overview' && stats && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', marginBottom: 12 }}>Activité récente</p>
                      <ActivityTimeline meetings={stats.myMeetings} actions={stats.myActions} />
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', marginBottom: 12 }}>Actions en cours</p>
                      {stats.openActions.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1D9E75' }}>
                          <Check style={{ width: 14, height: 14 }} /> Aucune action en attente
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {stats.openActions.slice(0, 5).map(a => {
                            const late = a.due_date && isOverdue(a.due_date)
                            return (
                              <div key={a.id} style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${late ? '#E24B4A20' : 'rgba(255,255,255,0.06)'}`, borderRadius: 8 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: late ? '#E24B4A' : '#EF9F27', flexShrink: 0, marginTop: 4 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</p>
                                  {a.due_date && <p style={{ fontSize: 10, color: late ? '#F09595' : 'rgba(255,255,255,0.3)', margin: '2px 0 0', fontFamily: 'monospace' }}>{fDate(a.due_date)}{late && ' · En retard'}</p>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions tab */}
                {activeTab === 'actions' && stats && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                      {[
                        { label: 'En retard', count: stats.lateActions.length, color: '#E24B4A' },
                        { label: 'En cours', count: stats.myActions.filter(a => a.status === 'in_progress').length, color: '#378ADD' },
                        { label: 'En attente', count: stats.myActions.filter(a => a.status === 'pending').length, color: '#8b90a4' },
                        { label: 'Terminées', count: stats.completedActions.length, color: '#1D9E75' },
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: `${s.color}12`, border: `1px solid ${s.color}25`, borderRadius: 20 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.count}</span>
                          <span style={{ fontSize: 10, color: `${s.color}90` }}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                    {stats.myActions.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '24px 0' }}>Aucune action assignée</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {stats.myActions.map(a => {
                          const late = a.due_date && isOverdue(a.due_date) && a.status !== 'completed'
                          const st = ACTION_STATUS[a.status]
                          return (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${late ? '#E24B4A20' : 'rgba(255,255,255,0.05)'}`, borderRadius: 10 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.status === 'completed' ? '#1D9E75' : late ? '#E24B4A' : '#EF9F27', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, color: a.status === 'completed' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)', margin: 0, textDecoration: a.status === 'completed' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</p>
                                {a.due_date && <p style={{ fontSize: 10, color: late ? '#F09595' : 'rgba(255,255,255,0.3)', margin: '2px 0 0', fontFamily: 'monospace' }}>{fDate(a.due_date)}</p>}
                              </div>
                              <span style={{ fontSize: 10, color: st?.color === 'teal' ? '#1D9E75' : st?.color === 'red' ? '#E24B4A' : st?.color === 'amber' ? '#EF9F27' : 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace', flexShrink: 0 }}>
                                {st?.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Meetings tab */}
                {activeTab === 'meetings' && stats && (
                  <div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16, fontFamily: 'monospace' }}>
                      Présent à {stats.myMeetings.length} réunion{stats.myMeetings.length > 1 ? 's' : ''} · {stats.thisMonth} ce mois
                    </p>
                    {stats.myMeetings.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '24px 0' }}>Aucune réunion</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {stats.myMeetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(m => {
                          const d = new Date(m.date)
                          const totalCR = [...(m.successes ?? []), ...(m.failures ?? []), ...(m.sensitive_points ?? []), ...(m.relational_points ?? [])].filter(s => s && !s.match(/^[0-9a-f]{8}-/)).length
                          return (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{format(d, 'd')}</span>
                                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{format(d, 'MMM', { locale: fr })}</span>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', fontFamily: 'monospace' }}>
                                  {format(d, 'EEEE d MMM yyyy', { locale: fr })}
                                  {totalCR > 0 && ` · ${totalCR} point${totalCR > 1 ? 's' : ''} CR`}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Consumables tab */}
                {activeTab === 'consumables' && stats && (
                  <div>
                    {stats.myConsumables.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '24px 0' }}>Aucune demande</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {stats.myConsumables.map((c: any) => {
                          const STATUS_COLORS: Record<string, string> = { pending: '#EF9F27', approved: '#1D9E75', ordered: '#378ADD', delivered: '#5DCAA5', rejected: '#E24B4A' }
                          const sc = STATUS_COLORS[c.status] ?? '#8b90a4'
                          return (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>{c.item_name}</p>
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', fontFamily: 'monospace' }}>
                                  Qté : {c.quantity} · {fDate(c.created_at)}
                                  {c.details && ` · ${c.details}`}
                                </p>
                              </div>
                              <span style={{ fontSize: 10, color: sc, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace', flexShrink: 0 }}>
                                {c.status === 'pending' ? 'En attente' : c.status === 'approved' ? 'Approuvé' : c.status === 'ordered' ? 'Commandé' : c.status === 'delivered' ? 'Livré' : 'Rejeté'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

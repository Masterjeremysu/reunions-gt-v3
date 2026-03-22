import { useState, useMemo } from 'react'
import { useConsumables, useCreateConsumable, useUpdateConsumableStatus } from './useConsumables'
import { useColleagues } from '../colleagues/useColleagues'
import { Spinner } from '../../components/ui'
import { fDate, fRelative } from '../../utils'
import {
  ShoppingCart, Plus, Search, X, Filter,
  Check, Clock, Package, Truck, CheckCircle,
  XCircle, ChevronDown, Loader2, BarChart2,
  AlertTriangle, ArrowUpRight, TrendingUp,
  Users, Hash, Edit2, RefreshCw
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

type ConsoStatus = 'pending' | 'approved' | 'ordered' | 'delivered' | 'rejected'

const STATUS_CONF: Record<ConsoStatus, { label: string; color: string; bg: string; border: string; icon: typeof Check; next?: ConsoStatus }> = {
  pending:   { label: 'En attente', color: '#EF9F27', bg: '#EF9F2712', border: '#EF9F2730', icon: Clock,        next: 'approved'  },
  approved:  { label: 'Approuvé',   color: '#1D9E75', bg: '#1D9E7512', border: '#1D9E7530', icon: Check,        next: 'ordered'   },
  ordered:   { label: 'Commandé',   color: '#378ADD', bg: '#378ADD12', border: '#378ADD30', icon: Truck,        next: 'delivered' },
  delivered: { label: 'Livré',      color: '#5DCAA5', bg: '#5DCAA512', border: '#5DCAA530', icon: CheckCircle, next: undefined   },
  rejected:  { label: 'Rejeté',     color: '#E24B4A', bg: '#E24B4A12', border: '#E24B4A30', icon: XCircle,     next: undefined   },
}

const PIPELINE: ConsoStatus[] = ['pending', 'approved', 'ordered', 'delivered']

// ─── Status pipeline badge ────────────────────────────────────────────────────
function PipelineBadge({ status, onChange }: { status: ConsoStatus; onChange: (s: ConsoStatus) => void }) {
  const [open, setOpen] = useState(false)
  const conf = STATUS_CONF[status]
  const Icon = conf.icon
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: conf.bg, border: `1px solid ${conf.border}`, borderRadius: 20, fontSize: 11, color: conf.color, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600, transition: 'opacity 0.15s' }}>
        <Icon style={{ width: 10, height: 10 }} />
        {conf.label}
        <ChevronDown style={{ width: 9, height: 9, opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#161b26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', zIndex: 20, minWidth: 150, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {(Object.keys(STATUS_CONF) as ConsoStatus[]).map(s => {
            const c = STATUS_CONF[s]; const CIcon = c.icon
            return (
              <button key={s} onClick={() => { onChange(s); setOpen(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: s === status ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', cursor: 'pointer', color: s === status ? c.color : 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                <CIcon style={{ width: 12, height: 12, color: c.color }} />
                {c.label}
                {s === status && <Check style={{ width: 10, height: 10, marginLeft: 'auto' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Kanban pipeline view ─────────────────────────────────────────────────────
function PipelineView({ consumables, colleagues, onStatusChange, onAdd }: {
  consumables: any[]; colleagues: any[]
  onStatusChange: (id: string, status: ConsoStatus) => void
  onAdd: (status: ConsoStatus) => void
}) {
  const byStatus = useMemo(() => {
    const map: Record<ConsoStatus, any[]> = { pending: [], approved: [], ordered: [], delivered: [], rejected: [] }
    consumables.forEach(c => { if (map[c.status as ConsoStatus]) map[c.status as ConsoStatus].push(c) })
    return map
  }, [consumables])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, height: '100%', padding: '16px 24px', overflowX: 'auto' }}>
      {PIPELINE.map(status => {
        const conf = STATUS_CONF[status]
        const items = byStatus[status]
        const Icon = conf.icon
        return (
          <div key={status} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Icon style={{ width: 12, height: 12, color: conf.color }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: conf.color, fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{conf.label}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '1px 7px', fontFamily: 'monospace' }}>{items.length}</span>
              {status === 'pending' && (
                <button onClick={() => onAdd(status)} style={{ marginLeft: 'auto', padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: conf.color, opacity: 0.6, display: 'flex' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '0.6')}>
                  <Plus style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.length === 0 && (
                <div style={{ border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 10, padding: '16px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>Vide</div>
              )}
              {items.map((item: any) => {
                const c = colleagues.find((col: any) => col.id === item.requested_by_colleague_id)
                return (
                  <div key={item.id} style={{ background: '#0e1118', border: `1px solid ${conf.border}`, borderRadius: 10, padding: '11px 13px', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = conf.color + '50')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = conf.border)}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0', margin: '0 0 5px', lineHeight: 1.3 }}>{item.item_name}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '1px 6px' }}>× {item.quantity}</span>
                      {c && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{c.name}</span>}
                      {item.details && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{item.details}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{fRelative(item.created_at)}</span>
                      {conf.next && (
                        <button onClick={() => onStatusChange(item.id, conf.next!)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: STATUS_CONF[conf.next].color, background: `${STATUS_CONF[conf.next].color}12`, border: `1px solid ${STATUS_CONF[conf.next].color}25`, borderRadius: 20, padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace', transition: 'all 0.15s' }}>
                          {STATUS_CONF[conf.next].label} →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Create form ──────────────────────────────────────────────────────────────
function CreateForm({ colleagues, defaultStatus = 'pending', onClose }: {
  colleagues: any[]; defaultStatus?: ConsoStatus; onClose: () => void
}) {
  const createConsumable = useCreateConsumable()
  const [name, setName] = useState('')
  const [details, setDetails] = useState('')
  const [qty, setQty] = useState(1)
  const [requestedBy, setRequestedBy] = useState('')
  const [status, setStatus] = useState<ConsoStatus>(defaultStatus)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await createConsumable.mutateAsync({ item_name: name.trim(), details: details || null, quantity: qty, requested_by_colleague_id: requestedBy || null, status, user_id: user?.id ?? null })
    onClose()
  }

  return (
    <div style={{ padding: '16px 24px', background: '#0e1118', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Article *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de l'article" required autoFocus
            style={{ width: '100%', background: '#1e2535', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Détails</label>
          <input value={details} onChange={e => setDetails(e.target.value)} placeholder="Référence, couleur, taille..."
            style={{ width: '100%', background: '#1e2535', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ width: 70 }}>
          <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Qté</label>
          <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min={1}
            style={{ width: '100%', background: '#1e2535', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#fff', outline: 'none' }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Demandé par</label>
          <select value={requestedBy} onChange={e => setRequestedBy(e.target.value)}
            style={{ width: '100%', background: '#1e2535', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: requestedBy ? '#fff' : '#565c75', outline: 'none' }}>
            <option value="">— Sélectionner —</option>
            {colleagues.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer' }}>Annuler</button>
          <button type="submit" disabled={!name.trim() || createConsumable.isPending}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#1D9E75', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: name.trim() ? 1 : 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {createConsumable.isPending ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <Plus style={{ width: 12, height: 12 }} />}
            Créer
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function ConsumablesPage() {
  const { data: consumables, isLoading } = useConsumables()
  const { data: colleagues } = useColleagues()
  const updateStatus = useUpdateConsumableStatus()

  const [view, setView] = useState<'pipeline' | 'list'>('pipeline')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ConsoStatus | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createStatus, setCreateStatus] = useState<ConsoStatus>('pending')

  const filtered = useMemo(() => {
    if (!consumables) return []
    const q = search.toLowerCase()
    return (consumables as any[]).filter(c => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      if (!q) return true
      const col = colleagues?.find((col: any) => col.id === c.requested_by_colleague_id)
      return c.item_name.toLowerCase().includes(q) || (c.details ?? '').toLowerCase().includes(q) || (col?.name ?? '').toLowerCase().includes(q)
    })
  }, [consumables, search, filterStatus, colleagues])

  const stats = useMemo(() => {
    const all = (consumables as any[]) ?? []
    const now = new Date()
    const monthStart = startOfMonth(now)
    const thisMonth = all.filter(c => new Date(c.created_at) >= monthStart).length
    const prevMonth = all.filter(c => {
      const d = new Date(c.created_at); return d >= startOfMonth(subMonths(now, 1)) && d < monthStart
    }).length
    return {
      pending:   all.filter(c => c.status === 'pending').length,
      approved:  all.filter(c => c.status === 'approved').length,
      ordered:   all.filter(c => c.status === 'ordered').length,
      delivered: all.filter(c => c.status === 'delivered').length,
      rejected:  all.filter(c => c.status === 'rejected').length,
      thisMonth, prevMonth, total: all.length,
    }
  }, [consumables])

  const handleStatusChange = (id: string, status: ConsoStatus) => {
    updateStatus.mutate({ id, status })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0c12', overflow: 'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Topbar */}
      <div style={{ flexShrink: 0, padding: '0 24px', height: 52, borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#0e1118', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 }}>Consommables</h1>

        {/* Mini stats */}
        <div style={{ display: 'flex', gap: 6 }}>
          {stats.pending > 0 && (
            <span style={{ fontSize: 10, color: '#FAC775', background: '#EF9F2712', border: '1px solid #EF9F2725', borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace', fontWeight: 600 }}>
              {stats.pending} en attente
            </span>
          )}
          {stats.ordered > 0 && (
            <span style={{ fontSize: 10, color: '#85B7EB', background: '#378ADD12', border: '1px solid #378ADD25', borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace' }}>
              {stats.ordered} commandé{stats.ordered > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '0 10px', height: 30, width: 200 }}>
            <Search style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 12, color: '#fff', outline: 'none' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}><X style={{ width: 10, height: 10 }} /></button>}
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 2 }}>
            {(['pipeline', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'monospace', transition: 'all 0.15s', background: view === v ? 'rgba(255,255,255,0.08)' : 'transparent', color: view === v ? '#e8eaf0' : 'rgba(255,255,255,0.3)' }}>
                {v === 'pipeline' ? '⊞ Pipeline' : '≡ Liste'}
              </button>
            ))}
          </div>

          <button onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#1D9E75', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus style={{ width: 12, height: 12 }} /> Nouvelle demande
          </button>
        </div>
      </div>

      {/* Stats band */}
      <div style={{ flexShrink: 0, padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: '#0a0c12', display: 'flex', gap: 6, overflowX: 'auto' }}>
        <button onClick={() => setFilterStatus('all')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: filterStatus === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent', border: `1px solid ${filterStatus === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{stats.total}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>total</span>
        </button>
        {(Object.keys(STATUS_CONF) as ConsoStatus[]).map(s => {
          const conf = STATUS_CONF[s]; const count = stats[s as keyof typeof stats] as number
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: filterStatus === s ? conf.bg : 'transparent', border: `1px solid ${filterStatus === s ? conf.border : 'rgba(255,255,255,0.06)'}`, borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s', opacity: count === 0 ? 0.4 : 1 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: conf.color, fontFamily: 'monospace' }}>{count}</span>
              <span style={{ fontSize: 10, color: conf.color, opacity: 0.7, fontFamily: 'monospace' }}>{conf.label.toLowerCase()}</span>
            </button>
          )
        })}
        {stats.thisMonth > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
            <TrendingUp style={{ width: 11, height: 11 }} />
            {stats.thisMonth} ce mois
            {stats.prevMonth > 0 && <span style={{ color: stats.thisMonth >= stats.prevMonth ? '#1D9E75' : '#E24B4A' }}>({stats.thisMonth >= stats.prevMonth ? '+' : ''}{stats.thisMonth - stats.prevMonth} vs mois dernier)</span>}
          </div>
        )}
      </div>

      {/* Create form */}
      {showCreate && <CreateForm colleagues={colleagues ?? []} defaultStatus={createStatus} onClose={() => setShowCreate(false)} />}

      {/* Content */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
      ) : view === 'pipeline' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <PipelineView
            consumables={filtered}
            colleagues={colleagues ?? []}
            onStatusChange={handleStatusChange}
            onAdd={(s) => { setCreateStatus(s); setShowCreate(true) }}
          />
        </div>
      ) : (
        /* List view */
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
              <ShoppingCart style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.3 }} />
              {search || filterStatus !== 'all' ? 'Aucun résultat' : 'Aucune demande'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(Object.keys(STATUS_CONF) as ConsoStatus[]).map(status => {
                const items = filtered.filter(c => c.status === status)
                if (items.length === 0) return null
                const conf = STATUS_CONF[status]
                return (
                  <div key={status} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: conf.color }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: conf.color, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {conf.label} · {items.length}
                      </span>
                    </div>
                    <div style={{ background: '#0e1118', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                      {items.map((item: any, i: number) => {
                        const c = colleagues?.find((col: any) => col.id === item.requested_by_colleague_id)
                        return (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 500, color: '#e8eaf0', margin: 0 }}>{item.item_name}</p>
                              <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '1px 6px' }}>× {item.quantity}</span>
                                {c && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{c.name}</span>}
                                {item.details && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{item.details}</span>}
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{fRelative(item.created_at)}</span>
                              </div>
                            </div>
                            <PipelineBadge status={item.status as ConsoStatus} onChange={(s) => handleStatusChange(item.id, s)} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

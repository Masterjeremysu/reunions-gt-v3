import { useMemo, useState } from 'react'
import { useMeetings } from '../meetings/useMeetings'
import { useActions } from '../actions/useActions'
import { useColleagues } from '../colleagues/useColleagues'
import { useAllInspections, useVehicles } from '../vehicles/useVehicles'
import { useConsumables, useMood } from '../consumables/useConsumables'
import { Spinner } from '../../components/ui'
import { fDate, isOverdue } from '../../utils'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../constants'
import {
  CalendarDays, CheckSquare, Car, TrendingUp,
  AlertTriangle, Flame, ChevronRight, Clock,
  Activity, Zap, ArrowUpRight, ArrowDownRight,
  BarChart2, Target, Award, Users
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import {
  format, subWeeks, startOfWeek, endOfWeek,
  differenceInDays, startOfMonth, subMonths,
  endOfMonth, isAfter, isBefore, addDays,
  isWithinInterval, parseISO
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

function isDueSoon(d: string, days = 45) {
  const now = new Date()
  return isAfter(new Date(d), now) && isBefore(new Date(d), addDays(now, days))
}

// ─── Leave colors ─────────────────────────────────────────────────────────────
const LEAVE_COLORS: Record<string, string> = {
  conges_payes: '#1D9E75', rtt: '#378ADD', maladie: '#EF9F27',
  arret_travail: '#E24B4A', conge_sans_solde: '#8b90a4',
  evenement_familial: '#D4537E', formation: '#7F77DD', autre: '#565c75',
}
const LEAVE_LABELS: Record<string, string> = {
  conges_payes: 'CP', rtt: 'RTT', maladie: 'Maladie', arret_travail: 'Arrêt',
  conge_sans_solde: 'CSS', evenement_familial: 'Famille', formation: 'Formation', autre: 'Autre',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useUpcomingLeaves() {
  return useQuery({
    queryKey: ['leaves', 'upcoming'],
    queryFn: async () => {
      const now = new Date()
      const weekStart = startOfWeek(now, { weekStartsOn: 1 })
      const twoWeeksEnd = addDays(weekStart, 13)
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, colleagues(id, name, post)')
        .eq('status', 'approved')
        .lte('start_date', twoWeeksEnd.toISOString().split('T')[0])
        .gte('end_date', weekStart.toISOString().split('T')[0])
        .order('start_date', { ascending: true })
      if (error) return []
      return data ?? []
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 6px', fontFamily: 'monospace' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ fontSize: 13, fontWeight: 600, color: p.color, margin: '2px 0', fontFamily: 'monospace' }}>
          {p.value} {p.name}
        </p>
      ))}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, delta, deltaLabel, color, icon: Icon, onClick, critical }: {
  label: string; value: string | number; delta?: number; deltaLabel?: string
  color: string; icon: typeof TrendingUp; onClick?: () => void; critical?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: critical ? `${color}08` : hovered ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${critical ? `${color}30` : hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 14, padding: '18px 20px', cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
      }}>
      {critical && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.8 }} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0, fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}15`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon style={{ width: 14, height: 14, color }} />
        </div>
      </div>
      <p style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.04em', fontFamily: 'monospace', lineHeight: 1 }}>{value}</p>
      {delta !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
          {delta > 0 ? <ArrowUpRight style={{ width: 12, height: 12, color: '#1D9E75' }} /> :
           delta < 0 ? <ArrowDownRight style={{ width: 12, height: 12, color: '#E24B4A' }} /> :
           null}
          <span style={{ fontSize: 11, color: delta > 0 ? '#1D9E75' : delta < 0 ? '#E24B4A' : '#565c75', fontFamily: 'monospace' }}>
            {delta > 0 ? `+${delta}` : delta} {deltaLabel}
          </span>
        </div>
      )}
      {onClick && (
        <div style={{ position: 'absolute', bottom: 14, right: 16, opacity: hovered ? 0.6 : 0, transition: 'opacity 0.2s' }}>
          <ChevronRight style={{ width: 14, height: 14, color: '#fff' }} />
        </div>
      )}
    </div>
  )
}

// ─── Alert item ───────────────────────────────────────────────────────────────
function AlertItem({ level, title, sub, action, onClick }: {
  level: 'critical' | 'warn' | 'info'; title: string; sub: string; action?: string; onClick?: () => void
}) {
  const conf = {
    critical: { color: '#E24B4A', bg: '#E24B4A08', border: '#E24B4A25', icon: Flame },
    warn:     { color: '#EF9F27', bg: '#EF9F2708', border: '#EF9F2725', icon: AlertTriangle },
    info:     { color: '#378ADD', bg: '#378ADD08', border: '#378ADD25', icon: Clock },
  }[level]
  const Icon = conf.icon
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      background: conf.bg, border: `1px solid ${conf.border}`, borderRadius: 10,
      cursor: onClick ? 'pointer' : 'default', marginBottom: 6, transition: 'opacity 0.15s',
    }}
    onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.opacity = '0.8')}
    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${conf.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon style={{ width: 13, height: 13, color: conf.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#e8eaf0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '1px 0 0', fontFamily: 'monospace' }}>{sub}</p>
      </div>
      {action && <span style={{ fontSize: 10, color: conf.color, fontFamily: 'monospace', flexShrink: 0 }}>{action} →</span>}
    </div>
  )
}

// ─── Section title ────────────────────────────────────────────────────────────
function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', margin: 0 }}>{children}</p>
      {action && <button onClick={onAction} style={{ fontSize: 11, color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}>{action} →</button>}
    </div>
  )
}

// ─── Leave row ────────────────────────────────────────────────────────────────
function LeaveRow({ leave, dimmed }: { leave: any; dimmed?: boolean }) {
  const c = leave.colleagues
  const color = LEAVE_COLORS[leave.leave_type] ?? '#8b90a4'
  const label = LEAVE_LABELS[leave.leave_type] ?? leave.leave_type
  const initials = c?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const dateLabel = leave.start_date === leave.end_date
    ? fDate(leave.start_date)
    : `${fDate(leave.start_date)} → ${fDate(leave.end_date)}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: dimmed ? 0.55 : 1 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: `${color}20`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: dimmed ? 'rgba(255,255,255,0.45)' : '#e8eaf0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c?.name}</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '1px 0 0', fontFamily: 'monospace' }}>
          {dateLabel}{leave.is_half_day && ` · ${leave.half_day_period === 'morning' ? 'Matin' : 'Après-midi'}`}
        </p>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color, background: `${color}15`, border: `1px solid ${color}25`, borderRadius: 20, padding: '2px 7px', fontFamily: 'monospace', flexShrink: 0 }}>
        {label}
      </span>
    </div>
  )
}

// ─── Leaves widget ────────────────────────────────────────────────────────────
function LeavesWidget({ onNavigate }: { onNavigate: () => void }) {
  const { data: leaves } = useUpcomingLeaves()
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const nextWeekStart = addDays(weekStart, 7)
  const nextWeekEnd = addDays(weekEnd, 7)

  const todayAbsent = (leaves ?? []).filter(l => l.start_date <= todayStr && l.end_date >= todayStr)
  const thisWeek = (leaves ?? []).filter(l =>
    !todayAbsent.find(t => t.id === l.id) && (
      isWithinInterval(parseISO(l.start_date), { start: weekStart, end: weekEnd }) ||
      isWithinInterval(parseISO(l.end_date), { start: weekStart, end: weekEnd }) ||
      (parseISO(l.start_date) <= weekStart && parseISO(l.end_date) >= weekEnd)
    )
  )
  const nextWeek = (leaves ?? []).filter(l =>
    !todayAbsent.find(t => t.id === l.id) && !thisWeek.find(t => t.id === l.id) && (
      isWithinInterval(parseISO(l.start_date), { start: nextWeekStart, end: nextWeekEnd }) ||
      isWithinInterval(parseISO(l.end_date), { start: nextWeekStart, end: nextWeekEnd })
    )
  )

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${todayAbsent.length > 0 ? '#EF9F2725' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 14, padding: '18px 20px',
    }}>
      <SectionTitle action="Gérer" onAction={onNavigate}>Absences & Congés</SectionTitle>

      {todayAbsent.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, color: '#FAC775', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF9F27', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
            Absent{todayAbsent.length > 1 ? 's' : ''} aujourd'hui · {todayAbsent.length}
          </p>
          {todayAbsent.map(l => <LeaveRow key={l.id} leave={l} />)}
        </div>
      )}

      {thisWeek.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Cette semaine</p>
          {thisWeek.map(l => <LeaveRow key={l.id} leave={l} />)}
        </div>
      )}

      {nextWeek.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Semaine prochaine</p>
          {nextWeek.map(l => <LeaveRow key={l.id} leave={l} dimmed />)}
        </div>
      )}

      {!leaves?.length && (
        <p style={{ fontSize: 12, color: '#1D9E75', textAlign: 'center', padding: '8px 0', fontFamily: 'monospace' }}>✓ Tout le monde présent cette semaine</p>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate()
  const { data: meetings, isLoading: mLoading } = useMeetings()
  const { data: actions, isLoading: aLoading } = useActions()
  const { data: colleagues } = useColleagues()
  const { data: allInspections } = useAllInspections()
  const { data: vehicles } = useVehicles()
  const { data: consumables } = useConsumables()
  const { data: moods } = useMood()
  const { data: leaves } = useUpcomingLeaves()

  const loading = mLoading || aLoading

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = startOfMonth(now); const monthEnd = endOfMonth(now)
    const prevStart = startOfMonth(subMonths(now, 1)); const prevEnd = endOfMonth(subMonths(now, 1))
    const meetingsThisMonth = meetings?.filter(m => { const d = new Date(m.date); return d >= monthStart && d <= monthEnd }).length ?? 0
    const meetingsPrevMonth = meetings?.filter(m => { const d = new Date(m.date); return d >= prevStart && d <= prevEnd }).length ?? 0
    const allActions = actions ?? []
    const openActions = allActions.filter(a => a.status !== 'completed' && a.status !== 'cancelled')
    const lateActions = openActions.filter(a => a.due_date && isOverdue(a.due_date))
    const completedActions = allActions.filter(a => a.status === 'completed')
    const completionRate = allActions.length > 0 ? Math.round((completedActions.length / allActions.length) * 100) : 0
    const expiredInspections = (allInspections ?? []).filter((i: any) => i.status === 'overdue')
    const soonInspections = (allInspections ?? []).filter((i: any) => i.status !== 'overdue' && isDueSoon(i.due_date, 30))
    const pendingConsumables = consumables?.filter(c => c.status === 'pending').length ?? 0
    const avgMood = moods?.length ? Math.round((moods.slice(0, 10).reduce((a, b) => a + b.mood_score, 0) / Math.min(moods.length, 10)) * 10) / 10 : null
    const todayStr = format(now, 'yyyy-MM-dd')
    const todayAbsent = (leaves ?? []).filter(l => l.start_date <= todayStr && l.end_date >= todayStr).length
    return {
      meetingsThisMonth, meetingsPrevMonth, meetingDelta: meetingsThisMonth - meetingsPrevMonth,
      openActions: openActions.length, lateActions: lateActions.length, completionRate,
      expiredInspections: expiredInspections.length, soonInspections: soonInspections.length,
      pendingConsumables, avgMood, todayAbsent,
    }
  }, [meetings, actions, allInspections, consumables, moods, leaves])

  const weeklyData = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const wStart = startOfWeek(subWeeks(new Date(), 7 - i), { weekStartsOn: 1 })
    const wEnd = endOfWeek(wStart, { weekStartsOn: 1 })
    return {
      week: format(wStart, "'S'ww", { locale: fr }),
      réunions: meetings?.filter(m => { const d = new Date(m.date); return d >= wStart && d <= wEnd }).length ?? 0,
      actions: actions?.filter(a => { if (!a.due_date) return false; const d = new Date(a.due_date); return d >= wStart && d <= wEnd }).length ?? 0,
      retards: actions?.filter(a => { if (!a.due_date || a.status === 'completed') return false; return isOverdue(a.due_date) && new Date(a.due_date) >= wStart && new Date(a.due_date) <= wEnd }).length ?? 0,
    }
  }), [meetings, actions])

  const colleaguePerf = useMemo(() => {
    if (!colleagues || !actions) return []
    return colleagues.map(c => {
      const mine = actions.filter(a => a.assigned_to_colleague_id === c.id)
      const done = mine.filter(a => a.status === 'completed').length
      const rate = mine.length > 0 ? Math.round((done / mine.length) * 100) : 0
      const late = mine.filter(a => a.due_date && isOverdue(a.due_date) && a.status !== 'completed').length
      return { name: c.name.split(' ')[0], total: mine.length, rate, late }
    }).filter(c => c.total > 0).sort((a, b) => b.rate - a.rate).slice(0, 5)
  }, [colleagues, actions])

  const moodTrend = useMemo(() =>
    (moods ?? []).slice(0, 14).reverse().map((m, i) => ({
      i: i + 1, score: m.mood_score,
      date: format(new Date(m.created_at), 'd/MM', { locale: fr }),
    })), [moods])

  const crStats = useMemo(() => {
    if (!meetings) return { successes: 0, failures: 0, sensitive: 0, relational: 0 }
    const parse = (arr: any[]) => (arr ?? []).filter(s => s && !s.match(/^[0-9a-f]{8}-/)).length
    return meetings.slice(0, 20).reduce((acc, m) => ({
      successes: acc.successes + parse(m.successes ?? []),
      failures: acc.failures + parse(m.failures ?? []),
      sensitive: acc.sensitive + parse(m.sensitive_points ?? []),
      relational: acc.relational + parse(m.relational_points ?? []),
    }), { successes: 0, failures: 0, sensitive: 0, relational: 0 })
  }, [meetings])

  const alerts = useMemo(() => {
    const list: any[] = []
    if (stats.lateActions > 0) list.push({ level: 'critical', title: `${stats.lateActions} action${stats.lateActions > 1 ? 's' : ''} en retard`, sub: 'Intervention immédiate requise', action: 'Voir', route: ROUTES.ACTIONS })
    if (stats.expiredInspections > 0) list.push({ level: 'critical', title: `${stats.expiredInspections} inspection${stats.expiredInspections > 1 ? 's' : ''} expirée${stats.expiredInspections > 1 ? 's' : ''}`, sub: 'Véhicule(s) non conforme(s)', action: 'Parc auto', route: ROUTES.VEHICLES })
    if (stats.todayAbsent > 0) list.push({ level: 'warn', title: `${stats.todayAbsent} absent${stats.todayAbsent > 1 ? 's' : ''} aujourd'hui`, sub: 'Voir le détail des congés', action: 'Congés', route: '/leaves' })
    if (stats.soonInspections > 0) list.push({ level: 'warn', title: `${stats.soonInspections} inspection${stats.soonInspections > 1 ? 's' : ''} dans 30j`, sub: 'Planifier les contrôles', action: 'Planifier', route: ROUTES.VEHICLES })
    if (stats.pendingConsumables > 0) list.push({ level: 'warn', title: `${stats.pendingConsumables} demande${stats.pendingConsumables > 1 ? 's' : ''} en attente`, sub: 'Consommables à approuver', action: 'Traiter', route: ROUTES.CONSUMABLES })
    return list
  }, [stats])

  const upcomingMeetings = useMemo(() =>
    (meetings ?? []).filter(m => isAfter(new Date(m.date), new Date()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 3)
  , [meetings])

  const urgentActions = useMemo(() =>
    (actions ?? []).filter(a => a.status !== 'completed' && a.status !== 'cancelled')
      .sort((a, b) => (isOverdue(a.due_date ?? '') ? -2 : 0) - (isOverdue(b.due_date ?? '') ? -2 : 0))
      .slice(0, 4)
  , [actions])

  const MOOD_EMOJI = ['', '😔', '😕', '😐', '🙂', '😄']
  const MOOD_COLOR = ['', '#E24B4A', '#EF9F27', '#8b90a4', '#378ADD', '#1D9E75']

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0c12' }}>
      <Spinner />
    </div>
  )

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Bonjour' : now.getHours() < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <div style={{ background: '#0a0c12', minHeight: '100vh', overflowY: 'auto' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}`}</style>

      {/* ── Header ── */}
      <div style={{ padding: '24px 28px 20px', background: 'linear-gradient(180deg, rgba(29,158,117,0.06) 0%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 11, color: '#1D9E75', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }}>
              {format(now, "EEEE d MMMM yyyy", { locale: fr })}
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.04em' }}>{greeting} 👋</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: '6px 0 0' }}>
              {stats.lateActions > 0
                ? `⚠️ ${stats.lateActions} action${stats.lateActions > 1 ? 's' : ''} en retard · intervention requise`
                : stats.todayAbsent > 0
                ? `👤 ${stats.todayAbsent} absent${stats.todayAbsent > 1 ? 's' : ''} aujourd'hui · ${stats.completionRate}% de complétion`
                : `${stats.meetingsThisMonth} réunion${stats.meetingsThisMonth > 1 ? 's' : ''} ce mois · ${stats.completionRate}% de complétion`
              }
            </p>
          </div>
          <button onClick={() => navigate(ROUTES.MEETINGS)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1D9E75', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <CalendarDays style={{ width: 14, height: 14 }} /> Nouvelle réunion
          </button>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <KpiCard label="Réunions ce mois" value={stats.meetingsThisMonth} delta={stats.meetingDelta} deltaLabel="vs mois dernier" color="#1D9E75" icon={CalendarDays} onClick={() => navigate(ROUTES.MEETINGS)} />
          <KpiCard label="Actions ouvertes" value={stats.openActions} delta={-stats.lateActions} deltaLabel="en retard" color={stats.lateActions > 0 ? '#E24B4A' : '#378ADD'} icon={CheckSquare} onClick={() => navigate(ROUTES.ACTIONS)} critical={stats.lateActions > 0} />
          <KpiCard label="Taux complétion" value={`${stats.completionRate}%`} color={stats.completionRate >= 70 ? '#1D9E75' : '#EF9F27'} icon={Target} onClick={() => navigate(ROUTES.ACTIONS)} />
          <KpiCard label="Inspections dues" value={stats.expiredInspections + stats.soonInspections} delta={-stats.expiredInspections} deltaLabel="expirées" color={stats.expiredInspections > 0 ? '#E24B4A' : '#EF9F27'} icon={Car} onClick={() => navigate(ROUTES.VEHICLES)} critical={stats.expiredInspections > 0} />
          <KpiCard label="Absents aujourd'hui" value={stats.todayAbsent || '✓'} color={stats.todayAbsent > 0 ? '#EF9F27' : '#1D9E75'} icon={Users} onClick={() => navigate('/leaves')} critical={stats.todayAbsent > 0} />
        </div>
      </div>

      {/* ── Main grid ── */}
      <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: 16 }}>

        {/* Col 1 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Activity chart */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
            <SectionTitle>Activité — 8 dernières semaines</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyData} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                <defs>
                  <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#378ADD" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#378ADD" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{ fill: '#565c75', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#565c75', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="réunions" stroke="#1D9E75" strokeWidth={2} fill="url(#gM)" dot={false} />
                <Area type="monotone" dataKey="actions" stroke="#378ADD" strokeWidth={1.5} fill="url(#gA)" dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {[['#1D9E75', 'Réunions'], ['#378ADD', 'Actions']].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                  <span style={{ width: 16, height: 2, background: c, borderRadius: 1, display: 'inline-block' }} />{l}
                </span>
              ))}
            </div>
          </div>

          {/* CR breakdown */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
            <SectionTitle>Analyse CR — 20 dernières réunions</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Succès', value: crStats.successes, color: '#1D9E75' },
                { label: 'Défauts', value: crStats.failures, color: '#E24B4A' },
                { label: 'Sensibles', value: crStats.sensitive, color: '#EF9F27' },
                { label: 'Relationnels', value: crStats.relational, color: '#7F77DD' },
              ].map(s => {
                const total = crStats.successes + crStats.failures + crStats.sensitive + crStats.relational
                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
                return (
                  <div key={s.label} style={{ background: `${s.color}08`, border: `1px solid ${s.color}20`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: s.color, fontFamily: 'monospace', fontWeight: 600 }}>{s.label}</span>
                      <span style={{ fontSize: 10, color: `${s.color}80`, fontFamily: 'monospace' }}>{pct}%</span>
                    </div>
                    <span style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{s.value}</span>
                    <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: s.color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Col 2 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Team performance */}
          {colleaguePerf.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
              <SectionTitle action="Voir équipe" onAction={() => navigate(ROUTES.COLLEAGUES)}>Performance équipe</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colleaguePerf.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', width: 72, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.rate}%`, background: c.rate >= 80 ? '#1D9E75' : c.rate >= 50 ? '#EF9F27' : '#E24B4A', borderRadius: 3, transition: 'width 0.6s ease' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.rate >= 80 ? '#1D9E75' : c.rate >= 50 ? '#EF9F27' : '#E24B4A', fontFamily: 'monospace', width: 36, textAlign: 'right', flexShrink: 0 }}>{c.rate}%</span>
                    {c.late > 0 && <span style={{ fontSize: 9, color: '#F09595', background: '#E24B4A15', borderRadius: 20, padding: '1px 5px', fontFamily: 'monospace' }}>+{c.late}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mood trend */}
          {moodTrend.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', margin: 0 }}>Baromètre humeur</p>
                {stats.avgMood && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 18 }}>{MOOD_EMOJI[Math.round(stats.avgMood)]}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: MOOD_COLOR[Math.round(stats.avgMood)], fontFamily: 'monospace' }}>{stats.avgMood}/5</span>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={moodTrend} margin={{ top: 4, right: 0, bottom: 0, left: -32 }}>
                  <defs>
                    <linearGradient id="gMood" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7F77DD" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7F77DD" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#565c75', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tick={{ fill: '#565c75', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="score" stroke="#7F77DD" strokeWidth={2} fill="url(#gMood)" dot={{ fill: '#7F77DD', r: 2, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Upcoming meetings */}
          {upcomingMeetings.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
              <SectionTitle action="Toutes" onAction={() => navigate(ROUTES.MEETINGS)}>Prochaines réunions</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcomingMeetings.map(m => {
                  const d = new Date(m.date)
                  const daysLeft = differenceInDays(d, new Date())
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, cursor: 'pointer' }}
                      onClick={() => navigate(ROUTES.MEETINGS)}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1D9E7512', border: '1px solid #1D9E7525', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#5DCAA5', lineHeight: 1 }}>{format(d, 'd')}</span>
                        <span style={{ fontSize: 8, color: '#1D9E75', textTransform: 'uppercase' }}>{format(d, 'MMM', { locale: fr })}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.8)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', fontFamily: 'monospace' }}>
                          {daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? 'Demain' : `Dans ${daysLeft} jours`}
                          {format(d, 'HH:mm') !== '00:00' && ` · ${format(d, 'HH:mm')}`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Col 3 — alertes + congés + actions urgentes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Alerts */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: alerts.some(a => a.level === 'critical') ? '1px solid #E24B4A25' : '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
            <SectionTitle>Alertes actives</SectionTitle>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#1D9E75', fontSize: 13 }}>
                <Award style={{ width: 24, height: 24, margin: '0 auto 8px', display: 'block', opacity: 0.6 }} />
                Tout est sous contrôle
              </div>
            ) : alerts.map((a, i) => (
              <AlertItem key={i} level={a.level} title={a.title} sub={a.sub} action={a.action} onClick={() => navigate(a.route)} />
            ))}
          </div>

          {/* Congés widget */}
          <LeavesWidget onNavigate={() => navigate('/leaves')} />

          {/* Urgent actions */}
          {urgentActions.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
              <SectionTitle action="Voir tout" onAction={() => navigate(ROUTES.ACTIONS)}>Actions urgentes</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {urgentActions.map(a => {
                  const late = a.due_date && isOverdue(a.due_date)
                  const c = colleagues?.find(col => col.id === a.assigned_to_colleague_id)
                  return (
                    <div key={a.id} style={{ display: 'flex', gap: 8, padding: '8px 10px', background: late ? '#E24B4A06' : 'rgba(255,255,255,0.02)', border: `1px solid ${late ? '#E24B4A20' : 'rgba(255,255,255,0.05)'}`, borderRadius: 8, cursor: 'pointer' }}
                      onClick={() => navigate(ROUTES.ACTIONS)}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: late ? '#E24B4A' : '#EF9F27', flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</p>
                        <p style={{ fontSize: 10, color: late ? '#F09595' : 'rgba(255,255,255,0.3)', margin: '1px 0 0', fontFamily: 'monospace' }}>
                          {c?.name}{c && a.due_date && ' · '}{a.due_date && fDate(a.due_date)}{late && ' · En retard'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Vehicles quick */}
          {vehicles && vehicles.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
              <SectionTitle action="Parc auto" onAction={() => navigate(ROUTES.VEHICLES)}>Véhicules</SectionTitle>
              {vehicles.slice(0, 4).map(v => {
                const vInsp = (allInspections ?? []).filter((i: any) => i.vehicle_id === v.id)
                const expired = vInsp.filter((i: any) => i.status === 'overdue').length
                const soon = vInsp.filter((i: any) => isDueSoon(i.due_date, 30)).length
                const color = expired > 0 ? '#E24B4A' : soon > 0 ? '#EF9F27' : '#1D9E75'
                return (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                    <span style={{ fontSize: 9, color: color, fontFamily: 'monospace' }}>
                      {expired > 0 ? `${expired} exp.` : soon > 0 ? `${soon} bientôt` : 'OK'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

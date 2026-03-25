import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, CheckSquare, Users, FileText,
  ShoppingCart, Car, Activity, Calendar, LogOut, AlertTriangle, Search
} from 'lucide-react'
import { useAuth } from '../features/auth/useAuth'
import { useActions } from '../features/actions/useActions'
import { useAllInspections } from '../features/vehicles/useVehicles'
import { useConsumables } from '../features/consumables/useConsumables'
import { GlobalSearch, useGlobalSearch } from './GlobalSearch'
import { ROUTES } from '../constants'
import { isBefore, addDays } from 'date-fns'
import { toast } from 'sonner'

function isOverdue(d: string) { return isBefore(new Date(d), new Date()) }
function isDueSoon(d: string) { return !isOverdue(d) && isBefore(new Date(d), addDays(new Date(), 30)) }

function useSidebarBadges() {
  const { data: actions } = useActions()
  const { data: inspections } = useAllInspections()
  const { data: consumables } = useConsumables()

  const lateActions = actions?.filter(a =>
    a.due_date && isOverdue(a.due_date) && a.status !== 'completed' && a.status !== 'cancelled'
  ).length ?? 0

  const openActions = actions?.filter(a =>
    a.status !== 'completed' && a.status !== 'cancelled'
  ).length ?? 0

  const expiredInspections = inspections?.filter((i: any) => i.status === 'overdue').length ?? 0
  const soonInspections = inspections?.filter((i: any) =>
    i.status !== 'overdue' && i.status !== 'completed' && isDueSoon(i.due_date)
  ).length ?? 0

  const pendingConsumables = consumables?.filter(c => c.status === 'pending').length ?? 0

  return { lateActions, openActions, expiredInspections, soonInspections, pendingConsumables }
}

type BadgeLevel = 'critical' | 'warn' | 'info' | null
function NavBadge({ count, level }: { count: number; level: BadgeLevel }) {
  if (!count || !level) return null
  const styles: Record<string, { bg: string; color: string }> = {
    critical: { bg: '#E24B4A20', color: '#F09595' },
    warn:     { bg: '#EF9F2720', color: '#FAC775' },
    info:     { bg: '#1D9E7520', color: '#5DCAA5' },
  }
  const s = styles[level]
  return (
    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.bg, color: s.color, borderRadius: 20, padding: '0 5px', fontFamily: 'monospace' }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function PulsingDot({ level }: { level: 'critical' | 'warn' }) {
  const color = level === 'critical' ? '#E24B4A' : '#EF9F27'
  return (
    <span style={{ position: 'absolute', top: 8, right: 14, width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 0 2px ${color}40`, animation: 'pulse 2s ease-in-out infinite' }} />
  )
}

export function ShellLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const badges = useSidebarBadges()
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearch()

  const handleSignOut = async () => {
    await signOut()
    navigate(ROUTES.LOGIN)
    toast.success('Déconnexion réussie')
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'GT'
  const hasCritical = badges.lateActions > 0 || badges.expiredInspections > 0

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0c12', overflow: 'hidden' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
        .nav-item { transition: all 0.12s; }
        .nav-item:hover { background: rgba(255,255,255,0.04) !important; }
        .nav-item.active-link { background: rgba(29,158,117,0.08) !important; color: #5DCAA5 !important; }
        .nav-item.active-link .nav-icon { color: #1D9E75 !important; }
        .search-btn:hover { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.12) !important; }
      `}</style>

      {/* Global search overlay */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside style={{ width: 220, flexShrink: 0, background: '#0e1118', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: '#1D9E75', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CalendarDays style={{ width: 15, height: 15, color: '#fff' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Réunions GT</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', margin: 0, fontFamily: 'monospace' }}>v3.0</p>
            </div>
          </div>

          {/* Bouton recherche Cmd+K */}
          <button
            className="search-btn"
            onClick={() => setSearchOpen(true)}
            style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
            <Search style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>Rechercher...</span>
            <kbd style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>⌘K</kbd>
          </button>

          {/* Global alert strip */}
          {hasCritical && (
            <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 8, background: '#E24B4A10', border: '1px solid #E24B4A25', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle style={{ width: 11, height: 11, color: '#F09595', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#F09595', fontFamily: 'monospace' }}>
                {[
                  badges.lateActions > 0 && `${badges.lateActions} action${badges.lateActions > 1 ? 's' : ''} en retard`,
                  badges.expiredInspections > 0 && `${badges.expiredInspections} inspection${badges.expiredInspections > 1 ? 's' : ''} expirée${badges.expiredInspections > 1 ? 's' : ''}`,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          <NavSection label="Principal">
            <NavItem to={ROUTES.DASHBOARD} icon={LayoutDashboard} label="Dashboard" />
            <NavItem to={ROUTES.MEETINGS} icon={CalendarDays} label="Réunions" />
            <NavItem to={ROUTES.ACTIONS} icon={CheckSquare} label="Actions"
              badge={badges.lateActions > 0 ? badges.lateActions : badges.openActions > 0 ? badges.openActions : 0}
              badgeLevel={badges.lateActions > 0 ? 'critical' : badges.openActions > 0 ? 'warn' : null}
              pulse={badges.lateActions > 0}
            />
            <NavItem to={ROUTES.COLLEAGUES} icon={Users} label="Collègues" />
          </NavSection>

          <NavSection label="Opérationnel">
            <NavItem to={ROUTES.NOTES} icon={FileText} label="Notes prép." />
            <NavItem to={ROUTES.CONSUMABLES} icon={ShoppingCart} label="Consommables"
              badge={badges.pendingConsumables}
              badgeLevel={badges.pendingConsumables > 0 ? 'warn' : null}
            />
            <NavItem to={ROUTES.VEHICLES} icon={Car} label="Parc auto"
              badge={badges.expiredInspections > 0 ? badges.expiredInspections : badges.soonInspections > 0 ? badges.soonInspections : 0}
              badgeLevel={badges.expiredInspections > 0 ? 'critical' : badges.soonInspections > 0 ? 'warn' : null}
              pulse={badges.expiredInspections > 0}
            />
            <NavItem to={ROUTES.MOOD} icon={Activity} label="Baromètre" />
            <NavItem to={ROUTES.SCHEDULE} icon={Calendar} label="Planning" />
            <NavItem to="/leaves" icon={Calendar} label="Congés" />
          </NavSection>
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1D9E7530', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#5DCAA5', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#e8eaf0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
          </div>
          <button onClick={handleSignOut} title="Se déconnecter"
            style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', borderRadius: 6, display: 'flex', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E24B4A')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}>
            <LogOut style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <p style={{ padding: '10px 20px 4px', fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', margin: 0 }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function NavItem({ to, icon: Icon, label, badge, badgeLevel, pulse }: {
  to: string; icon: React.ElementType; label: string
  badge?: number; badgeLevel?: BadgeLevel; pulse?: boolean
}) {
  return (
    <NavLink to={to} end={to === ROUTES.DASHBOARD}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 20px', textDecoration: 'none',
        color: isActive ? '#5DCAA5' : 'rgba(255,255,255,0.45)',
        borderLeft: `2px solid ${isActive ? '#1D9E75' : 'transparent'}`,
        background: isActive ? 'rgba(29,158,117,0.07)' : 'transparent',
        position: 'relative', transition: 'all 0.12s', fontSize: 13,
      })}
      className="nav-item"
    >
      <Icon className="nav-icon" style={{ width: 14, height: 14, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      <NavBadge count={badge ?? 0} level={badgeLevel ?? null} />
      {pulse && <PulsingDot level={badgeLevel === 'critical' ? 'critical' : 'warn'} />}
    </NavLink>
  )
}

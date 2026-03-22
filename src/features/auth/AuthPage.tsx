import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from './useAuth'
import { ROUTES } from '../../constants'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

// ─── Circuit board SVG background ────────────────────────────────────────────
function CircuitBoard() {
  return (
    <svg
      width="100%" height="100%"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, opacity: 0.07 }}
    >
      {/* Horizontal traces */}
      <line x1="0" y1="80"  x2="800" y2="80"  stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="0" y1="160" x2="800" y2="160" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="0" y1="240" x2="800" y2="240" stroke="#00E5A0" strokeWidth="0.3"/>
      <line x1="0" y1="320" x2="800" y2="320" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="0" y1="400" x2="800" y2="400" stroke="#00E5A0" strokeWidth="0.3"/>
      <line x1="0" y1="480" x2="800" y2="480" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="0" y1="560" x2="800" y2="560" stroke="#00E5A0" strokeWidth="0.3"/>

      {/* Vertical traces */}
      <line x1="100" y1="0" x2="100" y2="600" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="200" y1="0" x2="200" y2="600" stroke="#00E5A0" strokeWidth="0.3"/>
      <line x1="300" y1="0" x2="300" y2="600" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="400" y1="0" x2="400" y2="600" stroke="#00E5A0" strokeWidth="0.3"/>
      <line x1="500" y1="0" x2="500" y2="600" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="600" y1="0" x2="600" y2="600" stroke="#00E5A0" strokeWidth="0.3"/>
      <line x1="700" y1="0" x2="700" y2="600" stroke="#00E5A0" strokeWidth="0.5"/>

      {/* Nodes / vias */}
      {[
        [100,80],[300,80],[500,80],[700,80],
        [200,160],[400,160],[600,160],
        [100,240],[300,240],[500,240],[700,240],
        [200,320],[400,320],[600,320],
        [100,400],[300,400],[500,400],[700,400],
        [200,480],[400,480],[600,480],
        [100,560],[300,560],[500,560],[700,560],
      ].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="none" stroke="#00E5A0" strokeWidth="0.8" />
      ))}

      {/* Filled nodes (hot spots) */}
      {[[300,160],[500,320],[200,400],[600,80],[400,480]].map(([x,y], i) => (
        <circle key={`f${i}`} cx={x} cy={y} r="4" fill="#00E5A0" opacity="0.6" />
      ))}

      {/* IC chip shapes */}
      <rect x="120" y="170" width="60" height="40" rx="2" fill="none" stroke="#00E5A0" strokeWidth="0.8"/>
      <line x1="130" y1="170" x2="130" y2="160" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="145" y1="170" x2="145" y2="160" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="160" y1="170" x2="160" y2="160" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="130" y1="210" x2="130" y2="220" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="145" y1="210" x2="145" y2="220" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="160" y1="210" x2="160" y2="220" stroke="#00E5A0" strokeWidth="0.5"/>

      <rect x="520" y="330" width="70" height="50" rx="2" fill="none" stroke="#00E5A0" strokeWidth="0.8"/>
      <line x1="530" y1="330" x2="530" y2="320" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="548" y1="330" x2="548" y2="320" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="566" y1="330" x2="566" y2="320" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="530" y1="380" x2="530" y2="390" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="548" y1="380" x2="548" y2="390" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="566" y1="380" x2="566" y2="390" stroke="#00E5A0" strokeWidth="0.5"/>

      {/* Diagonal routing */}
      <path d="M300 80 L380 160" fill="none" stroke="#00E5A0" strokeWidth="0.5"/>
      <path d="M500 160 L600 80" fill="none" stroke="#00E5A0" strokeWidth="0.5"/>
      <path d="M200 320 L300 240" fill="none" stroke="#00E5A0" strokeWidth="0.5"/>
      <path d="M400 400 L500 320" fill="none" stroke="#00E5A0" strokeWidth="0.5"/>

      {/* Capacitor symbols */}
      <line x1="640" y1="230" x2="660" y2="230" stroke="#00E5A0" strokeWidth="1"/>
      <line x1="640" y1="238" x2="660" y2="238" stroke="#00E5A0" strokeWidth="1"/>
      <line x1="650" y1="220" x2="650" y2="230" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="650" y1="238" x2="650" y2="248" stroke="#00E5A0" strokeWidth="0.5"/>

      {/* Resistor */}
      <rect x="340" y="435" width="30" height="12" rx="2" fill="none" stroke="#00E5A0" strokeWidth="0.8"/>
      <line x1="320" y1="441" x2="340" y2="441" stroke="#00E5A0" strokeWidth="0.5"/>
      <line x1="370" y1="441" x2="390" y2="441" stroke="#00E5A0" strokeWidth="0.5"/>
    </svg>
  )
}

// ─── Animated scan line ───────────────────────────────────────────────────────
function ScanLine() {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 1,
      background: 'linear-gradient(90deg, transparent, #00E5A0, transparent)',
      opacity: 0.15,
      animation: 'scanline 6s linear infinite',
    }} />
  )
}

// ─── Typing text ──────────────────────────────────────────────────────────────
function TypingText({ texts }: { texts: string[] }) {
  const [idx, setIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [phase, setPhase] = useState<'typing' | 'pause' | 'erasing'>('typing')

  useEffect(() => {
    const current = texts[idx % texts.length]
    let timeout: ReturnType<typeof setTimeout>

    if (phase === 'typing') {
      if (displayed.length < current.length) {
        timeout = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), 60)
      } else {
        timeout = setTimeout(() => setPhase('pause'), 1800)
      }
    } else if (phase === 'pause') {
      timeout = setTimeout(() => setPhase('erasing'), 200)
    } else {
      if (displayed.length > 0) {
        timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30)
      } else {
        setIdx(i => i + 1)
        setPhase('typing')
      }
    }
    return () => clearTimeout(timeout)
  }, [displayed, phase, idx, texts])

  return (
    <span style={{ color: '#00E5A0', fontFamily: "'DM Mono', monospace" }}>
      {displayed}
      <span style={{ animation: 'blink 1s step-end infinite', opacity: 1 }}>_</span>
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function AuthPage() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [focused, setFocused] = useState<string | null>(null)

  if (!loading && session) return <Navigate to={ROUTES.DASHBOARD} replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('Vérifiez votre email pour confirmer votre compte')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erreur de connexion')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#050709',
      display: 'flex', position: 'relative', overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <style>{`
        @keyframes scanline {
          0% { top: -2px; }
          100% { top: 100%; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0,229,160,0.3); }
          70%  { transform: scale(1);    box-shadow: 0 0 0 10px rgba(0,229,160,0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0,229,160,0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .field-wrap input:focus { outline: none; }
      `}</style>

      {/* ── Circuit background ── */}
      <CircuitBoard />
      <ScanLine />

      {/* ── Left panel ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '48px 56px', position: 'relative', zIndex: 1,
        borderRight: '1px solid rgba(0,229,160,0.08)',
      }}>
        {/* Logo */}
        <div style={{ animation: 'fadeUp 0.6s ease forwards' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 36, height: 36, background: '#00E5A0',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulse-ring 2.5s ease-in-out infinite',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#050709" strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Réunions GT</p>
              <p style={{ fontSize: 10, color: '#00E5A0', margin: 0, fontFamily: "'DM Mono', monospace", letterSpacing: '0.08em' }}>v3.0 · SYSTÈME OPÉRATIONNEL</p>
            </div>
          </div>
        </div>

        {/* Center copy */}
        <div style={{ animation: 'fadeUp 0.6s 0.15s ease both' }}>
          <p style={{ fontSize: 11, color: '#00E5A0', fontFamily: "'DM Mono', monospace", letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            // Plateforme de gestion d'équipe
          </p>
          <h1 style={{
            fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, color: '#fff',
            margin: '0 0 12px', lineHeight: 1.08, letterSpacing: '-0.04em',
          }}>
            Piloter.<br />
            <span style={{ color: '#00E5A0' }}>Anticiper.</span><br />
            Décider.
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', margin: '0 0 32px', lineHeight: 1.6, maxWidth: 420 }}>
            Réunions, actions, parc auto, équipe — tout ce qui compte pour votre activité terrain, centralisé et accessible.
          </p>

          {/* Live typing */}
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1.8 }}>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>{'>'} </span>
            <TypingText texts={[
              'Gérer les réunions hebdo',
              'Suivre les points d\'action',
              'Surveiller le parc véhicules',
              'Piloter le baromètre équipe',
              'Anticiper les inspections VGP',
              'Centraliser les consommables',
            ]} />
          </div>
        </div>

        {/* Bottom badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', animation: 'fadeUp 0.6s 0.3s ease both' }}>
          {['Logistique', 'Industrie', 'Terrain', 'PME'].map(tag => (
            <span key={tag} style={{
              fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em',
              color: 'rgba(0,229,160,0.6)', border: '1px solid rgba(0,229,160,0.15)',
              borderRadius: 4, padding: '3px 10px', background: 'rgba(0,229,160,0.04)',
            }}>
              {tag.toUpperCase()}
            </span>
          ))}
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: "'DM Mono', monospace", alignSelf: 'center', marginLeft: 4 }}>
            · Conçu en France 🇫🇷
          </span>
        </div>
      </div>

      {/* ── Right panel : form ── */}
      <div style={{
        width: 480, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 48px', position: 'relative', zIndex: 1,
      }}>
        <div style={{ width: '100%', animation: 'fadeUp 0.6s 0.1s ease both' }}>

          {/* Form card */}
          <div style={{
            background: 'rgba(10,14,20,0.95)',
            border: '1px solid rgba(0,229,160,0.15)',
            borderRadius: 20,
            padding: '36px 36px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 0 60px rgba(0,229,160,0.05), 0 24px 48px rgba(0,0,0,0.6)',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Top accent line */}
            <div style={{ position: 'absolute', top: 0, left: 32, right: 32, height: 1, background: 'linear-gradient(90deg, transparent, #00E5A0, transparent)', opacity: 0.6 }} />

            {/* Corner markers */}
            {[
              { top: 8, left: 8, borderTop: '1.5px solid #00E5A040', borderLeft: '1.5px solid #00E5A040' },
              { top: 8, right: 8, borderTop: '1.5px solid #00E5A040', borderRight: '1.5px solid #00E5A040' },
              { bottom: 8, left: 8, borderBottom: '1.5px solid #00E5A040', borderLeft: '1.5px solid #00E5A040' },
              { bottom: 8, right: 8, borderBottom: '1.5px solid #00E5A040', borderRight: '1.5px solid #00E5A040' },
            ].map((s, i) => (
              <div key={i} style={{ position: 'absolute', width: 16, height: 16, ...s }} />
            ))}

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 10, color: '#00E5A0', fontFamily: "'DM Mono', monospace", letterSpacing: '0.15em', margin: '0 0 6px' }}>
                {mode === 'login' ? '// AUTHENTIFICATION' : '// CRÉATION DE COMPTE'}
              </p>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.03em' }}>
                {mode === 'login' ? 'Accès système' : 'Nouveau compte'}
              </h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '6px 0 0', fontFamily: "'DM Mono', monospace" }}>
                {mode === 'login' ? 'Entrez vos identifiants pour continuer' : 'Créez votre espace de travail'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Email field */}
              <div className="field-wrap">
                <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: focused === 'email' ? '#00E5A0' : 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace", marginBottom: 6, transition: 'color 0.2s' }}>
                  Identifiant
                </label>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${focused === 'email' ? '#00E5A0' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 10, padding: '0 14px', height: 46,
                  transition: 'border-color 0.2s, background 0.2s',
                  ...(focused === 'email' ? { background: 'rgba(0,229,160,0.04)' } : {}),
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={focused === 'email' ? '#00E5A0' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0, transition: 'stroke 0.2s' }}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="vous@entreprise.fr" required
                    onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                    style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: '#fff', fontFamily: "'DM Mono', monospace", letterSpacing: '0.02em' }}
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="field-wrap">
                <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: focused === 'pass' ? '#00E5A0' : 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace", marginBottom: 6, transition: 'color 0.2s' }}>
                  Mot de passe
                </label>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${focused === 'pass' ? '#00E5A0' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 10, padding: '0 14px', height: 46,
                  transition: 'border-color 0.2s, background 0.2s',
                  ...(focused === 'pass' ? { background: 'rgba(0,229,160,0.04)' } : {}),
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={focused === 'pass' ? '#00E5A0' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0, transition: 'stroke 0.2s' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••" required
                    onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)}
                    style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: '#fff', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em' }}
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit" disabled={busy || !email || !password}
                style={{
                  marginTop: 6, width: '100%', height: 50,
                  background: busy ? 'rgba(0,229,160,0.6)' : '#00E5A0',
                  border: 'none', borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
                  color: '#050709', fontSize: 14, fontWeight: 800,
                  fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s', opacity: (!email || !password) ? 0.5 : 1,
                  boxShadow: busy ? 'none' : '0 0 20px rgba(0,229,160,0.25)',
                }}
                onMouseEnter={e => { if (!busy) { (e.currentTarget as HTMLElement).style.background = '#00ffb3'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(0,229,160,0.4)' } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = busy ? 'rgba(0,229,160,0.6)' : '#00E5A0'; (e.currentTarget as HTMLElement).style.boxShadow = busy ? 'none' : '0 0 20px rgba(0,229,160,0.25)' }}
              >
                {busy
                  ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                }
                {busy ? 'Connexion...' : mode === 'login' ? 'Accéder au système' : 'Créer le compte'}
              </button>
            </form>

            {/* Mode toggle */}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
              <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace', transition: 'color 0.2s'" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#00E5A0')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)')}>
                {mode === 'login' ? "Pas de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
              </button>
            </div>
          </div>

          {/* Footer */}
          <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.12)', marginTop: 20, fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em' }}>
            RÉUNIONS GT v3.0 · SYSTÈME SÉCURISÉ · 🇫🇷
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#050709', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 36, height: 36, background: '#00E5A0', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse-ring 2.5s ease-in-out infinite',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#050709" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <p style={{ fontSize: 11, color: '#00E5A0', fontFamily: "'DM Mono', monospace", letterSpacing: '0.12em' }}>
          CHARGEMENT...
        </p>
      </div>
    </div>
  )

  if (!session) return <Navigate to={ROUTES.LOGIN} replace />
  return <>{children}</>
}

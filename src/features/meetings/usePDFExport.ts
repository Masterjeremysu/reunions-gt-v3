import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

/**
 * Génère et télécharge le PDF d'un compte-rendu.
 * Appelle la Supabase Edge Function "generate-cr-pdf"
 * qui exécute le script Python reportlab côté serveur.
 *
 * En attendant le déploiement de l'Edge Function,
 * on utilise un fallback HTML-to-print natif.
 */
export async function exportMeetingPDF(meeting: any, colleagues: any[], crItems: any[], actions: any[]) {
  const toastId = toast.loading('Génération du PDF...')
  try {
    const colmap: Record<string, any> = {}
    colleagues.forEach(c => { colmap[c.id] = c })

    // Tentative Edge Function
    const { data: { session } } = await supabase.auth.getSession()
    const payload = {
      title:            meeting.title,
      date:             meeting.date,
      description:      meeting.description,
      colleagues_ids:   meeting.colleagues_ids || [],
      colleagues,
      successes:        meeting.successes || [],
      failures:         meeting.failures || [],
      sensitive_points: meeting.sensitive_points || [],
      relational_points:meeting.relational_points || [],
      cr_items:         crItems,
      actions,
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cr-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      )
      if (res.ok) {
        const blob = await res.blob()
        downloadBlob(blob, `CR-${meeting.title.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`)
        toast.success('PDF téléchargé !', { id: toastId })
        return
      }
    } catch {}

    // Fallback : impression HTML premium
    printHTMLFallback(payload, colmap, crItems)
    toast.success('Impression lancée !', { id: toastId })
  } catch (err: any) {
    toast.error(err.message, { id: toastId })
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function parseItems(arr: string[]): string[] {
  return (arr || []).map(s => {
    const m = s.match(/^[0-9a-f\-]{36}::(.+)$/i)
    if (m) return m[1].trim()
    if (/^[0-9a-f]{8}-/i.test(s)) return ''
    return s.trim()
  }).filter(Boolean)
}

const CAT = [
  { key: 'successes',          label: 'Succès',          color: '#1D9E75', bg: '#1D9E7510', border: '#1D9E7530' },
  { key: 'failures',           label: 'Défauts',          color: '#E24B4A', bg: '#E24B4A10', border: '#E24B4A30' },
  { key: 'sensitive_points',   label: 'Points sensibles', color: '#EF9F27', bg: '#EF9F2710', border: '#EF9F2730' },
  { key: 'relational_points',  label: 'Relationnels',     color: '#7F77DD', bg: '#7F77DD10', border: '#7F77DD30' },
]

const STATUS: Record<string, [string, string]> = {
  pending:     ['#EF9F27', 'En attente'],
  in_progress: ['#378ADD', 'En cours'],
  completed:   ['#1D9E75', 'Terminée'],
  cancelled:   ['#8b90a4', 'Annulée'],
}

function fmtDate(d: string) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch { return d }
}

function printHTMLFallback(data: any, colmap: Record<string, any>, crItems: any[]) {
  const attrMap: Record<string, string> = {}
  crItems.forEach(it => {
    if (it.content && it.colleagues?.name) attrMap[it.content.trim()] = it.colleagues.name
  })

  const participants = (data.colleagues_ids || []).map((id: string) => colmap[id]).filter(Boolean)

  const crGrid = CAT.map(cat => {
    const items = parseItems(data[cat.key] || [])
    const rows = items.map(item => {
      const who = attrMap[item.trim()]
      return `
        <div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:12px;color:#e8eaf0;line-height:1.5">• ${item}</div>
          ${who ? `<div style="font-size:11px;color:${cat.color};margin-top:2px">  → ${who}</div>` : ''}
        </div>`
    }).join('')
    return `
      <div style="background:${cat.bg};border:1px solid ${cat.border};border-radius:8px;padding:12px;break-inside:avoid">
        <div style="font-size:10px;font-weight:700;color:${cat.color};letter-spacing:1px;margin-bottom:8px">${cat.label.toUpperCase()}</div>
        ${rows || '<div style="font-size:11px;color:#565c75">—</div>'}
      </div>`
  }).join('')

  const actRows = (data.actions || []).map((a: any) => {
    const [sc, sl] = STATUS[a.status] || ['#8b90a4', '—']
    const cname = colmap[a.assigned_to_colleague_id]?.name || '—'
    const due   = a.due_date ? a.due_date.slice(0, 10) : '—'
    return `
      <tr style="border-bottom:1px solid #131720">
        <td style="padding:7px 8px;font-size:11px;color:#e8eaf0">• ${a.description}</td>
        <td style="padding:7px 8px;font-size:11px;color:#8b90a4">${cname}</td>
        <td style="padding:7px 8px;font-size:11px;color:#8b90a4">${due}</td>
        <td style="padding:7px 8px;font-size:11px;color:${sc};font-weight:600">${sl}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${data.title}</title>
<style>
  @page { size:A4; margin:0 }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0c12;color:#e8eaf0;font-family:system-ui,sans-serif;padding:0}
  .page{width:210mm;min-height:297mm;padding:12mm 14mm 14mm;position:relative}
  .topbar{background:#1D9E75;padding:7px 14px;display:flex;justify-content:space-between;align-items:center;margin:-12mm -14mm 10mm}
  .topbar-l{font-weight:700;font-size:11px;color:#050709}
  .topbar-r{font-size:9px;color:#05392a}
  .sideline{border-left:3px solid #1D9E75;padding-left:10px;margin-bottom:6mm}
  .title{font-size:20px;font-weight:800;color:#fff;line-height:1.2}
  .date{font-size:10px;color:#5DCAA5;margin-top:4px}
  .section-label{font-size:8px;font-weight:700;color:#565c75;letter-spacing:1.5px;margin:5mm 0 3mm;text-transform:uppercase}
  .parts-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:5mm}
  .part-card{background:#161b26;border-radius:6px;padding:7px 10px}
  .part-name{font-size:10px;font-weight:600;color:#e8eaf0}
  .part-post{font-size:9px;color:#8b90a4;margin-top:1px}
  .cr-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:5mm}
  .actions-table{width:100%;border-collapse:collapse;background:#161b26;border-radius:8px;overflow:hidden}
  .actions-table th{padding:6px 8px;font-size:9px;font-weight:700;color:#565c75;text-align:left;background:#0e1118;border-bottom:1px solid #1D9E7540;letter-spacing:.8px}
  .footer{margin-top:6mm;border-top:1px solid #1e2535;padding-top:3mm;text-align:center;font-size:8px;color:#565c75}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>
<div class="page">
  <div class="topbar">
    <span class="topbar-l">RÉUNIONS GT</span>
    <span class="topbar-r">COMPTE-RENDU OFFICIEL · v3.0</span>
  </div>
  <div class="sideline">
    <div class="title">${data.title}</div>
    <div class="date">${fmtDate(data.date)}</div>
    ${data.description ? `<div style="font-size:11px;color:#8b90a4;margin-top:4px">${data.description}</div>` : ''}
  </div>
  ${participants.length ? `
  <div class="section-label">Participants</div>
  <div class="parts-grid">
    ${participants.map((p: any) => `
      <div class="part-card">
        <div class="part-name">${p.name}</div>
        <div class="part-post">${p.post || ''}</div>
      </div>`).join('')}
  </div>` : ''}
  <div class="section-label">Compte-rendu</div>
  <div class="cr-grid">${crGrid}</div>
  ${data.actions?.length ? `
  <div class="section-label">Points d'action</div>
  <table class="actions-table">
    <thead><tr>
      <th>Description</th><th>Assigné à</th><th>Échéance</th><th>Statut</th>
    </tr></thead>
    <tbody>${actRows}</tbody>
  </table>` : ''}
  <div class="footer">Document officiel · Réunions GT v3.0 · ${fmtDate(data.date)}</div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

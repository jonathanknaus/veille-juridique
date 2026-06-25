// Trace de traitement des articles de veille — preuve Qualiopi
const STORAGE_KEY = 'pls_traitements'

export const DECISIONS = {
  diffuser:  { label: 'Diffusé à l\'équipe', icon: '📢', color: '#276749' },
  archiver:  { label: 'Archivé',             icon: '📁', color: '#4A5568' },
  noter:     { label: 'Note interne',        icon: '📝', color: '#2B6CB0' },
}

export function getTraitements() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function getTraitement(articleId) {
  return getTraitements().find(t => t.articleId === articleId) || null
}

export function enregistrerTraitement({ articleId, articleTitre, articleSource, articleThematique, articleDate, decision, commentaire, destinataires, urlArticle }) {
  const traitements = getTraitements().filter(t => t.articleId !== articleId)
  const trace = {
    id: `t_${Date.now()}`,
    articleId,
    articleTitre,
    articleSource,
    articleThematique,
    articleDate,
    decision,
    commentaire: commentaire || '',
    destinataires: destinataires || [],
    urlArticle: urlArticle || '',
    traitePar: 'sarah.briden@pennylane-partners.com',
    traiteAt: new Date().toISOString(),
  }
  const updated = [...traitements, trace]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return trace
}

export function exportRegistrePDF(traitements) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const rows = [...traitements].sort((a, b) => new Date(b.traiteAt) - new Date(a.traiteAt))

  const lignes = rows.map(t => {
    const d = DECISIONS[t.decision]
    const dateTraitement = new Date(t.traiteAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const lien = t.urlArticle ? `<a href="${t.urlArticle}" style="color:#003D3D">${t.articleTitre}</a>` : t.articleTitre
    return `
      <tr>
        <td>${dateTraitement}</td>
        <td>${lien}</td>
        <td>${t.articleSource}</td>
        <td style="white-space:nowrap">${d?.icon || ''} ${d?.label || t.decision}</td>
        <td>${t.traitePar}</td>
        <td>${t.destinataires.length > 0 ? t.destinataires.join('<br>') : '—'}</td>
        <td>${t.commentaire || '—'}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Registre Qualiopi — Veille Juridique</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 20px; }
  h1 { font-size: 18px; color: #003D3D; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #003D3D; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f7fafa; }
  .footer { margin-top: 24px; font-size: 10px; color: #888; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>
</head>
<body>
<h1>Registre de veille juridique — Preuve Qualiopi</h1>
<p class="meta">Généré le ${today} · ${rows.length} trace(s)</p>
<table>
  <thead>
    <tr>
      <th>Date traitement</th><th>Titre article</th><th>Source</th><th>Décision</th><th>Traité par</th><th>Destinataires</th><th>Commentaire</th>
    </tr>
  </thead>
  <tbody>${lignes}</tbody>
</table>
<p class="footer">Document généré automatiquement par l'outil de veille juridique AFS — Pennylane Learning Suite</p>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

export function exportRegistreCSV(traitements) {
  const header = ['ID', 'Date traitement', 'Titre', 'Source', 'Thématique', 'Date article', 'Décision', 'Traité par', 'Commentaire', 'Destinataires']
  const rows = traitements.map(t => [
    t.id,
    new Date(t.traiteAt).toLocaleString('fr-FR'),
    `"${t.articleTitre.replace(/"/g, '""')}"`,
    t.articleSource,
    t.articleThematique,
    t.articleDate,
    DECISIONS[t.decision]?.label || t.decision,
    t.traitePar,
    `"${(t.commentaire || '').replace(/"/g, '""')}"`,
    t.destinataires.join(' | '),
  ])
  return [header, ...rows].map(r => r.join(';')).join('\n')
}

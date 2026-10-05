// Trace de traitement des articles de veille — preuve Qualiopi
//
// Ce registre sert de preuve pour trois indicateurs du référentiel :
//   23 — veille légale et réglementaire
//   24 — veille métiers, compétences et innovations du secteur
//   25 — veille sur l'innovation pédagogique et technologique
//
// Ce que l'auditeur attend n'est pas la liste des articles lus, mais la trace
// de ce qu'on en a FAIT : c'est le rôle du champ « impact ».
import { getCurrentUser } from './auth'

const STORAGE_KEY = 'pls_traitements'

export const DECISIONS = {
  diffuser:  { label: 'Diffusé à l\'équipe', icon: '📢', color: '#276749' },
  archiver:  { label: 'Archivé',             icon: '📁', color: '#4A5568' },
  noter:     { label: 'Note interne',        icon: '📝', color: '#2B6CB0' },
}

export const INDICATEURS = {
  23: {
    label: 'Veille légale et réglementaire',
    court: 'Légal',
    description: 'Droit de la formation professionnelle, financement, règles d\'audit : Qualiopi, OPCO, évolution de la loi sur les organismes de formation.',
    exemplePreuve: 'Adaptation d\'une convention de formation ou du règlement intérieur suite à une nouvelle loi.',
    color: '#B91C1C',
  },
  24: {
    label: 'Veille métiers, compétences et innovations du secteur',
    court: 'Métiers',
    description: 'Évolution du marché du travail et de l\'état de l\'art : France Compétences, observatoires métiers et GPEC, presse sectorielle.',
    exemplePreuve: 'Mise à jour du contenu d\'un cours, ajout d\'un module après la sortie d\'un nouvel outil métier.',
    color: '#1D4ED8',
  },
  25: {
    label: 'Veille sur l\'innovation pédagogique et technologique',
    court: 'Pédagogie',
    description: 'Modernisation des méthodes et des outils : distanciel, IA, gamification, neurosciences, LMS, plateformes interactives.',
    exemplePreuve: 'Intégration d\'un outil interactif, passage d\'un cours en blended learning, webinaire sur l\'IA appliquée à la pédagogie.',
    color: '#6D28D9',
  },
}

export const INDICATEURS_IDS = ['23', '24', '25']

export function libelleIndicateur(indicateur) {
  const i = INDICATEURS[indicateur]
  return i ? `Ind. ${indicateur} — ${i.label}` : 'Non qualifié'
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

export function enregistrerTraitement({
  articleId, articleTitre, articleSource, articleThematique, articleDate,
  decision, commentaire, destinataires, urlArticle, indicateur, impact,
}) {
  const traitements = getTraitements().filter(t => t.articleId !== articleId)
  // Qui a réellement traité : l'adresse était auparavant codée en dur sur
  // Sarah, ce qui faussait le registre dès qu'une autre personne intervenait.
  const auteur = getCurrentUser()?.email || 'inconnu'
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
    traitePar: auteur,
    traiteAt: new Date().toISOString(),
  }
  // Champs optionnels : les règles côté serveur refusent une valeur vide pour
  // 'indicateur', on ne l'écrit donc que s'il est qualifié.
  if (INDICATEURS_IDS.includes(String(indicateur))) trace.indicateur = String(indicateur)
  if (impact) trace.impact = impact

  const updated = [...traitements, trace]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return trace
}

// Filtre par indicateur. `'non_qualifie'` isole les traces sans rattachement,
// pour que Sarah puisse les reprendre progressivement.
export function filtrerParIndicateur(traitements, indicateur) {
  if (!indicateur || indicateur === 'tous') return traitements
  if (indicateur === 'non_qualifie') return traitements.filter(t => !t.indicateur)
  return traitements.filter(t => String(t.indicateur) === String(indicateur))
}

export function compterParIndicateur(traitements) {
  const compte = { tous: traitements.length, non_qualifie: 0 }
  INDICATEURS_IDS.forEach(id => { compte[id] = 0 })
  for (const t of traitements) {
    const id = String(t.indicateur || '')
    if (INDICATEURS_IDS.includes(id)) compte[id] += 1
    else compte.non_qualifie += 1
  }
  return compte
}

// Colonnes alignées sur le tableau de suivi demandé par Sarah :
// Date · Type de veille · Source/Lien · Sujet · Impact/Action menée sur l'OF
export function exportRegistreCSV(traitements) {
  const SEP = ';'
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = [
    'Date', 'Type de veille', 'Source', 'Lien', 'Sujet / Information cle',
    'Impact / Action menee sur l\'OF', 'Decision', 'Traite par',
    'Commentaire', 'Destinataires', 'Thematique', 'Date article', 'ID',
  ]
  const rows = [...traitements]
    .sort((a, b) => new Date(b.traiteAt) - new Date(a.traiteAt))
    .map(t => [
      new Date(t.traiteAt).toLocaleDateString('fr-FR'),
      q(t.indicateur ? `Ind. ${t.indicateur} — ${INDICATEURS[t.indicateur]?.court || ''}` : 'Non qualifie'),
      q(t.articleSource),
      q(t.urlArticle),
      q(t.articleTitre),
      q(t.impact),
      DECISIONS[t.decision]?.label || t.decision,
      t.traitePar,
      q(t.commentaire),
      q((t.destinataires || []).join(' | ')),
      t.articleThematique,
      t.articleDate,
      t.id,
    ])
  return 'sep=' + SEP + '\n' + [header, ...rows].map(r => r.join(SEP)).join('\r\n')
}

// `indicateur` restreint le document à un seul indicateur : c'est sous cette
// forme qu'on présente la preuve à l'auditeur, indicateur par indicateur.
export function exportRegistrePDF(traitements, indicateur) {
  const echap = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const filtrees = filtrerParIndicateur(traitements, indicateur)
  const rows = [...filtrees].sort((a, b) => new Date(b.traiteAt) - new Date(a.traiteAt))

  const info = INDICATEURS[indicateur]
  const titre = info
    ? `Indicateur ${indicateur} — ${info.label}`
    : indicateur === 'non_qualifie'
      ? 'Traces non encore rattachées à un indicateur'
      : 'Registre de veille — indicateurs 23, 24 et 25'

  const lignes = rows.map(t => {
    const d = DECISIONS[t.decision]
    const ind = t.indicateur ? `Ind. ${t.indicateur}` : '—'
    const dateTraitement = new Date(t.traiteAt).toLocaleDateString('fr-FR')
    const lien = t.urlArticle
      ? `<a href="${echap(t.urlArticle)}" style="color:#003D3D">${echap(t.articleTitre)}</a>`
      : echap(t.articleTitre)
    return `
      <tr>
        <td style="white-space:nowrap">${dateTraitement}</td>
        <td style="white-space:nowrap">${ind}</td>
        <td>${echap(t.articleSource)}</td>
        <td>${lien}</td>
        <td>${echap(t.impact) || '<em style="color:#999">non renseigné</em>'}</td>
        <td style="white-space:nowrap">${d?.icon || ''} ${echap(d?.label || t.decision)}</td>
        <td>${echap(t.traitePar)}</td>
      </tr>`
  }).join('')

  const rappel = info
    ? `<p class="rappel"><strong>Objectif :</strong> ${echap(info.description)}<br><strong>Preuve attendue :</strong> ${echap(info.exemplePreuve)}</p>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Registre Qualiopi — ${echap(titre)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 20px; }
  h1 { font-size: 17px; color: #003D3D; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 14px; }
  .rappel { font-size: 10.5px; color: #333; background: #f0f7f5; border-left: 3px solid #00BD57; padding: 8px 12px; margin-bottom: 16px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #003D3D; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f7fafa; }
  .footer { margin-top: 24px; font-size: 10px; color: #888; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>
</head>
<body>
<h1>${echap(titre)}</h1>
<p class="meta">Registre de veille — généré le ${today} · ${rows.length} trace(s)</p>
${rappel}
<table>
  <thead>
    <tr>
      <th>Date</th><th>Ind.</th><th>Source</th><th>Sujet / information clé</th><th>Impact / action menée</th><th>Décision</th><th>Traité par</th>
    </tr>
  </thead>
  <tbody>${lignes}</tbody>
</table>
<p class="footer">Document généré par l'outil de veille juridique AFS — Pennylane Learning Suite</p>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

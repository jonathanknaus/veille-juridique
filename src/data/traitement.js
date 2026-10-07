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

// Libellés conformes au référentiel national annexé au chapitre VI du Code du
// travail. Revérifiés mot à mot sur Légifrance le 2026-10-06 (décret
// n° 2026-728 du 1er août 2026, JORF n°0180 du 4 août, article 1er) : les trois
// libellés ci-dessous sont EXACTEMENT ceux du texte, et 23, 24, 25 restent les
// indicateurs de veille, tous trois sous le critère 6.
//
// ⚠️ Correction d'une note antérieure qui affirmait « 32 indicateurs, sans
// changement de numérotation » : la nouvelle annexe va jusqu'à l'indicateur 33.
// Le 33 est un indicateur spécifique (il ne porte qu'une croix dans le tableau
// des types d'action) et impose « un dispositif d'évaluation des contenus et des
// enseignements par les apprenants, distinct du recueil général de
// satisfaction ». À vérifier avant le 1er novembre 2026 : savoir s'il s'applique
// à nos actions de formation ou seulement à l'apprentissage.
//
// Les trois libellés officiels se terminent par « et en exploite les
// enseignements » : l'indicateur n'exige pas de faire de la veille, mais d'en
// tirer des conséquences. C'est tout le sens du champ 'impact'.
export const INDICATEURS = {
  23: {
    label: 'Veille légale et réglementaire',
    court: 'Légal',
    officiel: 'Le prestataire réalise une veille légale et réglementaire sur le champ de la formation professionnelle et en exploite les enseignements.',
    description: 'Droit de la formation professionnelle, financement, règles d\'audit : Qualiopi, OPCO, évolution de la loi sur les organismes de formation.',
    exemplePreuve: 'Adaptation d\'une convention de formation ou du règlement intérieur suite à une nouvelle loi.',
    color: '#B91C1C',
  },
  24: {
    label: 'Veille sur les compétences, les métiers et les emplois',
    court: 'Métiers',
    officiel: 'Le prestataire réalise une veille sur les évolutions des compétences, des métiers et des emplois dans ses secteurs d\'intervention et en exploite les enseignements.',
    description: 'Évolution du marché du travail dans les secteurs d\'intervention : France Compétences, observatoires métiers et GPEC, presse sectorielle.',
    exemplePreuve: 'Mise à jour du contenu d\'un cours, ajout d\'un module après la sortie d\'un nouvel outil métier.',
    color: '#1D4ED8',
  },
  25: {
    label: 'Veille sur les innovations pédagogiques et technologiques',
    court: 'Pédagogie',
    officiel: 'Le prestataire réalise une veille sur les innovations pédagogiques et technologiques permettant une évolution de ses prestations et en exploite les enseignements.',
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
  mailPrepareLe,
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
  // « Préparé », pas « envoyé » : l'outil ouvre le client de messagerie, il ne
  // voit pas si le bouton Envoyer a été cliqué. Écrire « envoyé » dans un
  // registre de preuve serait affirmer ce qu'on n'a pas constaté.
  if (mailPrepareLe) trace.mailPrepareLe = mailPrepareLe

  const updated = [...traitements, trace]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return trace
}

// Lien `mailto:` pré-rempli pour diffuser un article à l'équipe.
//
// L'outil n'envoie pas lui-même : le site est statique et son bundle est public,
// y mettre un identifiant SMTP reviendrait à le publier — c'est exactement ce qui
// est arrivé au token GitHub inliné par Vite. Le mail part donc de la boîte de la
// personne, avec sa signature, et elle le relit avant d'appuyer sur Envoyer.
//
// Les corps longs sont tronqués : au-delà d'environ 2 000 caractères d'URL,
// certains clients de messagerie coupent le message sans rien dire.
const LONGUEUR_CORPS_MAX = 1400

export function lienMailDiffusion({ titre, url, source, date, message, indicateur, destinataires }) {
  const ind = INDICATEURS[indicateur]
  const lignes = [
    'Bonjour,',
    '',
    (message || '').trim(),
    '',
    titre || '',
    url || '',
    '',
    [source, date ? new Date(date).toLocaleDateString('fr-FR') : ''].filter(Boolean).join(' · '),
    ind ? `Type de veille : indicateur ${indicateur} — ${ind.label}` : '',
  ].filter(l => l !== null && l !== undefined)

  let corps = lignes.join('\n').replace(/\n{3,}/g, '\n\n')
  if (corps.length > LONGUEUR_CORPS_MAX) corps = `${corps.slice(0, LONGUEUR_CORPS_MAX)}…`

  const objet = `[Veille] ${(titre || '').slice(0, 120)}`
  const pour = (destinataires || []).filter(Boolean).join(',')
  return `mailto:${encodeURIComponent(pour).replace(/%2C/g, ',')}`
    + `?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`
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
    'Commentaire', 'Destinataires', 'Mail prepare le', 'Thematique',
    'Date article', 'ID',
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
      t.mailPrepareLe ? new Date(t.mailPrepareLe).toLocaleString('fr-FR') : '',
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
    ? `<p class="rappel"><strong>Libellé officiel (référentiel national, annexe au chapitre VI du code du travail) :</strong><br>« ${echap(info.officiel)} »<br><br><strong>Périmètre :</strong> ${echap(info.description)}<br><strong>Preuve attendue :</strong> ${echap(info.exemplePreuve)}</p>`
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

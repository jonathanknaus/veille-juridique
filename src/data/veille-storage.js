// Stockage des traces de veille juridique dans la Realtime Database.
//
// Remplace github-storage.js, qui écrivait dans un fichier du repo via l'API
// GitHub. Ce schéma exigeait un token d'écriture dans le frontend — impossible
// à garder secret sur un site statique public, où il était donc lisible par
// tout le monde. La configuration Firebase, elle, est publique par conception :
// la protection vient des règles (voir database.rules.json).
//
// Bénéfices au passage : synchronisation temps réel entre PLS et l'outil de
// veille (plus besoin de naviguer pour rafraîchir), et plus de fichier à
// committer à chaque traitement d'article.
//
// ⚠️ Ce registre est une preuve Qualiopi (indicateur 7, veille réglementaire).
// Les écritures sont réservées aux administrateurs racine côté serveur.

import { ref, get, set, onValue, update } from 'firebase/database'
import { baseDeDonnees, authPrete } from './firebase-auth.js'

const CHEMIN = 'veille/traitements'

// Champs acceptés par les règles. Tout autre champ fait rejeter l'écriture
// ($autre: false), donc on filtre avant d'envoyer.
const CHAMPS = [
  'articleId', 'articleTitre', 'articleSource', 'articleThematique',
  'articleDate', 'decision', 'commentaire', 'destinataires', 'urlArticle',
  'traitePar', 'traiteAt',
  // Demande de Sarah (2026-10-05) : le registre doit servir de preuve pour les
  // indicateurs Qualiopi 23 (veille légale), 24 (métiers) et 25 (pédagogie).
  // 'impact' porte l'action menée sur l'organisme, c'est ce que l'auditeur attend.
  'indicateur', 'impact',
  // Horodatage de la préparation du mail de diffusion (2026-10-07). « Préparé »
  // et non « envoyé » : l'outil ouvre le client de messagerie, il ne constate pas
  // le clic sur Envoyer.
  'mailPrepareLe',
]

// Répare les accents abîmés par des encodages UTF-8 successifs.
//
// Une version antérieure de la synchro encodait en base64 sans passer par
// TextEncoder : chaque sauvegarde réabîmait les données déjà abîmées, d'où des
// chaînes du type « France CompÃÂÃÂ©tences ». Les données historiques ont été
// réparées lors de la migration ; on applique aussi la réparation à la lecture
// pour que rien de corrompu ne puisse réapparaître à l'écran.
export function reparerAccents(valeur) {
  if (typeof valeur !== 'string') return valeur
  let s = valeur
  for (let i = 0; i < 8; i++) {
    if (!s.includes('Ã') && !s.includes('Â')) break
    let candidat
    try {
      candidat = decodeURIComponent(escape(s))
    } catch {
      break
    }
    if (candidat === s) break
    s = candidat
  }
  return s
}

function reparerProfond(v) {
  if (typeof v === 'string') return reparerAccents(v)
  if (Array.isArray(v)) return v.map(reparerProfond)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) o[k] = reparerProfond(x)
    return o
  }
  return v
}

function listeDepuisSnapshot(valeur) {
  if (!valeur) return []
  return Object.entries(valeur).map(([id, t]) => ({
    id,
    ...reparerProfond(t),
    destinataires: Array.isArray(t?.destinataires) ? t.destinataires : [],
  }))
}

function chargeUtile(trace) {
  const sortie = {}
  for (const champ of CHAMPS) {
    const v = trace[champ]
    if (v === undefined || v === null) continue
    if (champ === 'destinataires') {
      const liste = (Array.isArray(v) ? v : []).filter(e => typeof e === 'string' && e)
      if (liste.length) sortie[champ] = liste
      continue
    }
    sortie[champ] = typeof v === 'string' ? v : String(v)
  }
  // Les règles exigent ces trois champs.
  if (!sortie.articleId || !sortie.decision || !sortie.traiteAt) {
    throw new Error('Trace incomplète : articleId, decision et traiteAt sont requis.')
  }
  return sortie
}

export async function chargerTraces() {
  await authPrete()
  const snap = await get(ref(baseDeDonnees(), CHEMIN))
  return listeDepuisSnapshot(snap.val())
}

// Écoute temps réel : un traitement fait par Sarah apparaît immédiatement
// dans PLS, et inversement.
export function ecouterTraces(callback, onErreur) {
  let stop = null
  let annule = false
  authPrete().then(() => {
    if (annule) return
    stop = onValue(
      ref(baseDeDonnees(), CHEMIN),
      snap => callback(listeDepuisSnapshot(snap.val())),
      err => { if (onErreur) onErreur(err) },
    )
  })
  return () => { annule = true; if (stop) stop() }
}

// Remplace l'ensemble du registre. Conserve la sémantique de l'ancienne
// synchro (le composant envoie la liste complète), ce qui évite de réécrire
// la logique d'état des deux tableaux de bord.
// ── Archives ─────────────────────────────────────────────────────────────────
//
// Articles écartés sans traitement, au-delà d'un seuil d'ancienneté. Archiver
// est une DÉCISION tracée (qui, quand, avec quel seuil), à la différence d'un
// simple masquage d'affichage qui ne laisse rien derrière lui.
//
// Rangées à part du registre : celui-ci ne doit contenir que des décisions
// documentées avec leur impact. Un archivage de masse y diluerait la preuve.

const CHEMIN_ARCHIVES = 'veille/archives'

export async function lireArchives() {
  await authPrete()
  const snap = await get(ref(baseDeDonnees(), CHEMIN_ARCHIVES))
  const v = snap.val()
  if (!v) return []
  return Object.entries(v).map(([id, a]) => ({ id, ...reparerProfond(a) }))
}

export function ecouterArchives(callback, onErreur) {
  let stop = null
  let annule = false
  authPrete().then(() => {
    if (annule) return
    stop = onValue(
      ref(baseDeDonnees(), CHEMIN_ARCHIVES),
      snap => {
        const v = snap.val()
        callback(v ? Object.entries(v).map(([id, a]) => ({ id, ...reparerProfond(a) })) : [])
      },
      err => { if (onErreur) onErreur(err) },
    )
  })
  return () => { annule = true; if (stop) stop() }
}

// Archive un lot d'articles. Rend le nombre réellement archivé.
export async function archiverArticles(articles, { seuilJours, emailAuteur }) {
  await authPrete()
  const maj = {}
  const horodatage = new Date().toISOString()
  for (const a of articles || []) {
    if (!a?.id) continue
    maj[a.id] = {
      titre: String(a.titre || '').slice(0, 500),
      source: String(a.source_nom || a.source_id || '').slice(0, 200),
      date: String(a.date || ''),
      archiveLe: horodatage,
      archivePar: String(emailAuteur || '').toLowerCase(),
      seuilJours: Number(seuilJours) || 0,
    }
  }
  const n = Object.keys(maj).length
  if (n === 0) return 0
  await update(ref(baseDeDonnees(), CHEMIN_ARCHIVES), maj)
  return n
}

// Remet un article dans la liste à traiter.
export async function desarchiverArticle(articleId) {
  await authPrete()
  await set(ref(baseDeDonnees(), `${CHEMIN_ARCHIVES}/${articleId}`), null)
}

// ── Articles ajoutés à la main ───────────────────────────────────────────────
//
// Ils vivaient dans le seul localStorage du navigateur : un article saisi par
// Sarah n'existait que sur son poste, PLS ne le voyait pas, et un nettoyage de
// navigateur l'effaçait. Or c'est par là que passent les sources sans flux RSS —
// Légifrance, la Caisse des Dépôts, le Padlet OPCO — donc les pièces les plus
// susceptibles de compter en audit.
//
// Depuis le 2026-10-06 ils vivent ici, le localStorage ne servant plus que de
// cache d'affichage.

const CHEMIN_MANUELS = 'veille/articles-manuels'

// Mêmes précautions que pour les traces : les règles refusent tout champ
// inconnu, on filtre donc avant d'envoyer. `id` n'en fait pas partie, c'est la
// clé du nœud.
const CHAMPS_MANUEL = [
  'titre', 'resume', 'source_nom', 'url', 'date', 'thematique', 'niveau',
  'ajoutePar', 'ajouteAt',
]

function chargeManuel(article) {
  const sortie = {}
  for (const champ of CHAMPS_MANUEL) {
    const v = article[champ]
    if (v === undefined || v === null || v === '') continue
    sortie[champ] = String(v)
  }
  if (!sortie.titre || !sortie.url || !sortie.date) {
    throw new Error('Article incomplet : titre, URL et date sont requis.')
  }
  return sortie
}

function manuelDepuisSnapshot(valeur) {
  if (!valeur) return []
  return Object.entries(valeur).map(([id, a]) => ({
    id,
    ...reparerProfond(a),
    // Reposés à la lecture plutôt que stockés : ce sont des constantes, les
    // écrire dans la base ne ferait que des champs à valider pour rien.
    source_id: 'manuel',
    manuel: true,
  }))
}

export async function lireArticlesManuels() {
  await authPrete()
  const snap = await get(ref(baseDeDonnees(), CHEMIN_MANUELS))
  return manuelDepuisSnapshot(snap.val())
}

export function ecouterArticlesManuels(callback, onErreur) {
  let stop = null
  let annule = false
  authPrete().then(() => {
    if (annule) return
    stop = onValue(
      ref(baseDeDonnees(), CHEMIN_MANUELS),
      snap => callback(manuelDepuisSnapshot(snap.val())),
      err => { if (onErreur) onErreur(err) },
    )
  })
  return () => { annule = true; if (stop) stop() }
}

// Écrit un article à sa clé, sans toucher aux autres : deux personnes peuvent
// en ajouter en même temps sans s'écraser.
export async function enregistrerArticleManuel(id, article) {
  await authPrete()
  await set(ref(baseDeDonnees(), `${CHEMIN_MANUELS}/${id}`), chargeManuel(article))
  return true
}

export async function supprimerArticleManuel(id) {
  await authPrete()
  await set(ref(baseDeDonnees(), `${CHEMIN_MANUELS}/${id}`), null)
}

// ── Liste de diffusion ───────────────────────────────────────────────────────
//
// Les formateurs destinataires vivaient dans le localStorage : chaque poste avait
// sa liste, donc Sarah pouvait diffuser à quatre personnes et PLS en afficher
// cinq. Une liste de diffusion qui diffère selon le navigateur n'est pas une
// liste de diffusion.

const CHEMIN_FORMATEURS = 'veille/formateurs'

const CHAMPS_FORMATEUR = ['prenom', 'nom', 'email', 'actif']

function chargeFormateur(f) {
  const sortie = {
    prenom: String(f.prenom || '').trim(),
    nom: String(f.nom || '').trim(),
    email: String(f.email || '').trim().toLowerCase(),
    actif: f.actif !== false,
  }
  if (!sortie.prenom || !sortie.nom || !sortie.email) {
    throw new Error('Formateur incomplet : prénom, nom et adresse sont requis.')
  }
  return sortie
}

function formateursDepuisSnapshot(valeur) {
  if (!valeur) return []
  return Object.entries(valeur)
    .map(([id, f]) => ({ id, ...reparerProfond(f), actif: f?.actif !== false }))
    .sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`, 'fr'))
}

export function ecouterFormateurs(callback, onErreur) {
  let stop = null
  let annule = false
  authPrete().then(() => {
    if (annule) return
    stop = onValue(
      ref(baseDeDonnees(), CHEMIN_FORMATEURS),
      snap => callback(formateursDepuisSnapshot(snap.val())),
      err => { if (onErreur) onErreur(err) },
    )
  })
  return () => { annule = true; if (stop) stop() }
}

// Écriture par clé, comme pour les articles manuels : deux personnes peuvent
// modifier la liste en même temps sans s'écraser.
export async function enregistrerFormateur(id, formateur) {
  await authPrete()
  await set(ref(baseDeDonnees(), `${CHEMIN_FORMATEURS}/${id}`), chargeFormateur(formateur))
  return true
}

export async function supprimerFormateur(id) {
  await authPrete()
  await set(ref(baseDeDonnees(), `${CHEMIN_FORMATEURS}/${id}`), null)
}

export async function publierFormateurs(liste) {
  await authPrete()
  const maj = {}
  for (const f of liste || []) {
    if (!f?.id) continue
    maj[f.id] = chargeFormateur(f)
  }
  if (Object.keys(maj).length === 0) return 0
  await update(ref(baseDeDonnees(), CHEMIN_FORMATEURS), maj)
  return Object.keys(maj).length
}

export { CHAMPS_FORMATEUR }

export async function sauvegarderTraces(traces) {
  await authPrete()
  const map = {}
  for (const t of traces || []) {
    if (!t?.id) continue
    map[t.id] = chargeUtile(t)
  }
  await set(ref(baseDeDonnees(), CHEMIN), map)
  return true
}

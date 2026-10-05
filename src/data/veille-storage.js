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

import { ref, get, set, onValue } from 'firebase/database'
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

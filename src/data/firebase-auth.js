// Authentification et gestion des accès via Firebase.
//
// Deux responsabilités distinctes, à ne pas confondre :
//   - Firebase Auth répond à « qui es-tu ? » et fournit une preuve vérifiable
//     (jeton signé par Google, validé par les serveurs Google).
//   - Les règles de la base (database.rules.json) répondent à « qu'as-tu le
//     droit de faire ? ». C'est la paire qui sécurise, jamais l'une sans l'autre.
//
// Contrairement au dispositif précédent, la vérification du jeton ne se fait
// plus dans le navigateur : la lecture et l'écriture de /acces sont arbitrées
// côté serveur. Un utilisateur ne peut donc plus s'attribuer de droits en
// manipulant son navigateur.

import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { getDatabase, ref, get, set, push, remove, onValue } from 'firebase/database'
import { FIREBASE_CONFIG, ADMINS_RACINE, DOMAINES_AUTORISES, PROFILS } from './firebase-config.js'

export { PROFILS, ADMINS_RACINE }

const CHEMIN_ACCES = 'acces'

function app() {
  return getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
}
function auth() { return getAuth(app()) }
function db() { return getDatabase(app()) }

function normaliser(email) {
  return String(email || '').trim().toLowerCase()
}

export function estAdminRacine(email) {
  return ADMINS_RACINE.includes(normaliser(email))
}

export function domaineAutorise(email) {
  const e = normaliser(email)
  return DOMAINES_AUTORISES.some(d => e.endsWith(d))
}

// ── Connexion ────────────────────────────────────────────────────────────────

export async function connexionGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const res = await signInWithPopup(auth(), provider)
  return res.user
}

export function deconnexionGoogle() {
  return fbSignOut(auth())
}

export function surChangementAuth(callback) {
  return onAuthStateChanged(auth(), callback)
}

export function utilisateurCourant() {
  return auth().currentUser
}

// ── Liste des accès ──────────────────────────────────────────────────────────

function normaliserListe(valeur) {
  if (!valeur) return []
  return Object.entries(valeur).map(([id, v]) => ({ id, ...v }))
}

export async function lireAcces() {
  const snap = await get(ref(db(), CHEMIN_ACCES))
  return normaliserListe(snap.val())
}

// Écoute temps réel : les deux outils voient les mêmes accès instantanément.
export function ecouterAcces(callback, onErreur) {
  return onValue(
    ref(db(), CHEMIN_ACCES),
    snap => callback(normaliserListe(snap.val())),
    err => { if (onErreur) onErreur(err) },
  )
}

export async function enregistrerAcces(entree, emailAuteur) {
  const charge = {
    email: normaliser(entree.email),
    profil: entree.profil,
    nom: entree.nom || '',
    prenom: entree.prenom || '',
    actif: entree.actif !== false,
    creeLe: entree.creeLe || new Date().toISOString(),
    creePar: entree.creePar || normaliser(emailAuteur) || '',
  }
  if (!PROFILS[charge.profil]) throw new Error(`Profil inconnu : ${charge.profil}`)
  if (!charge.email.includes('@')) throw new Error('Adresse email invalide.')

  if (entree.id) {
    await set(ref(db(), `${CHEMIN_ACCES}/${entree.id}`), charge)
    return entree.id
  }
  const nouvelle = push(ref(db(), CHEMIN_ACCES))
  await set(nouvelle, charge)
  return nouvelle.key
}

export async function supprimerAcces(id) {
  await remove(ref(db(), `${CHEMIN_ACCES}/${id}`))
}

// ── Résolution du profil ─────────────────────────────────────────────────────
// Rend { profil, role, source } ou null si l'accès doit être refusé.
export function resoudreProfil(email, liste) {
  const e = normaliser(email)
  const entree = (liste || []).find(x => normaliser(x.email) === e && x.actif !== false)
  if (entree) {
    const profil = PROFILS[entree.profil] ? entree.profil : 'consultatif'
    return { profil, role: PROFILS[profil].role, source: 'liste', entree }
  }
  // Amorçage : les administrateurs racine entrent même si la liste est vide.
  if (estAdminRacine(e)) {
    return { profil: 'administrateur', role: 'admin', source: 'racine' }
  }
  return null
}

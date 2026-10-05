// Authentification et gestion des accès via Firebase.
//
// Deux responsabilités distinctes, à ne pas confondre :
//   - Firebase Auth répond à « qui es-tu ? » et fournit une preuve vérifiable
//     (jeton signé par Google, validé par les serveurs Google).
//   - Les règles de la base (database.rules.json) répondent à « qu'as-tu le
//     droit de faire ? ». C'est la paire qui sécurise, jamais l'une sans l'autre.
//
// ⚠️ Portée des permissions par module : elles pilotent l'INTERFACE (ce qui est
// affiché, ce qui est modifiable à l'écran). Elles ne sont pas une frontière de
// sécurité, car les données PLS vivent en localStorage sur chaque poste. Ce qui
// est réellement appliqué côté serveur, c'est qui peut se connecter et qui peut
// modifier les accès et les profils. La vraie application viendra avec le backend.

import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { getDatabase, ref, get, set, push, remove, onValue, update } from 'firebase/database'
import {
  FIREBASE_CONFIG, ADMINS_RACINE, DOMAINES_AUTORISES,
  PROFILS_DEFAUT, PROFILS_IDS, MODULES_ACCES, TOUS_MODULES,
  permVide, permsVides, labelModule,
} from './firebase-config.js'

export {
  ADMINS_RACINE, PROFILS_DEFAUT, PROFILS_IDS, MODULES_ACCES, TOUS_MODULES,
  permVide, permsVides, labelModule,
}
// Alias conservé : plusieurs écrans importent PROFILS pour le libellé/rôle.
export const PROFILS = PROFILS_DEFAUT

const CHEMIN_ACCES = 'acces'
const CHEMIN_PROFILS = 'profils'

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

// Firebase restaure la session depuis IndexedDB de façon ASYNCHRONE : juste
// après un rechargement de page, currentUser vaut encore null. Toute lecture
// lancée à cet instant part non authentifiée et se fait refuser par les règles.
// On attend donc que l'état soit connu (utilisateur ou null) avant d'interroger
// la base. Résolu une seule fois, puis mémorisé.
let promesseAuthPrete = null
export function authPrete() {
  if (promesseAuthPrete) return promesseAuthPrete
  promesseAuthPrete = new Promise(resolve => {
    const stop = onAuthStateChanged(auth(), utilisateur => {
      stop()
      resolve(utilisateur)
    })
  })
  return promesseAuthPrete
}

// ── Liste des accès ──────────────────────────────────────────────────────────

function listeDepuisSnapshot(valeur) {
  if (!valeur) return []
  return Object.entries(valeur).map(([id, v]) => ({ id, ...v }))
}

export async function lireAcces() {
  await authPrete()
  const snap = await get(ref(db(), CHEMIN_ACCES))
  return listeDepuisSnapshot(snap.val())
}

// Branche un écouteur temps réel une fois l'authentification restaurée.
// Rend une fonction d'arrêt utilisable immédiatement, même si l'abonnement
// réel n'est pas encore en place.
function ecouterApresAuth(chemin, transformer, callback, onErreur) {
  let stop = null
  let annule = false
  authPrete().then(() => {
    if (annule) return
    stop = onValue(
      ref(db(), chemin),
      snap => callback(transformer(snap.val())),
      err => { if (onErreur) onErreur(err) },
    )
  })
  return () => { annule = true; if (stop) stop() }
}

// Écoute temps réel : les deux outils voient les mêmes accès instantanément.
export function ecouterAcces(callback, onErreur) {
  return ecouterApresAuth(CHEMIN_ACCES, listeDepuisSnapshot, callback, onErreur)
}

// Nettoie une table de permissions : uniquement les modules connus, booléens
// stricts, et cohérence écriture → lecture → accès. Les règles refusent tout
// champ inattendu, donc ce filtrage évite des écritures rejetées.
export function normaliserPerms(perms) {
  const sortie = {}
  TOUS_MODULES.forEach(id => {
    const p = (perms && perms[id]) || {}
    const ecriture = !!p.ecriture
    const lecture = !!p.lecture || ecriture
    const acces = !!p.acces || lecture
    sortie[id] = { acces, lecture, ecriture }
  })
  return sortie
}

export async function enregistrerAcces(entree, emailAuteur) {
  await authPrete()
  if (!PROFILS_IDS.includes(entree.profil)) throw new Error(`Profil inconnu : ${entree.profil}`)
  const email = normaliser(entree.email)
  if (!email.includes('@')) throw new Error('Adresse email invalide.')

  const charge = {
    email,
    profil: entree.profil,
    nom: entree.nom || '',
    prenom: entree.prenom || '',
    actif: entree.actif !== false,
    creeLe: entree.creeLe || new Date().toISOString(),
    creePar: entree.creePar || normaliser(emailAuteur) || '',
    permsPersonnalisees: !!entree.permsPersonnalisees,
  }
  if (charge.permsPersonnalisees) charge.perms = normaliserPerms(entree.perms)

  if (entree.id) {
    await set(ref(db(), `${CHEMIN_ACCES}/${entree.id}`), charge)
    return entree.id
  }
  const nouvelle = push(ref(db(), CHEMIN_ACCES))
  await set(nouvelle, charge)
  return nouvelle.key
}

export async function supprimerAcces(id) {
  await authPrete()
  await remove(ref(db(), `${CHEMIN_ACCES}/${id}`))
}

// ── Profils ──────────────────────────────────────────────────────────────────

function profilsDepuisSnapshot(valeur) {
  if (!valeur) return null
  const sortie = {}
  Object.entries(valeur).forEach(([id, v]) => { sortie[id] = v })
  return Object.keys(sortie).length ? sortie : null
}

export async function lireProfils() {
  await authPrete()
  const snap = await get(ref(db(), CHEMIN_PROFILS))
  return profilsDepuisSnapshot(snap.val()) || PROFILS_DEFAUT
}

export function ecouterProfils(callback, onErreur) {
  return ecouterApresAuth(
    CHEMIN_PROFILS,
    v => profilsDepuisSnapshot(v) || PROFILS_DEFAUT,
    callback,
    onErreur,
  )
}

// Vrai si la base ne contient encore aucun profil (il faut alors l'initialiser).
export async function profilsInitialises() {
  await authPrete()
  const snap = await get(ref(db(), CHEMIN_PROFILS))
  return !!profilsDepuisSnapshot(snap.val())
}

export async function initialiserProfils(emailAuteur) {
  await authPrete()
  const maj = {}
  for (const id of PROFILS_IDS) {
    const d = PROFILS_DEFAUT[id]
    maj[id] = {
      label: d.label,
      description: d.description,
      role: d.role,
      ordre: d.ordre,
      perms: normaliserPerms(d.perms),
      majLe: new Date().toISOString(),
      majPar: normaliser(emailAuteur) || '',
    }
  }
  await update(ref(db(), CHEMIN_PROFILS), maj)
}

export async function enregistrerProfil(id, profil, emailAuteur) {
  await authPrete()
  if (!PROFILS_IDS.includes(id)) throw new Error(`Profil inconnu : ${id}`)
  await set(ref(db(), `${CHEMIN_PROFILS}/${id}`), {
    label: profil.label || PROFILS_DEFAUT[id].label,
    description: profil.description || '',
    role: profil.role === 'admin' ? 'admin' : 'formateur',
    ordre: typeof profil.ordre === 'number' ? profil.ordre : PROFILS_DEFAUT[id].ordre,
    perms: normaliserPerms(profil.perms),
    majLe: new Date().toISOString(),
    majPar: normaliser(emailAuteur) || '',
  })
}

// ── Résolution du profil et des droits ───────────────────────────────────────

// Droits effectifs : les permissions personnalisées de la personne si elles
// existent, sinon celles de son profil type.
export function permsEffectives(entree, profils) {
  const table = profils || PROFILS_DEFAUT
  if (entree?.permsPersonnalisees && entree.perms) return normaliserPerms(entree.perms)
  const profil = table[entree?.profil] || PROFILS_DEFAUT[entree?.profil]
  return normaliserPerms(profil?.perms)
}

// Rend { profil, role, perms, source, entree } ou null si l'accès est refusé.
export function resoudreProfil(email, liste, profils) {
  const e = normaliser(email)
  const table = profils || PROFILS_DEFAUT
  const entree = (liste || []).find(x => normaliser(x.email) === e && x.actif !== false)

  if (entree) {
    const profilId = PROFILS_IDS.includes(entree.profil) ? entree.profil : 'consultatif'
    const def = table[profilId] || PROFILS_DEFAUT[profilId]
    return {
      profil: profilId,
      role: def?.role === 'admin' ? 'admin' : 'formateur',
      perms: permsEffectives({ ...entree, profil: profilId }, table),
      source: 'liste',
      entree,
    }
  }

  // Amorçage : les administrateurs racine entrent même si la liste est vide.
  if (estAdminRacine(e)) {
    return {
      profil: 'administrateur',
      role: 'admin',
      perms: normaliserPerms((table.administrateur || PROFILS_DEFAUT.administrateur).perms),
      source: 'racine',
    }
  }
  return null
}

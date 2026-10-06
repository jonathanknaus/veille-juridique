// ============================================================
//  CONFIGURATION FIREBASE — accès et profils (PLS + Veille juridique)
//  Projet : afs-pls-auth-42a28 (Realtime Database, europe-west1)
//  Organisation Google Cloud : pennylane.tech
//
//  Cette configuration n'est PAS un secret : elle est conçue pour vivre
//  dans du code public. La protection vient des règles de la base
//  (voir REGLES-FIREBASE.md : elles vivent dans le dépôt PLS), pas de cette clé.
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDHcfMz27Zotq0fkMmTNkkbb3TVoPI6Dk0',
  authDomain: 'afs-pls-auth-42a28.firebaseapp.com',
  databaseURL: 'https://afs-pls-auth-42a28-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'afs-pls-auth-42a28',
  storageBucket: 'afs-pls-auth-42a28.firebasestorage.app',
  messagingSenderId: '277368958085',
  appId: '1:277368958085:web:94740cacb78e6a3f238dec',
}

// Administrateurs racine — doit rester identique au bloc ".write" de
// les règles de la base (voir REGLES-FIREBASE.md). Deux rôles : amorçage quand la liste est vide, et
// garde-fou (ces comptes ne peuvent pas être privés d'accès depuis l'interface).
export const ADMINS_RACINE = [
  'jonathan.knaus@pennylane.com',
  'sarah.briden@pennylane-partners.com',
]

export const DOMAINES_AUTORISES = ['@pennylane.com', '@pennylane-partners.com']

// ── Modules de l'application ─────────────────────────────────────────────────
// Doit rester en phase avec NAV_ADMIN dans App.jsx.
export const MODULES_ACCES = [
  { group: 'Formation', items: [
    { id: 'accueil', label: 'Accueil' },
    { id: 'catalogue', label: 'Catalogue AFS' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'calendrier', label: 'Calendrier' },
  ] },
  { group: 'Participants', items: [
    { id: 'stagiaires', label: 'Apprenants' },
    { id: 'entreprises', label: 'Cabinets' },
  ] },
  { group: 'Équipe', items: [
    { id: 'formateurs', label: 'Formateurs' },
    { id: 'gestionnaires', label: 'Resp. admin. & réglementaire' },
    { id: 'financeurs', label: 'Financeurs' },
  ] },
  { group: 'Gestion', items: [
    { id: 'pipeline', label: 'Indicateurs' },
    { id: 'devis', label: 'Devis' },
    { id: 'facturation', label: 'Facturation' },
    { id: 'bilan', label: 'Bilan annuel' },
    { id: 'reclamations', label: 'Réclamations' },
    { id: 'documents', label: 'Documents Qualiopi' },
    { id: 'presentation', label: 'Présentation dossier' },
  ] },
  { group: 'Ressources', items: [
    { id: 'veille', label: 'Veille juridique' },
    { id: 'webinaires', label: 'Webinaires' },
    { id: 'product-update', label: 'Product Update' },
  ] },
  { group: 'Configuration', items: [
    { id: 'parametres', label: 'Paramètres' },
  ] },
]

export const TOUS_MODULES = MODULES_ACCES.flatMap(g => g.items.map(i => i.id))

export function labelModule(id) {
  for (const g of MODULES_ACCES) {
    const item = g.items.find(i => i.id === id)
    if (item) return item.label
  }
  return id
}

// ── Droits standards par profil ──────────────────────────────────────────────
// Notation : 'rw' écriture · 'r' lecture · '-' aucun accès
//
// Ces valeurs ne servent qu'à INITIALISER la base. Une fois /profils créé,
// c'est Firebase qui fait foi et les droits se modifient depuis l'interface,
// sans déploiement.
//
// Partis pris à connaître :
//  - Le formateur externe (freelance) n'a pas accès aux Cabinets : il lui faut
//    les apprenants de ses sessions, pas le portefeuille clients. C'est le
//    garde-fou le plus net faute de granularité « ses sessions seulement ».
//  - Il garde en revanche Documents Qualiopi et Veille juridique en lecture :
//    informer ses sous-traitants des exigences qualité et des évolutions
//    réglementaires est une obligation Qualiopi, pas une largesse.
//  - La Consultation ne voit aucune donnée personnelle (ni apprenants, ni cabinets).
const MATRICE = {
  //                 admin  interne  externe  consultatif
  accueil:          ['rw',  'rw',    'r',     'r'],
  catalogue:        ['rw',  'r',     'r',     'r'],
  sessions:         ['rw',  'rw',    'rw',    'r'],
  calendrier:       ['rw',  'rw',    'rw',    'r'],
  stagiaires:       ['rw',  'rw',    'rw',    '-'],
  entreprises:      ['rw',  'r',     '-',     '-'],
  formateurs:       ['rw',  'r',     '-',     '-'],
  gestionnaires:    ['rw',  '-',     '-',     '-'],
  financeurs:       ['rw',  '-',     '-',     '-'],
  pipeline:         ['rw',  '-',     '-',     '-'],
  devis:            ['rw',  '-',     '-',     '-'],
  facturation:      ['rw',  '-',     '-',     '-'],
  bilan:            ['rw',  'r',     '-',     'r'],
  reclamations:     ['rw',  'r',     '-',     '-'],
  documents:        ['rw',  'r',     'r',     'r'],
  presentation:     ['rw',  '-',     '-',     '-'],
  veille:           ['rw',  'r',     'r',     'r'],
  webinaires:       ['rw',  'r',     'r',     'r'],
  'product-update': ['rw',  'r',     'r',     '-'],
  parametres:       ['rw',  '-',     '-',     '-'],
}

const ORDRE_PROFILS = ['administrateur', 'formateur_interne', 'formateur_externe', 'consultatif']

function permDepuisCode(code) {
  if (code === 'rw') return { acces: true, lecture: true, ecriture: true }
  if (code === 'r') return { acces: true, lecture: true, ecriture: false }
  return { acces: false, lecture: false, ecriture: false }
}

function permsPourProfil(index) {
  const perms = {}
  for (const [moduleId, codes] of Object.entries(MATRICE)) {
    perms[moduleId] = permDepuisCode(codes[index])
  }
  return perms
}

export const PROFILS_DEFAUT = {
  administrateur: {
    label: 'Administrateur',
    description: 'Accès complet à tous les modules',
    role: 'admin',
    ordre: 0,
    perms: permsPourProfil(0),
  },
  formateur_interne: {
    label: 'Formateur interne',
    description: 'Salarié Pennylane : anime ses sessions, consulte le reste',
    role: 'formateur',
    ordre: 1,
    perms: permsPourProfil(1),
  },
  formateur_externe: {
    label: 'Formateur externe (freelance)',
    description: 'Prestataire : ses sessions et ses apprenants, sans accès aux cabinets',
    role: 'formateur',
    ordre: 2,
    perms: permsPourProfil(2),
  },
  consultatif: {
    label: 'Consultation',
    description: 'Lecture seule, hors données personnelles',
    role: 'formateur',
    ordre: 3,
    perms: permsPourProfil(3),
  },
}

// Identifiants de profil acceptés par les règles côté serveur.
export const PROFILS_IDS = ORDRE_PROFILS

// Compatibilité : certains écrans lisent PROFILS pour le libellé et le rôle.
export const PROFILS = PROFILS_DEFAUT

export function permVide() {
  return { acces: false, lecture: false, ecriture: false }
}

export function permsVides() {
  const p = {}
  TOUS_MODULES.forEach(id => { p[id] = permVide() })
  return p
}

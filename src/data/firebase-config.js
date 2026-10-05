// ============================================================
//  CONFIGURATION FIREBASE — gestion des accès (PLS + Veille juridique)
//  Projet : afs-pls-auth-42a28 (Realtime Database, europe-west1)
//  Organisation Google Cloud : pennylane.tech
//
//  Cette configuration n'est PAS un secret : elle est conçue pour vivre
//  dans du code public. La protection vient des règles de la base
//  (voir database.rules.json), pas de cette clé.
//
//  C'est précisément ce qui la distingue de l'ancien token GitHub, qui
//  devait rester caché et ne pouvait pas l'être dans un site statique.
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
// database.rules.json. Deux rôles :
//   1. Amorçage : permet de se connecter quand la liste /acces est vide,
//      sinon personne ne pourrait jamais créer la première entrée.
//   2. Garde-fou : ces comptes ne peuvent pas être privés d'accès depuis
//      l'interface, seulement en modifiant les règles côté serveur.
export const ADMINS_RACINE = [
  'jonathan.knaus@pennylane.com',
  'sarah.briden@pennylane-partners.com',
]

// Domaines autorisés à lire la liste (miroir du bloc ".read" des règles).
export const DOMAINES_AUTORISES = ['@pennylane.com', '@pennylane-partners.com']

export const PROFILS = {
  administrateur: { label: 'Administrateur', role: 'admin', description: 'Accès complet à tous les modules' },
  formateur_interne: { label: 'Formateur interne', role: 'formateur', description: 'Lecture/écriture sur ses sessions' },
  consultatif: { label: 'Consultatif', role: 'formateur', description: 'Lecture seule' },
}

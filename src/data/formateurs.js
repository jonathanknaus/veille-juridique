export const RESPONSABLE = {
  prenom: 'Sarah',
  nom: 'BRIDEN',
  email: 'sarah.briden@pennylane-partners.com',
  role: 'Responsable du traitement',
}

const STORAGE_KEY = 'pls_formateurs'

const DEFAUT = [
  { id: 'f1', prenom: 'Timothy',  nom: 'RATSIMA',     email: 'timothy.ratsima@pennylane.com',   actif: true },
  { id: 'f2', prenom: 'Thomas',   nom: 'NOUET',        email: 'thomas.nouet@pennylane.com',       actif: true },
  { id: 'f3', prenom: 'Laure',    nom: 'CASAGRAN',     email: 'laure.casagran@pennylane.com',     actif: true },
  { id: 'f4', prenom: 'Etienne',  nom: 'BARTHELEMY',   email: 'etienne.barthelemy@pennylane.com', actif: true },
  { id: 'f5', prenom: 'Jonathan', nom: 'KNAUS',        email: 'jonathan.knaus@pennylane.com',     actif: true },
]

export function getFormateurs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : DEFAUT
  } catch {
    return DEFAUT
  }
}

export function saveFormateurs(liste) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(liste))
}

export function addFormateur(prenom, nom, email) {
  const liste = getFormateurs()
  const nouveau = { id: `f_${Date.now()}`, prenom, nom, email, actif: true }
  const updated = [...liste, nouveau]
  saveFormateurs(updated)
  return updated
}

export function updateFormateur(id, changes) {
  const updated = getFormateurs().map(f => f.id === id ? { ...f, ...changes } : f)
  saveFormateurs(updated)
  return updated
}

export function removeFormateur(id) {
  const updated = getFormateurs().filter(f => f.id !== id)
  saveFormateurs(updated)
  return updated
}

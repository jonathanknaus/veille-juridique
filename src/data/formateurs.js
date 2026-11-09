// Liste de diffusion de la veille : les formateurs qui reçoivent les articles.
//
// Serveur d'abord, cache ensuite — même schéma que les articles manuels. Elle
// vivait dans le seul localStorage : chaque poste avait sa liste, donc Sarah
// pouvait diffuser à quatre personnes et PLS en afficher cinq. Une liste de
// diffusion qui diffère selon le navigateur n'est pas une liste de diffusion.
//
// Le localStorage reste le cache d'affichage : la liste s'affiche sans attendre
// le réseau, et l'outil reste utilisable si la base est injoignable.
import {
  ecouterFormateurs as ecouterServeur,
  enregistrerFormateur,
  supprimerFormateur,
  publierFormateurs,
} from './veille-storage.js'

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
  // La responsable est destinataire comme les autres, bien que ce soit elle qui
  // prépare les mails : elle garde ainsi une copie de ce qui est diffusé, et son
  // absence serait une faille le jour où quelqu'un d'autre diffuse.
  { id: 'f6', prenom: RESPONSABLE.prenom, nom: RESPONSABLE.nom, email: RESPONSABLE.email, actif: true },
]

// Ajout rattrapé une seule fois pour les listes déjà enregistrées.
//
// DEFAUT ne sert que si le cache est vide : sans ce rattrapage, ajouter la
// responsable au code n'aurait rien changé sur un poste qui a déjà sa liste. Un
// marqueur évite de la faire réapparaître si elle est retirée ensuite — le bouton
// de suppression doit rester vrai.
const CLE_AJOUT_RESPONSABLE = 'pls_formateurs_responsable_ajoute'

function ecrireCache(liste) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(liste))
  return liste
}

function rattraperResponsable(liste) {
  if (localStorage.getItem(CLE_AJOUT_RESPONSABLE)) return liste
  localStorage.setItem(CLE_AJOUT_RESPONSABLE, new Date().toISOString())
  const cible = RESPONSABLE.email.toLowerCase()
  if (liste.some(f => String(f.email || '').toLowerCase() === cible)) return liste
  return ecrireCache([
    ...liste,
    { id: `f_${Date.now()}`, prenom: RESPONSABLE.prenom, nom: RESPONSABLE.nom, email: RESPONSABLE.email, actif: true },
  ])
}

export function getFormateurs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAUT
    const liste = JSON.parse(stored)
    return Array.isArray(liste) ? rattraperResponsable(liste) : DEFAUT
  } catch {
    return DEFAUT
  }
}

// La liste du serveur fait foi dès qu'elle existe. Tant qu'elle est vide, le
// cache local tient : c'est ce qui permet de voir la liste avant publication, et
// d'éviter qu'un premier instantané vide n'efface tout.
// Le second argument dit si la liste existe en base. Tant qu'elle n'y est pas,
// l'écran propose de la publier plutôt que de le faire dans le dos de la personne.
export function ecouterFormateursVeille(callback, onErreur) {
  return ecouterServeur(
    duServeur => callback(
      duServeur.length ? ecrireCache(duServeur) : getFormateurs(),
      { publiee: duServeur.length > 0 },
    ),
    onErreur,
  )
}

export async function publierFormateursVeille() {
  return publierFormateurs(getFormateurs())
}

export async function addFormateur(prenom, nom, email) {
  const nouveau = { id: `f_${Date.now()}`, prenom, nom, email, actif: true }
  ecrireCache([...getFormateurs(), nouveau])
  await enregistrerFormateur(nouveau.id, nouveau)
  return getFormateurs()
}

// Ajout en lot depuis une liste d'adresses collée.
//
// Ajouté le 2026-11-09 pour ouvrir la diffusion aux Training Managers : saisir
// huit personnes champ par champ décourage, et les mettre dans DEFAUT les aurait
// publiées dans un dépôt public. Les adresses vivent donc seulement en base.
//
// Prénom et nom sont déduits de l'adresse (prenom.nom@…, suffixe .ext retiré) :
// sans accents, comme le reste de la liste.
function depuisAdresse(adresse) {
  const local = adresse.split('@')[0].replace(/\.ext$/, '')
  const [prenom, ...reste] = local.split('.')
  const majuscule = m => m.charAt(0).toUpperCase() + m.slice(1)
  return {
    prenom: prenom.split('-').map(majuscule).join('-'),
    nom: reste.join(' ').toUpperCase(),
  }
}

export async function ajouterPlusieursFormateursVeille(texte) {
  const adresses = [...new Set(
    String(texte || '').split(/[\s,;]+/).map(a => a.trim().toLowerCase()).filter(Boolean),
  )]
  const connues = new Set(getFormateurs().map(f => String(f.email || '').toLowerCase()))
  const invalides = adresses.filter(a => !/^[^\s@]+\.[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))
  const doublons = adresses.filter(a => connues.has(a))
  const nouveaux = adresses
    .filter(a => !invalides.includes(a) && !connues.has(a))
    .map((email, i) => ({ id: `fv_${Date.now()}_${i}`, ...depuisAdresse(email), email, actif: true }))
  if (nouveaux.length) {
    ecrireCache([...getFormateurs(), ...nouveaux])
    await publierFormateurs(nouveaux)
  }
  return { ajoutes: nouveaux.length, doublons, invalides, liste: getFormateurs() }
}

export async function updateFormateur(id, changes) {
  const liste = getFormateurs().map(f => f.id === id ? { ...f, ...changes } : f)
  ecrireCache(liste)
  const modifie = liste.find(f => f.id === id)
  if (modifie) await enregistrerFormateur(id, modifie)
  return liste
}

export async function removeFormateur(id) {
  ecrireCache(getFormateurs().filter(f => f.id !== id))
  await supprimerFormateur(id)
  return getFormateurs()
}

export function saveFormateurs(liste) {
  return ecrireCache(liste)
}

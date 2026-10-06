import { ARTICLES as ARTICLES_STATIQUES } from './veille.js'

const STORAGE_KEY = 'vj_articles_cache'
const STORAGE_DATE_KEY = 'vj_articles_cache_date'

// Source de vérité des articles : le fichier publié par l'outil de veille.
//
// Les deux outils doivent voir la MÊME liste. Les traces de traitement sont déjà
// communes (Firebase, veille/traitements), mais les articles, eux, étaient
// produits deux fois : chaque dépôt avait sa propre passe RSS du lundi, donc ses
// propres articles. Conséquence mesurée le 2026-10-06 : 146 articles dans PLS
// contre 174 dans l'outil de veille. Un article traité par Sarah pouvait donc
// n'exister dans PLS que sous forme de trace orpheline, reconstruite de mémoire.
//
// Désormais une seule passe fait foi, celle de l'outil de veille, et les deux
// interfaces lisent son fichier. Le fichier est servi par GitHub Pages avec
// « access-control-allow-origin: * » (vérifié le 2026-10-06), la lecture
// inter-origine passe donc sans proxy.
const SOURCE_PARTAGEE = 'https://jonathanknaus.github.io/veille-juridique/data/articles.json'

// Replis successifs : la copie locale du dépôt (tenue à jour par sa propre
// passe, qui sert de secours si Pages tombe ou si le dépôt de veille change de
// visibilité), puis le cache navigateur, puis le jeu de démonstration.
function urlLocale() {
  return `${import.meta.env.BASE_URL}data/articles.json`
}

async function lireArticles(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json.articles) || json.articles.length === 0) throw new Error('Vide')
  return json
}

export async function chargerArticles() {
  for (const url of [SOURCE_PARTAGEE, urlLocale()]) {
    try {
      const json = await lireArticles(url)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json.articles))
      localStorage.setItem(STORAGE_DATE_KEY, json.fetchedAt)
      return json.articles
    } catch (err) {
      console.warn(`[veille] source indisponible (${url}) : ${err.message}`)
    }
  }
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}
  return ARTICLES_STATIQUES
}

export function getArticlesCache() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    return cached ? JSON.parse(cached) : ARTICLES_STATIQUES
  } catch {
    return ARTICLES_STATIQUES
  }
}

export function getDateDerniereFetch() {
  const d = localStorage.getItem(STORAGE_DATE_KEY)
  return d ? new Date(d) : null
}

// ── Articles ajoutés manuellement ────────────────────────────────────────────
//
// Serveur d'abord, cache ensuite — même schéma que store-firebase.js : le
// localStorage donne l'affichage instantané, la Realtime Database fait foi et
// partage l'article entre les deux outils.
//
// Un article saisi à la main n'est pas un article de second rang : c'est par là
// que passent Légifrance, la Caisse des Dépôts et le Padlet OPCO, qui n'ont pas
// de flux RSS. Les laisser dans un seul navigateur, c'était accepter de les
// perdre.
import { ecouterArticlesManuels as ecouterServeur, enregistrerArticleManuel, supprimerArticleManuel } from './veille-storage.js'

const MANUEL_KEY = 'vj_articles_manuels'

export function getArticlesManuels() {
  try {
    return JSON.parse(localStorage.getItem(MANUEL_KEY) || '[]')
  } catch {
    return []
  }
}

function ecrireCacheManuels(liste) {
  localStorage.setItem(MANUEL_KEY, JSON.stringify(liste))
  return liste
}

// Un article qui n'est encore que sur ce poste. Deux cas : il a été saisi avant
// le passage au serveur (2026-10-06), donc il n'a pas d'`ajouteAt` ; ou sa
// publication a échoué et on l'a marqué. La distinction compte : sans elle, un
// article supprimé par quelqu'un d'autre réapparaîtrait comme « local » à chaque
// instantané, et ressusciterait indéfiniment.
export function estArticleLocal(article) {
  return !article?.ajouteAt || article?._aPublier === true
}

// Fusionne l'instantané du serveur avec ce qui n'y est pas encore monté.
export function fusionnerArticlesManuels(duServeur) {
  const surLeServeur = new Set((duServeur || []).map(a => a.id))
  const locaux = getArticlesManuels().filter(a => estArticleLocal(a) && !surLeServeur.has(a.id))
  return ecrireCacheManuels([...(duServeur || []), ...locaux])
}

export function ecouterArticlesManuels(callback, onErreur) {
  return ecouterServeur(
    duServeur => callback(fusionnerArticlesManuels(duServeur)),
    onErreur,
  )
}

function construireManuel(article, emailAuteur, id = `manuel_${Date.now()}`) {
  return {
    id,
    titre: article.titre,
    resume: article.resume || '',
    source_id: 'manuel',
    source_nom: article.source_nom || 'Source externe',
    thematique: article.thematique,
    niveau: article.niveau,
    date: article.date,
    url: article.url,
    ajoutePar: article.ajoutePar || emailAuteur || '',
    ajouteAt: article.ajouteAt || new Date().toISOString(),
    manuel: true,
  }
}

// Écrit le cache d'abord pour que l'article s'affiche tout de suite, puis monte
// au serveur. Si le serveur refuse, l'article n'est pas perdu : il reste en
// cache, marqué comme à publier, et la bannière propose de réessayer.
export async function saveArticleManuel(article, emailAuteur) {
  const nouveau = construireManuel(article, emailAuteur)
  ecrireCacheManuels([...getArticlesManuels(), nouveau])
  try {
    await enregistrerArticleManuel(nouveau.id, nouveau)
    return nouveau
  } catch (err) {
    const marque = { ...nouveau, _aPublier: true }
    ecrireCacheManuels(getArticlesManuels().map(a => a.id === nouveau.id ? marque : a))
    throw err
  }
}

export async function deleteArticleManuel(id) {
  ecrireCacheManuels(getArticlesManuels().filter(a => a.id !== id))
  await supprimerArticleManuel(id)
}

// Monte au serveur les articles restés locaux. Rend le détail, pour pouvoir dire
// ce qui est passé et ce qui a échoué plutôt qu'un simple « erreur ».
export async function publierArticlesLocaux(emailAuteur) {
  const locaux = getArticlesManuels().filter(estArticleLocal)
  const echecs = []
  for (const a of locaux) {
    const complet = construireManuel(a, emailAuteur, a.id)
    try {
      await enregistrerArticleManuel(complet.id, complet)
      // `complet` est reconstruit sans `_aPublier` : le remplacer suffit à lever
      // la marque.
      ecrireCacheManuels(getArticlesManuels().map(x => x.id === complet.id ? complet : x))
    } catch (err) {
      echecs.push({ titre: a.titre, message: err?.message || String(err) })
    }
  }
  return { publies: locaux.length - echecs.length, echecs }
}

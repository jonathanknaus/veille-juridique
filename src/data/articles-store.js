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
const MANUEL_KEY = 'vj_articles_manuels'

export function getArticlesManuels() {
  try {
    return JSON.parse(localStorage.getItem(MANUEL_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveArticleManuel(article) {
  const list = getArticlesManuels()
  const id = `manuel_${Date.now()}`
  const nouveau = {
    id,
    titre: article.titre,
    resume: article.resume || '',
    source_id: 'manuel',
    source_nom: article.source_nom || 'Source externe',
    thematique: article.thematique,
    niveau: article.niveau,
    date: article.date,
    url: article.url,
    manuel: true,
  }
  localStorage.setItem(MANUEL_KEY, JSON.stringify([...list, nouveau]))
  return nouveau
}

export function deleteArticleManuel(id) {
  const updated = getArticlesManuels().filter(a => a.id !== id)
  localStorage.setItem(MANUEL_KEY, JSON.stringify(updated))
}

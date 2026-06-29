import { ARTICLES as ARTICLES_STATIQUES } from './veille.js'

const STORAGE_KEY = 'vj_articles_cache'
const STORAGE_DATE_KEY = 'vj_articles_cache_date'

export async function chargerArticles() {
  try {
    const url = `${import.meta.env.BASE_URL}data/articles.json?t=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json.articles) || json.articles.length === 0) throw new Error('Vide')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json.articles))
    localStorage.setItem(STORAGE_DATE_KEY, json.fetchedAt)
    return json.articles
  } catch {
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) return JSON.parse(cached)
    } catch {}
    return ARTICLES_STATIQUES
  }
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

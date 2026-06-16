// Charge les articles depuis public/data/articles.json (généré chaque lundi par le cron)
// Fallback sur les articles statiques si le fichier n'est pas encore disponible

import { ARTICLES as ARTICLES_STATIQUES } from './veille.js'

const STORAGE_KEY = 'vj_articles_cache'
const STORAGE_DATE_KEY = 'vj_articles_cache_date'

export async function chargerArticles() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/articles.json`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json.articles) || json.articles.length === 0) throw new Error('Vide')
    // Fusionner avec statiques : les articles statiques avec un id numérique sont conservés si aucun RSS ne les couvre
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json.articles))
    localStorage.setItem(STORAGE_DATE_KEY, json.fetchedAt)
    return json.articles
  } catch {
    // Fallback cache local
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

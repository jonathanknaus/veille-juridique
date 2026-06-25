// Charge les articles depuis public/data/articles.json (généré chaque lundi par le cron)
// Fallback sur les articles statiques si le fichier n'est pas encore disponible

import { ARTICLES as ARTICLES_STATIQUES } from './veille.js'

const STORAGE_KEY = 'vj_articles_cache'
const STORAGE_DATE_KEY = 'vj_articles_cache_date'

export async function chargerArticles(traitements = []) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/articles.json`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json.articles) || json.articles.length === 0) throw new Error('Vide')

    // Réinjecter les articles traités qui ont disparu du flux (pour conserver l'historique)
    const traites = traitements.filter(t => t.articleId && t.articleTitre)
    const idsNouveaux = new Set(json.articles.map(a => a.id))
    const articlesOrphelins = traites
      .filter(t => !idsNouveaux.has(t.articleId))
      .map(t => ({
        id: t.articleId,
        titre: t.articleTitre,
        resume: '',
        source_id: t.articleSource,
        thematique: t.articleThematique,
        niveau: 'info',
        date: t.articleDate,
        url: t.urlArticle || '',
        lu: true,
        archive: true,
      }))

    const tous = [...json.articles, ...articlesOrphelins]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tous))
    localStorage.setItem(STORAGE_DATE_KEY, json.fetchedAt)
    return tous
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

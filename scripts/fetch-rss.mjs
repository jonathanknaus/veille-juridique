// Script de synchronisation RSS — lancé chaque lundi par GitHub Actions
// Récupère les vrais articles depuis les flux RSS des sources surveillées
// et écrit public/data/articles.json

import { writeFileSync, mkdirSync } from 'fs'
import { parseStringPromise } from 'xml2js'

const SOURCES = [
  {
    id: 'france-competences',
    nom: 'France Compétences',
    thematique: 'qualiopi',
    rss: 'https://www.francecompetences.fr/feed/',
  },
  {
    id: 'centre-inffo',
    nom: 'Centre Inffo',
    thematique: 'qualiopi',
    rss: 'https://www.centre-inffo.fr/feed',
  },
  {
    id: 'cnil',
    nom: 'CNIL',
    thematique: 'rgpd',
    rss: 'https://www.cnil.fr/fr/rss.xml',
  },
  {
    id: 'senat',
    nom: 'Sénat',
    thematique: 'legislatif',
    rss: 'http://www.senat.fr/rss/textes.xml',
  },
]

// Mots-clés par thématique pour classifier les articles
const KEYWORDS = {
  urgent: ['décret', 'ordonnance', 'obligation', 'sanction', 'amende', 'loi', 'arrêté', 'mise en demeure'],
  important: ['guide', 'modification', 'réforme', 'financement', 'audit', 'contrôle', 'nouvelle', 'mise à jour'],
}

function detectNiveau(titre, resume) {
  const text = (titre + ' ' + resume).toLowerCase()
  if (KEYWORDS.urgent.some(k => text.includes(k))) return 'urgent'
  if (KEYWORDS.important.some(k => text.includes(k))) return 'important'
  return 'info'
}

async function fetchFeed(source) {
  try {
    const res = await fetch(source.rss, {
      headers: { 'User-Agent': 'VeilleJuridique/1.0 (https://jonathanknaus.github.io/veille-juridique/)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    const parsed = await parseStringPromise(xml, { explicitArray: false })

    const channel = parsed?.rss?.channel || parsed?.feed
    if (!channel) return []

    // Format RSS 2.0
    const items = channel.item
      ? (Array.isArray(channel.item) ? channel.item : [channel.item])
      : []

    // Format Atom
    const entries = channel.entry
      ? (Array.isArray(channel.entry) ? channel.entry : [channel.entry])
      : []

    const allItems = [...items, ...entries].slice(0, 5)

    return allItems.map((item, idx) => {
      const titre = item.title?._?.trim() || item.title?.trim() || ''
      const resume = item.description?._?.replace(/<[^>]+>/g, '').trim()
        || item.summary?._?.replace(/<[^>]+>/g, '').trim()
        || item['content:encoded']?.replace(/<[^>]+>/g, '').trim()
        || ''
      const rawLink = item.link
      const url = (
        (typeof rawLink === 'string' ? rawLink : null)
        || rawLink?._
        || rawLink?.href
        || (Array.isArray(rawLink) ? rawLink.find(l => l?.rel !== 'self')?.href || rawLink[0] : null)
        || ''
      ).toString().trim()
      const dateRaw = item.pubDate || item.published || item.updated || ''
      const date = dateRaw ? new Date(dateRaw).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)

      return {
        id: `${source.id}-${date}-${idx}`,
        titre: titre.slice(0, 200),
        resume: resume.slice(0, 400),
        source_id: source.id,
        thematique: source.thematique,
        niveau: detectNiveau(titre, resume),
        date,
        url,
        lu: false,
      }
    }).filter(a => a.titre && a.url)
  } catch (err) {
    console.error(`[${source.id}] Erreur: ${err.message}`)
    return []
  }
}

async function main() {
  console.log('Récupération des flux RSS...')
  const results = await Promise.all(SOURCES.map(fetchFeed))
  const articles = results
    .flat()
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  console.log(`${articles.length} articles récupérés`)

  mkdirSync('public/data', { recursive: true })
  writeFileSync(
    'public/data/articles.json',
    JSON.stringify({ fetchedAt: new Date().toISOString(), articles }, null, 2)
  )
  console.log('public/data/articles.json écrit ✓')
}

main()

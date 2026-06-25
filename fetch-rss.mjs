// Script de synchronisation RSS — lancé chaque lundi par GitHub Actions
// Récupère les vrais articles depuis les flux RSS des sources surveillées
// et écrit public/data/articles.json

import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { parseStringPromise } from 'xml2js'

const SOURCES = [
  // ── Scraping HTML (pas de RSS) ───────────────────────────────────────────────
  {
    id: 'france-competences',
    nom: 'France Compétences',
    thematique: 'qualiopi',
    scrape: 'https://www.francecompetences.fr/actualites/',
  },
  // ── RSS disponibles ──────────────────────────────────────────────────────────
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
  {
    id: 'ministere-travail',
    nom: 'Ministère du Travail',
    thematique: 'legislatif',
    rss: 'https://travail-emploi.gouv.fr/rss.xml',
  },
  {
    id: 'agefiph',
    nom: 'Agefiph',
    thematique: 'opco',
    rss: 'https://www.agefiph.fr/rss.xml',
  },
  // ── Légifrance n'expose pas de RSS public — couverture via ajout manuel ──────
  // id: 'legifrance' → articles ajoutés manuellement via la modale Traiter
  // ── Caisse des Dépôts n'expose pas de RSS — couverture manuelle ────────────
  // id: 'caisse-depots' → articles ajoutés manuellement via la modale Traiter
  // ── Padlet Veille Formation (OPCO) — pas de RSS — couverture manuelle ───────
  // id: 'padlet-veille' → articles ajoutés manuellement via la modale Traiter
]

// Mots-clés par thématique pour classifier les articles
const KEYWORDS = {
  urgent: ['décret', 'ordonnance', 'obligation', 'sanction', 'amende', 'loi', 'arrêté', 'mise en demeure'],
  important: ['guide', 'modification', 'réforme', 'financement', 'audit', 'contrôle', 'nouvelle', 'mise à jour'],
}

function slugId(sourceId, url) {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '').replace(/^\//, '')
    const parts = path.split('/').filter(Boolean)
    const slug = parts[parts.length - 1] || parts[parts.length - 2] || url
    return `${sourceId}__${slug}`.slice(0, 120)
  } catch {
    return `${sourceId}__${url.replace(/[^a-z0-9]/gi, '-').slice(-60)}`
  }
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
        id: slugId(source.id, url),
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

async function scrapeFranceCompetences(source) {
  try {
    const res = await fetch(source.scrape, {
      headers: { 'User-Agent': 'VeilleJuridique/1.0 (https://jonathanknaus.github.io/veille-juridique/)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    // Extract /fiche/ links with their anchor text (first occurrence = clean title)
    const ficheRe = /<a[^>]+href="(https:\/\/www\.francecompetences\.fr\/fiche\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const seen = new Set()
    const titlesMap = {}
    let m
    while ((m = ficheRe.exec(html)) !== null) {
      const url = m[1]
      const rawText = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (rawText && rawText.length > 10 && !seen.has(url)) {
        seen.add(url)
        titlesMap[url] = rawText
      }
    }

    // Extract dates near each fiche (format: dd.mm.yyyy)
    const dateRe = /href="(https:\/\/www\.francecompetences\.fr\/fiche\/[^"]+)"[\s\S]{0,600}?(\d{2})\.(\d{2})\.(\d{4})/g
    const datesMap = {}
    while ((m = dateRe.exec(html)) !== null) {
      const url = m[1]
      if (!datesMap[url]) {
        datesMap[url] = `${m[4]}-${m[3]}-${m[2]}`
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    return Object.keys(titlesMap).slice(0, 5).map((url) => {
      const titre = titlesMap[url].slice(0, 200)
      const date = datesMap[url] || today
      return {
        id: slugId(source.id, url),
        titre,
        resume: '',
        source_id: source.id,
        thematique: source.thematique,
        niveau: detectNiveau(titre, ''),
        date,
        url,
        lu: false,
      }
    })
  } catch (err) {
    console.error(`[${source.id}] Erreur scraping: ${err.message}`)
    return []
  }
}

async function main() {
  console.log('Récupération des articles...')
  const results = await Promise.all(SOURCES.map(s => s.scrape ? scrapeFranceCompetences(s) : fetchFeed(s)))
  const nouveaux = results.flat()
  const nouveauxIds = new Set(nouveaux.map(a => a.id))

  // Conserver les anciens articles absents du flux (ex : articles traités/diffusés)
  let anciens = []
  try {
    const existing = JSON.parse(readFileSync('public/data/articles.json', 'utf-8'))
    anciens = (existing.articles || []).filter(a => !nouveauxIds.has(a.id))
    if (anciens.length > 0) console.log(`${anciens.length} articles conservés (hors flux actuel)`)
  } catch {}

  const articles = [...nouveaux, ...anciens]
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  console.log(`${articles.length} articles au total (${nouveaux.length} nouveaux)`)

  mkdirSync('public/data', { recursive: true })
  writeFileSync(
    'public/data/articles.json',
    JSON.stringify({ fetchedAt: new Date().toISOString(), articles }, null, 2)
  )
  console.log('public/data/articles.json écrit ✓')
}

main()

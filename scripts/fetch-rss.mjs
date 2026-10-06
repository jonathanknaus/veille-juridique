// Passe de veille — lancée chaque lundi 8h (Paris) par GitHub Actions, et à la
// demande via « Run workflow ». Récupère les articles des sources surveillées,
// les CLASSE par indicateur Qualiopi (23 / 24 / 25) et écrit
// public/data/articles.json, consommé par cet outil ET par PLS.
//
// Ce dépôt est la source de vérité des articles : PLS lit le fichier publié ici
// (voir articles-store.js), pour qu'un article traité par Sarah soit le même
// article dans les deux outils. Les traces de traitement, elles, vivent déjà en
// commun dans Firebase (veille/traitements).
//
// ⚠️ La passe n'écarte RIEN. Chaque article récupéré est écrit, avec son
// classement et, s'il est hors périmètre, le motif du rejet. Le ciblage est un
// tri d'affichage, pas une suppression : c'est l'interface qui ne propose au
// traitement que ce qui est pertinent, et l'onglet « Hors périmètre » garde le
// reste accessible. Un outil de preuve ne fait pas disparaître ce qu'il écarte.

import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { parseStringPromise } from 'xml2js'
import { classerArticle } from '../src/data/classement-veille.js'

// `pourIndicateur` dit à quel indicateur la source est censée contribuer. Ce
// n'est plus l'indicateur de l'article — il est déduit du contenu, article par
// article — mais ça sert à mesurer la couverture : si une source censée nourrir
// l'indicateur 25 n'en produit jamais, c'est elle qu'il faut changer.
const SOURCES = [
  // ── Scraping HTML (pas de RSS) ───────────────────────────────────────────────
  {
    id: 'france-competences',
    nom: 'France Compétences',
    thematique: 'qualiopi',
    pourIndicateur: '24', // métiers, compétences, répertoires
    scrape: 'https://www.francecompetences.fr/actualites/',
  },
  // ── RSS disponibles ──────────────────────────────────────────────────────────
  {
    id: 'centre-inffo',
    nom: 'Centre Inffo',
    thematique: 'qualiopi',
    pourIndicateur: '23', // droit de la formation, financement, audit
    rss: 'https://www.centre-inffo.fr/feed',
  },
  {
    id: 'cnil',
    nom: 'CNIL',
    thematique: 'rgpd',
    pourIndicateur: '23', // cadre légal applicable à l'OF
    rss: 'https://www.cnil.fr/fr/rss.xml',
  },
  {
    id: 'senat',
    nom: 'Sénat',
    thematique: 'legislatif',
    pourIndicateur: '23',
    rss: 'http://www.senat.fr/rss/textes.xml',
  },
  {
    id: 'ministere-travail',
    nom: 'Ministère du Travail',
    thematique: 'legislatif',
    pourIndicateur: '23',
    rss: 'https://travail-emploi.gouv.fr/rss.xml',
  },
  {
    id: 'agefiph',
    nom: 'Agefiph',
    thematique: 'opco',
    pourIndicateur: '23',
    rss: 'https://www.agefiph.fr/rss.xml',
  },
  {
    id: 'digiformag',
    nom: 'Digiformag',
    thematique: 'formation',
    pourIndicateur: '25', // innovation pédagogique et EdTech
    rss: 'https://www.digiformag.com/feed/',
  },
  {
    // Demandé par Sarah (2026-10-05) : syndicat des organismes de formation,
    // suit de près l'évolution de la loi sur les OF, Qualiopi et les OPCO.
    id: 'acteurs-competence',
    nom: 'Les Acteurs de la Compétence',
    thematique: 'legislatif',
    pourIndicateur: '23',
    rss: 'https://www.lesacteursdelacompetence.fr/feed/',
  },
  {
    // Ajouté le 2026-10-06 pour combler un trou : l'indicateur 24 porte sur
    // « les évolutions des compétences, des métiers et des emplois dans ses
    // secteurs d'intervention ». Nos secteurs, ce sont les cabinets d'expertise
    // comptable — et AUCUNE source ne les suivait. Sur les 174 articles du flux
    // du 2026-10-05, zéro ne parlait du métier de nos stagiaires : un registre
    // d'indicateur 24 ne pouvait pas exister.
    //
    // Le flux officiel du Conseil national de l'Ordre (testé le 2026-10-06 :
    // 200, 10 items, facturation électronique, attractivité du métier,
    // observatoires économiques) est la source la plus directe. Si elle doit
    // sauter pour une raison de périmètre, supprimer ce bloc suffit.
    id: 'ordre-experts-comptables',
    nom: 'Ordre des experts-comptables',
    thematique: 'formation',
    pourIndicateur: '24',
    rss: 'https://www.experts-comptables.fr/rss.xml',
  },
  // ── Service-Public.fr n'expose pas de flux RSS accessible (404 sur toutes les
  //    URL candidates testées le 2026-10-05) → couverture par ajout manuel ─────
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
  important: ['guide', 'modification', 'réforme', 'financement', 'audit', 'contrôle', 'nouvelle', 'mise à jour', 'qualiopi', 'opco', 'certification', 'organisme de formation', 'référentiel', 'bpf', 'france compétences'],
}

// Nombre d'articles retenus par source et par passe.
//
// Passé de 5 à 12 le 2026-10-06. Avec 5, la semaine où la CNIL publiait quatre
// ordres du jour de séance plénière, il ne restait qu'un article utile — et le
// tri par pertinence n'avait rien à trier. Puisque rien n'est supprimé et que
// le bruit part en « Hors périmètre », il vaut mieux ratisser large et cibler
// ensuite que rater un décret parce qu'il était sixième.
const PAR_SOURCE = 12

// xml2js en mode explicitArray:false rend une CHAÎNE quand la balise n'a pas
// d'attribut, et un objet { _, $ } quand elle en a. L'ancien code lisait
// `item.description?._` sans ce second cas : toutes les descriptions arrivant en
// texte simple étaient perdues. Mesuré le 2026-10-06 : 146 articles sur 174
// avaient un résumé vide, dont 100 % de la CNIL et du ministère du Travail, qui
// publient pourtant un résumé propre. Les flux WordPress (Digiformag) passaient,
// eux, par le troisième repli `content:encoded` — d'où l'illusion que ça marchait.
function texteDe(valeur) {
  if (typeof valeur === 'string') return valeur
  if (Array.isArray(valeur)) return valeur.map(texteDe).join(' ')
  if (valeur && typeof valeur === 'object') return texteDe(valeur._ ?? '')
  return ''
}

// Décode la réponse selon l'encodage qu'elle déclare, au lieu de supposer UTF-8.
//
// Le flux du Sénat est en ISO-8859-15 : lu en UTF-8, « Sénat » devenait
// « S�nat », et le caractère de remplacement est une perte sèche —
// reparerAccents() ne peut rien en tirer. On lit donc les octets, puis on décode
// avec le charset annoncé par l'en-tête HTTP ou, à défaut, par la déclaration XML.
async function texteReponse(res) {
  const octets = Buffer.from(await res.arrayBuffer())
  const entete = res.headers.get('content-type') || ''
  const declaration = octets.subarray(0, 200).toString('latin1')
  const charset = (
    /charset=["']?([\w-]+)/i.exec(entete)?.[1]
    || /encoding=["']([\w-]+)["']/i.exec(declaration)?.[1]
    || 'utf-8'
  ).toLowerCase()
  try {
    return new TextDecoder(charset).decode(octets)
  } catch {
    return new TextDecoder('utf-8').decode(octets)
  }
}

// Atom range l'URL dans les ATTRIBUTS du lien, que xml2js met sous `$` — pas
// sous `href`. L'ancienne lecture n'examinait que `href`, donc toute entrée Atom
// ressortait sans URL et était écartée par le filtre final : la source Sénat
// (projets et propositions de loi, le cœur de l'indicateur 23) n'a jamais produit
// un seul article depuis sa déclaration, sans la moindre erreur dans le journal.
function lienDe(rawLink) {
  const candidats = Array.isArray(rawLink) ? rawLink : [rawLink]
  let repli = ''
  for (const l of candidats) {
    if (typeof l === 'string' && l.trim()) return l.trim()
    const href = l?.$?.href || l?.href || l?._
    if (!href) continue
    const rel = l?.$?.rel || l?.rel
    if (rel === 'self') continue // pointe le flux lui-même, pas l'article
    if (rel && rel !== 'alternate') { repli = repli || String(href).trim(); continue }
    return String(href).trim()
  }
  return repli
}

function nettoyer(html) {
  return texteDe(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Les catégories posées par l'éditeur du flux (« Réglementation », « CPF »,
// « Handicap », « IA ») sont le signal de classement le plus fiable qu'on
// reçoive : elles valent souvent mieux que le titre.
function categoriesDe(item) {
  const brut = item.category ?? item.categories ?? []
  const liste = Array.isArray(brut) ? brut : [brut]
  return liste.map(c => nettoyer(c)).filter(Boolean).slice(0, 6)
}

// Pose le classement sur l'article. Même module que l'interface, donc même
// verdict de part et d'autre : ce qui est écrit ici est ce que l'écran affiche.
// L'interface reclasse quand même à l'affichage — une règle corrigée requalifie
// tout l'historique sans attendre la passe du lundi.
function qualifier(article) {
  const c = classerArticle(article)
  return {
    ...article,
    indicateur: c.indicateur,
    pertinent: c.pertinent,
    confiance: c.confiance,
    motifClassement: c.motif,
  }
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
    const xml = await texteReponse(res)
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

    const allItems = [...items, ...entries].slice(0, PAR_SOURCE)

    return allItems.map((item) => {
      const titre = nettoyer(item.title)
      const resume = nettoyer(item.description)
        || nettoyer(item.summary)
        || nettoyer(item['content:encoded'])
        || nettoyer(item.content)
        || ''
      const url = lienDe(item.link) || lienDe(item.id)
      const dateRaw = item.pubDate || item.published || item.updated || ''
      const date = dateRaw ? new Date(dateRaw).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)

      return qualifier({
        id: slugId(source.id, url),
        titre: titre.slice(0, 200),
        resume: resume.slice(0, 400),
        categories: categoriesDe(item),
        source_id: source.id,
        thematique: source.thematique,
        niveau: detectNiveau(titre, resume),
        date,
        url,
        lu: false,
      })
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
    const html = await texteReponse(res)

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
    return Object.keys(titlesMap).slice(0, PAR_SOURCE).map((url) => {
      const titre = titlesMap[url].slice(0, 200)
      const date = datesMap[url] || today
      return qualifier({
        id: slugId(source.id, url),
        titre,
        // Le scraping ne ramène que le titre : pour cette source, le classement
        // se joue sur quelques mots. D'où des « signal faible » plus fréquents.
        resume: '',
        categories: [],
        source_id: source.id,
        thematique: source.thematique,
        niveau: detectNiveau(titre, ''),
        date,
        url,
        lu: false,
      })
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
    // ⚠️ On conserve TOUS les articles sortis des flux, sans purge par l'âge.
    //
    // Une purge a été tentée puis retirée le 2026-10-05 : ce script tourne dans
    // GitHub Actions et ne peut pas savoir quels articles ont été traités (les
    // traces sont dans Firebase, dont la lecture exige un compte Pennylane
    // autorisé). Il purgeait donc à l'aveugle et faisait disparaître de la liste
    // des articles déjà traités — inacceptable, ce sont des pièces de preuve.
    //
    // Le désencombrement se fait côté interface, qui connaît les traces : elle
    // masque les articles NON TRAITÉS de plus de 45 jours, et jamais les autres.
    // Les anciens repassent au classement : ils ont été collectés avant que
    // l'indicateur soit déduit du contenu, et une règle corrigée doit les
    // rattraper. Leur contenu, lui, n'est jamais retouché.
    anciens = (existing.articles || [])
      .filter(a => !nouveauxIds.has(a.id))
      .map(qualifier)
    if (anciens.length > 0) console.log(`${anciens.length} articles conservés (hors flux actuel), reclassés`)
  } catch {}

  const articles = [...nouveaux, ...anciens]
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  console.log(`${articles.length} articles au total (${nouveaux.length} nouveaux)`)
  rapport(articles, nouveaux)

  mkdirSync('public/data', { recursive: true })
  writeFileSync(
    'public/data/articles.json',
    JSON.stringify({ fetchedAt: new Date().toISOString(), articles }, null, 2)
  )
  console.log('public/data/articles.json écrit ✓')
}

// Rapport lisible dans le journal de l'Action. Sert à une question précise :
// est-ce que les trois indicateurs sont nourris ? Un 24 ou un 25 à zéro est un
// trou de preuve Qualiopi, et il se voit ici avant de se voir en audit.
function rapport(articles, nouveaux) {
  const compter = (liste) => liste.reduce((acc, a) => {
    const cle = a.pertinent ? a.indicateur : 'hors'
    acc[cle] = (acc[cle] || 0) + 1
    return acc
  }, {})
  const t = compter(articles)
  const n = compter(nouveaux)
  console.log('')
  console.log('Répartition par indicateur Qualiopi (total / nouveaux de la passe) :')
  console.log(`  23 Légal      : ${t['23'] || 0}\t(${n['23'] || 0})`)
  console.log(`  24 Métiers    : ${t['24'] || 0}\t(${n['24'] || 0})`)
  console.log(`  25 Pédagogie  : ${t['25'] || 0}\t(${n['25'] || 0})`)
  console.log(`  Hors périmètre: ${t.hors || 0}\t(${n.hors || 0})  — conservés, consultables dans l'onglet dédié`)
  for (const ind of ['23', '24', '25']) {
    if (!t[ind]) console.log(`  ⚠️  Indicateur ${ind} à zéro : aucune source ne le nourrit, la preuve manquera en audit.`)
  }
  console.log('')
  console.log('Rendement par source (retenus / collectés) :')
  for (const s of SOURCES) {
    const sien = articles.filter(a => a.source_id === s.id)
    const retenus = sien.filter(a => a.pertinent)
    const vise = retenus.filter(a => a.indicateur === s.pourIndicateur).length
    console.log(
      `  ${s.nom.padEnd(30)} ${String(retenus.length).padStart(3)} / ${String(sien.length).padStart(3)}`
      + `   dont ${vise} sur l'indicateur ${s.pourIndicateur} visé`
    )
  }
}

main()

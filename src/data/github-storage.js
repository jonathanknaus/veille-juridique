const REPO = 'jonathanknaus/veille-juridique'
const FILE_PATH = 'data/veille-sarah.json'
const BRANCH = 'main'
const TOKEN = import.meta.env.VITE_GITHUB_DATA_TOKEN

const API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`

async function headers() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github+json',
  }
}

export async function chargerDepuisGitHub() {
  if (!TOKEN) return null
  try {
    const res = await fetch(API, { headers: await headers() })
    if (res.status === 404) return []
    if (!res.ok) return null
    const json = await res.json()
    return JSON.parse(atob(json.content.replace(/\n/g, '')))
  } catch {
    return null
  }
}

export async function sauvegarderSurGitHub(traitements) {
  if (!TOKEN) throw new Error('Token GitHub non configuré')
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(traitements, null, 2))))

  // Récupérer le SHA du fichier existant (requis pour mettre à jour)
  let sha = null
  try {
    const res = await fetch(API, { headers: await headers() })
    if (res.ok) {
      const json = await res.json()
      sha = json.sha
    }
  } catch {}

  const body = {
    message: `sauvegarde veille juridique — ${new Date().toLocaleString('fr-FR')}`,
    content,
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  }

  const res = await fetch(API, {
    method: 'PUT',
    headers: await headers(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Erreur GitHub')
  }
  return true
}

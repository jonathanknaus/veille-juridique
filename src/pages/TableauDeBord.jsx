import { useState, useMemo, useEffect } from 'react'
import { SOURCES, NIVEAUX } from '../data/veille'
import { chargerArticles, getArticlesCache, getDateDerniereFetch, getArticlesManuels, saveArticleManuel, deleteArticleManuel, ecouterArticlesManuels, publierArticlesLocaux, estArticleLocal } from '../data/articles-store'
// getCurrentUser était utilisé sans être importé : l'archivage échouait sur un
// « getCurrentUser is not defined », avalé par le catch et affiché comme un
// refus d'archivage.
import { getCurrentUser } from '../data/auth'
import { getTraitements, getTraitement, enregistrerTraitement, DECISIONS, INDICATEURS, INDICATEURS_IDS, exportRegistreCSV, exportRegistrePDF, filtrerParIndicateur, compterParIndicateur } from '../data/traitement'
import { getFormateurs, addFormateur, updateFormateur, removeFormateur } from '../data/formateurs'
import { RESPONSABLE } from '../data/formateurs'
import { ecouterTraces, sauvegarderTraces, ecouterArchives, archiverArticles, desarchiverArticle } from '../data/veille-storage'
import { annoterArticles, CONFIANCES } from '../data/classement-veille'
import './TableauDeBord.css'

// Onglets de la liste de veille : un par indicateur Qualiopi, plus la vue
// d'ensemble et le dépôt de ce qui a été écarté.
//
// « Hors périmètre » n'est pas une poubelle : rien n'y est supprimé, le motif du
// rejet est affiché, et traiter un article l'en fait sortir aussitôt. C'est la
// contrepartie du ciblage — on ne propose au traitement que ce qui est
// pertinent, à condition de pouvoir vérifier ce qu'on a laissé de côté.
// L'addition doit tomber juste : À traiter = 23 + 24 + 25 + À qualifier.
//
// Sans l'onglet « À qualifier », un article pertinent mais sans indicateur
// n'apparaissait dans AUCUN onglet d'indicateur tout en étant compté dans
// « À traiter » — on voyait 3 articles diffusés d'un côté et 2 de l'autre, sans
// moyen de trouver le troisième. C'est le cas des traces d'avant l'arrivée du
// champ `indicateur` : elles sont valables, mais ne prouvent encore rien pour un
// indicateur donné. Ce sont elles que l'auditeur ne pourra pas compter.
const CATEGORIES = [
  { id: 'a-traiter', libelle: 'À traiter', aide: 'Tous les articles pertinents : 23 + 24 + 25 + à qualifier' },
  { id: '23', libelle: 'Légal',     aide: 'Indicateur 23 — veille légale et réglementaire' },
  { id: '24', libelle: 'Métiers',   aide: 'Indicateur 24 — compétences, métiers et emplois de nos secteurs d\'intervention' },
  { id: '25', libelle: 'Pédagogie', aide: 'Indicateur 25 — innovations pédagogiques et technologiques' },
  { id: 'a-qualifier', libelle: 'À qualifier', aide: 'Pertinents mais rattachés à aucun indicateur : ils ne comptent dans aucun registre' },
  { id: 'hors', libelle: 'Hors périmètre', aide: 'Écartés par le classement, conservés et traitables : le motif est affiché' },
]

// Où ranger un article. La décision humaine passe devant le classement
// automatique, et un article déjà traité reste proposé quoi qu'il arrive : c'est
// une pièce de preuve, elle ne peut pas sortir de la liste parce qu'une règle a
// changé.
function rangement(article, trace) {
  const indicateur = String(trace?.indicateur || article?.classement?.indicateur || '')
  return {
    indicateur,
    pertinent: trace ? true : !!article?.classement?.pertinent,
    motif: article?.classement?.motif || '',
    confiance: article?.classement?.confiance || 'faible',
    motifs: article?.classement?.motifs || [],
  }
}

// Seuil d'ancienneté proposé pour l'ARCHIVAGE des articles non traités.
//
// Archiver est une décision tracée — qui, quand, avec quel seuil — et non un
// simple filtre d'affichage : « ces articles ont été examinés puis archivés » se
// documente, « ils ont disparu de ma vue » ne se documente pas.
//
// Un article déjà traité n'est jamais archivable, et une archive se défait d'un
// clic : rien n'est perdu.
const SEUILS_MASQUAGE = [15, 30, 45, 60, 90, 180, 0] // 0 = ne rien proposer à l'archivage
const SEUIL_DEFAUT = 45
const CLE_SEUIL = 'pls_seuil_masquage_veille'

// Les deux outils sont servis depuis la même origine GitHub Pages : ce réglage
// est donc commun à PLS et à l'outil de veille, sans synchronisation à écrire.
function lireSeuil() {
  const v = parseInt(localStorage.getItem(CLE_SEUIL) ?? '', 10)
  return SEUILS_MASQUAGE.includes(v) ? v : SEUIL_DEFAUT
}

function libelleSeuil(j) {
  return j === 0 ? 'Ne rien proposer' : `Plus de ${j} jours`
}

function ageEnJours(dateArticle) {
  const d = new Date(dateArticle)
  if (Number.isNaN(d.getTime())) return null // date illisible : on ne masque pas
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// ── Modale de traitement ──────────────────────────────────────────────────────
function ModaleTraitement({ article, onClose, onSave }) {
  const source = article.manuel ? { nom: article.source_nom || 'Source externe' } : SOURCES.find(s => s.id === article.source_id)
  const trace = getTraitement(article.id)
  const [decision, setDecision] = useState(trace?.decision || '')
  const [commentaire, setCommentaire] = useState(trace?.commentaire || '')
  const [destinataires, setDestinataires] = useState(trace?.destinataires || [])
  const [urlArticle, setUrlArticle] = useState(trace?.urlArticle || '')
  // Pré-remplit avec l'indicateur suggéré par la source de l'article : la trace
  // arrive qualifiée par défaut, il n'y a plus qu'à confirmer ou corriger.
  const [indicateur, setIndicateur] = useState(
    String(trace?.indicateur || article.indicateur || '')
  )
  const [impact, setImpact] = useState(trace?.impact || '')
  const formateurs = getFormateurs()

  function toggleDestinataire(email) {
    setDestinataires(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])
  }

  function handleSave() {
    if (!decision) return
    onSave({
      articleId: article.id,
      articleTitre: article.titre,
      articleSource: source?.nom || article.source_id,
      articleThematique: article.thematique,
      articleDate: article.date,
      decision,
      commentaire,
      destinataires: decision === 'diffuser' ? destinataires : [],
      urlArticle,
      indicateur,
      impact,
    })
    onClose()
  }

  return (
    <div className="modale-overlay" onClick={onClose}>
      <div className="modale" onClick={e => e.stopPropagation()}>
        <div className="modale-header">
          <h2>Traiter cet article</h2>
          <button className="modale-close" onClick={onClose}>✕</button>
        </div>

        <div className="modale-article">
          <span className={`thematique-badge thematique-${article.thematique}`}>{article.thematique}</span>
          <p className="modale-titre">{article.titre}</p>
          <p className="modale-meta">{source?.nom} · {new Date(article.date).toLocaleDateString('fr-FR')}</p>
        </div>

        <div className="modale-section">
          <p className="modale-label">Type de veille (indicateur Qualiopi)</p>
          <div className="indicateur-grid">
            {INDICATEURS_IDS.map(id => (
              <button
                key={id}
                className={`indicateur-btn ${indicateur === id ? 'actif' : ''}`}
                style={indicateur === id ? { borderColor: INDICATEURS[id].color, background: INDICATEURS[id].color } : undefined}
                onClick={() => setIndicateur(indicateur === id ? '' : id)}
                title={INDICATEURS[id].description}
              >
                <span className="indicateur-num">{id}</span>
                <span className="indicateur-label">{INDICATEURS[id].court}</span>
              </button>
            ))}
          </div>
          {indicateur
            ? <p className="indicateur-aide">{INDICATEURS[indicateur].description}</p>
            : <p className="indicateur-aide">Facultatif, mais c'est ce rattachement qui rend la trace exploitable comme preuve Qualiopi.</p>}
          {/* Le classement automatique se montre et s'explique : c'est une
              proposition, la trace enregistre le choix de la personne. */}
          {article.classement && !trace?.indicateur && (
            <p className="indicateur-aide">
              {article.classement.pertinent
                ? <>Proposé d'après le contenu : <strong>indicateur {article.classement.indicateur}</strong> — {CONFIANCES[article.classement.confiance].label.toLowerCase()}{article.classement.motifs.length ? ` (${article.classement.motifs.join(', ')})` : ''}.</>
                : <>Classé hors périmètre : {article.classement.motif}. Si tu le traites quand même, il rejoint l'indicateur choisi ci-dessus.</>}
            </p>
          )}
        </div>

        <div className="modale-section">
          <p className="modale-label">Décision</p>
          <div className="decision-grid">
            {Object.entries(DECISIONS).map(([k, v]) => (
              <button
                key={k}
                className={`decision-btn ${decision === k ? 'actif' : ''}`}
                onClick={() => setDecision(k)}
              >
                <span className="decision-icon">{v.icon}</span>
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {decision === 'diffuser' && (
          <div className="modale-section">
            <p className="modale-label">Destinataires</p>
            <div className="destinataires-list">
              {formateurs.filter(f => f.actif).map(f => (
                <label key={f.id} className="destinataire-item">
                  <input
                    type="checkbox"
                    checked={destinataires.includes(f.email)}
                    onChange={() => toggleDestinataire(f.email)}
                  />
                  {f.prenom} {f.nom}
                  <span className="destinataire-email">{f.email}</span>
                </label>
              ))}
            </div>
            <button className="btn-tous" onClick={() => setDestinataires(formateurs.filter(f => f.actif).map(f => f.email))}>
              Sélectionner tous
            </button>
          </div>
        )}

        <div className="modale-section">
          <p className="modale-label">Lien direct vers l'article</p>
          <input
            className="modale-input"
            type="url"
            placeholder="https://…"
            value={urlArticle}
            onChange={e => setUrlArticle(e.target.value)}
          />
        </div>

        <div className="modale-section">
          <p className="modale-label">
            {decision === 'diffuser' ? 'Message à l\'équipe (visible par les formateurs)' : 'Commentaire (optionnel)'}
          </p>
          <textarea
            className="modale-textarea"
            placeholder={decision === 'diffuser' ? 'Contexte, points d\'attention, action à mener… Ce message sera affiché sur la fiche article.' : 'Note interne…'}
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            rows={3}
          />
        </div>

        <div className="modale-section">
          <p className="modale-label">Impact / action menée sur l'organisme</p>
          <textarea
            className="modale-textarea"
            placeholder={indicateur ? INDICATEURS[indicateur].exemplePreuve : 'Ex. : modification des trames de devis, ajout d\'un chapitre au programme X, test d\'un outil sur la session Y…'}
            value={impact}
            onChange={e => setImpact(e.target.value)}
            rows={2}
          />
          <p className="indicateur-aide">
            L'auditeur ne regarde pas ce qu'on a lu, mais ce qu'on en a fait. C'est ce champ qui porte la preuve.
          </p>
        </div>

        <div className="modale-footer">
          <button className="btn-annuler" onClick={onClose}>Annuler</button>
          <button className="btn-valider" onClick={handleSave} disabled={!decision}>
            Enregistrer la trace
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modale ajout article manuel ───────────────────────────────────────────────
const EMPTY_MANUEL = { titre: '', url: '', source_nom: '', thematique: 'qualiopi', niveau: 'info', date: '', resume: '' }

function ModaleAjoutArticle({ onClose, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_MANUEL })
  const [erreur, setErreur] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleSave(e) {
    e.preventDefault()
    if (!form.titre.trim()) { setErreur('Le titre est requis.'); return }
    if (!form.url.trim()) { setErreur("L'URL est requise."); return }
    if (!form.date) { setErreur('La date est requise.'); return }
    onSave(form)
    onClose()
  }

  return (
    <div className="modale-overlay" onClick={onClose}>
      <div className="modale modale-ajout" onClick={e => e.stopPropagation()}>
        <div className="modale-header">
          <h2>Ajouter un article manuellement</h2>
          <button className="modale-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modale-section">
            <p className="modale-label">Titre *</p>
            <input className="modale-input" type="text" placeholder="Titre de l'article" value={form.titre} onChange={e => set('titre', e.target.value)} autoFocus />
          </div>

          <div className="modale-section">
            <p className="modale-label">URL de l'article *</p>
            <input className="modale-input" type="url" placeholder="https://…" value={form.url} onChange={e => set('url', e.target.value)} />
          </div>

          <div className="modale-section modale-row">
            <div style={{ flex: 1 }}>
              <p className="modale-label">Source (nom du site)</p>
              <input className="modale-input" type="text" placeholder="Ex : Journal du Net, RH Info…" value={form.source_nom} onChange={e => set('source_nom', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <p className="modale-label">Date de publication *</p>
              <input className="modale-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
          </div>

          <div className="modale-section modale-row">
            <div style={{ flex: 1 }}>
              <p className="modale-label">Thématique</p>
              <select className="modale-input" value={form.thematique} onChange={e => set('thematique', e.target.value)}>
                <option value="qualiopi">Qualiopi</option>
                <option value="rgpd">RGPD</option>
                <option value="opco">OPCO</option>
                <option value="legislatif">Législatif</option>
                <option value="formation">Formation</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <p className="modale-label">Niveau</p>
              <select className="modale-input" value={form.niveau} onChange={e => set('niveau', e.target.value)}>
                <option value="urgent">Urgent</option>
                <option value="important">Important</option>
                <option value="info">Information</option>
              </select>
            </div>
          </div>

          <div className="modale-section">
            <p className="modale-label">Résumé (optionnel)</p>
            <textarea className="modale-textarea" placeholder="Brève description de l'article…" value={form.resume} onChange={e => set('resume', e.target.value)} rows={3} />
          </div>

          {erreur && <p className="modale-erreur">{erreur}</p>}

          <div className="modale-footer">
            <button type="button" className="btn-annuler" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-valider">Ajouter l'article</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Section gestion formateurs ────────────────────────────────────────────────
function GestionFormateurs() {
  const [formateurs, setFormateurs] = useState(getFormateurs())
  const [form, setForm] = useState({ prenom: '', nom: '', email: '' })
  const [erreur, setErreur] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    if (!form.prenom || !form.nom || !form.email) { setErreur('Tous les champs sont requis.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setErreur('Email invalide.'); return }
    setFormateurs(addFormateur(form.prenom, form.nom, form.email))
    setForm({ prenom: '', nom: '', email: '' })
    setErreur('')
  }

  function handleToggle(id) {
    const f = formateurs.find(f => f.id === id)
    setFormateurs(updateFormateur(id, { actif: !f.actif }))
  }

  function handleRemove(id) {
    if (!window.confirm('Supprimer ce formateur ?')) return
    setFormateurs(removeFormateur(id))
  }

  return (
    <div className="gf-section">
      <h2 className="section-titre">Équipe de formateurs</h2>

      <table className="gf-table">
        <thead>
          <tr>
            <th>Prénom</th><th>Nom</th><th>Email</th><th>Statut</th><th></th>
          </tr>
        </thead>
        <tbody>
          {formateurs.map(f => (
            <tr key={f.id} className={!f.actif ? 'formateur-inactif' : ''}>
              <td>{f.prenom}</td>
              <td>{f.nom}</td>
              <td className="td-email">{f.email}</td>
              <td>
                <button
                  className={`badge-statut ${f.actif ? 'actif' : 'inactif'}`}
                  onClick={() => handleToggle(f.id)}
                  title={f.actif ? 'Désactiver' : 'Réactiver'}
                >
                  {f.actif ? 'Actif' : 'Inactif'}
                </button>
              </td>
              <td>
                <button className="btn-suppr" onClick={() => handleRemove(f.id)} title="Supprimer">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="gf-form" onSubmit={handleAdd}>
        <h3 className="gf-form-titre">Ajouter un formateur</h3>
        <div className="gf-fields">
          <input placeholder="Prénom" value={form.prenom} onChange={e => setForm(p => ({ ...p, prenom: e.target.value }))} />
          <input placeholder="Nom" value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} />
          <input placeholder="email@pennylane.com" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <button type="submit" className="btn-ajouter">Ajouter</button>
        </div>
        {erreur && <p className="gf-erreur">{erreur}</p>}
      </form>
    </div>
  )
}

const LAST_BACKUP_KEY = 'pls_last_backup'

function getLastBackup() {
  const v = localStorage.getItem(LAST_BACKUP_KEY)
  return v ? new Date(v) : null
}

function setLastBackup() {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString())
}

function shouldWarnBackup(traitements) {
  if (traitements.length === 0) return false
  const last = getLastBackup()
  if (!last) return true
  return (Date.now() - last.getTime()) > 24 * 60 * 60 * 1000
}

// ── Tableau de bord principal ─────────────────────────────────────────────────
export default function TableauDeBord() {
  const [articles, setArticles] = useState(getArticlesCache())
  const [articlesManuels, setArticlesManuels] = useState(getArticlesManuels())
  const [traitements, setTraitements] = useState(getTraitements())
  const [modaleArticle, setModaleArticle] = useState(null)
  const [showModaleAjout, setShowModaleAjout] = useState(false)
  const [onglet, setOnglet] = useState('veille')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  // Onglet de catégorie. Par défaut « À traiter » : la liste proposée est la
  // liste ciblée, pas le tout-venant des flux.
  const [categorie, setCategorie] = useState('a-traiter')
  const [filtreIndicateur, setFiltreIndicateur] = useState('tous')
  const [seuilMasquage, setSeuilMasquage] = useState(lireSeuil)
  const [archives, setArchives] = useState([])
  const [voirArchives, setVoirArchives] = useState(false)
  const [archivageEnCours, setArchivageEnCours] = useState(false)

  function changerSeuil(jours) {
    setSeuilMasquage(jours)
    localStorage.setItem(CLE_SEUIL, String(jours))
  }
  const [banniereVisible, setBanniereVisible] = useState(() => shouldWarnBackup(getTraitements()))
  const [syncStatus, setSyncStatus] = useState(null) // null | 'saving' | 'ok' | 'error'
  const [syncArticles, setSyncArticles] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [dateFetch, setDateFetch] = useState(getDateDerniereFetch)

  // Charger les articles RSS + traces de veille au démarrage
  useEffect(() => {
    chargerArticles().then(data => { if (data?.length) setArticles(data) })
    // Traces en écoute temps réel : un traitement fait par Sarah apparaît
    // immédiatement ici, et inversement. Plus besoin de naviguer pour rafraîchir.
    let premier = true
    const stop = ecouterTraces(
      data => {
        if (!Array.isArray(data)) return
        // Au premier instantané, un registre vide signifie « rien encore
        // migré » : on ne vide pas le cache local pour autant.
        if (premier && data.length === 0) { premier = false; return }
        premier = false
        localStorage.setItem('pls_traitements', JSON.stringify(data))
        setTraitements(data)
        setBanniereVisible(shouldWarnBackup(data))
      },
      () => {}, // registre inaccessible : on continue sur le cache local
    )
    const stopArchives = ecouterArchives(setArchives, () => {})
    // Articles saisis à la main : en écoute aussi, pour que celui que Sarah
    // ajoute apparaisse ici sans qu'elle ait à le redire.
    const stopManuels = ecouterArticlesManuels(setArticlesManuels, () => {})
    return () => { stop(); stopArchives(); stopManuels() }
  }, [])

  // Archive les articles non traités au-delà du seuil. Les traités en sont
  // exclus par construction : on ne touche jamais à une pièce de preuve.
  async function archiverAnciens(candidats) {
    if (candidats.length === 0) return
    if (!confirm(
      `Archiver ${candidats.length} article(s) non traité(s) de plus de ${seuilMasquage} jours ?\n\n`
      + 'Ils sortiront de la liste à traiter. L\'archivage est tracé et réversible.'
    )) return
    setArchivageEnCours(true)
    try {
      await archiverArticles(candidats, {
        seuilJours: seuilMasquage,
        emailAuteur: getCurrentUser()?.email,
      })
    } catch (err) {
      alert(`Archivage refusé : ${err?.message || err}`)
    }
    setArchivageEnCours(false)
  }

  async function handleSync() {
    setSyncArticles('loading')
    try {
      const data = await chargerArticles()
      if (data?.length) { setArticles(data); setDateFetch(getDateDerniereFetch()); setSyncArticles('ok') }
      else setSyncArticles('error')
      setTimeout(() => setSyncArticles(null), 3000)
    } catch {
      setSyncArticles('error')
      setTimeout(() => setSyncArticles(null), 3000)
    }
  }

  async function handleSaveArticleManuel(form) {
    try {
      await saveArticleManuel(form, getCurrentUser()?.email)
    } catch (err) {
      alert(
        `Article enregistré sur ce poste, mais pas envoyé à l'équipe : ${err?.message || err}\n\n`
        + 'Il reste dans la liste, marqué « local ». Utilise « Publier » pour réessayer.'
      )
    }
    setArticlesManuels(getArticlesManuels())
  }

  async function handleDeleteArticleManuel(id) {
    if (!confirm('Supprimer cet article ? Il disparaîtra aussi pour l\'équipe.')) return
    try {
      await deleteArticleManuel(id)
    } catch (err) {
      alert(`Suppression refusée par le serveur : ${err?.message || err}`)
    }
    setArticlesManuels(getArticlesManuels())
  }

  async function handlePublierLocaux() {
    const { publies, echecs } = await publierArticlesLocaux(getCurrentUser()?.email)
    setArticlesManuels(getArticlesManuels())
    if (echecs.length === 0) {
      alert(`${publies} article(s) publié(s) pour l'équipe ✓`)
      return
    }
    alert(
      `${publies} publié(s), ${echecs.length} refusé(s) :\n\n`
      + echecs.map(e => `· ${e.titre} — ${e.message}`).join('\n')
    )
  }

  async function handleSaveTraitement(data) {
    enregistrerTraitement(data)
    const updated = getTraitements()
    setTraitements(updated)
    setBanniereVisible(shouldWarnBackup(updated))
    // Sauvegarde automatique sur GitHub à chaque modification
    setSyncStatus('saving')
    try {
      await sauvegarderTraces(updated)
      setLastBackup()
      setBanniereVisible(false)
      setSyncStatus('ok')
      setTimeout(() => setSyncStatus(null), 3000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus(null), 5000)
    }
  }

  async function handleSaveTraitement(data) {
    enregistrerTraitement(data)
    const updated = getTraitements()
    setTraitements(updated)
    setBanniereVisible(shouldWarnBackup(updated))
    // Sauvegarde automatique sur GitHub à chaque modification
    setSyncStatus('saving')
    try {
      await sauvegarderTraces(updated)
      setLastBackup()
      setBanniereVisible(false)
      setSyncStatus('ok')
      setTimeout(() => setSyncStatus(null), 3000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus(null), 5000)
    }
  }

  function handleExport() {
    const csv = exportRegistreCSV(traitements)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registre-veille-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSauvegarder() {
    // Sauvegarde locale
    const blob = new Blob([JSON.stringify(traitements, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sauvegarde-veille-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    // Sauvegarde GitHub
    setSyncStatus('saving')
    try {
      await sauvegarderTraces(traitements)
      setLastBackup()
      setBanniereVisible(false)
      setSyncStatus('ok')
      setTimeout(() => setSyncStatus(null), 3000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus(null), 5000)
    }
  }

  function handleRestaurer(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!Array.isArray(data)) throw new Error('Format invalide')
        if (!window.confirm(`Restaurer ${data.length} trace(s) ? Les données actuelles seront remplacées.`)) return
        localStorage.setItem('pls_traitements', JSON.stringify(data))
        setTraitements(data)
        setLastBackup()
        setBanniereVisible(false)
        alert('Restauration réussie ✓')
      } catch {
        alert('Fichier invalide — utilisez un fichier de sauvegarde .json généré par cette application.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const tousArticles = useMemo(() => {
    // Classement recalculé à chaque rendu, articles manuels et orphelins
    // compris : une règle corrigée dans classement-veille.js requalifie tout
    // l'historique sans attendre la passe RSS du lundi.
    const base = annoterArticles([...articles, ...articlesManuels])
    const baseIds = new Set(base.map(a => a.id))
    // Réinjecter les articles orphelins depuis les traces (traités mais plus dans le flux)
    const orphelins = traitements
      .filter(t => !baseIds.has(t.articleId) && t.articleTitre)
      .map(t => ({
        id: t.articleId,
        titre: t.articleTitre,
        resume: '',
        source_id: t.articleSource || 'manuel',
        source_nom: t.articleSource || 'Source externe',
        thematique: t.articleThematique || '',
        niveau: 'info',
        date: t.articleDate || '',
        url: t.urlArticle || '',
        lu: true,
        orphelin: true,
      }))
    return [...base, ...annoterArticles(orphelins)]
  }, [articles, articlesManuels, traitements])

  // Compteurs d'onglets. Les archives n'y figurent pas : elles ont leur propre
  // vue, et les compter ici gonflerait le travail restant.
  const comptes = useMemo(() => {
    const c = { 'a-traiter': 0, 23: 0, 24: 0, 25: 0, 'a-qualifier': 0, hors: 0 }
    for (const a of tousArticles) {
      if (archives.some(x => x.id === a.id)) continue
      const r = rangement(a, getTraitement(a.id))
      if (!r.pertinent) { c.hors += 1; continue }
      c['a-traiter'] += 1
      if (r.indicateur) c[r.indicateur] += 1
      else c['a-qualifier'] += 1
    }
    return c
  }, [tousArticles, traitements, archives])

  const stats = useMemo(() => {
    const traitesIds = new Set(traitements.map(t => t.articleId))
    const articlesConnus = tousArticles.filter(a => !a.orphelin)
    const traites = articlesConnus.filter(a => traitesIds.has(a.id)).length
    // « En attente » ne compte que ce qui mérite une décision : un article hors
    // périmètre n'est pas du travail en retard, sinon le compteur affiche 160
    // alors qu'il n'y a que 40 articles à regarder.
    const enAttente = articlesConnus.filter(a => {
      if (traitesIds.has(a.id)) return false
      return rangement(a, null).pertinent
    }).length
    return {
      total: articlesConnus.length,
      traites,
      diffuses: traitements.filter(t => t.decision === 'diffuser').length,
      enAttente,
      hors: articlesConnus.length - traites - enAttente,
    }
  }, [tousArticles, traitements])

  return (
    <div className="tdb-page">
      <div className="tdb-inner">
        <div className="tdb-head">
          <div>
            <h1 className="tdb-title">Veille juridique</h1>
            <p className="tdb-subtitle">
              Responsable : {RESPONSABLE.prenom} {RESPONSABLE.nom} · {RESPONSABLE.email}
              {dateFetch && <span className="tdb-fetch-date"> · Dernière sync RSS : {dateFetch.toLocaleDateString('fr-FR')}</span>}
            </p>
          </div>
          <div className="tdb-head-actions">
            {syncArticles === 'loading' && <span className="sync-status sync-saving">⏳ Récupération RSS…</span>}
            {syncArticles === 'ok'      && <span className="sync-status sync-ok">✓ Articles mis à jour</span>}
            {syncArticles === 'error'   && <span className="sync-status sync-error">⚠️ Erreur RSS</span>}
            {syncStatus === 'saving' && <span className="sync-status sync-saving">⏳ Enregistrement…</span>}
            {syncStatus === 'ok'     && <span className="sync-status sync-ok">✓ Enregistré</span>}
            {syncStatus === 'error'  && <span className="sync-status sync-error">⚠️ Échec de l'enregistrement</span>}
            <button className="btn-add-article" onClick={() => setShowModaleAjout(true)} title="Ajouter un article manuellement">
              + Article
            </button>
            <button className="btn-sync-rss" onClick={handleSync} title="Récupérer les nouveaux articles">
              ↻ Actualiser les articles
            </button>
            <button className="btn-sauvegarder" onClick={handleSauvegarder} title="Sauvegarder toutes les traces en JSON">
              ↓ Sauvegarder
            </button>
            <label className="btn-restaurer" title="Restaurer depuis une sauvegarde JSON">
              ↑ Restaurer
              <input type="file" accept=".json" onChange={handleRestaurer} style={{ display: 'none' }} />
            </label>
            <button className="btn-export" onClick={handleExport} title="Exporter le registre Qualiopi en CSV">
              ↓ Registre CSV
            </button>
            <button className="btn-export btn-export-pdf" onClick={() => exportRegistrePDF(traitements)} title="Exporter le registre Qualiopi en PDF imprimable">
              ↓ Registre PDF
            </button>
          </div>
        </div>

        {/* Bannière de rappel sauvegarde */}
        {banniereVisible && (
          <div className="banniere-backup">
            <span>⚠️ Tu n'as pas sauvegardé depuis plus de 24h — clique sur <strong>↓ Sauvegarder</strong> pour protéger ton travail.</span>
            <button className="banniere-close" onClick={() => setBanniereVisible(false)}>✕</button>
          </div>
        )}

        {/* Articles saisis à la main restés sur ce poste. Ils ne sont pas perdus,
            mais l'équipe ne les voit pas — et ce sont souvent les sources sans
            flux RSS, donc les plus utiles. */}
        {(() => {
          const locaux = articlesManuels.filter(estArticleLocal)
          if (locaux.length === 0) return null
          const pluriel = locaux.length > 1
          return (
            <div className="banniere-backup">
              <span>
                📍 {locaux.length} article{pluriel ? 's' : ''} ajouté{pluriel ? 's' : ''} à la main
                n'existe{pluriel ? 'nt' : ''} que sur ce poste : l'équipe ne {pluriel ? 'les' : 'le'} voit pas,
                et un nettoyage du navigateur {pluriel ? 'les' : 'l\''}effacerait.
              </span>
              <button className="btn-anciens" onClick={handlePublierLocaux}>
                Publier pour l'équipe
              </button>
            </div>
          )
        })()}

        {/* Statistiques */}
        <div className="stats-grid">

          <div className="stat-card"><span className="stat-val">{stats.total}</span><span className="stat-lbl">Articles reçus</span></div>
          <div className="stat-card stat-ok"><span className="stat-val">{stats.traites}</span><span className="stat-lbl">Traités</span></div>
          <div className="stat-card stat-vert"><span className="stat-val">{stats.diffuses}</span><span className="stat-lbl">Diffusés</span></div>
          <div className="stat-card stat-warn" title="Articles pertinents qui attendent une décision. Les articles hors périmètre n'y sont pas comptés.">
            <span className="stat-val">{stats.enAttente}</span><span className="stat-lbl">En attente</span>
          </div>
          <div className="stat-card stat-neutre" title="Écartés par le classement : conservés, consultables et traitables dans l'onglet « Hors périmètre ».">
            <span className="stat-val">{stats.hors}</span><span className="stat-lbl">Hors périmètre</span>
          </div>
        </div>

        {/* Onglets */}
        <div className="tdb-onglets">
          <button className={`onglet-btn ${onglet === 'veille' ? 'actif' : ''}`} onClick={() => setOnglet('veille')}>Veille à traiter</button>
          <button className={`onglet-btn ${onglet === 'registre' ? 'actif' : ''}`} onClick={() => setOnglet('registre')}>Registre des traces</button>
          <button className={`onglet-btn ${onglet === 'formateurs' ? 'actif' : ''}`} onClick={() => setOnglet('formateurs')}>Formateurs</button>
        </div>

        {/* Veille à traiter */}
        {onglet === 'veille' && (
          <div>
            {/* Onglets de catégorie : la veille se présente en audit indicateur
                par indicateur, elle se trie donc de la même façon à l'écran. */}
            <div className="cat-onglets">
              {CATEGORIES.map(c => {
                const couleur = INDICATEURS[c.id]?.color
                const actif = categorie === c.id
                return (
                  <button
                    key={c.id}
                    className={`cat-btn ${actif ? 'actif' : ''} ${c.id === 'hors' ? 'cat-btn--hors' : ''}`}
                    style={actif && couleur ? { background: couleur, borderColor: couleur, color: '#fff' } : undefined}
                    onClick={() => setCategorie(c.id)}
                    title={c.aide}
                  >
                    {INDICATEURS[c.id] ? `${c.id} · ${c.libelle}` : c.libelle}
                    <span className="cat-compte">{comptes[c.id] ?? 0}</span>
                  </button>
                )
              })}
            </div>

            {categorie === 'hors' && (
              <p className="registre-aide">
                Ces articles ont été écartés du traitement, <strong>pas supprimés</strong> : le motif
                est indiqué sur chaque ligne. Si l'un d'eux compte, traite-le normalement — il
                rejoindra aussitôt l'indicateur que tu choisis. Les règles de tri se corrigent dans
                <code> classement-veille.js</code>.
              </p>
            )}
            {categorie === 'a-qualifier' && comptes['a-qualifier'] > 0 && (
              <p className="registre-aide">
                Ces articles comptent comme pertinents mais ne sont rattachés à <strong>aucun
                indicateur</strong> : ils n'apparaissent donc dans aucun registre, et un auditeur ne
                peut pas les compter. Ce sont surtout les traces d'avant l'arrivée du champ « type de
                veille ». Ouvre-les et choisis 23, 24 ou 25 — ils rejoindront l'onglet correspondant.
              </p>
            )}
            {['23', '24', '25'].includes(categorie) && comptes[categorie] === 0 && (
              <p className="registre-aide">
                Aucun article ici pour l'instant. Si cet onglet reste vide semaine après semaine,
                ce ne sont pas les règles de tri qu'il faut revoir mais les <strong>sources</strong> :
                un indicateur sans matière est un indicateur sans preuve en audit.
              </p>
            )}

            <div className="filtre-statut">
              {[
                { id: 'tous', label: 'Tous' },
                { id: 'en-attente', label: '⏳ En attente' },
                { id: 'diffuser', label: '📢 Diffusé' },
                { id: 'archiver', label: '📁 Archivé' },
                { id: 'noter', label: '📝 Note interne' },
              ].map(f => (
                <button
                  key={f.id}
                  className={`filtre-btn ${filtreStatut === f.id ? 'actif' : ''}`}
                  onClick={() => setFiltreStatut(f.id)}
                >
                  {f.label}
                </button>
              ))}
              <label className="seuil-masquage">
                Proposer l'archivage au-delà de :
                <select
                  className="seuil-select"
                  value={seuilMasquage}
                  onChange={e => changerSeuil(parseInt(e.target.value, 10))}
                  title="Les articles déjà traités ne sont jamais proposés à l'archivage, quel que soit ce réglage."
                >
                  {SEUILS_MASQUAGE.map(j => (
                    <option key={j} value={j}>{libelleSeuil(j)}</option>
                  ))}
                </select>
              </label>
            </div>

            {(() => {
              // Candidats : non traités, non déjà archivés, au-delà du seuil.
              const candidats = seuilMasquage === 0 ? [] : tousArticles.filter(a => {
                if (getTraitement(a.id)) return false
                if (archives.some(x => x.id === a.id)) return false
                const age = ageEnJours(a.date)
                return age !== null && age > seuilMasquage
              })
              if (candidats.length === 0 && archives.length === 0) return null
              return (
                <div className="anciens-masques">
                  <span>
                    {candidats.length > 0 ? (
                      <>
                        <strong>{candidats.length}</strong> article{candidats.length > 1 ? 's' : ''} non
                        traité{candidats.length > 1 ? 's' : ''} de plus de {seuilMasquage} jours
                      </>
                    ) : (
                      <>Aucun article à archiver au seuil actuel</>
                    )}
                    {archives.length > 0 && (
                      <> · <strong>{archives.length}</strong> en archive</>
                    )}
                  </span>
                  <span className="anciens-actions">
                    {candidats.length > 0 && !voirArchives && (
                      <button
                        className="btn-anciens"
                        disabled={archivageEnCours}
                        onClick={() => archiverAnciens(candidats)}
                      >
                        {archivageEnCours ? 'Archivage…' : `Archiver ces ${candidats.length} articles`}
                      </button>
                    )}
                    {archives.length > 0 && (
                      <button className="btn-anciens" onClick={() => setVoirArchives(v => !v)}>
                        {voirArchives ? '← Revenir à la liste' : `Consulter l'archive (${archives.length})`}
                      </button>
                    )}
                  </span>
                </div>
              )
            })()}

          <div className="tdb-table-wrap">
            <table className="tdb-table">
              <thead>
                <tr>
                  <th>Source</th><th>Date</th><th>Titre</th><th>Type de veille</th><th>Niveau</th><th>Statut</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...tousArticles].sort((a, b) => new Date(b.date) - new Date(a.date)).filter(article => {
                  const trace = getTraitement(article.id)
                  // Un article archivé sort de la liste à traiter, sauf si l'on
                  // consulte justement les archives.
                  const estArchive = archives.some(x => x.id === article.id)
                  if (estArchive !== voirArchives) return false
                  const r = rangement(article, trace)
                  if (categorie === 'hors') { if (r.pertinent) return false }
                  else if (!r.pertinent) return false
                  else if (categorie === 'a-qualifier') { if (r.indicateur) return false }
                  else if (categorie !== 'a-traiter' && r.indicateur !== categorie) return false
                  if (filtreStatut === 'tous') return true
                  if (filtreStatut === 'en-attente') return !trace
                  return trace?.decision === filtreStatut
                }).map(article => {
                  const source = SOURCES.find(s => s.id === article.source_id)
                  const nomSource = article.manuel ? (article.source_nom || 'Source externe') : (source?.nom || article.source_id)
                  const trace = getTraitement(article.id)
                  const decision = trace ? DECISIONS[trace.decision] : null
                  const lien = trace?.urlArticle || article.url
                  const r = rangement(article, trace)
                  const ind = INDICATEURS[r.indicateur]
                  return (
                    <tr key={article.id} className={`${trace ? 'ligne-traitee' : ''} ${article.manuel ? 'ligne-manuelle' : ''}`}>
                      <td className="td-source">
                        {nomSource}
                        {article.manuel && (
                          <span
                            className="badge-manuel"
                            title={estArticleLocal(article)
                              ? 'Saisi à la main et encore présent sur ce seul poste — à publier pour l\'équipe.'
                              : `Saisi à la main${article.ajoutePar ? ` par ${article.ajoutePar}` : ''}, partagé avec l'équipe.`}
                          >
                            {estArticleLocal(article) ? 'Manuel · local' : 'Manuel'}
                          </span>
                        )}
                      </td>
                      <td className="td-date">{new Date(article.date).toLocaleDateString('fr-FR')}</td>
                      <td className="td-titre"><a href={lien} target="_blank" rel="noopener noreferrer" className="lien-titre">{article.titre}</a></td>
                      {/* Type de veille. Le titre de survol porte les termes qui
                          ont décidé du classement : une règle doit pouvoir être
                          contestée sans ouvrir le code. */}
                      <td>
                        {ind ? (
                          <span
                            className="indicateur-badge"
                            style={{ background: ind.color }}
                            title={[
                              `Indicateur ${r.indicateur} — ${ind.label}`,
                              trace?.indicateur ? 'Choisi par la personne qui a traité l\'article.' : `Proposé automatiquement — ${CONFIANCES[r.confiance].label.toLowerCase()}.`,
                              r.motifs.length ? `Termes retenus : ${r.motifs.join(', ')}` : '',
                            ].filter(Boolean).join('\n')}
                          >
                            {r.indicateur} · {ind.court}
                            {!trace?.indicateur && CONFIANCES[r.confiance].marque}
                          </span>
                        ) : r.pertinent ? (
                          <span className="indicateur-badge vide" title="Pertinent mais non rattaché : à qualifier au traitement.">à qualifier</span>
                        ) : (
                          <span className="td-motif" title="Motif du classement hors périmètre. Traiter l'article le fait revenir dans la liste.">{r.motif}</span>
                        )}
                      </td>
                      <td><span className={`niveau-badge niveau-${article.niveau}`}>{NIVEAUX[article.niveau].label}</span></td>
                      <td>
                        {decision
                          ? <span className="trace-badge" style={{ color: decision.color }}>{decision.icon} {decision.label}</span>
                          : <span className="trace-badge en-attente">⏳ En attente</span>
                        }
                      </td>
                      <td className="td-actions">
                        <button className="btn-traiter" onClick={() => setModaleArticle(article)}>
                          {trace ? 'Modifier' : 'Traiter'}
                        </button>
                        {voirArchives && (
                          <button
                            className="btn-anciens"
                            style={{ marginLeft: 4 }}
                            title="Remettre cet article dans la liste à traiter"
                            onClick={() => desarchiverArticle(article.id).catch(e => alert(e.message))}
                          >
                            ↩ Désarchiver
                          </button>
                        )}
                        {article.manuel && (
                          <button className="btn-suppr" onClick={() => handleDeleteArticleManuel(article.id)} title="Supprimer">✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* Registre des traces */}
        {onglet === 'registre' && (() => {
          const compte = compterParIndicateur(traitements)
          const vue = filtrerParIndicateur(traitements, filtreIndicateur)
          const onglets = [
            { id: 'tous', libelle: 'Toutes les traces' },
            ...INDICATEURS_IDS.map(id => ({ id, libelle: `Ind. ${id} · ${INDICATEURS[id].court}` })),
            { id: 'non_qualifie', libelle: 'À qualifier' },
          ]
          return (
            <div>
              {/* Un registre par indicateur : c'est sous cette forme que la preuve
                  se présente en audit, indicateur par indicateur. */}
              <div className="filtre-statut">
                {onglets.map(o => (
                  <button
                    key={o.id}
                    className={`filtre-btn ${filtreIndicateur === o.id ? 'actif' : ''}`}
                    onClick={() => setFiltreIndicateur(o.id)}
                  >
                    {o.libelle} ({compte[o.id] ?? 0})
                  </button>
                ))}
                {vue.length > 0 && (
                  <button
                    className="btn-export btn-export-pdf"
                    onClick={() => exportRegistrePDF(traitements, filtreIndicateur)}
                    title="Exporter cette vue en PDF, avec le rappel de l'objectif et de la preuve attendue"
                  >
                    📄 Exporter cette vue
                  </button>
                )}
              </div>

              {filtreIndicateur === 'non_qualifie' && compte.non_qualifie > 0 && (
                <p className="registre-aide">
                  Ces traces n'ont pas encore de rattachement 23/24/25. Elles restent valables,
                  mais ne remontent dans aucun registre d'indicateur. Utilise le bouton
                  « Qualifier » sur chaque ligne — inutile de repasser par l'onglet Veille,
                  l'article d'origine a pu en sortir sans que la trace soit perdue.
                </p>
              )}

              <div className="tdb-table-wrap">
                {vue.length === 0 ? (
                  <div className="registre-empty">
                    {traitements.length === 0
                      ? 'Aucun article traité pour l\'instant.'
                      : 'Aucune trace pour ce filtre.'}
                  </div>
                ) : (
                  <table className="tdb-table">
                    <thead>
                      <tr>
                        <th>Date</th><th>Ind.</th><th>Titre</th><th>Source</th><th>Impact / action menée</th><th>Décision</th><th>Traité par</th><th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...vue].sort((a, b) => new Date(b.traiteAt) - new Date(a.traiteAt)).map(t => {
                        const d = DECISIONS[t.decision]
                        const ind = t.indicateur ? INDICATEURS[t.indicateur] : null
                        return (
                          <tr key={t.id}>
                            <td className="td-date">{new Date(t.traiteAt).toLocaleDateString('fr-FR')}</td>
                            <td>
                              {ind
                                ? <span className="indicateur-badge" style={{ background: ind.color }} title={ind.label}>{t.indicateur}</span>
                                : <span className="indicateur-badge vide" title="Non rattaché à un indicateur">—</span>}
                            </td>
                            <td className="td-titre">{t.articleTitre}</td>
                            <td>{t.articleSource}</td>
                            <td className="td-commentaire">{t.impact || <em className="td-vide">non renseigné</em>}</td>
                            <td><span className="trace-badge" style={{ color: d?.color }}>{d?.icon} {d?.label}</span></td>
                            <td className="td-email">{t.traitePar}</td>
                            <td className="td-actions">
                              {/* La trace doit être modifiable ICI : l'article d'origine
                                  peut avoir été purgé de la liste Veille (rétention 90 j),
                                  alors que la trace, elle, est conservée. */}
                              <button
                                className="btn-traiter"
                                onClick={() => setModaleArticle({
                                  id: t.articleId,
                                  titre: t.articleTitre,
                                  source_id: t.articleSource,
                                  source_nom: t.articleSource,
                                  thematique: t.articleThematique,
                                  date: t.articleDate,
                                  url: t.urlArticle,
                                  manuel: true,
                                })}
                              >
                                {t.indicateur ? 'Modifier' : 'Qualifier'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )
        })()}

        {/* Formateurs */}
        {onglet === 'formateurs' && <GestionFormateurs />}

      </div>

      {modaleArticle && (
        <ModaleTraitement
          article={modaleArticle}
          onClose={() => setModaleArticle(null)}
          onSave={handleSaveTraitement}
        />
      )}

      {showModaleAjout && (
        <ModaleAjoutArticle
          onClose={() => setShowModaleAjout(false)}
          onSave={handleSaveArticleManuel}
        />
      )}
    </div>
  )
}

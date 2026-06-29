import { useState, useMemo, useEffect } from 'react'
import { SOURCES, NIVEAUX } from '../data/veille'
import { chargerArticles, getArticlesCache, getDateDerniereFetch, getArticlesManuels, saveArticleManuel, deleteArticleManuel } from '../data/articles-store'
import { getTraitements, getTraitement, enregistrerTraitement, DECISIONS, exportRegistreCSV, exportRegistrePDF } from '../data/traitement'
import { getFormateurs, addFormateur, updateFormateur, removeFormateur } from '../data/formateurs'
import { RESPONSABLE } from '../data/formateurs'
import { chargerDepuisGitHub, sauvegarderSurGitHub } from '../data/github-storage'
import './TableauDeBord.css'

// ── Modale de traitement ──────────────────────────────────────────────────────
function ModaleTraitement({ article, onClose, onSave }) {
  const source = article.manuel ? { nom: article.source_nom || 'Source externe' } : SOURCES.find(s => s.id === article.source_id)
  const trace = getTraitement(article.id)
  const [decision, setDecision] = useState(trace?.decision || '')
  const [commentaire, setCommentaire] = useState(trace?.commentaire || '')
  const [destinataires, setDestinataires] = useState(trace?.destinataires || [])
  const [urlArticle, setUrlArticle] = useState(trace?.urlArticle || '')
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
  const [banniereVisible, setBanniereVisible] = useState(() => shouldWarnBackup(getTraitements()))
  const [syncStatus, setSyncStatus] = useState(null) // null | 'saving' | 'ok' | 'error'
  const [syncArticles, setSyncArticles] = useState(null) // null | 'loading' | 'ok' | 'error'
  const dateFetch = getDateDerniereFetch()

  // Charger les articles RSS + traces GitHub au démarrage
  useEffect(() => {
    chargerArticles().then(data => { if (data?.length) setArticles(data) })
    chargerDepuisGitHub().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem('pls_traitements', JSON.stringify(data))
        setTraitements(data)
        setBanniereVisible(shouldWarnBackup(data))
      }
    })
  }, [])

  async function handleSync() {
    setSyncArticles('loading')
    try {
      const data = await chargerArticles()
      if (data?.length) { setArticles(data); setSyncArticles('ok') }
      else setSyncArticles('error')
      setTimeout(() => setSyncArticles(null), 3000)
    } catch {
      setSyncArticles('error')
      setTimeout(() => setSyncArticles(null), 3000)
    }
  }

  function handleSaveArticleManuel(form) {
    saveArticleManuel(form)
    setArticlesManuels(getArticlesManuels())
  }

  function handleDeleteArticleManuel(id) {
    if (!confirm('Supprimer cet article ?')) return
    deleteArticleManuel(id)
    setArticlesManuels(getArticlesManuels())
  }

  async function handleSaveTraitement(data) {
    enregistrerTraitement(data)
    const updated = getTraitements()
    setTraitements(updated)
    setBanniereVisible(shouldWarnBackup(updated))
    // Sauvegarde automatique sur GitHub à chaque modification
    setSyncStatus('saving')
    try {
      await sauvegarderSurGitHub(updated)
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
      await sauvegarderSurGitHub(traitements)
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
    const base = [...articles, ...articlesManuels]
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
    return [...base, ...orphelins]
  }, [articles, articlesManuels, traitements])

  const stats = useMemo(() => {
    const traitesIds = new Set(traitements.map(t => t.articleId))
    const articlesConnus = tousArticles.filter(a => !a.orphelin)
    const traites = articlesConnus.filter(a => traitesIds.has(a.id)).length
    return {
      total: articlesConnus.length,
      traites,
      diffuses: traitements.filter(t => t.decision === 'diffuser').length,
      enAttente: articlesConnus.length - traites,
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
            {syncStatus === 'saving' && <span className="sync-status sync-saving">⏳ Sync GitHub…</span>}
            {syncStatus === 'ok'     && <span className="sync-status sync-ok">✓ Sauvegardé sur GitHub</span>}
            {syncStatus === 'error'  && <span className="sync-status sync-error">⚠️ Erreur sync GitHub</span>}
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

        {/* Statistiques */}
        <div className="stats-grid">
          <div className="stat-card"><span className="stat-val">{stats.total}</span><span className="stat-lbl">Articles reçus</span></div>
          <div className="stat-card stat-ok"><span className="stat-val">{stats.traites}</span><span className="stat-lbl">Traités</span></div>
          <div className="stat-card stat-vert"><span className="stat-val">{stats.diffuses}</span><span className="stat-lbl">Diffusés</span></div>
          <div className="stat-card stat-warn"><span className="stat-val">{stats.enAttente}</span><span className="stat-lbl">En attente</span></div>
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
            </div>
          <div className="tdb-table-wrap">
            <table className="tdb-table">
              <thead>
                <tr>
                  <th>Source</th><th>Date</th><th>Titre</th><th>Thématique</th><th>Niveau</th><th>Statut</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...tousArticles].sort((a, b) => new Date(b.date) - new Date(a.date)).filter(article => {
                  if (filtreStatut === 'tous') return true
                  const trace = getTraitement(article.id)
                  if (filtreStatut === 'en-attente') return !trace
                  return trace?.decision === filtreStatut
                }).map(article => {
                  const source = SOURCES.find(s => s.id === article.source_id)
                  const nomSource = article.manuel ? (article.source_nom || 'Source externe') : (source?.nom || article.source_id)
                  const trace = getTraitement(article.id)
                  const decision = trace ? DECISIONS[trace.decision] : null
                  const lien = trace?.urlArticle || article.url
                  return (
                    <tr key={article.id} className={`${trace ? 'ligne-traitee' : ''} ${article.manuel ? 'ligne-manuelle' : ''}`}>
                      <td className="td-source">
                        {nomSource}
                        {article.manuel && <span className="badge-manuel">Manuel</span>}
                      </td>
                      <td className="td-date">{new Date(article.date).toLocaleDateString('fr-FR')}</td>
                      <td className="td-titre"><a href={lien} target="_blank" rel="noopener noreferrer" className="lien-titre">{article.titre}</a></td>
                      <td><span className={`thematique-badge thematique-${article.thematique}`}>{article.thematique}</span></td>
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
        {onglet === 'registre' && (
          <div className="tdb-table-wrap">
            {traitements.length === 0 ? (
              <div className="registre-empty">Aucun article traité pour l'instant.</div>
            ) : (
              <table className="tdb-table">
                <thead>
                  <tr>
                    <th>Date traitement</th><th>Titre</th><th>Source</th><th>Décision</th><th>Traité par</th><th>Destinataires</th><th>Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {[...traitements].sort((a, b) => new Date(b.traiteAt) - new Date(a.traiteAt)).map(t => {
                    const d = DECISIONS[t.decision]
                    return (
                      <tr key={t.id}>
                        <td className="td-date">{new Date(t.traiteAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="td-titre">{t.articleTitre}</td>
                        <td>{t.articleSource}</td>
                        <td><span className="trace-badge" style={{ color: d?.color }}>{d?.icon} {d?.label}</span></td>
                        <td className="td-email">{t.traitePar}</td>
                        <td className="td-dest">{t.destinataires.length > 0 ? `${t.destinataires.length} formateur(s)` : '—'}</td>
                        <td className="td-commentaire">{t.commentaire || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

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

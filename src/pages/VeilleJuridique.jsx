import { useState, useMemo } from 'react'
import { ARTICLES, SOURCES, THEMATIQUES, NIVEAUX } from '../data/veille'
import './VeilleJuridique.css'

function NiveauBadge({ niveau }) {
  const n = NIVEAUX[niveau]
  return <span className={`niveau-badge niveau-${niveau}`}>{n.label}</span>
}

function ThematiqueBadge({ thematique }) {
  return <span className={`thematique-badge thematique-${thematique}`}>{thematique}</span>
}

function ArticleCard({ article, onToggleLu }) {
  const source = SOURCES.find(s => s.id === article.source_id)
  return (
    <article className={`article-card ${article.lu ? 'article-lu' : ''}`}>
      <div className="article-header">
        <div className="article-badges">
          <NiveauBadge niveau={article.niveau} />
          <ThematiqueBadge thematique={article.thematique} />
        </div>
        <button
          className={`btn-lu ${article.lu ? 'btn-lu--actif' : ''}`}
          onClick={() => onToggleLu(article.id)}
          title={article.lu ? 'Marquer comme non lu' : 'Marquer comme lu'}
        >
          {article.lu ? '✓ Lu' : 'Marquer lu'}
        </button>
      </div>
      <h3 className="article-titre">{article.titre}</h3>
      <p className="article-resume">{article.resume}</p>
      <div className="article-footer">
        <span className="article-source">{source?.nom}</span>
        <span className="article-date">{new Date(article.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <a className="article-lien" href={article.url} target="_blank" rel="noopener noreferrer">Lire l'article →</a>
      </div>
    </article>
  )
}

function Alertes({ articles }) {
  const urgents = articles.filter(a => a.niveau === 'urgent' && !a.lu)
  if (!urgents.length) return null
  return (
    <div className="alertes-banner">
      <span className="alertes-icon">⚡</span>
      <span className="alertes-count">{urgents.length} alerte{urgents.length > 1 ? 's' : ''} urgente{urgents.length > 1 ? 's' : ''}</span>
      <div className="alertes-list">
        {urgents.map(a => (
          <span key={a.id} className="alerte-item">{a.titre}</span>
        ))}
      </div>
    </div>
  )
}

function SourcesPanel() {
  return (
    <div className="sources-panel">
      <h3 className="sources-titre">Sources surveillées</h3>
      <ul className="sources-list">
        {SOURCES.map(s => (
          <li key={s.id} className="source-item">
            <span className={`source-dot thematique-${s.thematique}`} />
            <div className="source-info">
              <span className="source-nom">{s.nom}</span>
              <span className={`source-badge ${s.fiabilite}`}>{s.fiabilite}</span>
            </div>
            <span className="source-rss" title={s.rss ? 'Flux RSS actif' : s.api ? 'Via API' : 'Newsletter'}>
              {s.rss ? '📡 RSS' : s.api ? '🔌 API' : '📧 Newsletter'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function VeilleJuridique() {
  const [thematique, setThematique] = useState('tous')
  const [niveau, setNiveau] = useState('tous')
  const [afficherLus, setAfficherLus] = useState(false)
  const [articles, setArticles] = useState(ARTICLES)

  const toggleLu = (id) => {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, lu: !a.lu } : a))
  }

  const articlesFiltres = useMemo(() => {
    return articles
      .filter(a => thematique === 'tous' || a.thematique === thematique)
      .filter(a => niveau === 'tous' || a.niveau === niveau)
      .filter(a => afficherLus ? true : !a.lu)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [articles, thematique, niveau, afficherLus])

  const nonLus = articles.filter(a => !a.lu).length

  return (
    <div className="veille-page">
      <div className="veille-inner">

        <div className="veille-head">
          <div>
            <h1 className="veille-title">Veille juridique</h1>
            <p className="veille-subtitle">Qualiopi · RGPD · OPCO · Législatif — {nonLus} non lu{nonLus > 1 ? 's' : ''}</p>
          </div>
          <button className="btn-sync" title="Synchroniser les sources">
            ↻ Synchroniser
          </button>
        </div>

        <Alertes articles={articles} />

        <div className="veille-body">
          <aside className="veille-sidebar">
            <div className="filtres">
              <h3 className="filtres-titre">Thématique</h3>
              <div className="filtres-list">
                {THEMATIQUES.map(t => (
                  <button
                    key={t.id}
                    className={`filtre-btn ${thematique === t.id ? 'actif' : ''}`}
                    onClick={() => setThematique(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <h3 className="filtres-titre">Niveau</h3>
              <div className="filtres-list">
                <button className={`filtre-btn ${niveau === 'tous' ? 'actif' : ''}`} onClick={() => setNiveau('tous')}>Tous</button>
                {Object.entries(NIVEAUX).map(([k, v]) => (
                  <button key={k} className={`filtre-btn filtre-niveau filtre-niveau--${k} ${niveau === k ? 'actif' : ''}`} onClick={() => setNiveau(k)}>
                    {v.label}
                  </button>
                ))}
              </div>

              <label className="filtre-toggle">
                <input type="checkbox" checked={afficherLus} onChange={e => setAfficherLus(e.target.checked)} />
                Afficher les articles lus
              </label>
            </div>

            <SourcesPanel />
          </aside>

          <div className="veille-content">
            {articlesFiltres.length === 0 ? (
              <div className="veille-empty">
                <p>Aucun article ne correspond aux filtres sélectionnés.</p>
              </div>
            ) : (
              <div className="articles-list">
                {articlesFiltres.map(a => (
                  <ArticleCard key={a.id} article={a} onToggleLu={toggleLu} />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

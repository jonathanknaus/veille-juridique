import { useMemo } from 'react'
import { ARTICLES, SOURCES, NIVEAUX, THEMATIQUES } from '../data/veille'
import { getTraitements, DECISIONS } from '../data/traitement'
import './VeilleFormateur.css'

export default function VeilleFormateur() {
  const traitements = getTraitements()

  const articlesDiffuses = useMemo(() => {
    const diffuses = new Set(
      traitements.filter(t => t.decision === 'diffuser').map(t => t.articleId)
    )
    return ARTICLES
      .filter(a => diffuses.has(a.id))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [traitements])

  return (
    <div className="vf-page">
      <div className="vf-inner">
        <div className="vf-head">
          <h1 className="vf-title">Veille juridique</h1>
          <p className="vf-subtitle">{articlesDiffuses.length} article{articlesDiffuses.length > 1 ? 's' : ''} diffusé{articlesDiffuses.length > 1 ? 's' : ''} par l'équipe de formation</p>
        </div>

        {articlesDiffuses.length === 0 ? (
          <div className="vf-empty">
            <p>Aucun article n'a encore été diffusé.</p>
            <p>La responsable de traitement publiera les informations pertinentes ici.</p>
          </div>
        ) : (
          <div className="vf-articles">
            {articlesDiffuses.map(article => {
              const source = SOURCES.find(s => s.id === article.source_id)
              const trace = traitements.find(t => t.articleId === article.id)
              return (
                <article key={article.id} className="vf-card">
                  <div className="vf-card-header">
                    <div className="vf-badges">
                      <span className={`niveau-badge niveau-${article.niveau}`}>{NIVEAUX[article.niveau].label}</span>
                      <span className={`thematique-badge thematique-${article.thematique}`}>{article.thematique}</span>
                    </div>
                    <span className="vf-diffuse-badge">📢 Diffusé</span>
                  </div>
                  <h2 className="vf-titre"><a href={article.url} target="_blank" rel="noopener noreferrer" className="lien-titre">{article.titre}</a></h2>
                  <p className="vf-resume">{article.resume}</p>
                  <div className="vf-note">
                    <span className="vf-note-label">Message de la responsable</span>
                    <p>{trace?.commentaire || <em>Aucun message complémentaire.</em>}</p>
                  </div>
                  <div className="vf-footer">
                    <span className="vf-source">{source?.nom}</span>
                    <span className="vf-date">{new Date(article.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <a className="vf-lien" href={article.url} target="_blank" rel="noopener noreferrer">Lire l'article →</a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

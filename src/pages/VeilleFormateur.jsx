import { useState, useEffect, useMemo } from 'react'
import { SOURCES, NIVEAUX } from '../data/veille'
import { chargerArticles, getArticlesCache } from '../data/articles-store'
import { getTraitements, DECISIONS } from '../data/traitement'
import { ecouterTraces } from '../data/veille-storage'
import { getArticlesManuels, ecouterArticlesManuels } from '../data/articles-store'
import './VeilleFormateur.css'

export default function VeilleFormateur() {
  const [articles, setArticles] = useState(getArticlesCache())
  const [articlesManuels, setArticlesManuels] = useState(getArticlesManuels())
  // Les traces viennent de Firebase, pas du localStorage.
  //
  // Cette page lisait getTraitements(), c'est-à-dire le stockage local du
  // navigateur. Dans celui d'un formateur il est vide : la page affichait donc
  // « Aucun article n'a encore été diffusé », toujours, quoi qu'on diffuse. Les
  // articles diffusés n'étaient visibles que sur le poste de qui les avait
  // traités. La diffusion n'atteignait personne.
  const [traitements, setTraitements] = useState(getTraitements())

  useEffect(() => {
    chargerArticles().then(data => { if (data?.length) setArticles(data) })
    const stop = ecouterTraces(
      data => { if (Array.isArray(data)) setTraitements(data) },
      () => {}, // registre inaccessible : on garde ce qu'on a en cache
    )
    const stopManuels = ecouterArticlesManuels(setArticlesManuels, () => {})
    return () => { stop(); stopManuels() }
  }, [])

  const articlesDiffuses = useMemo(() => {
    const diffuses = new Set(
      traitements.filter(t => t.decision === 'diffuser').map(t => t.articleId)
    )
    // Les articles saisis à la main comptent autant : c'est par eux qu'arrivent
    // Légifrance et la Caisse des Dépôts, qui n'ont pas de flux RSS.
    return [...articles, ...articlesManuels]
      .filter(a => diffuses.has(a.id))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [articles, articlesManuels, traitements])

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
              const lien = trace?.urlArticle || article.url
              return (
                <article key={article.id} className="vf-card">
                  <div className="vf-card-header">
                    <div className="vf-badges">
                      <span className={`niveau-badge niveau-${article.niveau}`}>{NIVEAUX[article.niveau].label}</span>
                      <span className={`thematique-badge thematique-${article.thematique}`}>{article.thematique}</span>
                    </div>
                    <span className="vf-diffuse-badge">📢 Diffusé</span>
                  </div>
                  <h2 className="vf-titre"><a href={lien} target="_blank" rel="noopener noreferrer" className="lien-titre">{article.titre}</a></h2>
                  <p className="vf-resume">{article.resume}</p>
                  <div className="vf-note">
                    <span className="vf-note-label">Message de la responsable</span>
                    <p>{trace?.commentaire || <em>Aucun message complémentaire.</em>}</p>
                  </div>
                  <div className="vf-footer">
                    <span className="vf-source">{source?.nom || article.source_nom || 'Source externe'}</span>
                    <span className="vf-date">{new Date(article.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <a className="vf-lien" href={lien} target="_blank" rel="noopener noreferrer">Lire l'article →</a>
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

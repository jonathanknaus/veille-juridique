// Classement des articles de veille par indicateur Qualiopi : 23 (Légal),
// 24 (Métiers), 25 (Pédagogie).
//
// POURQUOI CE MODULE
//
// L'indicateur était jusqu'ici déduit de la SOURCE : tout ce qui venait de la
// CNIL en 23, tout Digiformag en 25. Une source ne dit rien du contenu — la
// CNIL publie l'ordre du jour de ses séances plénières comme ses règles sur les
// données des apprenants, et le ministère du Travail les risques liés aux grues
// à tour. Mesuré le 2026-10-06 sur le flux en place : 139 articles sur 174 sans
// aucun indicateur, et presque tout le reste en 23. Un registre d'indicateur 25
// vide ne prouve rien en audit.
//
// Le classement se fait donc sur le TITRE et le RÉSUMÉ, et il est recalculé à
// chaque affichage : corriger une règle ici requalifie tout l'historique sans
// attendre la synchro RSS du lundi et sans réécrire articles.json.
//
// DEUX DÉCISIONS À CONNAÎTRE AVANT DE LIRE LES RÈGLES
//
//  1. Un article n'est retenu que s'il touche NOTRE périmètre. L'indicateur 24
//     parle des « secteurs d'intervention » (texte vérifié sur Légifrance le
//     2026-10-06, décret n° 2026-728) : les nôtres sont les cabinets
//     d'expertise comptable, pas la formation professionnelle en général. Un
//     article sur la gestion des compétences chez Thales ne prouve rien pour
//     nous. Conséquence assumée : l'onglet Métiers est quasi vide avec les
//     sources actuelles — c'est un constat utile, pas un bug à masquer.
//
//  2. Ce qui est écarté n'est jamais supprimé : ça part dans « Hors périmètre »,
//     avec le motif du rejet, et ça reste traitable d'un clic. Un outil de
//     preuve ne doit pas faire disparaître silencieusement ce qu'il écarte.
//
// Le classement ne décide jamais à la place de la personne qui traite : il
// pré-sélectionne l'indicateur dans la modale. Une trace enregistrée porte
// l'indicateur choisi par l'humain, et lui seul fait foi dans le registre.

// Accents retirés des deux côtés : les titres arrivent de flux RSS dont
// l'encodage a déjà été abîmé par le passé (voir reparerAccents dans
// veille-storage.js), on ne peut pas faire reposer une règle sur un « é ».
function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // diacritiques
    .replace(/[’‘]/g, "'")
    .toLowerCase()
}

// Les acronymes courts (ia, bpf, tva, cfa…) sont cherchés entre frontières de
// mots : « ia » attraperait sinon « financiarisation », et « tva » « motvation ».
function present(texte, terme) {
  const t = normaliser(terme)
  if (t.length <= 4) return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(texte)
  return texte.includes(t)
}

// ── Ancres ───────────────────────────────────────────────────────────────────
//
// Un mot de droit (décret, contrôle, sanction…) ne vaut pour l'indicateur 23
// que s'il porte sur le champ de la formation professionnelle. Sans cette
// condition, « projet de loi sur l'égalité des rémunérations » finissait en
// veille réglementaire d'organisme de formation.
const ANCRES_FORMATION = [
  'formation', 'formations', 'formateur', 'apprenant', 'stagiaire',
  'organisme de formation', 'prestataire de formation', 'action de formation',
  'qualiopi', 'france competences', 'opco', 'cpf', 'certification professionnelle',
  'enseignement', 'afest', 'vae', 'bilan de competences', 'se former',
]

// Nos secteurs d'intervention : cabinets d'expertise comptable et finance
// d'entreprise. C'est ce périmètre que l'indicateur 24 exige de surveiller.
const ANCRES_NOS_SECTEURS = [
  'expert-comptable', 'experts-comptables', 'expertise comptable', 'comptable',
  'comptabilite', 'commissaire aux comptes', 'cabinet', 'cabinets',
  'profession comptable', 'fiscaliste', 'paie', 'facturation electronique',
  'facture electronique', 'tpe', 'pme', 'entrepreneur', 'entreprises clientes',
]

const ANCRES_PEDAGOGIE = [
  'formation', 'formations', 'pedagog', 'apprenant', 'apprentissage',
  'enseignement', 'former', 'se former', 'stagiaire', 'formateur', 'classe',
]

// ── Règles de score ──────────────────────────────────────────────────────────
//
// Chaque règle ajoute `poids` par terme trouvé. `avec` impose qu'au moins une
// ancre soit présente — c'est ce qui distingue « décret sur les organismes de
// formation » de « décret sur les grues à tour ».
//
// Les poids ne sont pas arbitraires : 5 = le terme suffit à qualifier
// (« qualiopi » n'est jamais ambigu), 3-4 = il faut une ancre, 2 = simple
// indice qui ne qualifie pas seul (seuil de rétention à 4).
//
// Les règles de poids 5 sont dites « autosuffisantes » : elles seules peuvent
// passer outre un rejet (voir SEUIL_OUTREPASSE_REJET).
const REGLES = [
  // ── 23 · Veille légale et réglementaire ────────────────────────────────────
  {
    indicateur: '23', poids: 5,
    pourquoi: 'termes propres au droit de la formation : ils ne sont jamais ambigus',
    termes: [
      'qualiopi', 'referentiel national', 'referentiel qualite', 'audit de surveillance',
      'bilan pedagogique et financier', 'bpf', "declaration d'activite",
      'r. 6352', 'l. 6316', 'd. 6316', 'r. 6316', 'l. 6313',
      'convention de formation', 'contrat de formation', 'reglement interieur',
      'sous-traitance', 'code du travail',
    ],
  },
  {
    indicateur: '23', poids: 5,
    pourquoi: 'un instrument juridique qui porte sur la formation',
    avec: ANCRES_FORMATION,
    termes: [
      'decret', 'arrete', 'ordonnance', 'circulaire', 'projet de loi',
      'proposition de loi', 'loi de finances', 'journal officiel',
      'juge administratif', 'conseil d\'etat', 'jurisprudence', 'legifrance',
    ],
  },
  {
    indicateur: '23', poids: 4,
    pourquoi: 'contrôle, fraude et sanction : le risque réglementaire de l\'OF',
    avec: ANCRES_FORMATION,
    termes: [
      'controle', 'fraude', 'sanction', 'mise en demeure', 'amende',
      'obligation', 'conformite', 'reglementation', 'cadre juridique',
      'redressement', 'taxation', 'contentieux', 'eligibilite',
    ],
  },
  {
    indicateur: '23', poids: 4,
    pourquoi: 'financement de la formation : les règles que nos clients subissent',
    termes: [
      'prise en charge', 'financement de la formation', 'niveaux de prise en charge',
      'fne-formation', 'abondement', 'opco', 'cpf', 'compte personnel de formation',
      'subrogation', 'regulation budgetaire',
    ],
  },
  {
    indicateur: '23', poids: 4,
    pourquoi: 'RGPD : seulement quand il touche les données que nous traitons',
    avec: ['formation', 'apprenant', 'stagiaire', 'enseignement', 'eleve',
      'etudiant', 'salarie', 'sous-traitant', 'dpo', 'registre des traitements'],
    termes: [
      'rgpd', 'donnees personnelles', 'protection des donnees', 'cnil',
      'violation de donnees', 'duree de conservation', 'base legale',
    ],
  },
  {
    indicateur: '23', poids: 3,
    pourquoi: 'accessibilité et référent handicap : obligation de l\'indicateur 26',
    avec: ANCRES_FORMATION,
    termes: ['referent handicap', 'accessibilite', 'accessible', 'handicap',
      'situation de handicap', 'adaptation', 'compensation'],
  },
  {
    indicateur: '23', poids: 2,
    pourquoi: 'indices faibles : ne qualifient pas seuls',
    termes: ['referentiel', 'indicateur', 'certificateur', 'habilitation', 'audit'],
  },

  // ── 24 · Veille métiers, compétences et emplois de NOS secteurs ────────────
  {
    indicateur: '24', poids: 5,
    pourquoi: 'le métier de nos stagiaires : cabinets d\'expertise comptable',
    termes: [
      'expert-comptable', 'experts-comptables', 'expertise comptable',
      'ordre des experts-comptables', 'commissaire aux comptes',
      'profession comptable', 'cabinet comptable', 'cabinets comptables',
      'collaborateur comptable', 'conseil superieur de l\'ordre',
    ],
  },
  {
    indicateur: '24', poids: 5,
    pourquoi: 'les sujets techniques qui font bouger le métier comptable',
    termes: [
      'facturation electronique', 'facture electronique', 'e-invoicing', 'factur-x',
      'plateforme de dematerialisation', 'portail public de facturation',
      'liasse fiscale', 'dgfip', 'tva', 'declaration sociale nominative', 'dsn',
      'bulletin de paie', 'revision comptable', 'cloture annuelle',
    ],
  },
  {
    indicateur: '24', poids: 4,
    pourquoi: 'évolution des compétences et des métiers, rattachée à nos secteurs',
    avec: ANCRES_NOS_SECTEURS,
    termes: [
      'metiers emergents', 'observatoire des metiers', 'observatoire prospectif',
      'evolution des metiers', 'evolution des competences', 'gpec',
      'referentiel de competences', 'competences de demain', 'penurie',
      'attractivite', 'recrutement', 'reconversion', 'transformation du metier',
      'automatisation', 'intelligence artificielle',
    ],
  },
  {
    indicateur: '24', poids: 4,
    pourquoi: 'France Compétences sur les métiers : matière directe de l\'indicateur 24',
    termes: ['metiers emergents', 'metiers en particuliere evolution', 'passeport de competences'],
  },

  // ── 25 · Veille sur les innovations pédagogiques et technologiques ─────────
  {
    indicateur: '25', poids: 5,
    pourquoi: 'ingénierie et modalités pédagogiques : le cœur de l\'indicateur 25',
    termes: [
      'ingenierie pedagogique', 'innovation pedagogique', 'innovations pedagogiques',
      'e-learning', 'elearning', 'digital learning', 'mobile learning',
      'micro-learning', 'microlearning', 'adaptive learning', 'blended',
      'classe virtuelle', 'classe inversee', 'serious game', 'gamification',
      'ludopedagogie', 'neurosciences', 'realite virtuelle', 'immersif',
      'edtech', 'lms', 'foad', 'formation a distance', 'afest',
      'outil auteur', 'scenario pedagogique', 'modalites pedagogiques',
    ],
  },
  {
    // Poids 5 assumé : « l'IA appliquée à la formation » est la matière même de
    // l'indicateur 25 aujourd'hui. Sans ça, un article sur les usages de l'IA
    // par les formateurs finissait en 23 parce qu'il contenait « conformité ».
    indicateur: '25', poids: 5,
    pourquoi: 'l\'IA appliquée à la formation, pas l\'IA en général',
    avec: ANCRES_PEDAGOGIE,
    termes: [
      'intelligence artificielle', 'ia generative', 'ia agentique', 'ia',
      'chatgpt', 'copilot', 'algorithme',
    ],
  },
  {
    indicateur: '25', poids: 4,
    pourquoi: 'animation, engagement et évaluation des acquis',
    avec: ANCRES_PEDAGOGIE,
    termes: [
      'engagement des apprenants', 'evaluation des acquis', 'positionnement',
      'tutorat', 'intelligence collective', 'apprentissage par', 'webinaire',
      'plateforme', 'outil collaboratif', 'simulateur', 'mooc',
    ],
  },
  {
    indicateur: '25', poids: 3,
    pourquoi: 'le distanciel : modalité, sauf quand le droit s\'en mêle (voir 23)',
    avec: ANCRES_PEDAGOGIE,
    termes: ['a distance', 'distanciel', 'hybride', 'presentiel', 'visioconference'],
  },
  {
    indicateur: '25', poids: 2,
    pourquoi: 'indices faibles',
    termes: ['pedagogique', 'pedagogie', 'numerique'],
  },
]

// ── Rejets ───────────────────────────────────────────────────────────────────
//
// Deux familles, distinguées à dessein : le BRUIT n'intéressera jamais personne,
// HORS_OFFRE est de la vraie veille formation mais pas la nôtre. La seconde se
// rouvre en commentant trois lignes le jour où l'offre AFS change — c'est un
// choix de périmètre, pas une erreur de classement.
const BRUIT = [
  {
    motif: 'vie interne de l\'institution',
    termes: ['ordre du jour', 'seance pleniere', 'agenda de', 'nomination',
      'nouveaux membres', 'college de la cnil', 'comite d\'histoire',
      'comite de deontologie', 'coordonnees des organisations',
      'resultats du concours', 'calendrier du concours', 'informations publiques'],
  },
  {
    motif: 'événement ou communication institutionnelle',
    termes: ['laureats', 'appel a projets', 'remise du prix', 'recoivent le',
      'signent une convention', 'convention de developpement', 'renforce son engagement',
      'devoilent les', 'participez aux', 'clap de fin', 'evenement', 'palmares',
      'assistez', 'journee de l', 'semaine de la', 'organisent une', 'mois europeen',
      'celebres'],
  },
  {
    motif: 'santé-sécurité au travail',
    termes: ['amiante', 'grue', 'appareils de levage', 'canicule', 'forte chaleur',
      'fortes chaleurs', 'incendie', 'risques professionnels', 'endometriose',
      'traite des etres humains', 'inspection du travail'],
  },
  {
    motif: 'droit social hors champ de la formation',
    termes: ['conge de paternite', 'conge de maternite', 'conge d\'adoption',
      'conge de mobilite', 'retraite', 'taux de chomage', 'chiffres du chomage',
      'representativite', 'conventions collectives', 'egalite des remunerations',
      'elections professionnelles', 'vote electronique'],
  },
  {
    motif: 'RGPD hors de nos traitements',
    termes: ['vehicules connectes', 'jeux d\'argent', 'geolocalisation',
      'applications mobiles', 'refus de credit', 'article de presse',
      'cybercriminalite', 'moissonnage', 'pixels', 'prospects et clients',
      'mineurs', 'cm2', 'eleves'],
  },
]

const HORS_OFFRE = [
  {
    // Termes volontairement précis : « apprenti » tout court est contenu dans
    // « apprentissage », qui veut aussi dire « le fait d'apprendre ». Avec le
    // terme nu, « L'intelligence collective, avenir de l'apprentissage » était
    // rejeté comme un article sur les CFA. « apprentissage : » attrape le titre
    // qui annonce le sujet, sans attraper la tournure de passage.
    motif: 'apprentissage et alternance — hors de notre offre',
    termes: ['apprenti ', 'apprentis', 'apprentissage :', 'contrat d\'apprentissage',
      'alternance', 'alternant', 'cfa', 'npec', 'taxe d\'apprentissage',
      'maitre d\'apprentissage', 'cprdfop'],
  },
  {
    motif: 'offre certifiante RNCP — nous ne sommes pas certificateur',
    termes: ['repertoires nationaux', 'rncp', 'repertoire specifique',
      'ingenierie de certification', 'organismes certificateurs'],
  },
  {
    motif: 'insertion et publics éloignés de l\'emploi — hors de notre offre',
    termes: ['insertion professionnelle', 'demandeur d\'emploi', 'esat',
      'mission locale', 'france travail', 'travail social', 'voie professionnelle',
      'agents publics', 'fonction publique', 'plan emploi'],
  },
  {
    motif: 'hors de nos secteurs d\'intervention',
    termes: ['sncf', 'thales', 'penitentiaire', 'soldats', 'armee', 'sante au travail'],
  },
]

// En dessous de ce score, le signal est trop mince pour qu'un auditeur y voie
// une veille : l'article part en « Hors périmètre », sans disparaître.
const SEUIL_RETENU = 4

// Un rejet peut être outrepassé, mais à deux conditions cumulées : un score
// élevé ET un terme autosuffisant. « Qualiopi : ce que le décret change pour les
// CFA » doit rester (qualiopi est autosuffisant) ; « Référentiel des niveaux de
// prise en charge des contrats d'apprentissage » doit partir, malgré son score
// de 14 — il n'est fait que de termes de financement, aucun ne nous désigne.
const SEUIL_OUTREPASSE_REJET = 10

export const CONFIANCES = {
  forte:   { label: 'Classement net',        marque: '' },
  moyenne: { label: 'Classement probable',   marque: '~' },
  faible:  { label: 'Signal faible — à confirmer', marque: '?' },
}

function chercherRejet(texte, familles) {
  for (const f of familles) {
    const touche = f.termes.find(t => present(texte, t))
    if (touche) return { motif: f.motif, terme: touche }
  }
  return null
}

// Les catégories du flux RSS comptent autant que le titre : « Réglementation »,
// « CPF », « Handicap », « IA » sont posées par l'éditeur lui-même, c'est le
// signal le plus fiable qu'on reçoive — et les titres de presse, eux, sont
// souvent allusifs (« Clap de fin pour le Quotidien de la formation »).
function texteAnalyse(article) {
  return `${texteSujet(article)} ${normaliser(article?.resume || '')}`
}

// Le SUJET de l'article : titre et catégories, sans le résumé.
//
// Le score se calcule sur tout le texte — plus de matière, meilleur le signal.
// Les REJETS, eux, ne regardent que le sujet : un rejet doit porter sur ce dont
// l'article parle, pas sur une mention de passage. « Handicap en formation : les
// limites de l'obligation de moyens » était écarté comme du droit social parce
// que son résumé citait le taux de chômage trois phrases plus loin.
function texteSujet(article) {
  const categories = Array.isArray(article?.categories) ? article.categories.join(' ') : ''
  return normaliser(`${article?.titre || ''} ${categories}`)
}

// Rend un verdict, jamais une décision : { indicateur, pertinent, confiance,
// motif, motifs, scores }. `motifs` liste les termes qui ont compté, pour que
// le classement soit vérifiable à l'écran et corrigeable ici.
export function classerArticle(article) {
  const texte = texteAnalyse(article)
  const scores = { 23: 0, 24: 0, 25: 0 }
  const motifs = { 23: [], 24: [], 25: [] }
  // Un terme autosuffisant ne compte comme tel que s'il est dans le SUJET.
  // Sinon le flux de l'Ordre des experts-comptables, qui recopie son gabarit
  // HTML dans chaque description, faisait passer « Assistez aux Palmarès de la
  // durabilité ! » pour de la veille métier : « experts-comptables » apparaissait
  // quatre fois dans le pied de page du résumé.
  const autosuffisant = { 23: false, 24: false, 25: false }

  for (const regle of REGLES) {
    if (regle.avec && !regle.avec.some(a => present(texte, a))) continue
    for (const terme of regle.termes) {
      if (!present(texte, terme)) continue
      scores[regle.indicateur] += regle.poids
      motifs[regle.indicateur].push(`${terme} (+${regle.poids})`)
      if (regle.poids >= 5 && present(texteSujet(article), terme)) {
        autosuffisant[regle.indicateur] = true
      }
    }
  }

  const classe = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [indicateur, score] = classe[0]
  const ecart = score - classe[1][1]

  const sujet = texteSujet(article)
  const rejet = chercherRejet(sujet, BRUIT) || chercherRejet(sujet, HORS_OFFRE)
  if (rejet && !(score >= SEUIL_OUTREPASSE_REJET && autosuffisant[indicateur])) {
    return {
      indicateur: '', pertinent: false, confiance: 'faible',
      motif: `${rejet.motif} (« ${rejet.terme} »)`,
      motifs: [], scores,
    }
  }
  if (score < SEUIL_RETENU) {
    return {
      indicateur: '', pertinent: false, confiance: 'faible',
      motif: score === 0
        ? 'rien ne rattache cet article à la veille 23 / 24 / 25'
        : 'signal trop faible pour tenir comme preuve de veille',
      motifs: motifs[indicateur], scores,
    }
  }

  const confiance = score >= 8 && ecart >= 3 ? 'forte' : score >= 5 ? 'moyenne' : 'faible'
  return { indicateur, pertinent: true, confiance, motif: '', motifs: motifs[indicateur], scores }
}

// Annote une liste sans la réordonner. `indicateur` est écrasé à dessein :
// la valeur venue d'articles.json était déduite de la source, celle-ci est
// déduite du contenu.
export function annoterArticles(articles) {
  return (articles || []).map(a => {
    const classement = classerArticle(a)
    return { ...a, indicateur: classement.indicateur, classement }
  })
}

export function compterParCategorie(articles) {
  const compte = { tous: articles.length, 23: 0, 24: 0, 25: 0, hors: 0 }
  for (const a of articles) {
    const c = a.classement || classerArticle(a)
    if (c.pertinent) compte[c.indicateur] += 1
    else compte.hors += 1
  }
  return compte
}

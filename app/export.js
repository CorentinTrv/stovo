// STOVO — Chantier C2 « les exports » : le module pur de fabrication des CSV
// =============================================================================
// Brique PURE et ISOLEE, sur le modele exact de pertes.js/pilotage.js :
// aucun acces au DOM, aucun acces a Supabase, AUCUN import. Tout ce dont
// elle a besoin lui est PASSE en parametre. C'est ce qui la rend testable
// hors navigateur, avec un simple `deno test`.
//
// Ce qu'elle fait : transformer des tableaux `produits` / `mouvements` deja
// charges en chaines de texte CSV pretes a etre telechargees.
//
// Ce qu'elle ne fait PAS, et c'est volontaire :
//   - elle ne parle jamais elle-meme a Supabase : lireToutesLesPages
//     (lot C2-2) orchestre la pagination mais delegue chaque requete reelle
//     a une fonction fournie par l'appelant (lot C2-3 pour le branchement
//     au bouton) ;
//   - elle n'ecrit rien, jamais ;
//   - elle ne pose pas le BOM UTF-8 : il est ajoute au moment de construire
//     le Blob (lot C2-3), pas ici. Sinon chaque assertion du banc devrait
//     commencer par un caractere invisible, nid a faux negatifs (plan §4).
//
// Regles non negociables (plan Architecte du 22/08/2026, §3.1) :
//   - separateur point-virgule, decimales a virgule, fins de ligne CRLF ;
//   - une valeur inconnue est une cellule VIDE, jamais 0, jamais NaN ;
//   - aucune reutilisation de fmtEuro/fmtNombre de dashboard.js : leurs
//     espaces insecables et leur symbole € sont faits pour un ecran, pas
//     pour une cellule de tableur. Le € ne vit que dans les en-tetes.
//   - le fuseau est un PARAMETRE (defaut 'Europe/Paris'), applique via
//     Intl.DateTimeFormat { timeZone } : verifie empiriquement (22/08/2026)
//     que le resultat ne depend PAS du fuseau systeme de la machine qui
//     execute le code.

// -----------------------------------------------------------------------
// Constantes exportees : mention legale et tables de correspondance
// -----------------------------------------------------------------------

// Mot pour mot (plan §3.2). Vit dans les DEUX fichiers, verifie par
// assertion pour qu'elle ne puisse jamais deriver au fil des retouches.
export const MENTION_LEGALE = "Valorisé au dernier prix d'achat, à retraiter par votre comptable";

// Liste blanche des motifs, ecrits en toutes lettres pour un lecteur qui
// n'est pas dans l'app (un comptable). Un motif absent de cette table est
// ecrit TEL QUEL (regle de justesse heritee de C1 : ne jamais masquer un
// motif inconnu en silence, cf. MOTIFS_PERTE de pertes.js).
export const LIBELLE_MOTIF_EXPORT = {
  inventaire: "Régularisation d'inventaire",
  casse: 'Casse',
  peremption: 'Péremption',
  vol: 'Vol',
  erreur: 'Correction',
};

// CHECK `mouvements.type` : 'entree' | 'sortie'.
export const LIBELLE_TYPE = {
  entree: 'Entrée',
  sortie: 'Sortie',
};

// CHECK `mouvements.source` : 'manuel' | 'vocal'.
export const LIBELLE_SOURCE = {
  vocal: 'Vocal',
  manuel: 'Manuel',
};

// -----------------------------------------------------------------------
// Petits helpers internes, non exportes
// -----------------------------------------------------------------------

// Nombre de decimales par famille de colonne, choisi d'apres le type
// Postgres reel de chaque colonne (voir cahier-logique-n8n.md et
// PROMPT_creer-produit) : stock_actuel/seuil_alerte sont `numeric` (donc
// potentiellement fractionnaires, ex. des kg), delai_repro_jours et
// mouvements.quantite sont `integer` (jamais de decimale).
const DEC_ARGENT = 2; // prix_achat, valeurs en euros
const DEC_QTE = 2;    // stock_actuel, seuil_alerte
const DEC_ENTIER = 0; // delai_repro_jours, quantite de mouvement

// Un prix est "connu" s'il est renseigne, y compris s'il vaut 0. Un
// produit offert a un prix d'achat de 0, ce n'est pas la meme chose qu'un
// produit dont on ignore le prix. Copie exacte de la regle de pertes.js.
const prixConnu = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// Un produit est actif sauf mention explicite du contraire. `actif` est
// une colonne NOT NULL en base, mais on reste defensif sur des fixtures
// de test incompletes plutot que de planter.
const estActif = (p) => p && p.actif !== false;

// Accord singulier/pluriel simple, copie de la convention deja en usage
// dans pertes.js/dashboard.js : 0 et 1 sont singuliers, 2+ sont pluriels.
const pluriel = (n) => (n > 1 ? 's' : '');

// Tri alphabetique insensible aux accents et a la casse (meme ordre que
// l'onglet Stock, plan §3.2).
const comparerNoms = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { sensitivity: 'base' });

// -----------------------------------------------------------------------
// Formateurs bruts, exportes
// -----------------------------------------------------------------------

/**
 * Echappe une valeur pour une cellule CSV (RFC 4180, separateur ';').
 * Un champ contenant ';', '"', un retour ligne ou commencant par une
 * espace est entoure de guillemets doubles, les guillemets internes etant
 * doubles. Une valeur absente devient une cellule vide, jamais "null".
 */
export function echapperCsv(valeur) {
  if (valeur === null || valeur === undefined) return '';
  const s = String(valeur);
  const doitEchapper = /[;"\n\r]/.test(s) || s.startsWith(' ');
  if (!doitEchapper) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Formate un nombre en decimales a virgule, sans separateur de milliers,
 * sans symbole monetaire. Une valeur inconnue (null/undefined/'', ou non
 * numerique) rend une cellule VIDE, jamais "0", jamais "NaN" (regle de
 * justesse n°2, heritee de C1). Le nombre de decimales est TOUJOURS fixe
 * (pas de troncature des zeros) : c'est la regle la plus simple qui ne
 * laisse aucune place a l'ambiguite entre "0" et "vide".
 */
export function formaterNombre(v, decimales = 2) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(decimales).replace('.', ',');
}

/**
 * Formate une date en JJ/MM/AAAA dans le fuseau donne. Le fuseau est un
 * PARAMETRE (defaut 'Europe/Paris'), jamais celui de la machine qui
 * execute le code : verifie empiriquement le 22/08/2026 que le resultat
 * est identique quel que soit le fuseau systeme.
 */
export function formaterDate(iso, fuseau = 'Europe/Paris') {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** Formate une heure en HH:MM (24h) dans le fuseau donne. */
export function formaterHeure(iso, fuseau = 'Europe/Paris') {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

// Date au format ISO (AAAA-MM-JJ), pour le nom de fichier uniquement.
// 'en-CA' est le detour connu pour obtenir directement l'ordre ISO d'un
// Intl.DateTimeFormat sans reassembler les champs a la main.
function formaterDateIso(maintenant, fuseau) {
  const d = new Date(maintenant);
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// -----------------------------------------------------------------------
// Fichier A : etat de stock valorise
// -----------------------------------------------------------------------

/**
 * Filtre le perimetre des LIGNES DE DONNEES de l'etat de stock (plan §3.2) :
 * produits actifs, PLUS produits desactives dont le stock n'est pas nul
 * (regle heritee du correctif C1 du 26/07 : oublier ces lignes fausserait
 * une valeur totale destinee a un bilan). EXPORTEE (revue du 22/08/2026,
 * lot C2-3) : dashboard.js en a besoin pour annoncer a l'ecran le nombre de
 * lignes reellement ecrites, SANS dupliquer ce filtre a la main — une seule
 * definition, utilisee des deux cotes.
 *
 * @param {Array} produits  Tolere null/undefined et des entrees null au
 *                          milieu du tableau.
 * @returns {Array} les produits retenus, dans le MEME ordre qu'en entree
 *                  (le tri alphabetique n'est applique qu'a l'affichage,
 *                  voir construireCsvStock ci-dessous).
 */
export function retenirProduitsExport(produits) {
  return (Array.isArray(produits) ? produits : [])
    .filter(Boolean)
    .filter((p) => estActif(p) || Number(p.stock_actuel ?? 0) !== 0);
}

/**
 * Construit le CSV de l'etat de stock valorise (plan §3.2, fichier A).
 * Perimetre : voir retenirProduitsExport ci-dessus.
 *
 * @param {object} args
 * @param {Array}  args.produits   Colonnes attendues : nom, unite,
 *                                 stock_actuel, seuil_alerte,
 *                                 delai_repro_jours, prix_achat, cree_le,
 *                                 actif. Tolere null/undefined.
 * @param {number|string} args.maintenant  Horodatage de reference (ms
 *                                 epoch ou ISO), injecte pour un banc
 *                                 deterministe.
 * @param {string} args.fuseau    Defaut 'Europe/Paris'.
 * @returns {string} le CSV complet, SANS BOM, fins de ligne CRLF.
 */
export function construireCsvStock({ produits, maintenant = Date.now(), fuseau = 'Europe/Paris' } = {}) {
  const retenus = retenirProduitsExport(produits);

  const nbActifs = retenus.filter(estActif).length;
  const nbDesactives = retenus.length - nbActifs;

  let valeurTotale = 0;
  let nbSansPrix = 0;
  for (const p of retenus) {
    const stock = Number(p.stock_actuel ?? 0);
    if (prixConnu(p.prix_achat)) valeurTotale += Number(p.prix_achat) * stock;
    else nbSansPrix++;
  }

  // Une seule table, un seul endroit : ajouter/retirer/reordonner une
  // colonne se fait ici et nulle part ailleurs (reserve du plan §3.2,
  // la liste des colonnes est provisoire tant que Corentin ne l'a pas
  // validee).
  const colonnes = [
    { entete: 'Produit', valeur: (p) => echapperCsv(p.nom) },
    { entete: 'Statut', valeur: (p) => echapperCsv(estActif(p) ? 'Actif' : 'Retiré du catalogue') },
    { entete: 'Stock actuel', valeur: (p) => formaterNombre(p.stock_actuel ?? 0, DEC_QTE) },
    { entete: 'Unité', valeur: (p) => echapperCsv(p.unite || '') },
    { entete: "Prix d'achat unitaire (€)", valeur: (p) => formaterNombre(p.prix_achat, DEC_ARGENT) },
    {
      entete: 'Valeur du stock (€)',
      valeur: (p) => (prixConnu(p.prix_achat) ? formaterNombre(Number(p.prix_achat) * Number(p.stock_actuel ?? 0), DEC_ARGENT) : ''),
    },
    { entete: "Seuil d'alerte", valeur: (p) => formaterNombre(p.seuil_alerte ?? 0, DEC_QTE) },
    { entete: 'Délai de réappro (jours)', valeur: (p) => formaterNombre(p.delai_repro_jours ?? 0, DEC_ENTIER) },
    { entete: 'Créé le', valeur: (p) => formaterDate(p.cree_le, fuseau) },
  ];

  const phraseLimite = nbDesactives === 0
    ? `Périmètre : ${nbActifs} produit${pluriel(nbActifs)} actif${pluriel(nbActifs)}`
    : `Périmètre : ${nbActifs} produit${pluriel(nbActifs)} actif${pluriel(nbActifs)}, et ${nbDesactives} produit${pluriel(nbDesactives)} retiré${pluriel(nbDesactives)} du catalogue ayant encore du stock`;

  // Elision francaise : "n'est" au singulier, "ne sont" au pluriel (piege
  // repere en ecrivant ce module, corrige avant meme le premier test).
  const verbeNegatif = nbSansPrix > 1 ? 'ne sont' : "n'est";
  const phraseValeur = nbSansPrix === 0
    ? `Valeur totale du stock : ${formaterNombre(valeurTotale, DEC_ARGENT)} €`
    : `Valeur totale du stock : ${formaterNombre(valeurTotale, DEC_ARGENT)} € (${nbSansPrix} produit${pluriel(nbSansPrix)} sans prix renseigné ${verbeNegatif} pas compté${pluriel(nbSansPrix)})`;

  const entete = [
    'Stovo, état de stock valorisé',
    `Exporté le ${formaterDate(maintenant, fuseau)} à ${formaterHeure(maintenant, fuseau)}`,
    phraseLimite,
    phraseValeur,
    MENTION_LEGALE,
  ];

  const lignesTriees = [...retenus].sort((a, b) => comparerNoms(a.nom, b.nom));
  const corps = lignesTriees.map((p) => colonnes.map((c) => c.valeur(p)).join(';'));
  const ligneEntetesColonnes = colonnes.map((c) => c.entete).join(';');

  return [...entete, '', ligneEntetesColonnes, ...corps].join('\r\n');
}

// -----------------------------------------------------------------------
// Fichier B : journal des mouvements
// -----------------------------------------------------------------------

/**
 * Filtre le perimetre des LIGNES DE DONNEES du journal des mouvements (plan
 * §3.2) : une entree null, ou dont la date est illisible, est ignoree
 * plutot que de produire une ligne fausse (meme prudence que
 * calculerDemarque de pertes.js). Ne TRIE PAS (voir construireCsvMouvements
 * ci-dessous, qui trie apres avoir filtre) : ce filtre ne porte que sur le
 * PERIMETRE des lignes retenues, pas sur leur ORDRE. EXPORTEE (revue du
 * 22/08/2026, lot C2-3), meme raison que retenirProduitsExport plus haut.
 *
 * @param {Array} mouvements  Tolere null/undefined et des entrees null.
 * @returns {Array} les mouvements retenus, dans leur ordre d'entree.
 */
export function retenirMouvementsExport(mouvements) {
  return (Array.isArray(mouvements) ? mouvements : [])
    .filter((m) => m && Number.isFinite(new Date(m.cree_le).getTime()));
}

/**
 * Construit le CSV du journal des mouvements (plan §3.2, fichier B).
 * Perimetre : voir retenirMouvementsExport ci-dessus. Tout l'historique,
 * trie du plus ancien au plus recent (inverse du tableau de bord,
 * volontaire : un journal se lit en chronologie).
 *
 * @param {object} args
 * @param {Array}  args.mouvements  Lignes attendues : cree_le, type,
 *                                  quantite, source, motif, produit_id,
 *                                  et la jointure `produits` (nom, unite,
 *                                  prix_achat). Tolere null/undefined.
 * @param {Array}  args.produits    Catalogue en repli, pour retrouver un
 *                                  prix quand la jointure ne le porte pas
 *                                  (meme pattern que pertes.js). Tolere
 *                                  null.
 * @param {number|string} args.maintenant
 * @param {string} args.fuseau
 * @returns {string} le CSV complet, SANS BOM, fins de ligne CRLF.
 */
export function construireCsvMouvements({ mouvements, produits, maintenant = Date.now(), fuseau = 'Europe/Paris' } = {}) {
  // Index des prix du catalogue, en repli de la jointure (comme pertes.js).
  const prixParId = new Map();
  (Array.isArray(produits) ? produits : []).forEach((p) => {
    if (p && p.id !== undefined) prixParId.set(p.id, p.prix_achat);
  });

  // Perimetre : voir retenirMouvementsExport ci-dessus. Le tri (plus ancien
  // au plus recent) reste ICI, apres le filtre : il concerne l'ORDRE
  // d'affichage, pas le PERIMETRE des lignes retenues.
  const valides = retenirMouvementsExport(mouvements)
    .sort((a, b) => new Date(a.cree_le).getTime() - new Date(b.cree_le).getTime());

  // Une seule table, un seul endroit : voir la meme remarque sur
  // construireCsvStock.
  const colonnes = [
    { entete: 'Date', valeur: (m) => formaterDate(m.cree_le, fuseau) },
    { entete: 'Heure', valeur: (m) => formaterHeure(m.cree_le, fuseau) },
    { entete: 'Produit', valeur: (m) => echapperCsv((m.produits && m.produits.nom) || '(produit supprimé)') },
    { entete: 'Type', valeur: (m) => echapperCsv(LIBELLE_TYPE[m.type] ?? m.type ?? '') },
    { entete: 'Quantité', valeur: (m) => formaterNombre(m.quantite, DEC_ENTIER) },
    { entete: 'Unité', valeur: (m) => echapperCsv((m.produits && m.produits.unite) || '') },
    { entete: 'Motif', valeur: (m) => (m.motif ? echapperCsv(LIBELLE_MOTIF_EXPORT[m.motif] ?? m.motif) : '') },
    { entete: 'Source', valeur: (m) => echapperCsv(LIBELLE_SOURCE[m.source] ?? m.source ?? '') },
    { entete: "Prix d'achat unitaire (€)", valeur: (m) => formaterNombre(prixDuMouvement(m), DEC_ARGENT) },
    {
      entete: 'Valeur estimée (€)',
      valeur: (m) => {
        const prix = prixDuMouvement(m);
        return prixConnu(prix) ? formaterNombre(Number(prix) * Number(m.quantite), DEC_ARGENT) : '';
      },
    },
  ];

  // Prix vient d'abord de la jointure (elle seule couvre un produit
  // desactive/renomme depuis), puis du catalogue passe en repli.
  function prixDuMouvement(m) {
    const joint = m.produits || {};
    return prixConnu(joint.prix_achat) ? joint.prix_achat : prixParId.get(m.produit_id);
  }

  const phrasePeriode = valides.length === 0
    ? 'Aucun mouvement enregistré'
    : `Période couverte : du ${formaterDate(valides[0].cree_le, fuseau)} au ${formaterDate(valides[valides.length - 1].cree_le, fuseau)}, tout l'historique`;

  const entete = [
    'Stovo, journal des mouvements',
    `Exporté le ${formaterDate(maintenant, fuseau)} à ${formaterHeure(maintenant, fuseau)}`,
    phrasePeriode,
    `${valides.length} mouvement${pluriel(valides.length)}`,
    MENTION_LEGALE,
    "Le prix d'achat n'est pas historisé : la valeur estimée d'un mouvement ancien utilise le prix connu aujourd'hui.",
  ];

  const corps = valides.map((m) => colonnes.map((c) => c.valeur(m)).join(';'));
  const ligneEntetesColonnes = colonnes.map((c) => c.entete).join(';');

  return [...entete, '', ligneEntetesColonnes, ...corps].join('\r\n');
}

// -----------------------------------------------------------------------
// Nom de fichier
// -----------------------------------------------------------------------

const NOMS_FICHIERS = {
  stock: 'stovo_etat-de-stock',
  mouvements: 'stovo_mouvements',
};

/**
 * Construit le nom du fichier telecharge (plan §3.6) : minuscules,
 * tirets, pas d'accent, pas d'espace, date ISO en fin de nom pour que le
 * tri alphabetique soit aussi le tri chronologique. Pas d'heure dans le
 * nom : l'horodatage complet vit dans l'en-tete du fichier.
 *
 * @param {'stock'|'mouvements'} type
 */
export function nomFichierExport(type, maintenant = Date.now(), fuseau = 'Europe/Paris') {
  const base = NOMS_FICHIERS[type];
  if (!base) throw new Error(`nomFichierExport : type inconnu "${type}" (attendu 'stock' ou 'mouvements')`);
  return `${base}_${formaterDateIso(maintenant, fuseau)}.csv`;
}

// -----------------------------------------------------------------------
// Lot C2-2 : lecture complete, sans troncature silencieuse
// -----------------------------------------------------------------------

/**
 * Lit toutes les pages d'une source paginee (typiquement PostgREST/Supabase,
 * qui plafonne a 1000 lignes par requete et TRONQUE EN SILENCE au-dela,
 * plan §3.4) jusqu'a ce qu'une page revienne incomplete, preuve qu'on est
 * au bout. Fonction pure d'orchestration : elle ne connait pas Supabase,
 * elle delegue chaque requete reelle a `faireUnePage`, ce qui la rend
 * testable sans reseau.
 *
 * Choix de conception, a justifier : quand `plafondPages` est atteint SANS
 * qu'une page ne soit revenue incomplete, la fonction LEVE UNE ERREUR
 * plutot que de rendre un resultat marque "tronque=true". Raison : un flag
 * de retour peut etre oublie par l'appelant (c'est exactement le mode de
 * panne que ce lot existe pour eliminer, plan §3.4 : "une reponse tronquee
 * en silence, sans erreur" est designee comme LE risque du chantier). Une
 * exception, elle, ne peut pas etre ignoree sans un `try/catch` explicite :
 * le lot C2-3 est ainsi oblige de decider consciemment quoi afficher a
 * l'utilisateur plutot que de risquer un export qui a l'air complet et ne
 * l'est pas. Coherent avec la regle "fail fast" du Codeur.
 *
 * Une erreur levee par `faireUnePage` (ex. panne reseau) n'est jamais
 * avalee : elle remonte telle quelle, aucun try/catch autour de l'appel.
 *
 * @param {(de: number, a: number) => Promise<Array>} faireUnePage
 *   Fournie par l'appelant : execute la vraie requete sur la tranche
 *   [de, a] INCLUSE aux deux bornes (convention `.range()` de Supabase).
 * @param {number} tailleTranche  Nombre de lignes demandees par page.
 * @param {number} plafondPages   Garde-fou anti-boucle-infinie : nombre
 *   maximal de pages lues avant d'echouer explicitement.
 * @returns {Promise<Array>} toutes les lignes, dans l'ordre des pages lues.
 * @throws {Error} si `faireUnePage` echoue (remontee telle quelle), si une
 *   page renvoyee n'est pas un tableau, ou si `plafondPages` est atteint
 *   sans qu'aucune page ne soit incomplete.
 */
export async function lireToutesLesPages(faireUnePage, tailleTranche = 1000, plafondPages = 50) {
  if (typeof faireUnePage !== 'function') {
    throw new Error('lireToutesLesPages : faireUnePage doit être une fonction');
  }

  const lignes = [];
  for (let page = 0; page < plafondPages; page++) {
    const de = page * tailleTranche;
    const a = de + tailleTranche - 1;
    const tranche = await faireUnePage(de, a);

    // Une tranche qui n'est PAS un tableau (null, undefined, un objet
    // { data, error } mal deballe par l'appelant...) ne doit JAMAIS etre
    // traitee comme une page vide : ce serait conclure "fin atteinte" a
    // tort et rendre les lignes deja lues comme un resultat COMPLET, alors
    // qu'il est peut-etre tronque. Meme principe que le plafond de pages :
    // on ne devine pas, on echoue fort (releve en revue le 22/08/2026).
    if (!Array.isArray(tranche)) {
      throw new Error(
        `lireToutesLesPages : la page ${page} (de=${de}, a=${a}) n'a pas renvoyé un tableau (reçu : ${typeof tranche}). ` +
        `Lecture interrompue pour ne jamais rendre un résultat qui pourrait être tronqué.`
      );
    }
    lignes.push(...tranche);

    // Une page incomplete est la PREUVE qu'on a atteint la fin : on
    // s'arrete la, jamais une page de plus (elle serait vide, un aller
    // reseau gaspille), jamais une page de moins (ce serait tronquer).
    if (tranche.length < tailleTranche) return lignes;
  }

  // Le plafond est atteint alors que la derniere page etait encore pleine :
  // il peut rester des lignes non lues. On ne le devine pas, on echoue.
  throw new Error(
    `lireToutesLesPages : plafond de ${plafondPages} pages atteint (${lignes.length} lignes lues) sans qu'aucune page ne soit revenue incomplète. ` +
    `Lecture interrompue pour ne jamais produire un export tronqué en silence.`
  );
}

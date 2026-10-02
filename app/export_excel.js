// STOVO — Chantier EX-1 « l'export Excel lisible » : le module pur
// =============================================================================
// Brique PURE et ISOLEE, sur le modele exact d'export.js/pertes.js/pilotage.js :
// aucun acces au DOM, aucun acces a Supabase, AUCUNE bibliotheque tierce
// importee (ni write-excel-file, ni rien d'autre). Tout ce dont elle a besoin
// lui est PASSE en parametre. Decisions du grilling du 01/10/2026 :
// context/import/app-stock/2026-10-01_export-excel_decisions-grilling.md
//
// Ce qu'elle fait : transformer des tableaux `produitsActifs` / `produitsRetires`
// / `mouvements` deja charges (et deja enrichis par pilotage.js/dashboard.js,
// voir plus bas) en la forme de donnees EXACTE attendue par `writeXlsxFile`
// (write-excel-file 4.1.1) pour un classeur a trois feuilles. Le lot 2
// (branchement) importe la bibliotheque et appelle :
//   const classeur = construireClasseurExcel({ ... });
//   await writeXlsxFile(classeur.feuilles, { ...classeur.optionsGlobales, fileName: nomFichierExcel(maintenant, fuseau) });
//
// Ce qu'elle ne fait PAS, et c'est volontaire (decision 4 du grilling) :
//   - elle ne RECALCULE RIEN de ce que pilotage.js/dashboard.js ont deja
//     calcule : statut, point de commande, couverture ("Tient encore"),
//     quantite conseillee viennent des champs _couverture/_pointCommande/
//     _qteCommander/_jamaisCompte/_aCommander deja poses sur chaque produit
//     par dashboard.js:charger() (lignes 754-772). C'est ce qui garantit que
//     le classeur affiche EXACTEMENT les memes chiffres qu'a l'ecran ;
//   - elle n'importe PAS dashboard.js (module impur, DOM) : la seule regle
//     qu'elle reprend de lui ("À surveiller" = urgence(couverture)==='warn')
//     est recopiee a l'identique sous estASurveiller ci-dessous, avec un
//     commentaire qui pointe vers la source et un test qui la fige ;
//   - les formules de la maquette (maquette_export.py) sont ABANDONNEES
//     (statut, point de commande, "Tient encore", quantite conseillee) :
//     seule sa mise en page (titres, largeurs, couleurs, formats) sert de
//     reference VISUELLE.

import {
  MENTION_LEGALE,
  LIBELLE_MOTIF_EXPORT,
  LIBELLE_TYPE,
  LIBELLE_SOURCE,
  retenirProduitsExport,
  retenirMouvementsExport,
  formaterDate,
} from './export.js';
import { FENETRE_JOURS, COUVERTURE_CIBLE_JOURS } from './pilotage.js';

// -----------------------------------------------------------------------
// Couleurs (maquette_export.py = reference VISUELLE, plus une couleur neuve)
// -----------------------------------------------------------------------

const ENCRE = '#1D1E1C';
const GRIS = '#615F5C';
// Gris du filet horizontal fin, repris tel quel de la maquette (BFB6AA) :
// ni styles.css ni DESIGN.md ne definissent de gris de bordure, seuls
// --gris (#615F5C, texte) et --gris-clair (#8E8B87, decor) existent.
const FILET_FIN = '#BFB6AA';
const BLANC = '#FFFFFF';
const DANGER_BG = '#FEF2F2';
const DANGER_TXT = '#B91C1C';
const WARN_BG = '#FEF9C3';
const WARN_TXT = '#A16207';
const OK_BG = '#F0FDFA';
const OK_TXT = '#0F766E';
const PAS_ENCORE_BG = '#FFF1E4'; // = --fond-chaud, deja pris par "Pas encore compté"
// Gris neutre du badge "Retiré du catalogue" : CHOIX DU CODEUR (01/10/2026),
// a dire dans le rapport. Ni styles.css ni DESIGN.md ne definissent de gris
// de FOND (seul --fond-chaud #FFF1E4 existe, et il est deja pris par
// "Pas encore compté" ci-dessus : le reutiliser confondrait les deux statuts,
// ce que le brief interdit explicitement). #F3F4F6 est un gris neutre
// standard, assez clair pour rester discret, assez different de #FFF1E4
// (qui est chaud/creme) pour ne jamais etre confondu avec lui a l'oeil.
const RETIRE_BG = '#F3F4F6';

// -----------------------------------------------------------------------
// Formats de cellule (maquette_export.py, dict FMT)
// -----------------------------------------------------------------------

const FMT_EURO = '#,##0.00 "€"';
const FMT_JOUR_DEC = '0.0 "j"';
const FMT_JOUR_ENT = '0 "j"';
const FMT_DATE = 'dd/mm/yyyy';
const FMT_HEURE = 'hh:mm';
const FMT_TEXTE = '@'; // force le type texte, evite qu'Excel interprete un nom de produit comme un nombre
const FMT_ENTIER = '#,##0';
const FMT_DECIMAL = '#,##0.00';

// -----------------------------------------------------------------------
// Petits helpers internes, non exportes (duplication volontaire de helpers
// prives d'export.js : meme convention que pertes.js/export.js, qui
// recopient chacun leurs propres predicats plutot que de les partager).
// -----------------------------------------------------------------------

const prixConnu = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// 0 et 1 sont singuliers, 2+ sont pluriels (meme convention qu'export.js).
const pluriel = (n) => (n > 1 ? 's' : '');

const comparerNoms = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { sensitivity: 'base' });

// -----------------------------------------------------------------------
// Le fuseau horaire (piège 1 du brief) : write-excel-file convertit une
// Date en numero de serie Excel via `date.getTime() / jour` (source lue le
// 01/10/2026 : source/xlsx/helpers/convertDateToSerialNumber.js du depot
// catamphetamine/write-excel-file, master). `getTime()` est TOUJOURS en
// epoch UTC, quel que soit le fuseau de la machine : le calcul lui-meme est
// donc deja independant du fuseau systeme. Mais si on lui passe directement
// `new Date(iso)`, le serial encode l'INSTANT UTC, et Excel l'affiche tel
// quel (il ne connait aucun fuseau) : un mouvement a 23h30 a Paris
// (= 21h30 UTC en ete) s'afficherait "21:30", pas "23:30".
//
// La parade : fabriquer une Date "deguisee en UTC" qui porte les champs de
// l'heure LOCALE DE PARIS, construite via Date.UTC(...). Son getTime() -
// donc le serial Excel qui en decoule - affiche alors l'heure de Paris,
// quel que soit le fuseau de la machine qui execute ce code (le calcul ne
// lit plus jamais le fuseau systeme, seul Intl.DateTimeFormat({timeZone})
// est consulte, exactement le meme detour que formaterDate/formaterHeure
// d'export.js).
export function dateExcelDansLeFuseau(iso, fuseau = 'Europe/Paris') {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const champ = (type) => Number(parts.find((p) => p.type === type).value);
  // hour12:false peut rendre "24" a minuit selon le moteur ICU : ramene a 0.
  const heure = champ('hour') % 24;
  return new Date(Date.UTC(champ('year'), champ('month') - 1, champ('day'), heure, champ('minute'), champ('second')));
}

// Date courte JJ/MM (sans annee), pour la borne de debut du titre de la
// feuille Mouvements. Meme detour par fuseau qu'export.js:formaterDate.
function formaterJourMois(iso, fuseau) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, day: '2-digit', month: '2-digit' }).format(d);
}

// Date ISO (AAAA-MM-JJ) pour le nom de fichier uniquement, meme detour que
// export.js (fonction privee non exportee, dupliquee a l'identique).
function formaterDateIso(maintenant, fuseau) {
  const d = new Date(maintenant);
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// -----------------------------------------------------------------------
// Piège 2 du brief : stock_actuel est `numeric` (fractionnaire possible,
// ex. 2,5 kg). Un format unique "#,##0.##" affiche "3," pour un entier
// (le point decimal final sans rien derriere). La parade : choisir le
// format CELLULE PAR CELLULE, entier ou deux decimales, selon la valeur.
// -----------------------------------------------------------------------
export function formatQuantiteStock(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return FMT_ENTIER;
  return Number.isInteger(n) ? FMT_ENTIER : FMT_DECIMAL;
}

// -----------------------------------------------------------------------
// Euro en texte, pour les TITRES de feuille (pas les cellules : elles
// utilisent FMT_EURO, un format Excel natif). Convention reprise de la
// maquette (maquette_export.py:euros(), arrondi a l'entier, espace comme
// separateur de milliers) : les FORMULES de la maquette sont abandonnees
// (decision 4), pas ses conventions d'affichage de TEXTE.
function formaterEuroTitre(valeur) {
  const entier = Math.round(Number(valeur) || 0);
  return `${entier}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}

// -----------------------------------------------------------------------
// "À surveiller" : reprise A L'IDENTIQUE de `urgence()` dans dashboard.js
// (ligne ~126 : `(c) => (c === null ? 'ok' : c < 1.5 ? 'crit' : c < 3 ? 'warn' : 'ok')`).
// dashboard.js N'EST PAS un module pur (DOM) : on ne l'importe pas, on
// recopie seulement cette regle de 1 ligne, figee par un test qui compare
// pile aux bornes 1.5 et 3 (voir export_excel_test.js).
// -----------------------------------------------------------------------
function estASurveiller(couverture) {
  return couverture !== null && couverture !== undefined && couverture >= 1.5 && couverture < 3;
}

// Le statut d'un produit ACTIF, dans l'ordre de priorite EXACT de
// dashboard.js:charger() (lignes 871-876) : jamais compte d'abord (il
// l'emporte sur tout le reste par construction, voir estACommander dans
// pilotage.js), puis a commander, puis a surveiller, sinon en stock.
function statutProduitActif(p) {
  if (p._jamaisCompte) return 'pasEncoreCompte';
  if (p._aCommander) return 'aCommander';
  if (estASurveiller(p._couverture)) return 'aSurveiller';
  return 'enStock';
}

const SYMBOLE_STATUT = {
  aCommander: '■ À commander',
  aSurveiller: '▲ À surveiller',
  pasEncoreCompte: '○ Pas encore compté',
  enStock: '● En stock',
  retire: '– Retiré du catalogue', // tiret demi-cadratin U+2013, decision 3 du grilling
};

const STYLE_STATUT = {
  'aCommander': { bg: DANGER_BG, texte: DANGER_TXT, gras: true },
  'aSurveiller': { bg: WARN_BG, texte: WARN_TXT, gras: true },
  'pasEncoreCompte': { bg: PAS_ENCORE_BG, texte: GRIS, gras: false },
  'enStock': { bg: OK_BG, texte: OK_TXT, gras: true },
  'retire': { bg: RETIRE_BG, texte: GRIS, gras: false },
};

function compareCouvertureAsc(a, b) {
  const ca = (a._couverture === null || a._couverture === undefined) ? Infinity : a._couverture;
  const cb = (b._couverture === null || b._couverture === undefined) ? Infinity : b._couverture;
  return ca - cb;
}

// -----------------------------------------------------------------------
// Petits constructeurs de cellules, pour ne pas repeter les memes cles a
// chaque colonne. Les sentinelles `Date`/`Number`/`String` du champ `type`
// sont les constructeurs GLOBAUX de JavaScript (voir le README de
// write-excel-file 4.1.1, ex. `{ value: new Date(...), type: Date, format: 'mm/dd/yyyy' }`) :
// ce ne sont PAS des exports de la bibliotheque, donc aucun import requis.
// -----------------------------------------------------------------------

function celluleTexte(valeur, extra = {}) {
  if (valeur === null || valeur === undefined || valeur === '') return { value: null, ...extra };
  return { value: String(valeur), type: String, format: FMT_TEXTE, ...extra };
}

function celluleNombre(valeur, format, extra = {}) {
  if (!prixConnu(valeur)) return { value: null, ...extra };
  return { value: Number(valeur), type: Number, format, ...extra };
}

function celluleDate(iso, fuseau, format, extra = {}) {
  const d = dateExcelDansLeFuseau(iso, fuseau);
  if (!d) return { value: null, ...extra };
  return { value: d, type: Date, format, ...extra };
}

const BORDURE_FINE = { bottomBorderColor: FILET_FIN, bottomBorderStyle: 'thin' };

// -----------------------------------------------------------------------
// Chantier EX-1, lot 2 (01/10/2026) : les deux "features" write-excel-file
// (decision 2 du grilling + ajout valide par Corentin le 01/10/2026) -- le
// filtre automatique et l'ajustement a la largeur de la page a l'impression.
//
// Une "feature" write-excel-file est un objet `{ files: { transform: {
// 'xl/worksheets/sheet{id}.xml': { transform(xml, sheetOptions, props) {
// ... return xml } } } } }` : la bibliotheque l'appelle APRES avoir genere
// le XML d'une feuille, en lui passant ce XML en TEXTE (jamais un DOM) et
// les OPTIONS de cette feuille (le meme objet que celui retourne par
// construireFeuille ci-dessus, SANS son tableau `data` -- source lue le
// 01/10/2026 : source/xlsx/generateXlsxFileContents.js et
// source/xlsx/helpers/features/transformContent.js du depot
// catamphetamine/write-excel-file, branche master). C'est pour ca que
// construireFeuille y pose `filtreAutoPlage`/`ajusterPageImpression` :
// exactement le meme canal que `stickyRowsCount`/`stickyColumnsCount`, les
// options "maison" que la bibliotheque utilise pour SA PROPRE feature de
// lignes/colonnes figees (source/xlsx/features/stickyRowsOrColumns.js, meme
// depot).
//
// Un simple remplacement de texte suffit ici (jamais besoin des aides XML
// internes de la bibliotheque, comme `insertElementMarkupAccordingToOrderOf
// Siblings` -- verifie le 01/10/2026 : le README "Features" les mentionne via
// un export npm separe "./utility", mais CET export n'a AUCUN bundle
// navigateur sur jsdelivr (seuls bundle/write-excel-file.min.js et
// bundle/getSheetData.min.js existent, confirme via l'API jsdelivr), donc
// inutilisable depuis une PWA sans build comme Stovo) parce qu'on connait
// exactement la forme du XML que cette bibliotheque genere pour NOS
// feuilles : construireFeuille pose toujours showGridLines:false (donc
// <sheetViews> est toujours present) et orientation:'landscape' (donc
// <pageSetup> est toujours present).
// -----------------------------------------------------------------------

// Lettre(s) de colonne Excel a partir d'un index 1-base (1 -> 'A', 26 ->
// 'Z', 27 -> 'AA'...). Nos feuilles ont au plus 10 colonnes (Mouvements),
// mais la fonction reste generale plutot que de supposer une seule lettre.
export function lettreColonne(index) {
  let n = index;
  let lettres = '';
  while (n > 0) {
    const reste = (n - 1) % 26;
    lettres = String.fromCharCode(65 + reste) + lettres;
    n = Math.floor((n - 1) / 26);
  }
  return lettres;
}

// Plage du filtre automatique : de la ligne d'en-tete (ligne 4, voir
// construireFeuille) jusqu'a la DERNIERE LIGNE DE DONNEES -- jamais la
// ligne de Total, jamais la mention legale, jamais les notes. `null` si la
// feuille n'a aucune ligne de donnees (decision du brief : pas de filtre
// sur une feuille vide).
export function calculerPlageFiltreAuto(nbColonnes, nbLignesDonnees) {
  if (!nbLignesDonnees) return null;
  const derniereLigne = 4 + nbLignesDonnees;
  return `A4:${lettreColonne(nbColonnes)}${derniereLigne}`;
}

// Feature "filtre automatique" : insere <autoFilter ref="..."/> juste apres
// </sheetData>, qui est bien sa place dans l'ordre impose par la
// specification ECMA-376 (sheetData, sheetCalcPr, sheetProtection,
// protectedRanges, scenarios, autoFilter, sortState, ..., mergeCells, ...,
// pageMargins, pageSetup...) tant qu'aucune de nos feuilles n'a de
// mergeCells/dataValidations/etc entre les deux -- verifie dans
// construireFeuille : aucune des trois feuilles n'en genere. Lit
// `sheetOptions.filtreAutoPlage`, pose par construireFeuille plus bas.
export function creerFeatureFiltreAuto() {
  return {
    files: {
      transform: {
        'xl/worksheets/sheet{id}.xml': {
          transform(xml, sheetOptions) {
            if (!sheetOptions || !sheetOptions.filtreAutoPlage) return xml;
            if (!xml.includes('</sheetData>')) return xml;
            return xml.replace('</sheetData>', `</sheetData><autoFilter ref="${sheetOptions.filtreAutoPlage}"/>`);
          },
        },
      },
    },
  };
}

// Feature "ajuster a la largeur de la page a l'impression" : <sheetPr>
// (avec pageSetUpPr fitToPage="1") doit etre le TOUT PREMIER enfant de
// <worksheet> (ordre ECMA-376 : sheetPr avant sheetViews), et
// fitToWidth="1" fitToHeight="0" se posent sur le <pageSetup> deja genere
// (toujours present : construireFeuille pose toujours
// orientation:'landscape'). Lit `sheetOptions.ajusterPageImpression`, pose
// par construireFeuille plus bas.
export function creerFeatureAjusterPageImpression() {
  return {
    files: {
      transform: {
        'xl/worksheets/sheet{id}.xml': {
          transform(xml, sheetOptions) {
            if (!sheetOptions || !sheetOptions.ajusterPageImpression) return xml;
            let sortie = xml;
            if (sortie.includes('<sheetViews')) {
              sortie = sortie.replace('<sheetViews', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews');
            }
            if (sortie.includes('<pageSetup ')) {
              sortie = sortie.replace('<pageSetup ', '<pageSetup fitToWidth="1" fitToHeight="0" ');
            }
            return sortie;
          },
        },
      },
    },
  };
}

// Marge pour la fleche du filtre automatique (correctif du 01/10/2026,
// retour d'essai iPhone/Office : "Stock actuel" -> "ock actuel", "Prix
// d'achat" -> "rix d'achat"... la fleche occupe la droite de la cellule et
// mange le texte aligne a droite). Chaque colonne fait au moins la longueur
// de son en-tete plus cette marge. Ne change rien d'autre a la mise en
// page : une colonne deja assez large garde sa largeur actuelle.
//
// RETOUCHE du 01/10/2026 : 4 -> 9. Une marge de 4 ne corrigeait pas ce que
// l'iPhone montrait -- "Stock actuel" (12+4=16) perdait deja 2 lettres,
// "Tient encore"/"Commander à" (16) 3 lettres, "Quantité" (12) 3 lettres,
// "Quantité conseillée" (20) 4 lettres. Mesure du Jarvis dans le vrai Excel
// (AutoFit, Calibri 11 gras, retrait 1) : "Stock actuel" tient en 11,44,
// "Prix d'achat" en 11,0, "Valeur du stock" en 14,22 -- l'apercu iPhone
// (police de substitution plus large que Calibri, plus la fleche du
// filtre) demande environ 7 a 9 au-dela de la longueur de l'en-tete. Avec
// 9, tous les cas releves sur les captures passent avec au moins un
// caractere d'avance.
const MARGE_FLECHE_FILTRE = 9;

export function largeurColonneAvecFiltre(entete, largeurSouhaitee) {
  return Math.max(largeurSouhaitee, String(entete).length + MARGE_FLECHE_FILTRE);
}

// -----------------------------------------------------------------------
// Assemblage generique d'une feuille (titre, sous-titre, en-tetes, lignes,
// total optionnel, mention legale, notes). Reproduit la mise en page de
// `feuille()` dans maquette_export.py : titre L1 (gras 14), sous-titre L2
// (italique 10 gris), en-tetes L4 (fond encre, texte blanc gras, trait
// epais dessous), donnees a partir de L5, bordures horizontales fines
// seulement, quadrillage masque, L1-L4 figees, paysage. Colonne A PAS
// figee (correctif du 01/10/2026, decision de Corentin apres essai
// iPhone : figee, elle empechait le titre/sous-titre/notes du bas -- qui
// debordent volontairement vers la droite sur une seule cellule, data[0]
// et data[1] n'ont qu'UNE valeur -- de s'afficher en entier).
// -----------------------------------------------------------------------
function construireFeuille({ nom, titre, sousTitre, colonnes, lignesCellules, colonneStatut, total, notes }) {
  const data = [];
  data.push([{ value: titre, type: String, format: FMT_TEXTE, fontWeight: 'bold', fontSize: 14, textColor: ENCRE }]);
  data.push([{ value: sousTitre, type: String, format: FMT_TEXTE, fontStyle: 'italic', fontSize: 10, textColor: GRIS }]);
  data.push([]); // ligne 3 : blanc, comme la maquette (rien entre le sous-titre et les en-tetes)

  data.push(colonnes.map((c) => ({
    value: c.entete, type: String, format: FMT_TEXTE,
    fontWeight: 'bold', textColor: BLANC, backgroundColor: ENCRE,
    align: c.align, bottomBorderColor: ENCRE, bottomBorderStyle: 'medium',
  })));

  lignesCellules.forEach((ligne) => data.push(ligne));

  if (total) {
    data.push([]); // ligne blanche entre les donnees et le total (comme la maquette)
    const n = colonnes.length;
    const ligneTotal = [];
    for (let j = 0; j < n; j++) {
      const bordure = { topBorderColor: ENCRE, topBorderStyle: 'medium' };
      if (j === total.colLibelle) {
        ligneTotal.push({ value: total.libelle, type: String, format: FMT_TEXTE, fontWeight: 'bold', textColor: ENCRE, align: 'left', ...bordure });
      } else if (j === total.colValeur) {
        ligneTotal.push(prixConnu(total.valeur)
          ? { value: Number(total.valeur), type: Number, format: FMT_EURO, fontWeight: 'bold', textColor: ENCRE, align: 'right', ...bordure }
          : { value: null, ...bordure });
      } else {
        ligneTotal.push({ value: null, ...bordure });
      }
    }
    data.push(ligneTotal);
  }

  data.push([]); // ligne blanche avant la mention legale (comme la maquette)
  data.push([{ value: MENTION_LEGALE, type: String, format: FMT_TEXTE, fontStyle: 'italic', textColor: GRIS }]);
  (notes || []).forEach((texte) => {
    data.push([{ value: texte, type: String, format: FMT_TEXTE, fontStyle: 'italic', textColor: GRIS }]);
  });

  return {
    sheet: nom,
    data,
    columns: colonnes.map((c) => ({ width: largeurColonneAvecFiltre(c.entete, c.largeur) })),
    stickyRowsCount: 4,
    showGridLines: false,
    orientation: 'landscape',
    // Chantier EX-1, lot 2 : lu par creerFeatureFiltreAuto/
    // creerFeatureAjusterPageImpression ci-dessus (voir leur commentaire).
    filtreAutoPlage: calculerPlageFiltreAuto(colonnes.length, lignesCellules.length),
    ajusterPageImpression: true,
  };
}

// =========================================================================
// Feuille 1 : À commander
// =========================================================================

const COLONNES_A_COMMANDER = [
  { entete: 'Produit', largeur: 32, align: 'left' },
  { entete: 'Il en reste', largeur: 16, align: 'right' },
  { entete: 'Unité', largeur: 12, align: 'left' },
  { entete: 'Commander à', largeur: 16, align: 'right' },
  { entete: 'Tient encore', largeur: 16, align: 'right' },
  { entete: 'Délai fournisseur', largeur: 20, align: 'right' },
  { entete: 'Quantité conseillée', largeur: 20, align: 'right' },
  { entete: "Prix d'achat", largeur: 16, align: 'right' },
  { entete: 'Montant estimé', largeur: 20, align: 'right' },
];

function construireFeuilleACommander(produitsActifs, maintenant, fuseau) {
  const aCommander = produitsActifs.filter((p) => p._aCommander === true);
  const tries = [...aCommander].sort(compareCouvertureAsc);

  let totalMontant = 0;
  let nbSansMontant = 0;
  const lignes = tries.map((p) => {
    const montant = prixConnu(p.prix_achat) && prixConnu(p._qteCommander) ? Number(p.prix_achat) * Number(p._qteCommander) : null;
    if (montant === null) nbSansMontant++;
    else totalMontant += montant;
    return [
      celluleTexte(p.nom, { align: 'left', ...BORDURE_FINE }),
      celluleNombre(p.stock_actuel, formatQuantiteStock(p.stock_actuel), { align: 'right', ...BORDURE_FINE }),
      celluleTexte(p.unite, { align: 'left', ...BORDURE_FINE }),
      celluleNombre(p._pointCommande, FMT_ENTIER, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(p._couverture, FMT_JOUR_DEC, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(p.delai_repro_jours, FMT_JOUR_ENT, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(p._qteCommander, FMT_ENTIER, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(p.prix_achat, FMT_EURO, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(montant, FMT_EURO, { align: 'right', ...BORDURE_FINE }),
    ];
  });

  const n = tries.length;
  const titre = n === 0
    ? `Rien à commander au ${formaterDate(maintenant, fuseau)}`
    : `${n} produit${pluriel(n)} à commander, pour environ ${formaterEuroTitre(totalMontant)} au ${formaterDate(maintenant, fuseau)}`;

  const notes = [
    `Commander à : calculé sur vos ventes des ${FENETRE_JOURS} derniers jours ; sans vente récente, c'est le seuil que vous avez fixé.`,
    `Tient encore : nombre de jours avant d'être vide, au rythme des sorties des ${FENETRE_JOURS} derniers jours.`,
    `Quantité conseillée : une estimation, de quoi tenir le délai fournisseur plus ${COUVERTURE_CIBLE_JOURS} jours, au rythme des ${FENETRE_JOURS} derniers jours ; vide sans vente récente.`,
    "Prix d'achat : dernier prix d'achat connu, à l'unité.",
  ];

  return construireFeuille({
    nom: 'À commander',
    titre,
    sousTitre: 'Les plus urgents en haut : ceux qui seront vides le plus tôt.',
    colonnes: COLONNES_A_COMMANDER,
    lignesCellules: n === 0 ? [] : lignes,
    total: n === 0 ? null : {
      colLibelle: 0,
      colValeur: 8,
      libelle: nbSansMontant === 0 ? 'Total' : `Total (${nbSansMontant} produit${pluriel(nbSansMontant)} sans montant connu)`,
      valeur: totalMontant,
    },
    notes,
  });
}

// =========================================================================
// Feuille 2 : État du stock
// =========================================================================

const COLONNES_ETAT_STOCK = [
  { entete: 'Produit', largeur: 32, align: 'left' },
  { entete: 'Statut', largeur: 20, align: 'center' },
  { entete: 'Stock actuel', largeur: 16, align: 'right' },
  { entete: 'Unité', largeur: 12, align: 'left' },
  { entete: "Prix d'achat", largeur: 16, align: 'right' },
  { entete: 'Valeur du stock', largeur: 20, align: 'right' },
  { entete: 'Commander à', largeur: 16, align: 'right' },
  { entete: 'Délai fournisseur', largeur: 20, align: 'right' },
  { entete: 'Créé le', largeur: 12, align: 'center' },
];

function construireFeuilleEtatStock(produitsActifs, produitsRetiresRetenus, maintenant, fuseau) {
  // Groupes dans l'ORDRE tranche par le Jarvis (decision 4 du grilling) :
  // a commander, pas encore compte, a surveiller, en stock, puis retires.
  const gCommander = [], gPasEncoreCompte = [], gSurveiller = [], gEnStock = [];
  produitsActifs.forEach((p) => {
    const s = statutProduitActif(p);
    if (s === 'aCommander') gCommander.push(p);
    else if (s === 'pasEncoreCompte') gPasEncoreCompte.push(p);
    else if (s === 'aSurveiller') gSurveiller.push(p);
    else gEnStock.push(p);
  });
  gCommander.sort(compareCouvertureAsc);
  gSurveiller.sort(compareCouvertureAsc);
  gEnStock.sort((a, b) => comparerNoms(a.nom, b.nom));
  const gRetires = [...produitsRetiresRetenus].sort((a, b) => comparerNoms(a.nom, b.nom));

  const ordonnes = [
    ...gCommander.map((p) => ({ p, statut: 'aCommander' })),
    ...gPasEncoreCompte.map((p) => ({ p, statut: 'pasEncoreCompte' })),
    ...gSurveiller.map((p) => ({ p, statut: 'aSurveiller' })),
    ...gEnStock.map((p) => ({ p, statut: 'enStock' })),
    ...gRetires.map((p) => ({ p, statut: 'retire' })),
  ];

  let totalValeur = 0;
  let nbSansPrix = 0;
  const lignes = ordonnes.map(({ p, statut }) => {
    const stock = Number(p.stock_actuel ?? 0);
    const valeur = prixConnu(p.prix_achat) ? Number(p.prix_achat) * stock : null;
    if (valeur === null) nbSansPrix++;
    else totalValeur += valeur;
    const style = STYLE_STATUT[statut];
    const celluleStatut = {
      value: SYMBOLE_STATUT[statut], type: String, format: FMT_TEXTE,
      align: 'center', backgroundColor: style.bg, textColor: style.texte,
      fontWeight: style.gras ? 'bold' : undefined,
      ...BORDURE_FINE,
    };
    return [
      celluleTexte(p.nom, { align: 'left', ...BORDURE_FINE }),
      celluleStatut,
      celluleNombre(p.stock_actuel, formatQuantiteStock(p.stock_actuel), { align: 'right', ...BORDURE_FINE }),
      celluleTexte(p.unite, { align: 'left', ...BORDURE_FINE }),
      celluleNombre(p.prix_achat, FMT_EURO, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(valeur, FMT_EURO, { align: 'right', ...BORDURE_FINE }),
      // "Commander à" vide pour un retire (decision 3 : jamais de point de
      // commande affiche pour un produit sorti du catalogue).
      statut === 'retire' ? { value: null, align: 'right', ...BORDURE_FINE } : celluleNombre(p._pointCommande, FMT_ENTIER, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(p.delai_repro_jours, FMT_JOUR_ENT, { align: 'right', ...BORDURE_FINE }),
      celluleDate(p.cree_le, fuseau, FMT_DATE, { align: 'center', ...BORDURE_FINE }),
    ];
  });

  const nbTotal = ordonnes.length;
  const nbRetires = gRetires.length;
  const titre = nbRetires === 0
    ? `${nbTotal} produit${pluriel(nbTotal)}, stock valorisé à ${formaterEuroTitre(totalValeur)} au ${formaterDate(maintenant, fuseau)}`
    : `${nbTotal} produit${pluriel(nbTotal)} dont ${nbRetires} retiré${pluriel(nbRetires)} du catalogue, stock valorisé à ${formaterEuroTitre(totalValeur)} au ${formaterDate(maintenant, fuseau)}`;

  const notes = [
    'Statut : mêmes règles que le tableau de bord de Stovo.',
    `Commander à : calculé sur vos ventes des ${FENETRE_JOURS} derniers jours ; sans vente récente, c'est le seuil que vous avez fixé.`,
    'Valeur : stock actuel multiplié par le prix d\'achat.',
  ];
  if (nbSansPrix > 0) {
    notes.push(`${nbSansPrix} produit${pluriel(nbSansPrix)} sans prix renseigné, non compté${pluriel(nbSansPrix)} dans la valeur totale.`);
  }

  return construireFeuille({
    nom: 'État du stock',
    titre,
    sousTitre: 'Triés par statut : à commander, pas encore compté, à surveiller, en stock, puis les retirés du catalogue.',
    colonnes: COLONNES_ETAT_STOCK,
    lignesCellules: lignes,
    total: nbTotal === 0 ? null : { colLibelle: 0, colValeur: 5, libelle: 'Total', valeur: totalValeur },
    notes,
  });
}

// =========================================================================
// Feuille 3 : Mouvements
// =========================================================================

const COLONNES_MOUVEMENTS = [
  { entete: 'Date', largeur: 12, align: 'center' },
  { entete: 'Heure', largeur: 8, align: 'center' },
  { entete: 'Produit', largeur: 32, align: 'left' },
  { entete: 'Type', largeur: 12, align: 'left' },
  { entete: 'Quantité', largeur: 12, align: 'right' },
  { entete: 'Unité', largeur: 12, align: 'left' },
  { entete: 'Motif', largeur: 28, align: 'left' },
  { entete: 'Source', largeur: 12, align: 'left' },
  { entete: "Prix d'achat", largeur: 16, align: 'right' },
  { entete: 'Valeur estimée', largeur: 20, align: 'right' },
];

// Motifs qui sont de VRAIES pertes (pertes.js:MOTIFS_PERTE) : "inventaire"
// (regularisation) et "erreur" (correction) n'en sont pas, contrairement a
// ce que supposait la maquette (son n_pertes comptait tout motif non-
// "Régularisation d'inventaire", sans connaitre "erreur"). On s'aligne sur
// la regle metier reelle plutot que sur l'approximation de la maquette.
const MOTIFS_PERTE = ['peremption', 'casse', 'vol'];

// Chantier EX-1, lot 2 (01/10/2026) : extrait pour etre reutilise par
// construireClasseurExcel plus bas, qui en a besoin pour le compte
// `comptes.nbMouvements` (message de fin d'export de la glu) -- memes
// mouvements, memes filtres, un seul calcul a maintenir.
function mouvementsDansLaFenetre(mouvements, maintenant) {
  const limite = Number(maintenant) - FENETRE_JOURS * 864e5;
  return retenirMouvementsExport(mouvements).filter((m) => new Date(m.cree_le).getTime() >= limite);
}

function construireFeuilleMouvements(mouvements, produitsActifs, produitsRetires, maintenant, fuseau) {
  // Index des prix en repli de la jointure, construit sur TOUT le
  // catalogue connu (actifs + retires bruts) : un mouvement ancien peut
  // citer un produit retire depuis, voire a stock nul (donc absent de
  // "État du stock"), mais son prix d'alors reste utile en repli.
  const prixParId = new Map();
  [...(produitsActifs || []), ...(produitsRetires || [])].forEach((p) => {
    if (p && p.id !== undefined) prixParId.set(p.id, p.prix_achat);
  });
  function prixDuMouvement(m) {
    const joint = m.produits || {};
    return prixConnu(joint.prix_achat) ? joint.prix_achat : prixParId.get(m.produit_id);
  }

  const retenus = mouvementsDansLaFenetre(mouvements, maintenant);
  // Plus recents en haut, depart stable (tri natif, stable depuis ES2019) :
  // aucune cle de depart secondaire ajoutee, deux mouvements a la meme
  // seconde gardent leur ordre d'entree.
  const tries = [...retenus].sort((a, b) => new Date(b.cree_le).getTime() - new Date(a.cree_le).getTime());

  let nbPertes = 0;
  const lignes = tries.map((m) => {
    const estPerte = MOTIFS_PERTE.includes(m.motif);
    if (estPerte) nbPertes++;
    const prix = prixDuMouvement(m);
    const valeur = prixConnu(prix) ? Number(prix) * Number(m.quantite) : null;
    const nomProduit = (m.produits && m.produits.nom) || '(produit supprimé)';
    const uniteProduit = (m.produits && m.produits.unite) || '';
    const celluleMotif = estPerte
      ? { value: LIBELLE_MOTIF_EXPORT[m.motif] ?? m.motif, type: String, format: FMT_TEXTE, align: 'left', backgroundColor: DANGER_BG, textColor: DANGER_TXT, fontWeight: 'bold', ...BORDURE_FINE }
      : celluleTexte(m.motif ? (LIBELLE_MOTIF_EXPORT[m.motif] ?? m.motif) : null, { align: 'left', ...BORDURE_FINE });
    return [
      celluleDate(m.cree_le, fuseau, FMT_DATE, { align: 'center', ...BORDURE_FINE }),
      celluleDate(m.cree_le, fuseau, FMT_HEURE, { align: 'center', ...BORDURE_FINE }),
      celluleTexte(nomProduit, { align: 'left', ...BORDURE_FINE }),
      celluleTexte(LIBELLE_TYPE[m.type] ?? m.type ?? '', { align: 'left', ...BORDURE_FINE }),
      // Correctif /code-review du 01/10/2026 : mouvements.quantite est
      // `numeric` en base (verifie par information_schema le meme jour),
      // pas `integer` -- FMT_ENTIER fixe arrondissait a tort une vente au
      // poids (0,4 kg -> "0", 2,5 kg -> "3"). Meme format cellule par
      // cellule que la colonne "Il en reste"/"Stock actuel" (formatQuantiteStock).
      celluleNombre(m.quantite, formatQuantiteStock(m.quantite), { align: 'right', ...BORDURE_FINE }),
      celluleTexte(uniteProduit, { align: 'left', ...BORDURE_FINE }),
      celluleMotif,
      celluleTexte(LIBELLE_SOURCE[m.source] ?? m.source ?? '', { align: 'left', ...BORDURE_FINE }),
      celluleNombre(prix, FMT_EURO, { align: 'right', ...BORDURE_FINE }),
      celluleNombre(valeur, FMT_EURO, { align: 'right', ...BORDURE_FINE }),
    ];
  });

  const n = tries.length;
  const titre = n === 0
    ? `Aucun mouvement sur les ${FENETRE_JOURS} derniers jours`
    : `${n} mouvement${pluriel(n)} du ${formaterJourMois(tries[n - 1].cree_le, fuseau)} au ${formaterDate(maintenant, fuseau)}, dont ${nbPertes} perte${pluriel(nbPertes)}`;

  const notes = [
    'Source : « Vocal » est dicté à Stovo, « Manuel » est saisi à l\'écran.',
    'Valeur estimée : quantité multipliée par le prix d\'achat.',
    "Le prix d'achat n'est pas historisé : la valeur estimée d'un mouvement ancien utilise le prix connu aujourd'hui.",
    "L'historique complet est dans le journal des mouvements (.csv).",
  ];

  return construireFeuille({
    nom: 'Mouvements',
    titre,
    sousTitre: 'Les plus récents en haut.',
    colonnes: COLONNES_MOUVEMENTS,
    lignesCellules: lignes,
    total: null,
    notes,
  });
}

// =========================================================================
// Point d'entree
// =========================================================================

/**
 * Construit la forme d'entree EXACTE de `writeXlsxFile` (write-excel-file
 * 4.1.1) pour le classeur Excel de Stovo a trois feuilles. Rien n'est
 * recalcule : `produitsActifs` doit deja porter `_couverture`,
 * `_pointCommande`, `_qteCommander`, `_jamaisCompte`, `_aCommander`, poses
 * par dashboard.js:charger() (pilotage.js). Le lot 2 appelle :
 *   writeXlsxFile(classeur.feuilles, { ...classeur.optionsGlobales, fileName })
 *
 * @param {object} args
 * @param {Array} args.produitsActifs   Produits actifs enrichis (voir plus haut).
 * @param {Array} args.produitsRetires  Produits `actif === false` BRUTS (pas enrichis).
 * @param {Array} args.mouvements       Lecture de charger() (cree_le, type, quantite,
 *                                      source, motif, produit_id, jointure produits).
 * @param {number|string} args.maintenant  Horodatage de reference (injecte, test deterministe).
 * @param {string} args.fuseau  Defaut 'Europe/Paris'.
 * @returns {{ feuilles: Array, optionsGlobales: { fontFamily: string, fontSize: number }, comptes: { nbProduits: number, nbMouvements: number } }}
 */
export function construireClasseurExcel({ produitsActifs = [], produitsRetires = [], mouvements = [], maintenant = Date.now(), fuseau = 'Europe/Paris' } = {}) {
  const actifs = (Array.isArray(produitsActifs) ? produitsActifs : []).filter(Boolean);
  const retiresBruts = (Array.isArray(produitsRetires) ? produitsRetires : []).filter(Boolean);
  // Meme regle que retenirProduitsExport (export.js) applique a un tableau
  // de produits tous actif===false : seuls ceux a stock non nul survivent.
  const retiresRetenus = retenirProduitsExport(retiresBruts);

  return {
    feuilles: [
      construireFeuilleACommander(actifs, maintenant, fuseau),
      construireFeuilleEtatStock(actifs, retiresRetenus, maintenant, fuseau),
      construireFeuilleMouvements(mouvements, actifs, retiresBruts, maintenant, fuseau),
    ],
    optionsGlobales: { fontFamily: 'Calibri', fontSize: 11 },
    // Chantier EX-1, lot 2 : comptes EXACTS de ce qui est dans "État du
    // stock" (actifs + retires retenus) et "Mouvements" (fenetre de
    // FENETRE_JOURS jours) -- pour le message de fin d'export de la glu
    // (dashboard.js), sans qu'elle ait besoin de recalculer ces filtres
    // elle-meme.
    comptes: {
      nbProduits: actifs.length + retiresRetenus.length,
      nbMouvements: mouvementsDansLaFenetre(mouvements, maintenant).length,
    },
  };
}

/**
 * Nom du fichier telecharge : `stovo_mon-stock_AAAA-MM-JJ.xlsx` (decision
 * du grilling du 01/10/2026, "Détails tranchés par le Jarvis").
 */
export function nomFichierExcel(maintenant = Date.now(), fuseau = 'Europe/Paris') {
  return `stovo_mon-stock_${formaterDateIso(maintenant, fuseau)}.xlsx`;
}

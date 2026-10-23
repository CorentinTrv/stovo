// STOVO — les missions de la démo, logique pure (lot L7, 08/10/2026)
// ====================================================================
// Module PUR : aucun DOM, aucun Supabase, aucune horloge lue. Même famille que
// premiers_pas_logique.js et demo_logique.js. Il décide quelles missions sont faites ; la glu
// (missions_demo.js) lit la base, appelle ces fonctions et pose le résultat à l'écran.
//
// Le principe (plan du 05/10/2026, point 7) : AUCUN drapeau d'étape n'est stocké. L'état de
// chaque mission se déduit à chaque fois de la base : les produits et les mouvements que le
// tableau de bord publie (stovo:donnees) et la ligne `demos` du visiteur. Un rechargement
// retrouve donc la même carte.
//
// Un mouvement « du visiteur » est un mouvement dicté APRÈS la création de sa démo :
// `source === 'vocal'` ET `cree_le >= demos.cree_le`. Ce que la démo copie du modèle à la
// création est en source 'manuel' et daté d'avant : il ne coche jamais rien.
//
// Un moteur pour N missions : chaque entrée de MISSIONS est { id, niveau, actif,
// emplacementTexte, verifier(etat) }. Les cinq de « L'essentiel » sont actives. Les cinq de
// « Pour aller plus loin » ont leur prédicat écrit et testé ici, mais restent INACTIVES : le
// lot L10 n'aura qu'à les activer et à poser leurs textes.

export const NIVEAU_ESSENTIEL = 'essentiel';
export const NIVEAU_PLUS_LOIN = 'plus-loin';

// Texte lisible d'une date PostgREST ('2026-10-08T09:00:00.123456+00:00'), en millisecondes ;
// null si illisible. Les microsecondes sont tronquées par Date.parse, sans effet ici : on ne
// compare jamais deux dates à moins d'une milliseconde, sauf l'égalité de la mission « Deux
// produits d'un coup », qui compare les TEXTES (voir plus bas).
function enMillisecondes(valeur) {
  if (typeof valeur !== 'string' || valeur.trim() === '') return null;
  const t = Date.parse(valeur);
  return Number.isNaN(t) ? null : t;
}

// Sans accent ni majuscule : « Bières », « BIERES » et « bières » sont le même produit.
// Forme échappée de la classe des accents combinants (jamais les caractères bruts).
function normaliser(texte) {
  return typeof texte === 'string' ? texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() : '';
}

// Les mouvements du visiteur : vocaux ET postérieurs (ou égaux) au début de sa démo. Un début
// inconnu ou illisible ne permet pas de dire ce qui est « du visiteur » : liste vide.
export function mouvementsDuVisiteur(mouvements, debutMs) {
  if (!Array.isArray(mouvements) || !Number.isFinite(debutMs)) return [];
  return mouvements.filter((m) => {
    if (m === null || typeof m !== 'object' || m.source !== 'vocal') return false;
    const t = enMillisecondes(m.cree_le);
    return t !== null && t >= debutMs;
  });
}

// Une trace de la ligne demos est posée quand elle contient une date (non vide).
const tracePosee = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';

const produitNomme = (produits, nom) => produits.find((p) => p !== null && typeof p === 'object' && normaliser(p.nom) === nom);

// etat = { debut, produits, visiteur, questionLe, reapproLe } : voir etatDesMissions.
export const MISSIONS = Object.freeze([
  {
    id: 'recevoir', niveau: NIVEAU_ESSENTIEL, actif: true, emplacementTexte: 'TEXTE_MISSION_01',
    // « j'ai reçu 24 lait » : une entrée du visiteur, sans motif (un compensateur d'annulation porte le motif erreur).
    verifier: (e) => e.visiteur.some((m) => m.type === 'entree' && m.motif == null),
  },
  {
    id: 'vendre-ou-casser', niveau: NIVEAU_ESSENTIEL, actif: true, emplacementTexte: 'TEXTE_MISSION_02',
    // « j'ai vendu 3 pâtes » : une sortie du visiteur, une vente (sans motif) ou une casse. Une perte
    // péremption, un vol, un inventaire ou un compensateur ne sont pas « vendre ou casser ».
    verifier: (e) => e.visiteur.some((m) => m.type === 'sortie' && (m.motif == null || m.motif === 'casse')),
  },
  {
    id: 'demander', niveau: NIVEAU_ESSENTIEL, actif: true, emplacementTexte: 'TEXTE_MISSION_03',
    // « combien de bières ? » ne laisse aucun mouvement : pwa-api note la première question dans demos.question_le (alerte A3).
    verifier: (e) => tracePosee(e.questionLe),
  },
  {
    id: 'le-matin', niveau: NIVEAU_ESSENTIEL, actif: true, emplacementTexte: 'TEXTE_MISSION_04',
    texteApres: 'TEXTE_MISSIONS_APRES_MATIN',
    // « Qu'est-ce que je dois commander ? » : même trace, demos.reappro_le.
    verifier: (e) => tracePosee(e.reapproLe),
  },
  {
    id: 'creer-produit', niveau: NIVEAU_ESSENTIEL, actif: true, emplacementTexte: 'TEXTE_MISSION_05',
    // « crée le produit yaourt » : un produit né depuis le début de la démo (ceux du modèle sont nés 21 à 45 jours avant).
    verifier: (e) => Number.isFinite(e.debut)
      && e.produits.some((p) => p !== null && typeof p === 'object' && (enMillisecondes(p.cree_le) ?? -Infinity) >= e.debut),
  },
  // --- « Pour aller plus loin » : prédicats prêts, missions inactives jusqu'au lot L10 ---
  {
    id: 'deux-produits', niveau: NIVEAU_PLUS_LOIN, actif: false, emplacementTexte: 'TEXTE_MISSION_06',
    // « j'ai vendu 3 pâtes et 2 riz » : deux produits DIFFÉRENTS écrits d'un coup (le tampon groupé partagé :
    // même texte de cree_le). Deux phrases séparées n'ont jamais le même tampon.
    verifier: (e) => e.visiteur.some((a, i) => e.visiteur.some((b, j) => j > i
      && a.produit_id !== b.produit_id && typeof a.cree_le === 'string' && a.cree_le === b.cree_le)),
  },
  {
    id: 'inventaire', niveau: NIVEAU_PLUS_LOIN, actif: false, emplacementTexte: 'TEXTE_MISSION_07',
    // « en rayon il y a 8 lait »
    verifier: (e) => e.visiteur.some((m) => m.motif === 'inventaire'),
  },
  {
    id: 'seuil', niveau: NIVEAU_PLUS_LOIN, actif: false, emplacementTexte: 'TEXTE_MISSION_08',
    // « le seuil des bières c'est 6 » : le modèle porte 12 (à revérifier au lot L10 si le modèle change).
    verifier: (e) => Number(produitNomme(e.produits, 'bieres')?.seuil_alerte) === 6,
  },
  {
    id: 'prix', niveau: NIVEAU_PLUS_LOIN, actif: false, emplacementTexte: 'TEXTE_MISSION_09',
    // « le prix des pâtes c'est 1,20 » : le modèle porte 0,80. Tolérance d'un demi-centime (numeric rendu en texte ou en nombre).
    verifier: (e) => {
      const prix = Number(produitNomme(e.produits, 'pates')?.prix_achat);
      return Number.isFinite(prix) && Math.abs(prix - 1.2) < 0.005;
    },
  },
  {
    id: 'annuler', niveau: NIVEAU_PLUS_LOIN, actif: false, emplacementTexte: 'TEXTE_MISSION_10',
    // « annule le dernier » : le compensateur d'annulation.ts porte le motif erreur.
    verifier: (e) => e.visiteur.some((m) => m.motif === 'erreur'),
  },
]);

// L'état de chaque mission ACTIVE d'un niveau, dans l'ordre de la table.
//   donnees = { produits, mouvements, ligne } : ce que stovo:donnees publie, et la ligne `demos`
//   du visiteur ({ cree_le, question_le, reappro_le }, ou null si elle n'est pas lue).
// Rend [{ id, niveau, emplacementTexte, texteApres?, fait }]. Une donnée absente ou d'une forme
// inattendue n'est jamais une exception : la mission n'est simplement pas faite (on ne coche
// jamais sans preuve). `missions` ne sert qu'aux tests.
export function etatDesMissions(donnees, niveau = NIVEAU_ESSENTIEL, missions = MISSIONS) {
  const d = donnees !== null && typeof donnees === 'object' ? donnees : {};
  const ligne = d.ligne !== null && typeof d.ligne === 'object' ? d.ligne : {};
  const debut = enMillisecondes(ligne.cree_le);
  const etat = {
    debut,
    produits: Array.isArray(d.produits) ? d.produits : [],
    visiteur: mouvementsDuVisiteur(d.mouvements, debut),
    questionLe: ligne.question_le,
    reapproLe: ligne.reappro_le,
  };
  return missions
    .filter((m) => m.actif && m.niveau === niveau)
    .map((m) => ({
      id: m.id,
      niveau: m.niveau,
      emplacementTexte: m.emplacementTexte,
      ...(m.texteApres ? { texteApres: m.texteApres } : {}),
      fait: m.verifier(etat) === true,
    }));
}

// Les missions d'un niveau sont-elles toutes faites ? Une liste vide n'est jamais « tout fait ».
export function essentielFait(etats) {
  return Array.isArray(etats) && etats.length > 0 && etats.every((m) => m.fait === true);
}

function texteDe(textes, nom) {
  const valeur = textes?.[nom];
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    throw new Error(`missions de la démo : le texte ${nom} est absent ou vide (demo_textes.js)`);
  }
  return valeur;
}

// La carte prête à dessiner : { titre, consigne, lignes: [{ id, titre, phrase, fait, apres? }], fini }.
// `fini` est le texte de fin quand les missions sont toutes faites, sinon null. Les textes viennent
// de demo_textes.js (passé en paramètre) : un texte manquant échoue tout de suite, avec son nom.
export function composerCarte(etats, textes) {
  return {
    titre: texteDe(textes, 'TEXTE_MISSIONS_TITRE'),
    consigne: texteDe(textes, 'TEXTE_MISSIONS_CONSIGNE'),
    lignes: etats.map((m) => ({
      id: m.id,
      titre: texteDe(textes, `${m.emplacementTexte}_TITRE`),
      phrase: texteDe(textes, `${m.emplacementTexte}_PHRASE`),
      fait: m.fait,
      ...(m.texteApres ? { apres: texteDe(textes, m.texteApres) } : {}),
    })),
    fini: essentielFait(etats) ? texteDe(textes, 'TEXTE_MISSIONS_FINI') : null,
  };
}

// Une mission prouvée reste cochée pour la vie de la page (correctif de revue du lot L7). Des lectures
// du tableau de bord qui se chevauchent peuvent se résoudre dans le désordre, et une publication plus
// ancienne ne montre pas encore un mouvement que la précédente montrait : sans cette fusion, une
// mission venait de se cocher puis se décochait. Les faits d'une mission sont irréversibles (un
// mouvement ne s'efface pas, une annulation en ajoute un autre ; une trace de la démo ne se remet pas
// à zéro), donc « déjà prouvée » vaut « faite ». Rien n'est stocké : un rechargement relit la base.
// Rend { etats, faites } : les états fusionnés, et les identifiants prouvés à retenir pour la suite.
// `dejaFaites` n'est jamais modifié ; un identifiant inconnu est ignoré.
export function fusionnerCoches(etats, dejaFaites) {
  const vues = new Set(Array.isArray(dejaFaites) ? dejaFaites : []);
  const fusion = etats.map((m) => ({ ...m, fait: m.fait === true || vues.has(m.id) }));
  return { etats: fusion, faites: fusion.filter((m) => m.fait).map((m) => m.id) };
}

// pilotage.js - Lot P-1 du chantier PILOTAGE (26/07/2026)
//
// JUMEAU DE _shared/pilotage.ts (backend). Toute modification de la formule
// de consommation/reappro passe par _shared/pilotage_cas.ts, le jeu d'essai
// COMMUN aux deux cotes. Voir le plan complet :
// context/import/app-stock/2026-07-25_architecte_plan-pilotage-consommation.md
// (§1 "la formule existe en TROIS exemplaires", §4 "la formule cible").
//
// Module PUR, JavaScript vanilla (pas de build, choix du 10/07/2026) : aucun
// DOM, aucun appel reseau. dashboard.js ET la page racine du site
// (livrables/sites-web/stovo/index.html) importent ce fichier au lieu de
// recopier la formule chacun de leur cote.
//
// LOT P-1 = pur refactor, ZERO changement de chiffre par rapport a l'ancien
// code duplique. FENETRE_JOURS etait a 7 a ce stade.
//
// LOT P-2b (26/07/2026) : la fenetre passe a 30 jours, mais BORNEE par
// l'anciennete du produit (plancher 7 jours). Regle tranchee par l'Architecte
// (plan §3 Q1 et §4) : un produit tout jeune ne peut pas etre juge sur 30
// jours qu'il n'a pas vecus (ca sous-estimerait sa conso), mais on ne
// descend jamais sous PLANCHER_OBSERVATION_JOURS (mesurer un rythme sur 2
// jours donnerait un chiffre demesure). C'est CE lot qui change le chiffre
// affiche, le lot P-1 n'avait touche a aucune valeur.
//
// LOT P-3 (26/07/2026) : fin de l'ecran muet (plan §3 Q2/Q3, §4). Le calcul de
// l'ETAT d'un produit (mesure/dormant/insuffisant) et du RESUME GLOBAL
// (gesteVivant, derniereSortieLe, compteurs) arrive ici, JAMAIS dans
// dashboard.js/stock.js : c'est ce qui garantit que la voix (backend) et
// l'ecran qualifient un produit de la meme facon. Ces fonctions sont
// volontairement INDEPENDANTES de calculerLignePilotage : pas de champ
// "etat" ajoute a son resultat, pour ne pas casser la parite deja acquise
// par P-1/P-2b (voir pilotage_cas.ts, CAS_PILOTAGE inchange).

export const FENETRE_JOURS = 30;                 // periode sur laquelle on mesure le rythme de consommation
export const PLANCHER_OBSERVATION_JOURS = 7;     // on ne mesure jamais un rythme sur moins d'une semaine
export const COUVERTURE_CIBLE_JOURS = 10; // combien de jours on veut tenir apres reception (curseur tresorerie)
export const SECURITE_JOURS = 3;          // marge de securite du point de commande (jours de conso ajoutes au delai)
export const GESTE_VIVANT_JOURS = 7;      // au-dela, on considere que la declaration de sorties s'est arretee
export const SEUIL_DORMANT_JOURS = 30;    // anciennete minimale pour oser dire d'un produit qu'il dort (aligne sur FENETRE_JOURS)

// Total des VRAIES sorties (type "sortie", SANS motif) par produit, dans la
// fenetre de FENETRE_JOURS jours. Regle inchangee, recopiee telle quelle de
// l'ancien dashboard.js : un mouvement avec motif (inventaire, casse,
// peremption, vol, erreur) n'est JAMAIS une vente (l'ecarte en conscience,
// voir _shared/pilotage_cas.ts qui grave ce cas).
//
// Retourne un objet simple {produit_id: total}, comme le faisait dashboard.js
// (le backend, lui, retourne une Map : cote pur mais idiome propre a chaque
// langage, sans consequence sur le resultat calcule).
export function calculerSortiesParProduit(mouvements, maintenantMs = Date.now()) {
  const limite = maintenantMs - FENETRE_JOURS * 864e5;
  const sorties = {};
  (mouvements || []).forEach((m) => {
    if (!m || m.type !== 'sortie' || m.motif) return;
    const t = new Date(m.cree_le).getTime();
    if (!Number.isFinite(t) || t < limite) return;
    sorties[m.produit_id] = (sorties[m.produit_id] || 0) + Number(m.quantite);
  });
  return sorties;
}

// Anciennete d'un produit en jours, a partir de sa date de creation (LOT
// P-3, exporte pour servir aussi au calcul de l'etat "dormant" ci-dessous).
// Repli PRUDENT sur FENETRE_JOURS si cree_le est absent ou illisible :
// exactement le comportement d'une fenetre fixe, jamais une exception (meme
// regle que calculerJoursObserves, qui reutilise cette fonction).
//
// maintenantMs : injecte pour rendre la fonction deterministe en test.
export function calculerAncienneteJours(creeLe, maintenantMs = Date.now()) {
  if (!creeLe) return FENETRE_JOURS;
  const t = new Date(creeLe).getTime();
  if (!Number.isFinite(t)) return FENETRE_JOURS;
  return (maintenantMs - t) / 864e5;
}

// Combien de jours on observe REELLEMENT le rythme d'un produit (LOT P-2b) :
// borne par son anciennete, entre PLANCHER_OBSERVATION_JOURS et FENETRE_JOURS.
// - Produit age d'au moins FENETRE_JOURS : on mesure sur la fenetre entiere.
// - Produit tout jeune (moins de PLANCHER_OBSERVATION_JOURS) : on mesure quand
//   meme sur PLANCHER_OBSERVATION_JOURS, jamais moins (sinon un chiffre demesure).
// - cree_le absent ou illisible : repli PRUDENT sur FENETRE_JOURS (voir
//   calculerAncienneteJours), exactement le comportement d'une fenetre fixe.
function calculerJoursObserves(creeLe, maintenantMs) {
  const ancienneteJours = calculerAncienneteJours(creeLe, maintenantMs);
  return Math.min(FENETRE_JOURS, Math.max(PLANCHER_OBSERVATION_JOURS, ancienneteJours));
}

// Calcule consoJour / couverture / point de commande / quantite a commander
// pour UN produit, a partir du total de ses sorties recentes (deja agrege par
// calculerSortiesParProduit). Fonction pure, aucun effet de bord.
//
// maintenantMs : injecte pour rendre la fonction deterministe en test (sert au
// calcul de l'anciennete du produit, LOT P-2b).
export function calculerLignePilotage(produit, totalSorties, maintenantMs = Date.now()) {
  const stock = Number(produit.stock_actuel);
  const joursObserves = calculerJoursObserves(produit.cree_le, maintenantMs);
  const conso = (totalSorties || 0) / joursObserves;
  const delai = Number(produit.delai_repro_jours) || 0;

  const couverture = conso > 0 ? stock / conso : null;
  // Point de commande DYNAMIQUE : de quoi tenir le delai de livraison plus une
  // marge, au rythme reel des ventes. Repli sur le seuil fige tant qu'aucune
  // vente recente ne permet de le calculer.
  const pdcDynamique = conso > 0 ? Math.max(1, Math.ceil(conso * (delai + SECURITE_JOURS))) : null;
  const pointCommande = pdcDynamique !== null ? pdcDynamique : Number(produit.seuil_alerte);

  const qteCommander = conso > 0
    ? Math.max(0, Math.ceil(conso * (delai + COUVERTURE_CIBLE_JOURS) - stock))
    : null;

  return { consoJour: conso, couverture, pdcDynamique, pointCommande, qteCommander };
}

// Etat de pilotage d'UN produit (LOT P-3, plan §3 Q3). Fonction pure et
// volontairement separee de calculerLignePilotage (voir l'en-tete du fichier).
// - "mesure" : au moins une sortie sans motif dans la fenetre (consoJour > 0).
// - "dormant" : zero sortie, produit age d'au moins SEUIL_DORMANT_JOURS, ET
//   le geste de sortie est vivant (sinon ce n'est pas le stock qui dort,
//   c'est le geste : voir calculerGesteVivant, GARDE-FOU grave par
//   pilotage_cas.ts).
// - "insuffisant" : tout le reste, on ne sait pas encore.
export function calculerEtatProduit(consoJour, ancienneteJours, gesteVivant) {
  if (consoJour > 0) return 'mesure';
  if (ancienneteJours >= SEUIL_DORMANT_JOURS && gesteVivant) return 'dormant';
  return 'insuffisant';
}

// Le geste de sortie est-il vivant ? Vrai s'il existe au moins une sortie
// sans motif, TOUS PRODUITS CONFONDUS, dans les GESTE_VIVANT_JOURS derniers
// jours. Tant qu'il est faux, aucun produit ne peut etre etiquete "dormant"
// (plan §3 Q3) : le bandeau global explique alors pourquoi (niveau 1, dashboard.js).
//
// maintenantMs : injecte pour rendre la fonction deterministe en test.
export function calculerGesteVivant(mouvements, maintenantMs = Date.now()) {
  const limite = maintenantMs - GESTE_VIVANT_JOURS * 864e5;
  return (mouvements || []).some((m) => {
    if (!m || m.type !== 'sortie' || m.motif) return false;
    const t = new Date(m.cree_le).getTime();
    return Number.isFinite(t) && t >= limite;
  });
}

// Date de la sortie sans motif la plus recente, tous produits confondus, ou
// null si aucune sortie n'existe. Sert la phrase du bandeau global ("depuis
// le 15 juillet", plan §3 Q2 niveau 1). Meme filtre "ecarte en conscience"
// que calculerSortiesParProduit : un mouvement avec motif ne compte jamais.
export function calculerDerniereSortieLe(mouvements) {
  let plusRecente = null;
  let plusRecenteMs = -Infinity;
  (mouvements || []).forEach((m) => {
    if (!m || m.type !== 'sortie' || m.motif) return;
    const t = new Date(m.cree_le).getTime();
    if (!Number.isFinite(t) || t <= plusRecenteMs) return;
    plusRecenteMs = t;
    plusRecente = m.cree_le;
  });
  return plusRecente;
}

// Combien de produits sont dans chaque etat, a partir de la liste deja
// calculee (une entree par produit, ex. produits.map(p => p._etat)). Pur
// agregat, aucun nouveau calcul : sert le lot P-6 (photo de l'instrument
// repare) et un futur chiffre de synthese (lot P-5).
export function compterEtats(etats) {
  const compteurs = { mesure: 0, dormant: 0, insuffisant: 0 };
  (etats || []).forEach((e) => { compteurs[e]++; });
  return compteurs;
}

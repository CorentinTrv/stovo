// STOVO — registre des icônes SVG en trait
// (lot « l'app rejoint le monde clair, suite », 23/08/2026)
// ====================================================================
// Module PUR : aucun DOM, zéro import. Une seule spécification pour toutes
// les icônes de ce fichier : viewBox 0 0 20 20, trait 1,8, currentColor, sans
// remplissage, bouts et jonctions arrondis, deux ou trois tracés au plus. Ces
// quatre réglages sont posés UNE FOIS sur le <svg> englobant (voir plus bas) :
// les tracés stockés ci-dessous n'ont donc pas à les répéter, ils héritent
// par la cascade SVG normale.
//
// Les icônes de la nav (pilotage, stock, parler, aide) sont recopiées ici
// avec le MÊME tracé que index.html : la barre de navigation reste inline
// dans le HTML (elle ne dépend pas de ce module), mais le micro de l'écran
// Parler (tracé « parler ») et la colonne Source du tableau de bord (tracés
// « parler » et « clavier ») doivent rester visuellement identiques à la nav.
// Si un tracé change ici, il doit changer aussi dans index.html (et
// réciproquement) : un commentaire le rappelle aux deux endroits.
//
// Chaque icône a une taille par défaut de 20x20 (attribut de présentation,
// posé ci-dessous) : une règle CSS ciblée sur le conteneur
// (`.aide-icone svg { width: 22px; height: 22px; }`) l'emporte toujours si
// une autre taille est voulue à un endroit précis — la spécification du
// trait, elle, ne bouge jamais.

const TRACES = {
  // ---- mêmes tracés que la nav de index.html, à garder synchronisés ----
  pilotage: '<path d="M3 16h14M5 13V9M9 13V5M13 13v-3M17 13V7"/>',
  stock: '<path d="M3 7l7-3.5L17 7v7l-7 3.5L3 14V7zM3 7l7 3.5L17 7M10 10.5V17.5"/>',
  parler: '<path d="M10 3a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 10 3zM5 9.5a5 5 0 0 0 10 0M10 14.5V17M7.5 17h5"/>',
  aide: '<path d="M7.2 7.6a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1-1.5 2M10 15.5h.01M10 17.5a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"/>',

  // ---- sections de l'onglet Aide ----
  boussole: '<circle cx="10" cy="10" r="7.5"/><path d="M12.8 7.2l-1.6 3.8-3.8 1.6 1.6-3.8z"/>',
  bulle: '<path d="M4 5.5h12a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H9l-3 2.5V14H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z"/>',
  ampoule: '<path d="M10 3.5a4.5 4.5 0 0 0-2.5 8.2c.5.35.8.9.8 1.5v.3h3.4v-.3c0-.6.3-1.15.8-1.5A4.5 4.5 0 0 0 10 3.5z"/><path d="M8.3 15.5h3.4M8.7 17h2.6"/>',
  recu: '<path d="M6 3.5h8v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z"/><path d="M8 7h4M8 9.5h4M8 12h2.5"/>',

  // ---- gestes vocaux (section « Tout ce que tu peux dire » + boutons de Parler) ----
  entree: '<path d="M4 13v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/><path d="M10 3v8m0 0l-3-3m3 3l3-3"/>',
  sortie: '<path d="M4 6.5V3.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3"/><path d="M10 17V9m0 0l-3 3m3-3l3 3"/>',
  question: '<path d="M7.5 7.6a2.5 2.5 0 1 1 3.6 2.3c-.7.35-1.1.8-1.1 1.6"/><path d="M10 15h.01"/>',
  panier: '<path d="M4.5 6.5h11l-1.2 6.5a1 1 0 0 1-1 .8H6.7a1 1 0 0 1-1-.8L4.5 6.5z"/><path d="M7.3 6.5l1.4-3h2.6l1.4 3"/>',
  corbeille: '<path d="M4.5 6h11M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M6 6l.6 9.5a1 1 0 0 0 1 .95h4.8a1 1 0 0 0 1-.95L14 6"/><path d="M8.5 9v5M11.5 9v5"/>',
  recaler: '<path d="M10 4v12M6.5 16h7"/><path d="M4 7.5h5M11 7.5h5M4.7 7.5l-1.6 3a1.6 1.6 0 0 0 3.2 0zM14.9 7.5l-1.6 3a1.6 1.6 0 0 0 3.2 0z"/>',
  annuler: '<path d="M5 8h7a4 4 0 0 1 0 8H8"/><path d="M8 4.5L5 8l3 3.5"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  crayon: '<path d="M12.5 4.5l3 3L7 16l-3.5.5.5-3.5z"/><path d="M11 6l3 3"/>',
  renommer: '<rect x="2" y="5" width="16" height="10" rx="2"/><path d="M8.5 7h3M10 7v6M8.5 13h3"/>',
  interrupteur: '<rect x="4" y="7.5" width="12" height="5" rx="2.5"/><circle cx="8.5" cy="10" r="1.6" fill="currentColor" stroke="none"/>',
  etiquette: '<path d="M4 4.5h6l6 6-6.5 6.5-6-6z"/><circle cx="8" cy="8" r="1.2"/>',
  inventaire: '<path d="M4.5 6.5l1.3 1.3L8.3 5M4.5 10.5l1.3 1.3 2.5-2.6M4.5 14.5l1.3 1.3 2.5-2.6"/><path d="M11 6h5M11 10.5h5M11 15h5"/>',
  carton: '<path d="M3.5 7.5L10 4l6.5 3.5L10 11z"/><path d="M3.5 7.5V14L10 17.5V11M16.5 7.5V14L10 17.5"/>',
  'moins-cercle': '<circle cx="10" cy="10" r="7"/><path d="M6.5 10h7"/>',
  'appareil-photo': '<path d="M4 8a1.5 1.5 0 0 1 1.5-1.5h1L7.5 5h5l1 1.5h1A1.5 1.5 0 0 1 16 8v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 15z"/><circle cx="10" cy="11" r="2.6"/>',
  'document-fleche': '<path d="M6 3.5h6l3 3V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M10 8v6m0 0l-2-2m2 2l2-2"/>',

  // ---- colonne « Source » du tableau des mouvements (dashboard.js) ----
  clavier: '<rect x="3.5" y="6" width="13" height="8" rx="1.5"/><path d="M6 9h1M9 9h1M12 9h1M6 12h6M13.5 12h1"/>',
};

// ICONES[cle] : la chaîne SVG complète (spécification commune + tracé),
// prête à être insérée en innerHTML. Construit une fois au chargement du
// module : pas de recalcul à chaque appel. Clé inconnue -> undefined, jamais
// une erreur (aide.js teste la présence avant d'afficher, voir aide.js).
export const ICONES = Object.fromEntries(
  Object.entries(TRACES).map(([cle, traces]) => [
    cle,
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${traces}</svg>`,
  ]),
);

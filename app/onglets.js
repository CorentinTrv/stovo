// STOVO — libellés visibles des quatre onglets (lot 1a « Saisir », 14/09/2026)
// ====================================================================
// Module PUR : aucun DOM, zéro import, même famille que aide-contenu.js et
// icones.js. Un seul endroit relie la clé technique `data-onglet` de la
// barre de navigation (index.html) au libellé VISIBLE affiché à l'écran.
// Les trois formes de visibilité annoncées le 14/09/2026 (une Aide refondue,
// des indices au moment où le besoin naît, un parcours guidé) liront ce
// module : un futur renommage d'onglet ne coûtera qu'une ligne ici, au lieu
// d'un grep sur tout le dépôt.
//
// `index.html` garde ses libellés EN DUR dans le HTML (ne pas les remplacer
// par un rendu JS au chargement) : afficher la barre de navigation avant que
// ce module soit importé évite qu'elle apparaisse vide le temps du
// chargement du JavaScript. C'est `onglets_test.js` qui vérifie que
// `index.html` reste synchronisé avec ce module, pas un rendu à l'exécution.
//
// Les noms INTERNES ne changent jamais avec le libellé visible : la clé
// `parler` reste `parler` (data-onglet="parler", parler.js, parler_logique.js,
// #champ-parler, #form-parler, viderParler, la clé d'icône 'parler'...) même
// si son libellé affiché est désormais « Saisir ».

const LIBELLES_ONGLETS = Object.freeze({
  dashboard: 'Pilotage',
  stock: 'Stock',
  parler: 'Saisir',
  aide: 'Aide',
});

// libelleOnglet(cle) : le libellé visible pour une clé data-onglet donnée,
// ou undefined si la clé est inconnue (jamais une erreur, même esprit que
// ICONES dans icones.js : un appelant teste la présence avant d'afficher).
export function libelleOnglet(cle) {
  return LIBELLES_ONGLETS[cle];
}

export { LIBELLES_ONGLETS };

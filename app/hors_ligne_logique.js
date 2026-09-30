// STOVO — logique pure du repli hors ligne (D49, 25/09/2026)
// ====================================================================
// Test 10 du protocole iPhone du 16/09 : hors ligne, la coquille s'affiche
// (le service worker sert le cache, il fait son travail) mais le contenu ne
// vient jamais, sans un mot — probablement parce que la vérification de
// session (app.js, getSessionActuelle) attend une réponse réseau qui
// n'arrivera pas. Module PUR (aucun DOM, aucun Supabase, même famille que
// recuperation_logique.js/maj_worker.js) : app.js lit `navigator.onLine`
// (vrai signal envoyé par `context.setOffline` de Playwright comme par un
// vrai avion en mode avion) et appelle les deux fonctions ci-dessous, sans
// jamais attendre getSessionActuelle() tant que l'appareil est hors ligne.

// Texte affiché dans #hors-ligne-message (index.html), UNE SEULE constante
// (validé par Corentin avant déploiement) : aucun autre endroit du code ne
// doit réécrire ce texte à la main.
export const MESSAGE_HORS_LIGNE =
  "Pas de connexion. Stovo a besoin d'internet pour lire ton stock. Dès que le réseau revient, l'app reprend toute seule.";

// `navigateurEnLigne` est directement `navigator.onLine` : un booléen la
// plupart du temps, mais certains navigateurs anciens ne le posent jamais
// (`undefined`) — dans ce cas on se comporte comme avant D49 (pas de repli,
// comportement inchangé) plutôt que de risquer un faux "hors ligne" permanent.
export function fautIlAfficherRepliHorsLigne(navigateurEnLigne) {
  return navigateurEnLigne === false;
}

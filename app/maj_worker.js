// STOVO — logique pure de la bannière « nouvelle version prête » (lot A6,
// 25/08/2026)
// ====================================================================
// Module PUR : aucun DOM, aucune API Service Worker ici (même famille que
// export.js, pertes.js, pilotage.js — voir la mémoire d'agent
// feedback-test-pwa-offline). C'est app.js qui observe le vrai service
// worker (registration.waiting, updatefound/statechange, controllerchange)
// et qui transmet seulement des booléens à ce module. Deux responsabilités
// testables sans navigateur :
//   1. faut-il montrer la bannière, à partir des deux chemins de détection
//      décrits par la marche à suivre de l'Architecte ;
//   2. garantir qu'un seul reload se déclenche, même si l'événement
//      'controllerchange' arrivait plusieurs fois (leçon idempotence,
//      CLAUDE.md : un événement ne doit jamais s'appliquer deux fois).
//
// Choix n°5 de l'Architecte (gravé, jamais remis en cause ici) : aucune mise
// à jour automatique, aucun reload forcé. Ce module ne déclenche rien tout
// seul : il répond aux questions que lui pose app.js, et c'est app.js qui
// agit uniquement sur un geste de l'utilisateur (le tap sur la bannière).

export const TEXTE_BANNIERE_MAJ = 'Nouvelle version prête. Appuie pour recharger.';

// `waitingAuChargement` : `registration.waiting` était déjà rempli dès le
// premier appel (un onglet précédent avait laissé une version installée
// mais jamais activée — l'attente existait AVANT que cette page ne se
// charge).
// `installeEnSessionAvecControlleur` : un nouveau service worker vient de
// passer à l'état "installed" EN COURS DE SESSION, et un controller actif
// existait déjà à ce moment-là (sinon ce serait la toute première
// installation de l'app sur cet appareil, rien à « mettre à jour »).
// Les deux chemins mènent au même affichage (un simple OU) : c'est à app.js
// de distinguer les deux cas à partir des vrais événements du navigateur,
// ce module se contente de dire oui/non à partir de ce qu'on lui rapporte.
export function fautIlAfficherLaBanniereMaj({ waitingAuChargement, installeEnSessionAvecControlleur } = {}) {
  return Boolean(waitingAuChargement) || Boolean(installeEnSessionAvecControlleur);
}

// Garde anti-double-reload. Leçon n8n gravée dans CLAUDE.md (un node à deux
// entrées tournait deux fois et créait 6 produits au lieu de 3) : ici,
// l'événement 'controllerchange' pourrait en théorie être reçu plusieurs
// fois (plusieurs onglets, ou le navigateur qui répète l'événement) et
// chaque reçu ne doit déclencher qu'UN SEUL reload. Le premier appel
// autorise (renvoie `true`), tous les suivants sont ignorés (renvoie
// `false`). Un seul booléen fermé sur la fonction retournée, rien de plus.
export function creerGardeUnSeulReload() {
  let dejaDeclenche = false;
  return function autoriserReload() {
    if (dejaDeclenche) return false;
    dejaDeclenche = true;
    return true;
  };
}

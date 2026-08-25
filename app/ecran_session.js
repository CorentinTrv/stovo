// STOVO — bascule connexion / application (extrait de app.js au lot A4,
// 24/08/2026)
// ====================================================================
// `afficherApp`/`afficherLogin` vivaient jusqu'ici directement dans app.js
// (lot 9b). Extraites ici pour une seule raison : le nouveau parcours "mot de
// passe perdu" (recuperation.js) doit, lui aussi, pouvoir ouvrir l'app une
// fois le mot de passe changé (bouton "Ouvrir Stovo" de l'écran "Fait"), sans
// dupliquer cette logique ni créer un import circulaire entre app.js et
// recuperation.js. Les deux modules importent donc ce fichier, qui ne
// connaît ni l'un ni l'autre.
//
// Comportement INCHANGÉ par rapport à app.js (lot 9b) : aucune ligne de
// logique n'a changé, seul l'emplacement bouge.
//
// Lot "sortie de session propre" (25/08/2026) : `afficherLogin()` purge
// désormais tout résidu d'affichage du compte qui vient de se déconnecter,
// AVANT que #app-shell ne redevienne visible pour un éventuel prochain
// compte (défaut constaté le 25/08 en changeant de compte sur l'iPhone :
// jusqu'à 30 s de stock de l'ancien compte affiché). Deux purges seulement,
// une par « famille » de puits d'affichage : dashboard.js (Pilotage + Stock,
// via l'événement 'stovo:donnees') et parler.js (zone de réponse/choix, plus
// les 3 modes de session réception/sortie/inventaire, qu'il orchestre déjà).
// `afficherApp()` rejoue `charger()` à CHAQUE ouverture (voir dashboard.js) :
// c'est ce qui repeint l'écran sans attendre le prochain setInterval.
//
// Jamais appelé pendant une récupération de mot de passe : `afficherLogin()`
// n'est invoquée que par app.js (chargement initial sans session, ou
// `onAuthChange`), et `onAuthChange` ignore tout tant que
// `gardeRecuperation.estEnCours()` est vrai (voir app.js et le registre du
// brief de ce lot) — la purge ne peut donc jamais effacer le message
// d'erreur affiché par recuperation.js sur sa propre carte.

import { demarrerDashboard, viderDashboard } from './dashboard.js';
import { viderParler } from './parler.js';

const $ = (id) => document.getElementById(id);

export function afficherApp() {
  $('ecran-login').hidden = true;
  $('app-shell').hidden = false;
  demarrerDashboard();
}

export function afficherLogin() {
  $('app-shell').hidden = true;
  $('ecran-login').hidden = false;
  viderDashboard();
  viderParler();
  // Appareil partagé (point 1 du brief) : l'e-mail de l'ancien compte ne
  // doit pas rester pré-rempli. Le mot de passe n'est déjà jamais laissé
  // (voir seConnecter() dans app.js), vidé ici aussi par sécurité/symétrie.
  $('login-email').value = '';
  $('login-mdp').value = '';
  // Troisième puits trouvé au grep de ce lot (reglages.js, hors du périmètre
  // de fichiers du brief, mais son contenu EST un résidu de compte) : l'écran
  // Réglages ne se repeint que sur l'événement 'stovo:onglet' (remplirReglages,
  // reglages.js), jamais tout seul à la reconnexion. Comme app.js ne remet
  // jamais l'onglet actif sur "dashboard" après une reconnexion (la seule
  // porte de sortie est justement Réglages → Déconnexion), l'e-mail affiché
  // et le lien "Écrire à Corentin" (qui l'embarque dans son corps, voir
  // contact.js) resteraient ceux de l'ancien compte tant que le prochain
  // compte ne revisite pas Réglages. Remis à l'état initial d'index.html.
  const reglagesEmail = $('reglages-email');
  if (reglagesEmail) reglagesEmail.textContent = '';
  const reglagesMailto = $('reglages-mailto');
  if (reglagesMailto) reglagesMailto.href = '#';
  // Correction post-relecture du Jarvis (25/08/2026, meme lot) : sans ceci,
  // l'ecran actif au moment de la deconnexion restait affiche a la
  // reconnexion (app.js ne remet jamais l'onglet sur "dashboard" tout seul,
  // et la SEULE porte de sortie est Reglages -> Deconnexion) — le prochain
  // compte tombait donc sur un ecran Reglages fraichement vide au lieu du
  // Pilotage (l'ecran par defaut impose par la spec). L'evenement existant
  // 'stovo:onglet' (deja ecoute par app.js, deja utilise par aide.js/
  // reglages.js/dashboard.js) fait exactement ca sans qu'aucune ligne
  // n'ait besoin de changer dans app.js : il ne bascule que vers un ecran
  // connu (garde deja en place cote app.js).
  document.dispatchEvent(new CustomEvent('stovo:onglet', { detail: { onglet: 'dashboard' } }));
}

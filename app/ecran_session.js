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

import { demarrerDashboard } from './dashboard.js';

const $ = (id) => document.getElementById(id);

export function afficherApp() {
  $('ecran-login').hidden = true;
  $('app-shell').hidden = false;
  demarrerDashboard();
}

export function afficherLogin() {
  $('app-shell').hidden = true;
  $('ecran-login').hidden = false;
}

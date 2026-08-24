// STOVO — logique pure du mot de passe perdu (lot A4, 24/08/2026)
// ====================================================================
// Module PUR : aucun DOM, aucun Supabase (même famille que maj_worker.js,
// pilotage.js, pertes.js — voir la mémoire d'agent
// feedback-test-pwa-offline). Deux responsabilités testables sans navigateur
// ni réseau :
//
//   1. La garde de récupération (creerGardeRecuperation) : LE PIÈGE MAJEUR du
//      lot (§1.3 de l'analyse, point 4 du brief). `verifyOtp` pose une
//      session Supabase avant même que le nouveau mot de passe ne soit
//      enregistré, donc `onAuthChange` de app.js déclencherait `afficherApp()`
//      trop tôt. Cette garde est un simple booléen fermé sur trois fonctions,
//      posée/levée par recuperation.js AUTOUR de l'appel verifyOtp ->
//      updateUser, et consultée par app.js avant de basculer vers l'app.
//   2. La minuterie des 60 secondes avant de pouvoir renvoyer un code
//      (Supabase refuse un second envoi avant une minute, `max_frequency`).
//      Le calcul est pur (deux horodatages en entrée, un nombre de secondes
//      en sortie) : c'est recuperation.js qui rappelle ces fonctions chaque
//      seconde avec `Date.now()`, jamais de `setInterval` ici.

// Garde de récupération. Même patron que creerGardeUnSeulReload
// (maj_worker.js) : un état fermé sur des fonctions, pas une classe, pas de
// singleton imposé — recuperation.js en crée UNE instance et la partage avec
// app.js (import nommé), pour que les deux lisent le même état.
export function creerGardeRecuperation() {
  let enCours = false;
  return {
    demarrer() { enCours = true; },
    terminer() { enCours = false; },
    estEnCours() { return enCours; },
  };
}

// Secondes restantes avant de pouvoir renvoyer un code, bornées entre 0 et
// dureeMs/1000 (jamais négatif, jamais au-dessus de la durée totale même si
// l'horloge de l'appareil recule entre deux appels). `Math.ceil` : à
// 59,4 secondes écoulées il reste encore "1" seconde affichée, pas "0" avant
// que la minute soit vraiment passée.
export function calculerSecondesRestantesRenvoi(debutMs, maintenantMs, dureeMs = 60000) {
  const ecoule = maintenantMs - debutMs;
  const restant = Math.ceil((dureeMs - ecoule) / 1000);
  return Math.max(0, Math.min(Math.ceil(dureeMs / 1000), restant));
}

// Texte exact du lien "Renvoyer un code", planche Code2Saisie : "Renvoyer un
// code (dans 52 s)" pendant le compte à rebours, "Renvoyer un code" une fois
// la minute écoulée.
export function libelleRenvoi(secondesRestantes) {
  return secondesRestantes > 0
    ? `Renvoyer un code (dans ${secondesRestantes} s)`
    : 'Renvoyer un code';
}

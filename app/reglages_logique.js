// STOVO — logique pure de l'écran Réglages (lot D31, 13/09/2026, après
// relecture)
// ====================================================================
// validerChangementMotDePasse vivait dans auth.js, dont l'en-tête promet un
// pur client Auth qui ne connaît aucun écran (voir son commentaire de tête).
// Déménagée ici, dans la forme de recuperation_logique.js et
// couleur_logique.js : module PUR, aucun DOM, aucun réseau, testable seul.

// Validation du formulaire "Changer mon mot de passe". L'ordre des
// contrôles compte : le mot de passe actuel manquant se signale avant tout
// le reste (règle la plus probable en premier), puis le nouveau mot de
// passe vide (le formulaire est `novalidate`, sans ce contrôle un envoi à
// vide partirait au serveur), puis la non-correspondance des deux nouveaux.
export function validerChangementMotDePasse({ actuel, nouveau, confirmation }) {
  if (!actuel || !actuel.trim()) {
    return { ok: false, message: "Indique d'abord ton mot de passe actuel." };
  }
  if (!nouveau || !nouveau.trim()) {
    return { ok: false, message: 'Choisis un nouveau mot de passe.' };
  }
  if (nouveau !== confirmation) {
    return { ok: false, message: 'Les deux mots de passe ne correspondent pas.' };
  }
  return { ok: true };
}

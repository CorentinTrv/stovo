// STOVO — authentification (lot 9b) + mot de passe perdu et changement de
// mot de passe (lot A4, 24/08/2026)
// =====================================
// Choix n°6 de l'Architecte (marche à suivre phase 2, 2026-07-10) :
// Supabase Auth, UN SEUL compte (email + mot de passe) au départ, créé côté
// Supabase par Corentin (Authentication → Users). Ce module ne fait toujours
// aucune écriture de données métier : il pose une session (JWT géré par
// supabase-js), ou la met à jour. L'écriture sécurisée via ce JWT vit dans
// pwa-api (étape 10).
//
// Lot A4 : mot de passe perdu PAR CODE (jamais par lien, décision tranchée
// le 23/08 : un lien ouvre Safari sur iPhone, pas la PWA installée — voir
// context/import/app-stock/2026-08-23_analyse_mdp-couleurs-contact.md §1.2).
// `demanderCodeRecuperation` et `verifierCode` sont des enveloppes minces
// autour de l'API Auth de Supabase (resetPasswordForEmail, verifyOtp), sur
// le même modèle que seConnecter/seDeconnecter ci-dessous : elles ne sont
// pas testées au banc (appel réseau), seule la traduction des erreurs
// (messageLisible) et la logique pure de récupération (recuperation_logique.js)
// le sont. L'orchestration verifyOtp -> updateUser -> garde de récupération
// vit dans recuperation.js (DOM), PAS ici : ce fichier reste un pur client
// Auth, sans connaître l'écran qui l'appelle.

import { supabase } from './supabase.js';

// Traduit les erreurs Supabase les plus courantes en français lisible.
// Repli sur le message brut si le cas n'est pas prévu : mieux vaut un
// message technique visible qu'une erreur avalée en silence.
// Exportée depuis le lot A4 pour son banc Deno (auth_test.js) : les 5 erreurs
// ajoutées (§1.3 de l'analyse) couvrent le code faux/périmé, le renvoi trop
// tôt, le mot de passe trop court, identique à l'ancien, et le plafond
// d'envoi — les 3 cas d'origine (lot 9b) ne changent pas.
export function messageLisible(erreur) {
  const brut = erreur?.message || '';
  if (/invalid login credentials/i.test(brut)) {
    return 'Email ou mot de passe incorrect.';
  }
  if (/email not confirmed/i.test(brut)) {
    return "Ce compte n'a pas encore été confirmé.";
  }
  if (/email logins are disabled/i.test(brut)) {
    return "La connexion par email n'est pas activée sur ce projet.";
  }
  if (/token has expired or is invalid/i.test(brut)) {
    return 'Ce code est faux ou a expiré. Vérifie les six chiffres, ou demande un nouveau code.';
  }
  const attente = brut.match(/only request this after (\d+) seconds?/i);
  if (attente) {
    return `Attends encore ${attente[1]} secondes avant de redemander un code.`;
  }
  const tropCourt = brut.match(/password should be at least (\d+) characters?/i);
  if (tropCourt) {
    return `Ton mot de passe doit faire au moins ${tropCourt[1]} caractères.`;
  }
  if (/new password should be different from the old password/i.test(brut)) {
    return "Choisis un mot de passe différent de l'ancien.";
  }
  if (/email rate limit exceeded/i.test(brut)) {
    return 'Trop de mails envoyés récemment, réessaie un peu plus tard.';
  }
  // Point P3 signalé par le Jarvis à la relecture (24/08/2026) : le champ
  // e-mail de "Recevoir un code" porte `novalidate` (comme #form-login),
  // donc un e-mail vide ou mal formé part réellement vers Supabase au lieu
  // d'être bloqué par la validation native du navigateur.
  if (/unable to validate email address/i.test(brut)) {
    return "Cette adresse e-mail n'est pas valide.";
  }
  return brut || 'Connexion impossible, réessaie.';
}

// Lit la session en cours (null si personne n'est connecté).
export async function getSessionActuelle() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Erreur de lecture de session Stovo :', error.message);
    return null;
  }
  return data.session;
}

// Tente une connexion. Renvoie toujours { ok, message } : jamais d'exception
// qui remonterait jusqu'à l'appelant, le formulaire n'a qu'à lire `ok`.
export async function seConnecter(email, motDePasse) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: motDePasse,
  });
  if (error) {
    return { ok: false, message: messageLisible(error) };
  }
  return { ok: true, message: '', session: data.session };
}

// Déconnexion : purge la session locale et distante.
export async function seDeconnecter() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Erreur de déconnexion Stovo :', error.message);
  }
}

// S'abonne aux changements de session (connexion, déconnexion, expiration/
// renouvellement du jeton). Renvoie la fonction de désabonnement, au cas où
// un appelant futur en aurait besoin (pas utilisé par app.js pour l'instant,
// la page vit le temps de la session).
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_evenement, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

// --- Lot A4 (24/08/2026) : mot de passe perdu par code, changement connecté ---

// Demande l'envoi d'un code à 6 chiffres par mail (sans `redirectTo` : le
// chemin par lien n'existe pas dans Stovo). Supabase répond de la même façon
// que l'adresse existe ou non (§1.1 de l'analyse, aucun indice sur
// l'existence d'un compte) : `ok:true` ne veut donc PAS dire "cette adresse a
// un compte", seulement "la demande est partie sans erreur".
export async function demanderCodeRecuperation(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    return { ok: false, message: messageLisible(error) };
  }
  return { ok: true };
}

// Vérifie le code reçu. En cas de succès, Supabase pose une session (type
// `recovery`) : c'est le PIÈGE du lot, géré par l'appelant (recuperation.js)
// via la garde de recuperation_logique.js, jamais ici.
export async function verifierCode(email, code) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (error) {
    return { ok: false, message: messageLisible(error) };
  }
  return { ok: true };
}

// Change le mot de passe de la session en cours (connecté normalement, ou en
// pleine récupération juste après verifierCode). Pas de re-saisie de
// l'ancien mot de passe : l'option Supabase "Secure password change" reste
// désactivée (son défaut, §1.3 de l'analyse), c'est un réglage du projet, pas
// de ce code.
export async function changerMotDePasse(nouveauMotDePasse) {
  const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
  if (error) {
    return { ok: false, message: messageLisible(error) };
  }
  return { ok: true };
}

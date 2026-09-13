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

import { supabase, SUPABASE_KEY, SUPABASE_URL } from './supabase.js';

// Traduit les erreurs Supabase les plus courantes en français lisible.
// Repli sur le message brut si le cas n'est pas prévu : mieux vaut un
// message technique visible qu'une erreur avalée en silence.
// Exportée depuis le lot A4 pour son banc Deno (auth_test.js) : les 5 erreurs
// ajoutées (§1.3 de l'analyse) couvrent le code faux/périmé, le renvoi trop
// tôt, le mot de passe trop court, identique à l'ancien, et le plafond
// d'envoi — les 3 cas d'origine (lot 9b) ne changent pas.
export function messageLisible(erreur) {
  const brut = erreur?.message || '';
  const code = erreur?.code;
  // Le code d'abord (Auth le pose sur chaque erreur), le message ensuite
  // pour les cas anciens.
  if (code === 'current_password_required') {
    return 'Indique ton mot de passe actuel.';
  }
  // current_password_invalid : valeur de ErrorCodeCurrentPasswordMismatch,
  // supabase/auth internal/api/apierrors/errorcode.go.
  if (code === 'current_password_invalid') {
    return "Le mot de passe actuel n'est pas le bon.";
  }
  // Réponse (b) reportée (§1 du brief D31) mais le serveur peut l'exiger de
  // lui-même si le réglage "Secure password change" est activé un jour :
  // ce cas doit rester traduit proprement même si rien ne le déclenche
  // aujourd'hui côté Stovo.
  if (code === 'reauthentication_needed') {
    return 'Par sécurité, déconnecte-toi, reconnecte-toi, puis réessaie.';
  }
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

// Change le mot de passe pendant une récupération (juste après verifierCode).
// Le serveur lève lui-même l'exigence du mot de passe actuel pour ces sessions
// (session.IsRecovery()), prouvé sur le bac à sable le 13/09/2026 (Auth v2.196.0, épreuve epreuve-recuperation).
export async function changerMotDePasse(nouveauMotDePasse) {
  const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
  if (error) {
    return { ok: false, message: messageLisible(error) };
  }
  return { ok: true };
}

// Change le mot de passe d'une session connectée normalement (écran
// Réglages). Lot D31, corrigé le 13/09/2026 après relecture : le contrôle
// serveur du mot de passe actuel ne joue pas sur une session de récupération
// persistante (`session.IsRecovery()` reste vrai des jours durant avec
// `persistSession: true`), donc LE FRONT vérifie lui-même le mot de passe
// actuel avant de changer quoi que ce soit — que le réglage de projet
// `security_update_password_require_current_password` soit actif ou non
// (projet restauré, branche non alignée). Le contrôle de connexion passe par
// `fetch` brut plutôt que par `supabase.auth.signInWithPassword` : ce dernier
// remplacerait la session en cours et ferait déclencher `onAuthStateChange`
// (afficherApp() en pleine session Réglages) ; ici la réponse est jetée sans
// jamais être posée sur le client partagé.
export async function changerMotDePasseConnecte(nouveauMotDePasse, motDePasseActuel) {
  const session = await getSessionActuelle();
  const email = session?.user?.email;
  if (!email) {
    return { ok: false, message: 'Impossible de vérifier ton mot de passe actuel. Réessaie dans un instant.' };
  }

  let reponse;
  try {
    reponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: motDePasseActuel }),
    });
  } catch (_e) {
    return { ok: false, message: 'Impossible de vérifier ton mot de passe actuel. Réessaie dans un instant.' };
  }

  if (reponse.status === 400) {
    return { ok: false, message: "Le mot de passe actuel n'est pas le bon." };
  }
  if (!reponse.ok) {
    return { ok: false, message: 'Impossible de vérifier ton mot de passe actuel. Réessaie dans un instant.' };
  }
  // Mot de passe actuel juste : la session reçue n'est jamais conservée, on
  // jette simplement le corps de la réponse.
  await reponse.json().catch(() => {});

  const { error } = await supabase.auth.updateUser({
    password: nouveauMotDePasse,
    current_password: motDePasseActuel,
  });
  if (error) {
    return { ok: false, message: messageLisible(error) };
  }
  return { ok: true };
}

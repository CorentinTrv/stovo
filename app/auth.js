// STOVO — authentification (lot 9b)
// =====================================
// Choix n°6 de l'Architecte (marche à suivre phase 2, 2026-07-10) :
// Supabase Auth, UN SEUL compte (email + mot de passe), créé côté Supabase
// par Corentin (Authentication → Users), hors de ce lot. Le code ici ne
// fait que se connecter à un compte existant : pas de signUp, pas de reset
// de mot de passe, pas d'inscription publique.
//
// Ce module ne fait aucune écriture de données métier : il pose juste une
// session (JWT géré par supabase-js). L'écriture sécurisée via ce JWT
// viendra à l'étape 10 (Edge Function pwa-api).

import { supabase } from './supabase.js';

// Traduit les erreurs Supabase les plus courantes en français lisible.
// Repli sur le message brut si le cas n'est pas prévu : mieux vaut un
// message technique visible qu'une erreur avalée en silence.
function messageLisible(erreur) {
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

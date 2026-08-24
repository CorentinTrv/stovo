// auth_test.js — lot A4 (24/08/2026), mot de passe perdu et contact
//
// Banc offline de la SEULE fonction pure d'auth.js : messageLisible. Les
// autres exports (getSessionActuelle, seConnecter, seDeconnecter,
// demanderCodeRecuperation, verifierCode, changerMotDePasse, onAuthChange)
// appellent tous le vrai client Supabase (supabase.js), donc le réseau : ils
// ne sont pas testés ici, comme le reste du fichier depuis le lot 9b (aucun
// auth_test.js n'existait avant ce lot, vérifié par `git log -- app/auth*`).
//
// Les 3 premiers cas (invalid login credentials, email not confirmed, email
// logins are disabled) existaient déjà au lot 9b, non testés jusqu'ici :
// couverts ici pour la première fois, sans changer leur comportement. Les 5
// suivants sont l'ajout du lot A4 (§1.3 de l'analyse).
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/auth_test.js

import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { messageLisible } from "./auth.js";

const erreur = (message) => ({ message });

// --- Les 3 cas d'origine (lot 9b), jamais testés jusqu'ici ---

Deno.test("messageLisible : identifiants invalides", () => {
  assertStrictEquals(
    messageLisible(erreur('Invalid login credentials')),
    'Email ou mot de passe incorrect.',
  );
});

Deno.test("messageLisible : email non confirmé", () => {
  assertStrictEquals(
    messageLisible(erreur('Email not confirmed')),
    "Ce compte n'a pas encore été confirmé.",
  );
});

Deno.test("messageLisible : connexion par email désactivée sur le projet", () => {
  assertStrictEquals(
    messageLisible(erreur('Email logins are disabled')),
    "La connexion par email n'est pas activée sur ce projet.",
  );
});

// --- Les 5 cas ajoutés par le lot A4 (§1.3 de l'analyse) ---

Deno.test("messageLisible : code faux ou périmé (verifyOtp)", () => {
  assertStrictEquals(
    messageLisible(erreur('Token has expired or is invalid')),
    'Ce code est faux ou a expiré. Vérifie les six chiffres, ou demande un nouveau code.',
  );
});

Deno.test("messageLisible : renvoi demandé trop tôt, le nombre de secondes est repris dans le message", () => {
  assertStrictEquals(
    messageLisible(erreur('For security purposes, you can only request this after 42 seconds.')),
    'Attends encore 42 secondes avant de redemander un code.',
  );
});

Deno.test("messageLisible : mot de passe trop court, la longueur minimale est reprise dans le message", () => {
  assertStrictEquals(
    messageLisible(erreur('Password should be at least 8 characters.')),
    'Ton mot de passe doit faire au moins 8 caractères.',
  );
});

Deno.test("messageLisible : mot de passe trop court, singulier (1 caractère) — la regex ne casse pas sur le 's' optionnel", () => {
  assertStrictEquals(
    messageLisible(erreur('Password should be at least 1 character.')),
    'Ton mot de passe doit faire au moins 1 caractères.',
  );
});

Deno.test("messageLisible : nouveau mot de passe identique à l'ancien", () => {
  assertStrictEquals(
    messageLisible(erreur('New password should be different from the old password.')),
    "Choisis un mot de passe différent de l'ancien.",
  );
});

Deno.test("messageLisible : plafond d'envoi de mails atteint", () => {
  assertStrictEquals(
    messageLisible(erreur('Email rate limit exceeded')),
    'Trop de mails envoyés récemment, réessaie un peu plus tard.',
  );
});

// --- P3 signalé par le Jarvis à la relecture (24/08/2026) : #form-code-demande
// porte novalidate, un e-mail vide ou mal formé part donc réellement vers
// Supabase, qui répond "Unable to validate email address: invalid format". ---

Deno.test("messageLisible : adresse e-mail invalide (soumission d'un champ vide ou mal formé)", () => {
  assertStrictEquals(
    messageLisible(erreur('Unable to validate email address: invalid format')),
    "Cette adresse e-mail n'est pas valide.",
  );
});

// --- Repli et cas dégradés ---

Deno.test("messageLisible : erreur non reconnue -> message brut affiché tel quel (jamais avalé)", () => {
  assertStrictEquals(
    messageLisible(erreur('Some brand new Supabase error we never mapped')),
    'Some brand new Supabase error we never mapped',
  );
});

Deno.test("messageLisible : aucune erreur (undefined) -> message générique, jamais d'exception", () => {
  assertStrictEquals(messageLisible(undefined), 'Connexion impossible, réessaie.');
});

Deno.test("messageLisible : erreur sans message -> message générique", () => {
  assertStrictEquals(messageLisible({}), 'Connexion impossible, réessaie.');
});

Deno.test("messageLisible : insensible à la casse (majuscules Supabase varient selon les versions)", () => {
  assertEquals(
    messageLisible(erreur('TOKEN HAS EXPIRED OR IS INVALID')),
    'Ce code est faux ou a expiré. Vérifie les six chiffres, ou demande un nouveau code.',
  );
});

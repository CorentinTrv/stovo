// STOVO — banc de reglages_logique.js (lot D31, 13/09/2026, après relecture)
// ====================================================================
// validerChangementMotDePasse déménage depuis auth.js (dont l'en-tête promet
// un client Auth qui ne connaît aucun écran) vers ce module pur, dans la
// forme de recuperation_logique.js / couleur_logique.js. Les 4 tests
// d'origine sont repris tels quels, plus un 5e pour la règle D (nouveau mot
// de passe vide, ajoutée entre l'actuel manquant et la non-correspondance).
//
// Lancer avec (depuis app/) : deno test --allow-env --allow-read

import { assertEquals } from "jsr:@std/assert";
import { validerChangementMotDePasse } from "./reglages_logique.js";

Deno.test("validerChangementMotDePasse : mot de passe actuel vide -> message dédié, avant même de comparer les deux nouveaux", () => {
  assertEquals(
    validerChangementMotDePasse({ actuel: '', nouveau: 'abc', confirmation: 'xyz' }),
    { ok: false, message: "Indique d'abord ton mot de passe actuel." },
  );
});

Deno.test("validerChangementMotDePasse : mot de passe actuel fait uniquement d'espaces -> même message que vide", () => {
  assertEquals(
    validerChangementMotDePasse({ actuel: '   ', nouveau: 'abc', confirmation: 'abc' }),
    { ok: false, message: "Indique d'abord ton mot de passe actuel." },
  );
});

Deno.test("validerChangementMotDePasse : nouveau mot de passe vide -> message dédié, avant la comparaison des deux nouveaux (règle D)", () => {
  assertEquals(
    validerChangementMotDePasse({ actuel: 'ancien', nouveau: '', confirmation: '' }),
    { ok: false, message: 'Choisis un nouveau mot de passe.' },
  );
});

Deno.test("validerChangementMotDePasse : nouveau et confirmation différents -> message de non-correspondance", () => {
  assertEquals(
    validerChangementMotDePasse({ actuel: 'ancien', nouveau: 'abc', confirmation: 'xyz' }),
    { ok: false, message: 'Les deux mots de passe ne correspondent pas.' },
  );
});

Deno.test("validerChangementMotDePasse : actuel renseigné et les deux nouveaux identiques -> ok", () => {
  assertEquals(
    validerChangementMotDePasse({ actuel: 'ancien', nouveau: 'abc', confirmation: 'abc' }),
    { ok: true },
  );
});

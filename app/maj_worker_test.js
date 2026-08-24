// maj_worker_test.js — Lot A6, bannière « nouvelle version prête »
// (25/08/2026)
//
// Banc offline du module PUR app/maj_worker.js. Aucun DOM, aucun mock de
// service worker : deux fonctions pures, entrées booléennes, sorties
// booléennes.
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/maj_worker_test.js

import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { TEXTE_BANNIERE_MAJ, fautIlAfficherLaBanniereMaj, creerGardeUnSeulReload } from "./maj_worker.js";

Deno.test("le texte exact de la bannière est celui du brief, à la lettre", () => {
  assertStrictEquals(TEXTE_BANNIERE_MAJ, "Nouvelle version prête. Appuie pour recharger.");
});

// --- fautIlAfficherLaBanniereMaj -----------------------------------------

Deno.test("aucun des deux chemins -> pas de bannière", () => {
  assertEquals(
    fautIlAfficherLaBanniereMaj({ waitingAuChargement: false, installeEnSessionAvecControlleur: false }),
    false,
  );
});

Deno.test("registration.waiting rempli au chargement -> bannière (cas 1 de la détection)", () => {
  assertEquals(
    fautIlAfficherLaBanniereMaj({ waitingAuChargement: true, installeEnSessionAvecControlleur: false }),
    true,
  );
});

Deno.test("installed en session avec un controller déjà actif -> bannière (cas 2 de la détection)", () => {
  assertEquals(
    fautIlAfficherLaBanniereMaj({ waitingAuChargement: false, installeEnSessionAvecControlleur: true }),
    true,
  );
});

Deno.test("les deux chemins vrais en même temps -> bannière (pas de double affichage à vérifier ici, c'est app.js qui gère l'idempotence de l'affichage)", () => {
  assertEquals(
    fautIlAfficherLaBanniereMaj({ waitingAuChargement: true, installeEnSessionAvecControlleur: true }),
    true,
  );
});

Deno.test("aucun argument fourni -> pas de bannière (jamais d'erreur, jamais un affichage par défaut)", () => {
  assertEquals(fautIlAfficherLaBanniereMaj(), false);
});

Deno.test("des valeurs falsy autres que false (undefined, 0) sont traitées comme absentes", () => {
  assertEquals(
    fautIlAfficherLaBanniereMaj({ waitingAuChargement: undefined, installeEnSessionAvecControlleur: 0 }),
    false,
  );
});

// --- creerGardeUnSeulReload -----------------------------------------------

Deno.test("le premier appel autorise le reload", () => {
  const autoriserReload = creerGardeUnSeulReload();
  assertEquals(autoriserReload(), true);
});

Deno.test("un deuxième appel sur la même garde est refusé (jamais deux reload)", () => {
  const autoriserReload = creerGardeUnSeulReload();
  assertEquals(autoriserReload(), true);
  assertEquals(autoriserReload(), false);
});

Deno.test("de nombreux appels répétés (simulateur d'un controllerchange en rafale) restent bloqués après le premier", () => {
  const autoriserReload = creerGardeUnSeulReload();
  const resultats = [autoriserReload(), autoriserReload(), autoriserReload(), autoriserReload()];
  assertEquals(resultats, [true, false, false, false]);
});

Deno.test("deux gardes distinctes sont indépendantes l'une de l'autre", () => {
  const gardeA = creerGardeUnSeulReload();
  const gardeB = creerGardeUnSeulReload();
  assertEquals(gardeA(), true);
  // La garde B n'a jamais été appelée : son premier appel reste autorisé,
  // preuve qu'aucun état n'est partagé entre deux instances (ex. deux
  // enregistrements de service worker successifs).
  assertEquals(gardeB(), true);
});

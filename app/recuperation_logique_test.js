// recuperation_logique_test.js — lot A4 (24/08/2026)
//
// Banc offline du module PUR app/recuperation_logique.js : la garde de
// récupération (le piège majeur du lot) et la minuterie des 60 secondes.
// Aucun DOM, aucun mock de Supabase.
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/recuperation_logique_test.js

import { assertEquals } from "jsr:@std/assert";
import {
  calculerSecondesRestantesRenvoi,
  creerGardeRecuperation,
  libelleRenvoi,
} from "./recuperation_logique.js";

// --- creerGardeRecuperation ------------------------------------------------

Deno.test("garde de récupération : au repos, estEnCours() est faux", () => {
  const garde = creerGardeRecuperation();
  assertEquals(garde.estEnCours(), false);
});

Deno.test("garde de récupération : demarrer() la fait passer à vrai", () => {
  const garde = creerGardeRecuperation();
  garde.demarrer();
  assertEquals(garde.estEnCours(), true);
});

Deno.test("garde de récupération : terminer() la fait repasser à faux", () => {
  const garde = creerGardeRecuperation();
  garde.demarrer();
  garde.terminer();
  assertEquals(garde.estEnCours(), false);
});

Deno.test("garde de récupération : terminer() sans demarrer() préalable ne casse rien (idempotent)", () => {
  const garde = creerGardeRecuperation();
  garde.terminer();
  assertEquals(garde.estEnCours(), false);
});

Deno.test("garde de récupération : demarrer() deux fois de suite reste vrai (idempotent)", () => {
  const garde = creerGardeRecuperation();
  garde.demarrer();
  garde.demarrer();
  assertEquals(garde.estEnCours(), true);
});

Deno.test("garde de récupération : deux instances sont indépendantes l'une de l'autre", () => {
  const gardeA = creerGardeRecuperation();
  const gardeB = creerGardeRecuperation();
  gardeA.demarrer();
  assertEquals(gardeA.estEnCours(), true);
  assertEquals(gardeB.estEnCours(), false);
});

// --- calculerSecondesRestantesRenvoi ---------------------------------------

Deno.test("minuterie : aucune seconde écoulée -> 60 secondes restantes", () => {
  assertEquals(calculerSecondesRestantesRenvoi(0, 0), 60);
});

Deno.test("minuterie : 55 secondes écoulées -> 5 secondes restantes", () => {
  assertEquals(calculerSecondesRestantesRenvoi(0, 55000), 5);
});

Deno.test("minuterie : 59,4 secondes écoulées -> encore 1 seconde affichée (arrondi au plafond)", () => {
  assertEquals(calculerSecondesRestantesRenvoi(0, 59400), 1);
});

Deno.test("minuterie : exactement 60 secondes écoulées -> 0", () => {
  assertEquals(calculerSecondesRestantesRenvoi(0, 60000), 0);
});

Deno.test("minuterie : plus de 60 secondes écoulées -> 0, jamais négatif", () => {
  assertEquals(calculerSecondesRestantesRenvoi(0, 120000), 0);
});

Deno.test("minuterie : horloge qui recule (maintenant avant le début) -> plafonné à la durée totale, jamais au-dessus", () => {
  assertEquals(calculerSecondesRestantesRenvoi(0, -30000), 60);
});

Deno.test("minuterie : une durée personnalisée est respectée", () => {
  assertEquals(calculerSecondesRestantesRenvoi(0, 0, 30000), 30);
  assertEquals(calculerSecondesRestantesRenvoi(0, 20000, 30000), 10);
});

// --- libelleRenvoi ----------------------------------------------------------

Deno.test("libellé : pendant le compte à rebours, texte exact de la planche Code2Saisie", () => {
  assertEquals(libelleRenvoi(52), 'Renvoyer un code (dans 52 s)');
});

Deno.test("libellé : une seule seconde restante, l'accord ne change pas (pas de pluriel géré, cas rare et le texte reste correct)", () => {
  assertEquals(libelleRenvoi(1), 'Renvoyer un code (dans 1 s)');
});

Deno.test("libellé : minuterie écoulée (0) -> lien actif, sans mention de délai", () => {
  assertEquals(libelleRenvoi(0), 'Renvoyer un code');
});

Deno.test("libellé : une valeur négative (ne devrait jamais arriver) est traitée comme écoulée", () => {
  assertEquals(libelleRenvoi(-1), 'Renvoyer un code');
});

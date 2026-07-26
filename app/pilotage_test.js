// pilotage_test.js - Lot P-1 du chantier PILOTAGE (26/07/2026)
//
// Banc FRONT du juge commun : rejoue le MEME jeu d'essai que
// _shared/pilotage_test.ts (backend), mais contre app/pilotage.js. C'est ce
// double rejeu qui garantit que les deux formules restent identiques (plan
// §1, "Comment la parite est garantie, concretement").
//
// Import STATIQUE du fichier TS partage, par chemin RELATIF (front et backend
// vivent dans le meme depot disque, cf. le plan) : Deno le compile a la
// volee, aucune permission de lecture supplementaire n'est necessaire (le
// fichier est resolu comme un module, pas lu via Deno.readTextFile).
//
// Module pilotage.js etant PUR (aucun DOM, aucun supabase-js), ce banc n'a
// besoin d'AUCUN mock de navigateur, contrairement aux bancs de dashboard.js
// ou parler.js (voir la memoire d'agent feedback-test-pwa-offline).
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/pilotage_test.js

import { assertEquals } from "jsr:@std/assert";
import {
  calculerDerniereSortieLe,
  calculerEtatProduit,
  calculerGesteVivant,
  calculerLignePilotage,
  calculerSortiesParProduit,
  compterEtats,
  FENETRE_JOURS,
  GESTE_VIVANT_JOURS,
  PLANCHER_OBSERVATION_JOURS,
  SEUIL_DORMANT_JOURS,
} from "./pilotage.js";
import {
  CAS_COMPTEURS_PILOTAGE,
  CAS_ETAT_PILOTAGE,
  CAS_PILOTAGE,
  CAS_RESUME_GLOBAL,
  MAINTENANT_MS,
} from "../../../backend-stovo/supabase/functions/_shared/pilotage_cas.ts";

Deno.test("pilotage (front) : la fenetre de mesure est celle attendue au lot P-2b (30 jours, plancher 7)", () => {
  assertEquals(FENETRE_JOURS, 30);
  assertEquals(PLANCHER_OBSERVATION_JOURS, 7);
});

Deno.test("pilotage (front) : les constantes du lot P-3 (geste vivant 7 j, seuil dormant 30 j)", () => {
  assertEquals(GESTE_VIVANT_JOURS, 7);
  assertEquals(SEUIL_DORMANT_JOURS, 30);
});

for (const cas of CAS_PILOTAGE) {
  Deno.test(`pilotage (front) : ${cas.nom}`, () => {
    const sorties = calculerSortiesParProduit(cas.mouvements, MAINTENANT_MS);
    const resultat = calculerLignePilotage(cas.produit, sorties[cas.produit.id] || 0, MAINTENANT_MS);
    assertEquals(resultat, cas.attendu);
  });
}

for (const cas of CAS_ETAT_PILOTAGE) {
  Deno.test(`pilotage (front) etat : ${cas.nom}`, () => {
    assertEquals(calculerEtatProduit(cas.consoJour, cas.ancienneteJours, cas.gesteVivant), cas.attendu);
  });
}

for (const cas of CAS_RESUME_GLOBAL) {
  Deno.test(`pilotage (front) resume global : ${cas.nom}`, () => {
    assertEquals(calculerGesteVivant(cas.mouvements, MAINTENANT_MS), cas.attenduGesteVivant);
    assertEquals(calculerDerniereSortieLe(cas.mouvements), cas.attenduDerniereSortieLe);
  });
}

for (const cas of CAS_COMPTEURS_PILOTAGE) {
  Deno.test(`pilotage (front) compteurs : ${cas.nom}`, () => {
    assertEquals(compterEtats(cas.etats), cas.attendu);
  });
}

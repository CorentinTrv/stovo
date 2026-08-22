// aide_test.js - Onglet "Aide", lot C2-5 (chantier C2 "les exports")
//
// Banc offline du module PUR app/aide-contenu.js (la donnee CONTENU).
// aide.js lui-meme touche au DOM des son chargement (document.getElementById
// appele au niveau du module, voir "GLUE DOM" en bas de aide.js) : il ne peut
// donc PAS etre importe tel quel par Deno (ReferenceError: document is not
// defined). Le contenu a ete extrait dans aide-contenu.js, module pur sur le
// modele exact de pertes.js / export.js (voir la memoire d'agent stovo-codeur,
// "feedback-test-pwa-offline"), pour rendre ce banc possible sans navigateur.
//
// Aucun banc anterieur pour l'Aide n'a jamais ete committe dans ce depot
// (verifie via `git log -- app/aide*` avant d'ecrire ce fichier : seul
// aide.js y figure, aucun aide_test.js). Ce fichier est donc une creation,
// pas une reprise.
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/aide_test.js

import { assertEquals, assert, assertMatch } from "jsr:@std/assert";
import { CONTENU } from "./aide-contenu.js";

// ---------------------------------------------------------------------------
// CONTENU se charge sans DOM, structure de base
// ---------------------------------------------------------------------------

Deno.test("aide-contenu : CONTENU se charge sans DOM et n'est jamais vide", () => {
  assert(Array.isArray(CONTENU));
  assert(CONTENU.length > 0);
});

Deno.test("aide-contenu : chaque section a un id, une icone, un titre et au moins un bloc", () => {
  for (const section of CONTENU) {
    assert(typeof section.id === 'string' && section.id.trim().length > 0, `section sans id valide : ${JSON.stringify(section)}`);
    assert(typeof section.icone === 'string' && section.icone.trim().length > 0, `section "${section.id}" sans icone`);
    assert(typeof section.titre === 'string' && section.titre.trim().length > 0, `section "${section.id}" sans titre`);
    assert(Array.isArray(section.blocs) && section.blocs.length > 0, `section "${section.id}" sans bloc`);
  }
});

Deno.test("aide-contenu : les id de section sont uniques", () => {
  const ids = CONTENU.map((s) => s.id);
  assertEquals(ids.length, new Set(ids).size);
});

// ---------------------------------------------------------------------------
// Chaque "entree" (section, geste, astuce) a un titre et un corps non vides,
// et aucun titre n'est en double, tous types confondus.
// ---------------------------------------------------------------------------

// Rassemble toutes les entrees titrees : les sections elles-memes, plus
// chaque bloc de type 'geste' ou 'astuce' a l'interieur (ce sont les seuls
// types de bloc qui portent un `titre`, voir la doc de structure en tete
// de aide-contenu.js).
function toutesLesEntreesTitrees() {
  const entrees = [];
  for (const section of CONTENU) {
    entrees.push({ titre: section.titre, corps: section.blocs.length > 0 ? 'ok' : '' });
    for (const bloc of section.blocs) {
      if (bloc.type === 'geste') {
        entrees.push({ titre: bloc.titre, corps: bloc.quoi });
      } else if (bloc.type === 'astuce') {
        entrees.push({ titre: bloc.titre, corps: bloc.texte });
      }
    }
  }
  return entrees;
}

Deno.test("aide-contenu : chaque entree (section, geste, astuce) a un titre et un corps non vides", () => {
  const entrees = toutesLesEntreesTitrees();
  assert(entrees.length > 0);
  for (const e of entrees) {
    assert(typeof e.titre === 'string' && e.titre.trim().length > 0, `entree sans titre : ${JSON.stringify(e)}`);
    assert(typeof e.corps === 'string' && e.corps.trim().length > 0, `entree "${e.titre}" sans corps`);
  }
});

Deno.test("aide-contenu : aucun titre en double, tous types d'entree confondus", () => {
  const titres = toutesLesEntreesTitrees().map((e) => e.titre);
  const doublons = titres.filter((t, i) => titres.indexOf(t) !== i);
  assertEquals(doublons, []);
});

// ---------------------------------------------------------------------------
// La nouvelle entree "Sortir mes donnees" (lot C2-5)
// ---------------------------------------------------------------------------

function sectionExport() {
  return CONTENU.find((s) => s.id === 'export');
}

Deno.test("aide-contenu : la section 'export' existe et s'appelle 'Sortir mes données'", () => {
  const section = sectionExport();
  assert(section, "section id='export' introuvable dans CONTENU");
  assertEquals(section.titre, 'Sortir mes données');
});

Deno.test("aide-contenu : la section 'export' mentionne les DEUX fichiers, avec les libelles exacts des boutons", () => {
  const section = sectionExport();
  const texteComplet = section.blocs.map((b) => b.texte || '').join(' ');
  // Libelles exacts poses sur les boutons du bloc "Exporter mes données"
  // (index.html, lot C2-3) : si l'un des deux change la-bas, ce test doit
  // le detecter ici plutot que de laisser l'Aide dire autre chose que
  // l'ecran reel.
  assertMatch(texteComplet, /État de mon stock \(\.csv\)/);
  assertMatch(texteComplet, /Journal de mes mouvements \(\.csv\)/);
});

Deno.test("aide-contenu : la section 'export' dit que la valorisation est indicative et cite le mot 'comptable'", () => {
  const section = sectionExport();
  const texteComplet = section.blocs.map((b) => b.texte || '').join(' ');
  assertMatch(texteComplet, /indicative/);
  assertMatch(texteComplet, /comptable/);
});

Deno.test("aide-contenu : la section 'export' dit où trouver le bouton (onglet Pilotage, bloc replié)", () => {
  const section = sectionExport();
  const texteComplet = section.blocs.map((b) => b.texte || '').join(' ');
  assertMatch(texteComplet, /Pilotage/);
  assertMatch(texteComplet, /Exporter mes données/);
});

Deno.test("aide-contenu : la section 'export' tient en trois phrases (trois blocs de texte, pas plus)", () => {
  const section = sectionExport();
  assertEquals(section.blocs.length, 3);
  for (const bloc of section.blocs) {
    assertEquals(bloc.type, 'texte');
  }
});

// ---------------------------------------------------------------------------
// Zero caractere combinant (U+0300-U+036F) : le texte doit etre en NFC
// precompose, jamais en forme decomposee invisible (piege deja rencontre
// trois fois sur ce depot, voir la memoire d'agent
// "regex-diacritiques-forme-echappee").
// ---------------------------------------------------------------------------

Deno.test("aide-contenu : aucun caractere combinant (U+0300-U+036F) dans tout le contenu", () => {
  const texteComplet = JSON.stringify(CONTENU);
  // Forme ECHAPPEE, jamais des caracteres combinants bruts dans le motif :
  // un combinant brut colle a la lettre precedente est invisible a l'oeil
  // ET dans ce fichier source, ce qui a deja fait echouer ce meme test en
  // silence sur ce depot (memoire d'agent
  // "regex-diacritiques-forme-echappee").
  const debut = String.fromCharCode(0x0300);
  const fin = String.fromCharCode(0x036F);
  const motif = new RegExp('[' + debut + '-' + fin + ']');
  assertEquals(motif.test(texteComplet), false);
});

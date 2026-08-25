// couleur_logique_test.js — lot A15 (25/08/2026), la couleur d'action au choix
//
// Banc offline du module PUR app/couleur_logique.js. Aucun DOM, aucun
// localStorage réel : toutes les valeurs testées sont des chaînes tapées à
// la main.
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/couleur_logique_test.js

import { assertEquals, assertMatch, assertStrictEquals } from "jsr:@std/assert";
import {
  calculerAttribut,
  CLE_STOCKAGE,
  LIBELLE_TEINTE,
  normaliserTeinte,
  rendreNuancier,
  TEINTE_PAR_DEFAUT,
  TEINTES,
  VALEUR_TEINTE,
} from "./couleur_logique.js";

// --- Constantes ------------------------------------------------------------

Deno.test("CLE_STOCKAGE : clé localStorage exacte du brief", () => {
  assertStrictEquals(CLE_STOCKAGE, 'stovo_couleur');
});

Deno.test("TEINTES : les cinq teintes du brief, dans l'ordre de la planche", () => {
  assertEquals(TEINTES, ['flamme', 'bleu', 'prune', 'framboise', 'encre']);
});

Deno.test("TEINTES : ni teal ni vert (règle 10 de DESIGN.md)", () => {
  for (const t of TEINTES) {
    assertStrictEquals(/teal|vert/i.test(t), false);
  }
});

Deno.test("TEINTE_PAR_DEFAUT : flamme", () => {
  assertStrictEquals(TEINTE_PAR_DEFAUT, 'flamme');
});

Deno.test("LIBELLE_TEINTE : un libellé visible pour chacune des cinq teintes", () => {
  assertEquals(LIBELLE_TEINTE, {
    flamme: 'Flamme',
    bleu: 'Bleu',
    prune: 'Prune',
    framboise: 'Framboise',
    encre: 'Encre',
  });
});

Deno.test("VALEUR_TEINTE : les cinq couleurs exactes de l'analyse (§2.3)", () => {
  assertEquals(VALEUR_TEINTE, {
    flamme: '#FA5D00',
    bleu: '#1D4ED8',
    prune: '#7E22CE',
    framboise: '#BE185D',
    encre: '#1D1E1C',
  });
});

Deno.test("VALEUR_TEINTE : une valeur hex à 7 caractères pour chaque teinte, sans exception", () => {
  for (const t of TEINTES) {
    assertMatch(VALEUR_TEINTE[t], /^#[0-9A-F]{6}$/);
  }
});

// --- normaliserTeinte --------------------------------------------------

Deno.test("normaliserTeinte : une teinte connue est renvoyée telle quelle", () => {
  for (const t of TEINTES) {
    assertStrictEquals(normaliserTeinte(t), t);
  }
});

Deno.test("normaliserTeinte : valeur absente -> flamme (brief §7)", () => {
  assertStrictEquals(normaliserTeinte(undefined), 'flamme');
  assertStrictEquals(normaliserTeinte(null), 'flamme');
});

Deno.test("normaliserTeinte : chaîne vide -> flamme", () => {
  assertStrictEquals(normaliserTeinte(''), 'flamme');
});

Deno.test("normaliserTeinte : valeur inconnue (faute de frappe, ancien lot, teal halluciné) -> flamme, jamais d'exception", () => {
  assertStrictEquals(normaliserTeinte('teal'), 'flamme');
  assertStrictEquals(normaliserTeinte('bleuu'), 'flamme');
  assertStrictEquals(normaliserTeinte('Bleu'), 'flamme'); // sensible à la casse, comme le reste de l'app
});

Deno.test("normaliserTeinte : une entrée non-chaîne (nombre, objet) -> flamme, jamais d'exception", () => {
  assertStrictEquals(normaliserTeinte(42), 'flamme');
  assertStrictEquals(normaliserTeinte({}), 'flamme');
});

// --- calculerAttribut ---------------------------------------------------

Deno.test("calculerAttribut : flamme (défaut) -> null, aucun attribut posé (brief §7)", () => {
  assertStrictEquals(calculerAttribut('flamme'), null);
});

Deno.test("calculerAttribut : les quatre autres teintes -> leur propre nom", () => {
  assertStrictEquals(calculerAttribut('bleu'), 'bleu');
  assertStrictEquals(calculerAttribut('prune'), 'prune');
  assertStrictEquals(calculerAttribut('framboise'), 'framboise');
  assertStrictEquals(calculerAttribut('encre'), 'encre');
});

Deno.test("calculerAttribut : valeur inconnue -> null (repli sur flamme, donc pas d'attribut)", () => {
  assertStrictEquals(calculerAttribut('teal'), null);
  assertStrictEquals(calculerAttribut(undefined), null);
});

// --- rendreNuancier ------------------------------------------------------

Deno.test("rendreNuancier : cinq boutons rendus, un par teinte", () => {
  const html = rendreNuancier('flamme');
  const nbBoutons = (html.match(/<button/g) || []).length;
  assertStrictEquals(nbBoutons, 5);
});

Deno.test("rendreNuancier : chaque teinte a son data-teinte et son libellé visible", () => {
  const html = rendreNuancier('flamme');
  for (const t of TEINTES) {
    assertMatch(html, new RegExp(`data-teinte="${t}"`));
    assertMatch(html, new RegExp(`>${LIBELLE_TEINTE[t]}<`));
  }
});

Deno.test("rendreNuancier('prune') : seule la pastille prune porte aria-pressed=true et la classe est-choisi", () => {
  const html = rendreNuancier('prune');
  assertMatch(html, /data-teinte="prune" aria-pressed="true"/);
  for (const t of TEINTES.filter((t) => t !== 'prune')) {
    assertMatch(html, new RegExp(`data-teinte="${t}" aria-pressed="false"`));
  }
  const nbEstChoisi = (html.match(/est-choisi/g) || []).length;
  assertStrictEquals(nbEstChoisi, 1);
});

Deno.test("rendreNuancier('prune') : une seule coche SVG, sur la pastille choisie", () => {
  const html = rendreNuancier('prune');
  const nbCoches = (html.match(/reglages-pastille-coche/g) || []).length;
  assertStrictEquals(nbCoches, 1);
  const avantPrune = html.split('data-teinte="prune"')[0];
  assertStrictEquals(avantPrune.includes('reglages-pastille-coche'), false);
});

Deno.test("rendreNuancier : une teinte inconnue retombe sur flamme choisie (jamais aucune pastille cochée)", () => {
  const html = rendreNuancier('teal');
  assertMatch(html, /data-teinte="flamme" aria-pressed="true"/);
});

Deno.test("rendreNuancier : appel sans argument (undefined) -> flamme choisie, ne casse pas", () => {
  const html = rendreNuancier();
  assertMatch(html, /data-teinte="flamme" aria-pressed="true"/);
});

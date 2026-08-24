// contact_test.js — lot A4 (24/08/2026), contact par mail et version affichée
//
// Banc offline du module PUR app/contact.js. Aucun DOM, aucun navigator réel :
// tous les user-agents ci-dessous sont des chaînes tapées à la main,
// représentatives (relevées dans la doc MDN des user-agents courants).
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/contact_test.js

import { assertEquals, assertMatch, assertStrictEquals } from "jsr:@std/assert";
import {
  construireCorpsMail,
  construireLienMailto,
  DESTINATAIRE_CONTACT,
  extraireNumeroVersion,
  resumerAppareil,
  resumerNavigateur,
  SUJET_CONTACT,
} from "./contact.js";

const UA_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const UA_WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const UA_WINDOWS_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

// --- Constantes ------------------------------------------------------------

Deno.test("contact : destinataire et sujet, mot pour mot (planche MailPrerempli)", () => {
  assertStrictEquals(DESTINATAIRE_CONTACT, 'bonjour.stovo@outlook.com');
  assertStrictEquals(SUJET_CONTACT, 'Stovo : une question');
});

// --- resumerAppareil ---------------------------------------------------

Deno.test("resumerAppareil : iPhone", () => {
  assertStrictEquals(resumerAppareil(UA_IPHONE_SAFARI), 'iPhone');
});

Deno.test("resumerAppareil : Android", () => {
  assertStrictEquals(resumerAppareil(UA_ANDROID_CHROME), 'Android');
});

Deno.test("resumerAppareil : PC (Windows, ni iPhone ni Android)", () => {
  assertStrictEquals(resumerAppareil(UA_WINDOWS_EDGE), 'PC');
});

Deno.test("resumerAppareil : entrée vide ou absente -> PC par repli, jamais d'exception", () => {
  assertStrictEquals(resumerAppareil(''), 'PC');
  assertStrictEquals(resumerAppareil(undefined), 'PC');
});

// --- resumerNavigateur -------------------------------------------------

Deno.test("resumerNavigateur : Safari sur iPhone", () => {
  assertStrictEquals(resumerNavigateur(UA_IPHONE_SAFARI), 'Safari');
});

Deno.test("resumerNavigateur : Chrome sur Android (contient pourtant 'Safari' dans son UA)", () => {
  assertStrictEquals(resumerNavigateur(UA_ANDROID_CHROME), 'Chrome');
});

Deno.test("resumerNavigateur : Edge sur Windows (contient pourtant 'Chrome' et 'Safari' dans son UA)", () => {
  assertStrictEquals(resumerNavigateur(UA_WINDOWS_EDGE), 'Edge');
});

Deno.test("resumerNavigateur : Firefox", () => {
  assertStrictEquals(resumerNavigateur(UA_WINDOWS_FIREFOX), 'Firefox');
});

Deno.test("resumerNavigateur : entrée vide -> repli explicite, jamais d'exception", () => {
  assertStrictEquals(resumerNavigateur(''), 'navigateur inconnu');
});

// --- extraireNumeroVersion ---------------------------------------------

Deno.test("extraireNumeroVersion : nom de cache Stovo standard", () => {
  assertStrictEquals(extraireNumeroVersion('stovo-app-v32'), '32');
});

Deno.test("extraireNumeroVersion : nom de cache qui ne correspond pas -> null", () => {
  assertStrictEquals(extraireNumeroVersion('autre-cache-quelconque'), null);
});

Deno.test("extraireNumeroVersion : entrée vide ou absente -> null, jamais d'exception", () => {
  assertStrictEquals(extraireNumeroVersion(''), null);
  assertStrictEquals(extraireNumeroVersion(undefined), null);
});

// --- construireCorpsMail -------------------------------------------------

Deno.test("construireCorpsMail : structure exacte du brief (Bonjour, DEUX lignes vides, tiret, ligne d'envoi)", () => {
  const corps = construireCorpsMail({ version: '32', email: 'corentin@exemple.fr', userAgent: UA_IPHONE_SAFARI });
  const lignes = corps.split('\n');
  assertEquals(lignes, [
    'Bonjour Corentin,',
    '',
    '',
    '—',
    'Envoyé depuis Stovo, version 32, compte corentin@exemple.fr, iPhone (Safari).',
  ]);
});

Deno.test("construireCorpsMail : la ligne d'envoi retombe sur Android/Chrome", () => {
  const corps = construireCorpsMail({ version: '5', email: 'a@b.fr', userAgent: UA_ANDROID_CHROME });
  assertMatch(corps, /Android \(Chrome\)\.$/);
});

// --- construireLienMailto ------------------------------------------------

Deno.test("construireLienMailto : commence par mailto: suivi du destinataire exact", () => {
  const lien = construireLienMailto({ version: '32', email: 'c@c.fr', userAgent: UA_IPHONE_SAFARI });
  assertMatch(lien, /^mailto:bonjour\.stovo@outlook\.com\?/);
});

Deno.test("construireLienMailto : le sujet encodé apparaît dans l'URL", () => {
  const lien = construireLienMailto({ version: '32', email: 'c@c.fr', userAgent: UA_IPHONE_SAFARI });
  assertMatch(lien, new RegExp(`subject=${encodeURIComponent(SUJET_CONTACT)}`));
});

Deno.test("construireLienMailto : les retours à la ligne du corps sont encodés en %0A", () => {
  const lien = construireLienMailto({ version: '32', email: 'c@c.fr', userAgent: UA_IPHONE_SAFARI });
  const nbEncodages = (lien.match(/%0A/g) || []).length;
  // 4 sauts de ligne dans construireCorpsMail (5 lignes -> 4 séparateurs).
  assertEquals(nbEncodages, 4);
});

Deno.test("construireLienMailto : le corps encodé, une fois décodé, redonne exactement construireCorpsMail", () => {
  const params = { version: '9', email: 'test@exemple.fr', userAgent: UA_WINDOWS_FIREFOX };
  const lien = construireLienMailto(params);
  const brut = decodeURIComponent(lien.split('&body=')[1]);
  assertStrictEquals(brut, construireCorpsMail(params));
});

// pertes_test.js - Chantier C1 "Ce que tu as jete" (demarque valorisee)
//
// Banc offline du module PUR app/pertes.js (calculerDemarque + rendreDemarque).
// Module PUR (aucun DOM, aucun supabase-js), meme famille que pilotage.js
// (voir la memoire d'agent feedback-test-pwa-offline) : ce banc n'a besoin
// d'AUCUN mock de navigateur, un Deno.test tout simple suffit.
//
// Ce fichier avait deja ete ecrit et passe (64/64) lors du codage initial de
// pertes.js le 25/07/2026, mais n'a jamais ete commite dans le depot (verifie
// le 26/07/2026 via `git log` : seul pertes.js est dans l'historique). Il est
// recree ici pour le branchement C1, sans toucher a pertes.js lui-meme.
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/pertes_test.js

import { assertEquals, assertMatch } from "jsr:@std/assert";
import { calculerDemarque, LIBELLE_MOTIF, MOTIFS_PERTE, rendreDemarque } from "./pertes.js";

const JOUR = 864e5;
const MAINTENANT = new Date('2026-07-26T12:00:00Z').getTime();

// Un mouvement de "sortie perte" minimal, avec la jointure produits telle que
// dashboard.js la charge (nom, unite, prix_achat).
// Piege evite (deja rencontre le 25/07 sur ce meme fichier) : `??` retombe
// sur la valeur par defaut meme quand on passe explicitement `null`, donc
// pour un champ ou `null` est un cas de test a part entiere (motif), on
// verifie `'motif' in overrides` plutot que d'utiliser `??`.
const mvt = (overrides = {}) => ({
  id: overrides.id ?? 1,
  produit_id: overrides.produit_id ?? 1,
  type: overrides.type ?? 'sortie',
  motif: 'motif' in overrides ? overrides.motif : 'casse',
  quantite: overrides.quantite ?? 2,
  cree_le: overrides.cree_le ?? new Date(MAINTENANT - 1 * JOUR).toISOString(),
  produits: overrides.produits ?? { nom: 'Pâtes', unite: 'paquet', prix_achat: 1.5 },
});

// ---------------------------------------------------------------------------
// Constantes exportees
// ---------------------------------------------------------------------------

Deno.test("pertes : MOTIFS_PERTE est la liste blanche casse/peremption/vol, ni inventaire ni erreur", () => {
  assertEquals(MOTIFS_PERTE, ['peremption', 'casse', 'vol']);
  assertEquals(MOTIFS_PERTE.includes('inventaire'), false);
  assertEquals(MOTIFS_PERTE.includes('erreur'), false);
});

Deno.test("pertes : LIBELLE_MOTIF couvre les 3 motifs de la liste blanche", () => {
  for (const m of MOTIFS_PERTE) {
    assertEquals(typeof LIBELLE_MOTIF[m], 'string');
  }
});

// ---------------------------------------------------------------------------
// calculerDemarque : cas vides / entrees degradees
// ---------------------------------------------------------------------------

Deno.test("calculerDemarque : aucun argument -> objet vide, jamais null/undefined", () => {
  const r = calculerDemarque();
  assertEquals(r.total, 0);
  assertEquals(r.nbLignes, 0);
  assertEquals(r.partiel, false);
  assertEquals(r.parMotif, []);
  assertEquals(r.parProduit, []);
});

Deno.test("calculerDemarque : mouvements null (erreur de lecture) -> vide, ne plante pas", () => {
  const r = calculerDemarque({ mouvements: null, produits: null, maintenant: MAINTENANT });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : tableau vide -> vide", () => {
  const r = calculerDemarque({ mouvements: [], produits: [], maintenant: MAINTENANT });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : une ligne null au milieu du tableau est ignoree, pas de crash", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ id: 1 }), null, mvt({ id: 2 })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 2);
});

// ---------------------------------------------------------------------------
// Regle de justesse n°1 : liste blanche des motifs (positive, pas exclusive)
// ---------------------------------------------------------------------------

Deno.test("calculerDemarque : motif 'inventaire' n'est JAMAIS une perte", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ motif: 'inventaire', type: 'sortie' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : motif 'erreur' (mouvement compensateur) n'est JAMAIS une perte", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ motif: 'erreur', type: 'sortie' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : motif null (vente normale) n'est pas une perte", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ motif: null, type: 'sortie' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : un motif futur inconnu (pas encore dans MOTIFS_PERTE) n'est pas compte en silence", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ motif: 'demo-future' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : une ENTREE avec motif casse/peremption/vol n'est pas une perte (seules les sorties comptent)", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ type: 'entree', motif: 'casse' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

for (const motif of MOTIFS_PERTE) {
  Deno.test(`calculerDemarque : une sortie motif='${motif}' EST comptee`, () => {
    const r = calculerDemarque({
      mouvements: [mvt({ motif, quantite: 3 })],
      produits: [],
      maintenant: MAINTENANT,
    });
    assertEquals(r.nbLignes, 1);
    assertEquals(r.parMotif[0].motif, motif);
    assertEquals(r.parMotif[0].quantite, 3);
  });
}

// ---------------------------------------------------------------------------
// Fenetre glissante
// ---------------------------------------------------------------------------

Deno.test("calculerDemarque : une perte dans la fenetre (hier) est comptee", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ cree_le: new Date(MAINTENANT - 1 * JOUR).toISOString() })],
    produits: [],
    fenetreJours: 30,
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 1);
});

Deno.test("calculerDemarque : une perte hors fenetre (31 jours) est exclue", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ cree_le: new Date(MAINTENANT - 31 * JOUR).toISOString() })],
    produits: [],
    fenetreJours: 30,
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : une date illisible est ignoree plutot que comptee a tort", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ cree_le: 'pas-une-date' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

// ---------------------------------------------------------------------------
// Quantite invalide
// ---------------------------------------------------------------------------

Deno.test("calculerDemarque : quantite nulle ou negative est ignoree", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ quantite: 0 }), mvt({ quantite: -1 })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

Deno.test("calculerDemarque : quantite non numerique est ignoree", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ quantite: 'trois' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.nbLignes, 0);
});

// ---------------------------------------------------------------------------
// Valorisation : prix connu / inconnu, regle de justesse n°2
// ---------------------------------------------------------------------------

Deno.test("calculerDemarque : un prix connu valorise correctement (quantite x prix)", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ quantite: 4, produits: { nom: 'Pâtes', unite: 'paquet', prix_achat: 1.5 } })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.total, 6);
  assertEquals(r.partiel, false);
});

Deno.test("calculerDemarque : produit SANS prix -> jamais 0€, jamais NaN, total partiel", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ quantite: 5, produits: { nom: 'Inconnu', unite: 'kg', prix_achat: null } })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.total, 0);
  assertEquals(r.partiel, true);
  assertEquals(r.nbSansPrix, 1);
  assertEquals(r.quantiteSansPrix, 5);
  assertEquals(r.parProduit[0].montant, null);
});

Deno.test("calculerDemarque : un prix a 0 est un prix CONNU (produit offert), pas un prix manquant", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ quantite: 2, produits: { nom: 'Offert', unite: 'u', prix_achat: 0 } })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.total, 0);
  assertEquals(r.partiel, false); // pas "sans prix", juste un prix nul
  assertEquals(r.nbSansPrix, 0);
});

Deno.test("calculerDemarque : produit DESACTIVE (absent du catalogue actif) -> valorise via la jointure quand meme", () => {
  // La jointure porte encore le prix, le catalogue `produits` (filtre actif=true) ne le connait plus.
  const r = calculerDemarque({
    mouvements: [mvt({ produit_id: 99, quantite: 2, produits: { nom: 'Désactivé', unite: 'u', prix_achat: 3 } })],
    produits: [], // catalogue actif : le produit 99 n'y est plus
    maintenant: MAINTENANT,
  });
  assertEquals(r.total, 6);
  assertEquals(r.partiel, false);
});

Deno.test("calculerDemarque : jointure sans prix_achat -> repli sur le prix du catalogue (produit toujours actif)", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ produit_id: 7, quantite: 2, produits: { nom: 'Repli', unite: 'u' } })],
    produits: [{ id: 7, prix_achat: 4 }],
    maintenant: MAINTENANT,
  });
  assertEquals(r.total, 8);
});

// ---------------------------------------------------------------------------
// Agregation par produit et par motif
// ---------------------------------------------------------------------------

Deno.test("calculerDemarque : deux lignes du meme produit et du meme motif s'additionnent", () => {
  const r = calculerDemarque({
    mouvements: [
      mvt({ produit_id: 1, motif: 'casse', quantite: 2, produits: { nom: 'Pâtes', unite: 'paquet', prix_achat: 1 } }),
      mvt({ produit_id: 1, motif: 'casse', quantite: 3, produits: { nom: 'Pâtes', unite: 'paquet', prix_achat: 1 } }),
    ],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.parProduit.length, 1);
  assertEquals(r.parProduit[0].quantite, 5);
  assertEquals(r.parProduit[0].montant, 5);
});

Deno.test("calculerDemarque : le meme produit avec deux motifs differents garde le detail par motif", () => {
  const r = calculerDemarque({
    mouvements: [
      mvt({ produit_id: 1, motif: 'casse', quantite: 2, produits: { nom: 'Pâtes', unite: 'paquet', prix_achat: 1 } }),
      mvt({ produit_id: 1, motif: 'peremption', quantite: 1, produits: { nom: 'Pâtes', unite: 'paquet', prix_achat: 1 } }),
    ],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.parProduit[0].quantite, 3);
  assertEquals(r.parProduit[0].motifs, { casse: 2, peremption: 1 });
});

Deno.test("calculerDemarque : la part (%) par motif est calculee sur le total valorise", () => {
  const r = calculerDemarque({
    mouvements: [
      mvt({ produit_id: 1, motif: 'casse', quantite: 3, produits: { nom: 'A', unite: 'u', prix_achat: 1 } }),
      mvt({ produit_id: 2, motif: 'vol', quantite: 1, produits: { nom: 'B', unite: 'u', prix_achat: 1 } }),
    ],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.total, 4);
  const casse = r.parMotif.find((g) => g.motif === 'casse');
  assertEquals(casse.part, 0.75);
});

Deno.test("calculerDemarque : tri par montant decroissant, produit le plus cher en tete", () => {
  const r = calculerDemarque({
    mouvements: [
      mvt({ produit_id: 1, quantite: 1, produits: { nom: 'Petit', unite: 'u', prix_achat: 2 } }),
      mvt({ produit_id: 2, quantite: 1, produits: { nom: 'Gros', unite: 'u', prix_achat: 50 } }),
    ],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.parProduit[0].nom, 'Gros');
  assertEquals(r.parProduit[1].nom, 'Petit');
});

Deno.test("calculerDemarque : les lignes sans prix passent TOUJOURS en fin de tri (jamais confondues avec un 0€)", () => {
  const r = calculerDemarque({
    mouvements: [
      mvt({ produit_id: 1, quantite: 1, produits: { nom: 'SansPrix', unite: 'u', prix_achat: null } }),
      mvt({ produit_id: 2, quantite: 1, produits: { nom: 'AvecPrix', unite: 'u', prix_achat: 1 } }),
    ],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(r.parProduit[0].nom, 'AvecPrix');
  assertEquals(r.parProduit[1].nom, 'SansPrix');
  assertEquals(r.parProduit[1].montant, null);
});

// ---------------------------------------------------------------------------
// rendreDemarque : rendu HTML
// ---------------------------------------------------------------------------

Deno.test("rendreDemarque : cas vide -> message positif avec la fenetre en jours", () => {
  const html = rendreDemarque(calculerDemarque({ mouvements: [], maintenant: MAINTENANT }));
  assertMatch(html, /Rien jeté/);
  assertMatch(html, /30 derniers jours/);
});

Deno.test("rendreDemarque : cas vide sans argument (r undefined) ne plante pas, tombe sur 30 par defaut", () => {
  const html = rendreDemarque(undefined);
  assertMatch(html, /30 derniers jours/);
});

Deno.test("rendreDemarque : total partiel affiche 'au moins', jamais un total silencieusement faux", () => {
  const r = calculerDemarque({
    mouvements: [mvt({ produits: { nom: 'X', unite: 'u', prix_achat: null } })],
    produits: [],
    maintenant: MAINTENANT,
  });
  const html = rendreDemarque(r, { fmtEuro: (v) => `${v} €`, fmtNombre: (v) => String(v) });
  assertMatch(html, /au moins/);
  assertMatch(html, /prix non renseigné/);
  assertMatch(html, /sans prix renseigné/);
});

Deno.test("rendreDemarque : mentionne toujours la methode de valorisation (jamais presente comme un chiffre comptable)", () => {
  const r = calculerDemarque({
    mouvements: [mvt()],
    produits: [],
    maintenant: MAINTENANT,
  });
  const html = rendreDemarque(r, { fmtEuro: (v) => `${v} €`, fmtNombre: (v) => String(v) });
  assertMatch(html, /Valorisé au dernier prix d'achat connu/);
  assertMatch(html, /pas un état comptable/);
});

Deno.test("rendreDemarque : sans formateurs injectes, un repli minimal fonctionne quand meme", () => {
  const r = calculerDemarque({ mouvements: [mvt({ quantite: 2, produits: { nom: 'X', unite: 'u', prix_achat: 3 } })], produits: [], maintenant: MAINTENANT });
  const html = rendreDemarque(r);
  assertMatch(html, /6 €/);
});

Deno.test("rendreDemarque : la ventilation par motif liste le libelle et le montant", () => {
  const r = calculerDemarque({ mouvements: [mvt({ motif: 'vol', quantite: 1, produits: { nom: 'X', unite: 'u', prix_achat: 10 } })], produits: [], maintenant: MAINTENANT });
  const html = rendreDemarque(r, { fmtEuro: (v) => `${v} €`, fmtNombre: (v) => String(v) });
  assertMatch(html, /vol/);
  assertMatch(html, /10 €/);
});

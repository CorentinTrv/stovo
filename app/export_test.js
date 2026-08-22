// export_test.js — Chantier C2 « les exports », lot C2-1 (22/08/2026)
//
// Banc offline du module PUR app/export.js. Module PUR (aucun DOM, aucun
// supabase-js), meme famille que pertes.js/pilotage.js (voir la memoire
// d'agent feedback-test-pwa-offline) : ce banc n'a besoin d'AUCUN mock de
// navigateur, un Deno.test tout simple suffit.
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/export_test.js

import { assertEquals, assertMatch, assertRejects, assertThrows } from "jsr:@std/assert";
import {
  MENTION_LEGALE,
  LIBELLE_MOTIF_EXPORT,
  LIBELLE_TYPE,
  LIBELLE_SOURCE,
  echapperCsv,
  formaterNombre,
  formaterDate,
  formaterHeure,
  retenirProduitsExport,
  retenirMouvementsExport,
  construireCsvStock,
  construireCsvMouvements,
  nomFichierExport,
  lireToutesLesPages,
} from "./export.js";

// Date de reference identique a l'exemple illustratif du plan Architecte
// (§3.2) : 22/08/2026 a 14:32 heure de Paris (ete, UTC+2), donc 12:32 UTC.
const MAINTENANT = new Date('2026-08-22T12:32:00Z').getTime();

// --- Fixtures -----------------------------------------------------------
// Piege deja rencontre sur pertes_test.js et repris ici : `??` retombe sur
// la valeur par defaut meme quand on passe explicitement `null`. Pour les
// champs ou `null`/`false` sont des cas de test a part entiere (prix_achat,
// actif, motif, produits), on verifie `'x' in overrides` plutot que `??`.
const produit = (overrides = {}) => ({
  id: overrides.id ?? 1,
  nom: overrides.nom ?? 'Pâtes',
  unite: overrides.unite ?? 'paquet',
  stock_actuel: overrides.stock_actuel ?? 10,
  seuil_alerte: overrides.seuil_alerte ?? 2,
  delai_repro_jours: overrides.delai_repro_jours ?? 3,
  prix_achat: 'prix_achat' in overrides ? overrides.prix_achat : 1.5,
  cree_le: overrides.cree_le ?? '2026-06-05T10:00:00Z',
  actif: 'actif' in overrides ? overrides.actif : true,
});

const mvt = (overrides = {}) => ({
  id: overrides.id ?? 1,
  produit_id: overrides.produit_id ?? 1,
  type: overrides.type ?? 'sortie',
  quantite: overrides.quantite ?? 2,
  source: overrides.source ?? 'vocal',
  motif: 'motif' in overrides ? overrides.motif : null,
  cree_le: overrides.cree_le ?? '2026-06-10T10:00:00Z',
  produits: 'produits' in overrides ? overrides.produits : { nom: 'Pâtes', unite: 'paquet', prix_achat: 1.5 },
});

// Indices de colonnes, pour ne pas semer des "magic numbers" dans les
// assertions (memes noms que les en-tetes du plan §3.2).
const COL_STOCK = { produit: 0, statut: 1, stock: 2, unite: 3, prix: 4, valeur: 5, seuil: 6, delai: 7, cree: 8 };
const COL_MVT = { date: 0, heure: 1, produit: 2, type: 3, quantite: 4, unite: 5, motif: 6, source: 7, prix: 8, valeur: 9 };

// ==========================================================================
// Constantes exportees
// ==========================================================================

Deno.test("MENTION_LEGALE : texte exact, mot pour mot (plan §3.2)", () => {
  assertEquals(MENTION_LEGALE, "Valorisé au dernier prix d'achat, à retraiter par votre comptable");
});

Deno.test("LIBELLE_MOTIF_EXPORT : les 5 motifs de la base, en toutes lettres", () => {
  assertEquals(LIBELLE_MOTIF_EXPORT, {
    inventaire: "Régularisation d'inventaire",
    casse: 'Casse',
    peremption: 'Péremption',
    vol: 'Vol',
    erreur: 'Correction',
  });
});

Deno.test("LIBELLE_TYPE : entree/sortie -> Entrée/Sortie", () => {
  assertEquals(LIBELLE_TYPE, { entree: 'Entrée', sortie: 'Sortie' });
});

Deno.test("LIBELLE_SOURCE : vocal/manuel -> Vocal/Manuel", () => {
  assertEquals(LIBELLE_SOURCE, { vocal: 'Vocal', manuel: 'Manuel' });
});

// ==========================================================================
// echapperCsv
// ==========================================================================

Deno.test("echapperCsv : une valeur simple ressort inchangee", () => {
  assertEquals(echapperCsv('Pâtes'), 'Pâtes');
});

Deno.test("echapperCsv : null/undefined -> cellule vide, jamais 'null'", () => {
  assertEquals(echapperCsv(null), '');
  assertEquals(echapperCsv(undefined), '');
});

Deno.test("echapperCsv : un ';' declenche les guillemets", () => {
  assertEquals(echapperCsv('Farine; Levure'), '"Farine; Levure"');
});

Deno.test("echapperCsv : un guillemet interne est double, le champ est encadre", () => {
  assertEquals(echapperCsv('Le "meilleur" pain'), '"Le ""meilleur"" pain"');
});

Deno.test("echapperCsv : un retour a la ligne declenche les guillemets", () => {
  assertEquals(echapperCsv('Ligne 1\nLigne 2'), '"Ligne 1\nLigne 2"');
});

Deno.test("echapperCsv : un debut d'espace declenche les guillemets", () => {
  assertEquals(echapperCsv(' Produit'), '" Produit"');
});

Deno.test("echapperCsv : un nombre est converti en chaine", () => {
  assertEquals(echapperCsv(5), '5');
});

// ==========================================================================
// formaterNombre
// ==========================================================================

Deno.test("formaterNombre : null/undefined/'' -> cellule vide, jamais 0", () => {
  assertEquals(formaterNombre(null), '');
  assertEquals(formaterNombre(undefined), '');
  assertEquals(formaterNombre(''), '');
});

Deno.test("formaterNombre : une valeur non numerique -> cellule vide, jamais NaN", () => {
  assertEquals(formaterNombre('pas un nombre'), '');
  assertEquals(formaterNombre(NaN), '');
});

Deno.test("formaterNombre : 0 est une valeur CONNUE -> '0,00', pas une cellule vide", () => {
  assertEquals(formaterNombre(0, 2), '0,00');
});

Deno.test("formaterNombre : decimales a virgule, jamais un point", () => {
  assertEquals(formaterNombre(1.5, 2), '1,50');
  assertEquals(formaterNombre(12.567, 2), '12,57');
});

Deno.test("formaterNombre : 0 decimale ne laisse aucune virgule (colonnes entieres)", () => {
  assertEquals(formaterNombre(12, 0), '12');
});

// ==========================================================================
// formaterDate / formaterHeure : le fuseau est un parametre, pas celui de
// la machine (verifie empiriquement le 22/08/2026 avant d'ecrire ce banc).
// ==========================================================================

Deno.test("formaterDate : JJ/MM/AAAA a Paris", () => {
  assertEquals(formaterDate('2026-08-22T12:32:00Z', 'Europe/Paris'), '22/08/2026');
});

Deno.test("formaterHeure : HH:MM 24h a Paris (ete, UTC+2)", () => {
  assertEquals(formaterHeure('2026-08-22T12:32:00Z', 'Europe/Paris'), '14:32');
});

Deno.test("formaterDate/formaterHeure : un changement de fuseau change le resultat (le parametre est reellement utilise)", () => {
  // 23:32 UTC en ete = 01:32 le lendemain a Paris (+2h), mais encore 19:32
  // le meme jour a New York (-4h). Si le parametre n'etait pas respecte,
  // les trois resultats seraient identiques.
  const iso = '2026-08-22T23:32:00Z';
  assertEquals(formaterDate(iso, 'UTC'), '22/08/2026');
  assertEquals(formaterDate(iso, 'Europe/Paris'), '23/08/2026');
  assertEquals(formaterDate(iso, 'America/New_York'), '22/08/2026');
  assertEquals(formaterHeure(iso, 'America/New_York'), '19:32');
});

Deno.test("formaterDate/formaterHeure : une date illisible -> cellule vide", () => {
  assertEquals(formaterDate('pas-une-date'), '');
  assertEquals(formaterHeure('pas-une-date'), '');
});

Deno.test("formaterDate : le fuseau par defaut est 'Europe/Paris'", () => {
  assertEquals(formaterDate('2026-08-22T12:32:00Z'), '22/08/2026');
  assertEquals(formaterHeure('2026-08-22T12:32:00Z'), '14:32');
});

// ==========================================================================
// nomFichierExport
// ==========================================================================

Deno.test("nomFichierExport : nom exact du fichier d'etat de stock (plan §3.6)", () => {
  assertEquals(nomFichierExport('stock', MAINTENANT, 'Europe/Paris'), 'stovo_etat-de-stock_2026-08-22.csv');
});

Deno.test("nomFichierExport : nom exact du fichier de mouvements (plan §3.6)", () => {
  assertEquals(nomFichierExport('mouvements', MAINTENANT, 'Europe/Paris'), 'stovo_mouvements_2026-08-22.csv');
});

Deno.test("nomFichierExport : un type inconnu echoue tot, il n'invente pas un nom", () => {
  assertThrows(() => nomFichierExport('inconnu', MAINTENANT), Error);
});

// ==========================================================================
// retenirProduitsExport (extraite d'export.js le 22/08/2026 en revue du lot
// C2-3, pour que dashboard.js compte les lignes SANS dupliquer ce filtre)
// ==========================================================================

Deno.test("retenirProduitsExport : actif absent -> traite comme actif (meme regle que estActif)", () => {
  const p = produit({ id: 1 });
  delete p.actif;
  assertEquals(retenirProduitsExport([p]), [p]);
});

Deno.test("retenirProduitsExport : desactive a stock 0 -> exclu", () => {
  assertEquals(retenirProduitsExport([produit({ actif: false, stock_actuel: 0 })]), []);
});

Deno.test("retenirProduitsExport : desactive a stock NEGATIF -> inclus (non nul, meme regle que le fichier)", () => {
  const p = produit({ actif: false, stock_actuel: -3 });
  assertEquals(retenirProduitsExport([p]), [p]);
});

Deno.test("retenirProduitsExport : null/undefined tolere, et une entree null au milieu est ignoree", () => {
  assertEquals(retenirProduitsExport(null), []);
  assertEquals(retenirProduitsExport(undefined), []);
  const p1 = produit({ id: 1 });
  const p2 = produit({ id: 2 });
  assertEquals(retenirProduitsExport([p1, null, p2]), [p1, p2]);
});

Deno.test("retenirProduitsExport : construireCsvStock produit EXACTEMENT autant de lignes de donnees qu'elle en retient", () => {
  const jeu = [
    produit({ id: 1 }),
    produit({ id: 2, actif: false, stock_actuel: 0 }),   // exclu
    produit({ id: 3, actif: false, stock_actuel: 4 }),   // inclus
    produit({ id: 4, actif: false, stock_actuel: -2 }),  // inclus (non nul)
    null,                                                 // ignore
  ];
  const attendu = retenirProduitsExport(jeu).length;
  const csv = construireCsvStock({ produits: jeu, maintenant: MAINTENANT });
  const nbLignesDonnees = csv.split('\r\n').length - 7; // 5 entete + 1 vide + 1 colonnes
  assertEquals(attendu, 3);
  assertEquals(nbLignesDonnees, attendu);
});

// ==========================================================================
// construireCsvStock
// ==========================================================================

Deno.test("construireCsvStock : fins de ligne CRLF exclusivement", () => {
  const csv = construireCsvStock({ produits: [produit()], maintenant: MAINTENANT });
  assertEquals(csv.includes('\r\n'), true);
  assertEquals(/(?<!\r)\n/.test(csv), false, "un \\n non precede d'un \\r a ete trouve");
  assertEquals(/\r(?!\n)/.test(csv), false, "un \\r non suivi d'un \\n a ete trouve");
});

Deno.test("construireCsvStock : la mention legale est presente mot pour mot (5e ligne)", () => {
  const csv = construireCsvStock({ produits: [produit()], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[4], MENTION_LEGALE);
});

Deno.test("construireCsvStock : reproduit l'exemple illustratif du plan (titre, horodatage)", () => {
  const csv = construireCsvStock({ produits: [produit()], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[0], 'Stovo, état de stock valorisé');
  assertEquals(lignes[1], 'Exporté le 22/08/2026 à 14:32');
});

Deno.test("construireCsvStock : les 9 colonnes dans l'ordre exact du plan §3.2", () => {
  const csv = construireCsvStock({ produits: [produit()], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[6], "Produit;Statut;Stock actuel;Unité;Prix d'achat unitaire (€);Valeur du stock (€);Seuil d'alerte;Délai de réappro (jours);Créé le");
});

Deno.test("construireCsvStock : accents preserves dans le nom du produit", () => {
  const csv = construireCsvStock({ produits: [produit({ nom: 'Étagère à épices' })], maintenant: MAINTENANT });
  assertEquals(csv.includes('Étagère à épices'), true);
});

Deno.test("construireCsvStock : un nom contenant un ';' est encadre de guillemets", () => {
  const csv = construireCsvStock({ produits: [produit({ nom: 'Farine; Levure' })], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[7].split(';');
  assertEquals(champs[COL_STOCK.produit], '"Farine');
  // Verification robuste : la ligne complete commence bien par le champ encadre.
  assertEquals(csv.split('\r\n')[7].startsWith('"Farine; Levure";'), true);
});

Deno.test("construireCsvStock : un nom contenant un guillemet double correctement", () => {
  const csv = construireCsvStock({ produits: [produit({ nom: 'Le "meilleur" pain' })], maintenant: MAINTENANT });
  const ligne = csv.split('\r\n')[7];
  assertEquals(ligne.startsWith('"Le ""meilleur"" pain";'), true);
});

Deno.test("construireCsvStock : prix inconnu -> DEUX cellules vides (prix ET valeur), jamais 0", () => {
  const csv = construireCsvStock({ produits: [produit({ prix_achat: null, stock_actuel: 5 })], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[7].split(';');
  assertEquals(champs[COL_STOCK.prix], '');
  assertEquals(champs[COL_STOCK.valeur], '');
});

Deno.test("construireCsvStock : prix a 0 est un prix CONNU (produit offert) -> '0,00', pas vide", () => {
  const csv = construireCsvStock({ produits: [produit({ prix_achat: 0, stock_actuel: 5 })], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[7].split(';');
  assertEquals(champs[COL_STOCK.prix], '0,00');
  assertEquals(champs[COL_STOCK.valeur], '0,00');
});

Deno.test("construireCsvStock : produit desactive a STOCK NON NUL -> present, statut 'Retiré du catalogue'", () => {
  const csv = construireCsvStock({ produits: [produit({ actif: false, stock_actuel: 3 })], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[7].split(';');
  assertEquals(champs[COL_STOCK.statut], 'Retiré du catalogue');
});

Deno.test("construireCsvStock : produit desactive a STOCK NUL -> absent du fichier", () => {
  const csv = construireCsvStock({ produits: [produit({ actif: false, stock_actuel: 0 })], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  // 5 lignes d'entete + 1 ligne vide + 1 ligne de colonnes = 7, aucune ligne de donnees.
  assertEquals(lignes.length, 7);
});

Deno.test("construireCsvStock : produit ACTIF a stock nul reste present (seul le desactive est filtre)", () => {
  const csv = construireCsvStock({ produits: [produit({ actif: true, stock_actuel: 0 })], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes.length, 8);
});

Deno.test("construireCsvStock : une quantite decimale est rendue avec une virgule", () => {
  const csv = construireCsvStock({ produits: [produit({ stock_actuel: 12.5 })], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[7].split(';');
  assertEquals(champs[COL_STOCK.stock], '12,50');
});

Deno.test("construireCsvStock : seuil d'alerte et delai de reappro se formatent (colonnes entieres, sans virgule)", () => {
  const csv = construireCsvStock({ produits: [produit({ seuil_alerte: 5, delai_repro_jours: 7 })], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[7].split(';');
  assertEquals(champs[COL_STOCK.seuil], '5,00');
  assertEquals(champs[COL_STOCK.delai], '7');
});

Deno.test("construireCsvStock : tri alphabetique insensible aux accents et a la casse", () => {
  const csv = construireCsvStock({
    produits: [
      produit({ id: 1, nom: 'zinc' }),
      produit({ id: 2, nom: 'Étagère' }),
      produit({ id: 3, nom: 'avoine' }),
    ],
    maintenant: MAINTENANT,
  });
  const noms = csv.split('\r\n').slice(7).map((l) => l.split(';')[0]);
  assertEquals(noms, ['avoine', 'Étagère', 'zinc']);
});

Deno.test("construireCsvStock : unite absente -> cellule vide, pas 'undefined'", () => {
  const csv = construireCsvStock({ produits: [produit({ unite: '' })], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[7].split(';');
  assertEquals(champs[COL_STOCK.unite], '');
});

Deno.test("construireCsvStock : phrase de perimetre avec des produits retires, accord au pluriel", () => {
  const csv = construireCsvStock({
    produits: [produit({ id: 1 }), produit({ id: 2, actif: false, stock_actuel: 4 }), produit({ id: 3, actif: false, stock_actuel: 1 })],
    maintenant: MAINTENANT,
  });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[2], 'Périmètre : 1 produit actif, et 2 produits retirés du catalogue ayant encore du stock');
});

Deno.test("construireCsvStock : phrase de perimetre sans produit retire n'evoque pas de retire", () => {
  const csv = construireCsvStock({ produits: [produit()], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[2], 'Périmètre : 1 produit actif');
});

Deno.test("construireCsvStock : phrase de valeur totale, singulier avec elision (n'est), pas 'ne est'", () => {
  const csv = construireCsvStock({ produits: [produit({ prix_achat: null })], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertMatch(lignes[3], /1 produit sans prix renseigné n'est pas compté\)$/);
});

Deno.test("construireCsvStock : phrase de valeur totale, pluriel (ne sont ... comptes)", () => {
  const csv = construireCsvStock({
    produits: [produit({ id: 1, prix_achat: null }), produit({ id: 2, prix_achat: null })],
    maintenant: MAINTENANT,
  });
  const lignes = csv.split('\r\n');
  assertMatch(lignes[3], /2 produits sans prix renseigné ne sont pas comptés\)$/);
});

Deno.test("construireCsvStock : aucune reference a un encaissement, un paiement ou un justificatif (ligne rouge NF525)", () => {
  const csv = construireCsvStock({ produits: [produit()], maintenant: MAINTENANT });
  const interdits = /encaiss|paiement|justificatif|\btva\b/i;
  assertEquals(interdits.test(csv), false);
});

Deno.test("construireCsvStock : produits null/undefined/vide -> fichier valide sans ligne de donnees", () => {
  assertEquals(construireCsvStock().split('\r\n').length, 7);
  assertEquals(construireCsvStock({ produits: null }).split('\r\n').length, 7);
  assertEquals(construireCsvStock({ produits: [] }).split('\r\n').length, 7);
});

Deno.test("construireCsvStock : une entree null au milieu du tableau est ignoree, pas de crash", () => {
  const csv = construireCsvStock({ produits: [produit({ id: 1 }), null, produit({ id: 2, nom: 'Autre' })], maintenant: MAINTENANT });
  assertEquals(csv.split('\r\n').length, 9);
});

// ==========================================================================
// retenirMouvementsExport (extraite d'export.js le 22/08/2026, meme revue
// que retenirProduitsExport ci-dessus)
// ==========================================================================

Deno.test("retenirMouvementsExport : une date lisible -> incluse", () => {
  const m = mvt({ cree_le: '2026-06-05T10:00:00Z' });
  assertEquals(retenirMouvementsExport([m]), [m]);
});

Deno.test("retenirMouvementsExport : une date illisible -> exclue", () => {
  assertEquals(retenirMouvementsExport([mvt({ cree_le: 'pas-une-date' })]), []);
});

Deno.test("retenirMouvementsExport : null/undefined tolere, et une entree null au milieu est ignoree", () => {
  assertEquals(retenirMouvementsExport(null), []);
  assertEquals(retenirMouvementsExport(undefined), []);
  const m1 = mvt({ id: 1 });
  const m2 = mvt({ id: 2 });
  assertEquals(retenirMouvementsExport([m1, null, m2]), [m1, m2]);
});

Deno.test("retenirMouvementsExport : ne trie PAS (le tri reste dans construireCsvMouvements, sur le PERIMETRE deja filtre)", () => {
  const recent = mvt({ id: 1, cree_le: '2026-08-01T10:00:00Z' });
  const ancien = mvt({ id: 2, cree_le: '2026-06-05T10:00:00Z' });
  assertEquals(retenirMouvementsExport([recent, ancien]), [recent, ancien]);
});

Deno.test("retenirMouvementsExport : construireCsvMouvements produit EXACTEMENT autant de lignes de donnees qu'elle en retient", () => {
  const jeu = [
    mvt({ id: 1, cree_le: '2026-06-05T10:00:00Z' }),
    mvt({ id: 2, cree_le: 'pas-une-date' }), // exclu
    null,                                     // ignore
    mvt({ id: 3, cree_le: '2026-07-15T10:00:00Z' }),
  ];
  const attendu = retenirMouvementsExport(jeu).length;
  const csv = construireCsvMouvements({ mouvements: jeu, produits: [], maintenant: MAINTENANT });
  const nbLignesDonnees = csv.split('\r\n').length - 8; // 6 entete + 1 vide + 1 colonnes
  assertEquals(attendu, 2);
  assertEquals(nbLignesDonnees, attendu);
});

// ==========================================================================
// construireCsvMouvements
// ==========================================================================

Deno.test("construireCsvMouvements : fins de ligne CRLF exclusivement", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt()], produits: [], maintenant: MAINTENANT });
  assertEquals(csv.includes('\r\n'), true);
  assertEquals(/(?<!\r)\n/.test(csv), false);
  assertEquals(/\r(?!\n)/.test(csv), false);
});

Deno.test("construireCsvMouvements : la mention legale (5e ligne) et la note de non-historisation (6e ligne)", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt()], produits: [], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[4], MENTION_LEGALE);
  assertEquals(lignes[5], "Le prix d'achat n'est pas historisé : la valeur estimée d'un mouvement ancien utilise le prix connu aujourd'hui.");
});

Deno.test("construireCsvMouvements : les 10 colonnes dans l'ordre exact du plan §3.2", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt()], produits: [], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[7], "Date;Heure;Produit;Type;Quantité;Unité;Motif;Source;Prix d'achat unitaire (€);Valeur estimée (€)");
});

Deno.test("construireCsvMouvements : tri du plus ancien au plus recent (inverse du tableau de bord)", () => {
  const csv = construireCsvMouvements({
    mouvements: [
      mvt({ id: 1, cree_le: '2026-08-01T10:00:00Z' }),
      mvt({ id: 2, cree_le: '2026-06-05T10:00:00Z' }),
      mvt({ id: 3, cree_le: '2026-07-15T10:00:00Z' }),
    ],
    produits: [],
    maintenant: MAINTENANT,
  });
  const dates = csv.split('\r\n').slice(8).map((l) => l.split(';')[COL_MVT.date]);
  assertEquals(dates, ['05/06/2026', '15/07/2026', '01/08/2026']);
});

Deno.test("construireCsvMouvements : type entree/sortie traduit en Entrée/Sortie", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ id: 1, type: 'entree' }), mvt({ id: 2, type: 'sortie' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  const types = csv.split('\r\n').slice(8).map((l) => l.split(';')[COL_MVT.type]);
  assertEquals(types, ['Entrée', 'Sortie']);
});

Deno.test("construireCsvMouvements : source vocal/manuel traduite en Vocal/Manuel", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ id: 1, source: 'vocal' }), mvt({ id: 2, source: 'manuel', cree_le: '2026-06-11T10:00:00Z' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  const sources = csv.split('\r\n').slice(8).map((l) => l.split(';')[COL_MVT.source]);
  assertEquals(sources, ['Vocal', 'Manuel']);
});

Deno.test("construireCsvMouvements : motif connu (casse) traduit en toutes lettres", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt({ motif: 'casse' })], produits: [], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[8].split(';');
  assertEquals(champs[COL_MVT.motif], 'Casse');
});

Deno.test("construireCsvMouvements : motif null (mouvement normal) -> cellule vide", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt({ motif: null })], produits: [], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[8].split(';');
  assertEquals(champs[COL_MVT.motif], '');
});

Deno.test("construireCsvMouvements : un motif INCONNU (pas encore dans la liste blanche) s'ecrit tel quel, jamais masque", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt({ motif: 'don' })], produits: [], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[8].split(';');
  assertEquals(champs[COL_MVT.motif], 'don');
});

Deno.test("construireCsvMouvements : quantite (entier en base) sans virgule", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt({ quantite: 7 })], produits: [], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[8].split(';');
  assertEquals(champs[COL_MVT.quantite], '7');
});

Deno.test("construireCsvMouvements : produit supprime de la jointure -> repli '(produit supprimé)', prix vide", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt({ produits: null })], produits: [], maintenant: MAINTENANT });
  const champs = csv.split('\r\n')[8].split(';');
  assertEquals(champs[COL_MVT.produit], '(produit supprimé)');
  assertEquals(champs[COL_MVT.prix], '');
  assertEquals(champs[COL_MVT.valeur], '');
});

Deno.test("construireCsvMouvements : jointure sans prix_achat -> repli sur le catalogue produits (meme pattern que pertes.js)", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ produit_id: 7, quantite: 2, produits: { nom: 'Repli', unite: 'u' } })],
    produits: [{ id: 7, prix_achat: 4 }],
    maintenant: MAINTENANT,
  });
  const champs = csv.split('\r\n')[8].split(';');
  assertEquals(champs[COL_MVT.prix], '4,00');
  assertEquals(champs[COL_MVT.valeur], '8,00');
});

Deno.test("construireCsvMouvements : valeur estimee = quantite x prix connu aujourd'hui", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ quantite: 4, produits: { nom: 'X', unite: 'u', prix_achat: 1.5 } })],
    produits: [],
    maintenant: MAINTENANT,
  });
  const champs = csv.split('\r\n')[8].split(';');
  assertEquals(champs[COL_MVT.prix], '1,50');
  assertEquals(champs[COL_MVT.valeur], '6,00');
});

Deno.test("construireCsvMouvements : aucun mouvement -> en-tete honnete, aucune ligne de donnees", () => {
  const csv = construireCsvMouvements({ mouvements: [], produits: [], maintenant: MAINTENANT });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[2], 'Aucun mouvement enregistré');
  assertEquals(lignes[3], '0 mouvement');
  assertEquals(lignes.length, 8); // 6 entete + 1 vide + 1 colonnes, aucune donnee
});

Deno.test("construireCsvMouvements : periode couverte et compte exact, accord singulier/pluriel", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ id: 1, cree_le: '2026-06-05T10:00:00Z' }), mvt({ id: 2, cree_le: '2026-08-22T10:00:00Z' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[2], "Période couverte : du 05/06/2026 au 22/08/2026, tout l'historique");
  assertEquals(lignes[3], '2 mouvements');
});

Deno.test("construireCsvMouvements : une entree null ou a date illisible est ignoree, pas de crash, pas comptee", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ id: 1 }), null, mvt({ id: 2, cree_le: 'pas-une-date' })],
    produits: [],
    maintenant: MAINTENANT,
  });
  const lignes = csv.split('\r\n');
  assertEquals(lignes[3], '1 mouvement');
});

Deno.test("construireCsvMouvements : accents preserves dans le nom du produit", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ produits: { nom: 'Pâtes à la crème', unite: 'u', prix_achat: 1 } })],
    produits: [],
    maintenant: MAINTENANT,
  });
  assertEquals(csv.includes('Pâtes à la crème'), true);
});

Deno.test("construireCsvMouvements : un nom de produit avec ';' est encadre de guillemets", () => {
  const csv = construireCsvMouvements({
    mouvements: [mvt({ produits: { nom: 'Farine; Levure', unite: 'u', prix_achat: 1 } })],
    produits: [],
    maintenant: MAINTENANT,
  });
  const ligne = csv.split('\r\n')[8];
  assertMatch(ligne, /^\d{2}\/\d{2}\/\d{4};\d{2}:\d{2};"Farine; Levure";/);
});

Deno.test("construireCsvMouvements : mouvements/produits null/undefined -> fichier valide sans ligne de donnees", () => {
  assertEquals(construireCsvMouvements().split('\r\n')[3], '0 mouvement');
  assertEquals(construireCsvMouvements({ mouvements: null, produits: null }).split('\r\n')[3], '0 mouvement');
});

Deno.test("construireCsvMouvements : aucune reference a un encaissement, un paiement ou un justificatif (ligne rouge NF525)", () => {
  const csv = construireCsvMouvements({ mouvements: [mvt()], produits: [], maintenant: MAINTENANT });
  const interdits = /encaiss|paiement|justificatif|\btva\b/i;
  assertEquals(interdits.test(csv), false);
});

// ==========================================================================
// lireToutesLesPages (lot C2-2, 22/08/2026) : pagination sans troncature
// silencieuse. Source falsifiee, aucun reseau : `faireUnePage(de, a)`
// simule un jeu de `total` lignes (les entiers 0..total-1), en respectant
// la convention `.range()` de Supabase (bornes INCLUSES aux deux bouts).
// ==========================================================================

function fabriquerSource(total) {
  const appels = [];
  const faireUnePage = async (de, a) => {
    await Promise.resolve(); // simule le vrai aller-retour reseau d'une requete Supabase
    appels.push([de, a]);
    const fin = Math.min(a, total - 1);
    if (de > fin) return [];
    const tranche = [];
    for (let i = de; i <= fin; i++) tranche.push(i);
    return tranche;
  };
  return { faireUnePage, appels };
}

Deno.test("lireToutesLesPages : 0 ligne -> tableau vide, un seul appel", async () => {
  const { faireUnePage, appels } = fabriquerSource(0);
  const lignes = await lireToutesLesPages(faireUnePage, 1000, 50);
  assertEquals(lignes, []);
  assertEquals(appels, [[0, 999]]);
});

Deno.test("lireToutesLesPages : 1 ligne -> une page suffit, incomplete d'emblee", async () => {
  const { faireUnePage, appels } = fabriquerSource(1);
  const lignes = await lireToutesLesPages(faireUnePage, 1000, 50);
  assertEquals(lignes.length, 1);
  assertEquals(appels.length, 1);
});

Deno.test("lireToutesLesPages : exactement 1000 lignes (piege classique) -> declenche une DEUXIEME requete pour verifier la fin", async () => {
  const { faireUnePage, appels } = fabriquerSource(1000);
  const lignes = await lireToutesLesPages(faireUnePage, 1000, 50);
  assertEquals(lignes.length, 1000);
  assertEquals(appels, [[0, 999], [1000, 1999]]);
});

Deno.test("lireToutesLesPages : 1001 lignes -> deuxieme page incomplete (1 ligne), pas de troisieme appel", async () => {
  const { faireUnePage, appels } = fabriquerSource(1001);
  const lignes = await lireToutesLesPages(faireUnePage, 1000, 50);
  assertEquals(lignes.length, 1001);
  assertEquals(appels, [[0, 999], [1000, 1999]]);
});

Deno.test("lireToutesLesPages : 2500 lignes -> trois pages (1000 + 1000 + 500)", async () => {
  const { faireUnePage, appels } = fabriquerSource(2500);
  const lignes = await lireToutesLesPages(faireUnePage, 1000, 50);
  assertEquals(lignes.length, 2500);
  assertEquals(appels, [[0, 999], [1000, 1999], [2000, 2999]]);
});

Deno.test("lireToutesLesPages : les lignes sont rendues dans l'ordre des pages lues", async () => {
  const { faireUnePage } = fabriquerSource(25);
  const lignes = await lireToutesLesPages(faireUnePage, 10, 50);
  assertEquals(lignes, Array.from({ length: 25 }, (_, i) => i));
});

Deno.test("lireToutesLesPages : les bornes de/a passees a chaque appel respectent la convention .range() (bornes incluses)", async () => {
  const { faireUnePage, appels } = fabriquerSource(25);
  await lireToutesLesPages(faireUnePage, 10, 50);
  assertEquals(appels, [[0, 9], [10, 19], [20, 29]]);
});

Deno.test("lireToutesLesPages : le plafond de pages atteint SANS page incomplete leve une erreur explicite, jamais une troncature silencieuse", async () => {
  // Source volontairement plus grande que ce que le plafond autorise a lire :
  // chaque page est pleine, la boucle ne rencontre donc jamais de page
  // incomplete avant le plafond.
  const { faireUnePage, appels } = fabriquerSource(1000);
  await assertRejects(
    () => lireToutesLesPages(faireUnePage, 10, 5),
    Error,
    'plafond de 5 pages atteint (50 lignes lues)',
  );
  assertEquals(appels.length, 5);
});

Deno.test("lireToutesLesPages : une erreur levee par faireUnePage remonte telle quelle, elle n'est jamais avalee", async () => {
  const faireUnePage = () => { throw new Error('panne réseau simulée'); };
  await assertRejects(() => lireToutesLesPages(faireUnePage, 100, 5), Error, 'panne réseau simulée');
});

Deno.test("lireToutesLesPages : faireUnePage n'est pas une fonction -> echoue tot avec un message clair", async () => {
  await assertRejects(() => lireToutesLesPages(null, 100, 5), Error, 'faireUnePage doit être une fonction');
});

// Faille relevee en revue le 22/08/2026 : traiter une page non-tableau
// comme une page VIDE ferait conclure "fin atteinte" a tort, et rendrait
// les lignes deja lues comme un resultat COMPLET alors qu'il peut etre
// tronque. C'est exactement le defaut que ce lot existe pour interdire :
// une tranche qui n'est pas un tableau doit donc toujours ECHOUER, jamais
// etre devinee comme vide.

Deno.test("lireToutesLesPages : une page qui renvoie null echoue explicitement, jamais devinee comme vide", async () => {
  const faireUnePage = () => null;
  await assertRejects(() => lireToutesLesPages(faireUnePage, 10, 5), Error, "n'a pas renvoyé un tableau");
});

Deno.test("lireToutesLesPages : une page qui renvoie undefined echoue explicitement", async () => {
  const faireUnePage = () => undefined;
  await assertRejects(() => lireToutesLesPages(faireUnePage, 10, 5), Error, "n'a pas renvoyé un tableau");
});

Deno.test("lireToutesLesPages : une page qui renvoie un objet non-tableau (ex. { data, error } mal deballe) echoue explicitement", async () => {
  const faireUnePage = () => ({ data: null, error: null });
  await assertRejects(() => lireToutesLesPages(faireUnePage, 10, 5), Error, "n'a pas renvoyé un tableau");
});

Deno.test("lireToutesLesPages : une premiere page valide puis une deuxieme non-tableau echoue, sans rendre les lignes deja lues comme un resultat complet", async () => {
  let appel = 0;
  const faireUnePage = () => {
    appel++;
    // Premiere page pleine (10 lignes, donc pas encore "fin atteinte") :
    // sans le correctif, la boucle continuerait puis avalerait la panne
    // de la deuxieme page en silence et rendrait ces 10 lignes comme si
    // c'etait tout le jeu de donnees.
    if (appel === 1) return Array.from({ length: 10 }, (_, i) => i);
    return { data: null, error: 'panne' }; // deuxieme page mal deballee
  };
  await assertRejects(() => lireToutesLesPages(faireUnePage, 10, 5), Error, "n'a pas renvoyé un tableau");
});

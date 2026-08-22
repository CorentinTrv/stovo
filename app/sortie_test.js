// sortie_test.js - Chantier S (mode sortie de stock), lot S-5
//
// Banc offline du module app/sortie.js. Contrairement à pilotage.js/pertes.js
// (modules PURS, zéro DOM), sortie.js est un JUMEAU de reception.js : il
// manipule des nœuds, mais TOUS lui sont injectés (elements, appeler,
// confirmer, afficher, doc, prendreVerrou, rendreVerrou), voir l'en-tête de
// sortie.js. Ce module ne fait donc AUCUN accès à `globalThis.document` ni à
// `globalThis.fetch` : pas besoin de stubber quoi que ce soit au niveau
// global (technique différente de celle décrite dans la mémoire d'agent
// feedback-test-pwa-offline pour dashboard.js/parler.js, qui EUX importent
// supabase.js au niveau module). Ici, un simple mock d'éléments + un faux
// `document.createElement` suffisent, zéro réseau, zéro Supabase, zéro
// navigateur réel.
//
// Piège évité (mémoire feedback-test-pwa-offline) : `hidden`/`disabled` des
// éléments simulés sont initialisés à la valeur RÉELLE posée dans index.html
// (ex. `sortie-panneau` a l'attribut `hidden` par défaut), sinon une
// assertion "c'est bien caché au départ" passerait par coïncidence.
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test livrables/sites-web/stovo/app/sortie_test.js

import { assertEquals, assertMatch } from "jsr:@std/assert";
import { creerModeSortie } from "./sortie.js";

// --- Un nœud DOM minimal : className/textContent/children/addEventListener,
// et un `click()` qui respecte `disabled` (comme un vrai bouton HTML ne
// déclenche pas 'click' quand il est désactivé -- c'est précisément ce qui
// protège le double-clic en production, cf. sortie.js `executer`). ---
function crearElemento() {
  const el = {
    className: "",
    textContent: "",
    hidden: false,
    disabled: false,
    value: "",
    placeholder: "",
    children: [],
    _listeners: {},
    appendChild(hijo) {
      el.children.push(hijo);
    },
    setAttribute(clave, valor) {
      el[clave] = valor;
    },
    addEventListener(tipo, cb) {
      el._listeners[tipo] = el._listeners[tipo] || [];
      el._listeners[tipo].push(cb);
    },
    click() {
      if (el.disabled) return undefined; // un bouton disabled ne dispatch pas 'click'
      const listeners = el._listeners.click || [];
      const resultados = listeners.map((cb) => cb());
      return resultados[0];
    },
  };
  // `innerHTML = ''` (posé par sortie.js avant de re-remplir la liste) doit
  // vider `children`, sinon deux rendus successifs s'accumuleraient.
  Object.defineProperty(el, "innerHTML", {
    get() {
      return el._innerHTML || "";
    },
    set(valor) {
      el._innerHTML = valor;
      el.children = [];
    },
  });
  return el;
}

const doc = { createElement: () => crearElemento() };

// Valeurs initiales calquées sur index.html (attribut `hidden`/`disabled`
// réellement posé par défaut sur chaque nœud du bloc sortie).
function crearElementos() {
  const demarrer = crearElemento();
  demarrer.hidden = false;
  const panneau = crearElemento();
  panneau.hidden = true;
  const actions = crearElemento();
  actions.hidden = true;
  const reprise = crearElemento();
  reprise.hidden = true;
  const inconnus = crearElemento();
  inconnus.hidden = true;
  const confirmation = crearElemento();
  confirmation.hidden = true;
  const boutonImport = crearElemento();
  boutonImport.hidden = false;
  const valider = crearElemento();
  valider.disabled = true;

  return {
    demarrer,
    panneau,
    titreTotal: crearElemento(),
    liste: crearElemento(),
    inconnus,
    actions,
    valider,
    abandon: crearElemento(),
    reprise,
    repriseTexte: crearElemento(),
    reprendre: crearElemento(),
    repriseAbandon: crearElemento(),
    champ: crearElemento(),
    boutonEnvoyer: crearElemento(),
    boutonImport,
    confirmation,
  };
}

// Construit un contexte de test frais : elements + modo + espions (appels
// réseau capturés, messages affichés, confirmations demandées).
function crearContexto(options = {}) {
  const elements = crearElementos();
  const llamadas = [];
  let appelerImpl = () => null;
  const appeler = async (corps) => {
    llamadas.push(corps);
    return await appelerImpl(corps);
  };
  const mensajes = [];
  const afficher = (texte) => {
    mensajes.push(texte);
  };
  const confirmaciones = [];
  const confirmer = (mensaje) => {
    confirmaciones.push(mensaje);
    return options.confirmerRepond ?? true;
  };

  const modo = creerModeSortie({
    elements,
    appeler,
    confirmer,
    afficher,
    doc,
    prendreVerrou: options.prendreVerrou,
    rendreVerrou: options.rendreVerrou,
  });

  return {
    elements,
    modo,
    llamadas,
    mensajes,
    confirmaciones,
    setRespuesta(fn) {
      appelerImpl = fn;
    },
  };
}

const LIGNE_PATES = { produitId: 1, nom: "Pâtes", quantite: 3, stockConnu: 10, stockApres: 7, insuffisant: false };

// ---------------------------------------------------------------------------
// Construction de la liste (vide, puis une ligne)
// ---------------------------------------------------------------------------

Deno.test("sortie.js : demarrer une sortie affiche la liste vide, puis une ligne ajoutee est rendue avec le signe moins", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();

  assertEquals(ctx.modo.estEnSortie(), true);
  assertEquals(ctx.elements.panneau.hidden, false);
  assertEquals(ctx.elements.demarrer.hidden, true);
  assertEquals(ctx.elements.liste.children.length, 1);
  assertEquals(ctx.elements.liste.children[0].className, "reception-vide");
  assertMatch(ctx.elements.liste.children[0].textContent, /3 pâtes/);

  ctx.setRespuesta(() => ({
    reply: "Sortie : Pâtes -3.",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");

  assertEquals(ctx.llamadas.at(-1).kind, "sortie-ligne");
  assertEquals(ctx.elements.liste.children.length, 1);
  const item = ctx.elements.liste.children[0];
  assertEquals(item.className, "reception-item");
  assertEquals(item.children[0].textContent, "Pâtes"); // nom
  assertEquals(item.children[1].textContent, "-3"); // quantite, signe MOINS (repere visuel vs reception)
  assertEquals(ctx.elements.valider.disabled, false);
  assertEquals(ctx.elements.titreTotal.textContent, "3 lignes");
});

// ---------------------------------------------------------------------------
// Fusion additive (dicter deux fois le meme produit)
// ---------------------------------------------------------------------------

Deno.test("sortie.js : dicter deux fois le meme produit fusionne (additif, pas d'ecrasement), classe fusionnee posee", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();

  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");

  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: {
      active: true,
      lignes: [{ ...LIGNE_PATES, quantite: 6, stockApres: 4, fusionnee: true }],
      inconnus: [],
      total: 6,
    },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");

  const item = ctx.elements.liste.children[0];
  assertEquals(item.className, "reception-item fusionnee");
  assertEquals(item.children[1].textContent, "-6");
  assertEquals(ctx.elements.titreTotal.textContent, "6 lignes");
});

// ---------------------------------------------------------------------------
// Retrait d'une ligne (la croix)
// ---------------------------------------------------------------------------

Deno.test("sortie.js : la croix retire une ligne (appelle sortie-retirer avec le bon produitId)", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");

  const croix = ctx.elements.liste.children[0].children[2];
  ctx.setRespuesta(() => ({
    reply: "Ligne retiree.",
    sortie: { active: false, lignes: [], inconnus: [], total: 0 },
  }));
  await croix.click();

  assertEquals(ctx.llamadas.at(-1).kind, "sortie-retirer");
  assertEquals(ctx.llamadas.at(-1).produitId, 1);
  assertEquals(ctx.elements.liste.children.length, 1);
  assertEquals(ctx.elements.liste.children[0].className, "reception-vide");
  // On reste en session meme si la liste redevient vide (l'utilisateur peut redicter).
  assertEquals(ctx.modo.estEnSortie(), true);
});

// ---------------------------------------------------------------------------
// Produit inconnu : exclu du total, affiche, non bloquant
// ---------------------------------------------------------------------------

Deno.test("sortie.js : un produit inconnu est signale et exclu du total, sans bloquer la session", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "jambon : pas dans ton catalogue, cree-le d'abord pour l'ajouter.",
    sortie: { active: false, lignes: [], inconnus: ["jambon"], total: 0 },
  }));
  await ctx.modo.ajouterLigne("3 jambon");

  assertEquals(ctx.elements.inconnus.hidden, false);
  assertMatch(ctx.elements.inconnus.textContent, /jambon/);
  assertMatch(ctx.elements.inconnus.textContent, /n'est pas dans ton catalogue/);
  assertEquals(ctx.elements.titreTotal.textContent, "0 ligne");
  assertEquals(ctx.modo.estEnSortie(), true); // rien de bloquant, on reste en session
});

// ---------------------------------------------------------------------------
// Alerte de stock insuffisant : non bloquant (§Q1 du plan)
// ---------------------------------------------------------------------------

Deno.test("sortie.js : une ligne dont le stock passe negatif (insuffisant=true) porte la classe alerte, sans bloquer la validation", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "Sortie : Lait -5.",
    sortie: {
      active: true,
      lignes: [{ produitId: 2, nom: "Lait", quantite: 5, stockConnu: 2, stockApres: -3, insuffisant: true }],
      inconnus: [],
      total: 5,
    },
  }));
  await ctx.modo.ajouterLigne("5 lait");

  const item = ctx.elements.liste.children[0];
  assertEquals(item.className, "reception-item alerte");
  assertEquals(ctx.elements.valider.disabled, false); // avertissement NON bloquant : Valider reste actif
});

Deno.test("sortie.js : une ligne au stock suffisant NE porte PAS la classe alerte", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");

  assertEquals(ctx.elements.liste.children[0].className, "reception-item");
});

// ---------------------------------------------------------------------------
// Double-clic sur Valider : un seul appel API (frontiere idempotente + UX)
// ---------------------------------------------------------------------------

Deno.test("sortie.js : double-clic sur Valider n'appelle l'API qu'une seule fois (controles desactives pendant l'appel)", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");
  assertEquals(ctx.elements.valider.disabled, false);

  let resolver;
  const enAttente = new Promise((resolve) => {
    resolver = resolve;
  });
  let appelsValidation = 0;
  ctx.setRespuesta(async (corps) => {
    if (corps.kind === "sortie-valider") appelsValidation++;
    return await enAttente;
  });

  const p1 = ctx.elements.valider.click(); // 1er clic : desactive AVANT le premier await reel
  assertEquals(ctx.elements.valider.disabled, true);
  assertEquals(ctx.elements.abandon.disabled, true);

  const p2 = ctx.elements.valider.click(); // 2e clic : bouton desactive, click() ne declenche rien
  assertEquals(p2, undefined);

  resolver({
    reply: "Sortie enregistree : 1 ligne.",
    sortie: { active: false, lignes: [], inconnus: [], total: 0 },
  });
  await p1;

  assertEquals(appelsValidation, 1);
  assertEquals(ctx.elements.valider.disabled, false); // re-active apres l'appel (finally de executer)
  assertEquals(ctx.modo.estEnSortie(), false); // sortir() a bien ete appele une seule fois
});

// ---------------------------------------------------------------------------
// Abandon : confirmation, message dedie, vide la session
// ---------------------------------------------------------------------------

Deno.test("sortie.js : abandonner demande confirmation avec le message dedie et vide la session", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");

  ctx.setRespuesta(() => ({ reply: "Sortie abandonnee.", sortie: { active: false, lignes: [], inconnus: [], total: 0 } }));
  await ctx.elements.abandon.click();

  assertEquals(ctx.confirmaciones, ["Abandonner cette sortie ? Rien ne sera enregistré."]);
  assertEquals(ctx.llamadas.at(-1).kind, "sortie-abandon");
  assertEquals(ctx.modo.estEnSortie(), false);
});

Deno.test("sortie.js : abandonner sans confirmation (confirmer renvoie false) n'appelle pas l'API", async () => {
  const ctx = crearContexto({ confirmerRepond: false });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");
  const appelsAvant = ctx.llamadas.length;

  await ctx.elements.abandon.click();

  assertEquals(ctx.llamadas.length, appelsAvant); // aucun nouvel appel
  assertEquals(ctx.modo.estEnSortie(), true); // toujours en session
});

// ---------------------------------------------------------------------------
// Bannière de reprise apres un rechargement simule
// ---------------------------------------------------------------------------

Deno.test("sortie.js : la banniere de reprise apparait si le serveur renvoie une sortie active (rechargement simule)", async () => {
  const ctx = crearContexto();
  assertEquals(ctx.elements.reprise.hidden, true); // etat initial reel (index.html)

  ctx.setRespuesta((corps) => {
    assertEquals(corps.kind, "sortie-etat");
    return { reply: "", sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 } };
  });
  await ctx.modo.verifierReprise();

  assertEquals(ctx.elements.reprise.hidden, false);
  assertMatch(ctx.elements.repriseTexte.textContent, /sortie en cours/);
  assertMatch(ctx.elements.repriseTexte.textContent, /3 lignes/);
});

Deno.test("sortie.js : pas de sortie active cote serveur -> pas de banniere de reprise", async () => {
  const ctx = crearContexto();
  ctx.setRespuesta(() => ({ reply: "", sortie: { active: false, lignes: [], inconnus: [], total: 0 } }));
  await ctx.modo.verifierReprise();

  assertEquals(ctx.elements.reprise.hidden, true);
});

Deno.test("sortie.js : cliquer Reprendre depuis la banniere entre en session avec les lignes deja connues, sans nouvel appel reseau", async () => {
  const ctx = crearContexto();
  ctx.setRespuesta(() => ({ reply: "", sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 } }));
  await ctx.modo.verifierReprise();
  const appelsAvant = ctx.llamadas.length;

  ctx.elements.reprendre.click();

  assertEquals(ctx.modo.estEnSortie(), true);
  assertEquals(ctx.elements.reprise.hidden, true);
  assertEquals(ctx.elements.liste.children.length, 1);
  assertEquals(ctx.elements.liste.children[0].children[1].textContent, "-3");
  assertEquals(ctx.llamadas.length, appelsAvant); // reprendre reutilise l'etat deja recu, pas de nouvel appel
});

// ---------------------------------------------------------------------------
// Verrou de mode (lot S-0) : injection permissive par defaut, refus respecte
// ---------------------------------------------------------------------------

Deno.test("sortie.js : sans prendreVerrou/rendreVerrou injectes, le mode fonctionne quand meme (defauts permissifs)", () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  assertEquals(ctx.modo.estEnSortie(), true);
});

Deno.test("sortie.js : prendreVerrou('sortie') est appele a l'entree, et un refus empeche d'entrer en session", () => {
  const appelsVerrou = [];
  const ctx = crearContexto({
    prendreVerrou: (nom) => {
      appelsVerrou.push(nom);
      return false;
    },
    rendreVerrou: () => {},
  });
  ctx.elements.demarrer.click();

  assertEquals(appelsVerrou, ["sortie"]);
  assertEquals(ctx.modo.estEnSortie(), false);
  assertEquals(ctx.elements.panneau.hidden, true); // inchange : toujours cache
  assertEquals(ctx.elements.demarrer.hidden, false); // inchange : toujours visible
});

Deno.test("sortie.js : rendreVerrou('sortie') est appele a la sortie du mode (validation)", async () => {
  const appelsRendus = [];
  const ctx = crearContexto({
    prendreVerrou: () => true,
    rendreVerrou: (nom) => appelsRendus.push(nom),
  });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    sortie: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 3 },
  }));
  await ctx.modo.ajouterLigne("3 pâtes");
  ctx.setRespuesta(() => ({
    reply: "Sortie enregistree : 1 ligne.",
    sortie: { active: false, lignes: [], inconnus: [], total: 0 },
  }));
  await ctx.elements.valider.click();

  assertEquals(appelsRendus, ["sortie"]);
});

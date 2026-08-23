// reception_test.js - Lot A11-1 (tests front de la boucle vocale, 23/08/2026)
//
// Banc offline du module app/reception.js, sur le MODELE EXACT de
// app/sortie_test.js (meme technique : reception.js est un JUMEAU de
// sortie.js, tous ses noeuds DOM/reseau/confirmation sont INJECTES, aucun
// acces a `globalThis.document` ni `globalThis.fetch`). Zero navigateur reel,
// zero reseau, zero Supabase.
//
// Differences reelles avec sortie_test.js (voir l'en-tete de reception.js) :
//   - la reponse serveur porte `{ reply, session }` (pas `sortie`) ;
//   - la quantite s'affiche avec un signe PLUS ("+10") ;
//   - pas de champ `insuffisant`/classe `alerte` (ca n'existe que cote sortie) ;
//   - un chemin PHOTO en plus (`envoyerPhoto`, `reduirePhoto` injecte, journal
//     de lecture `elements.lecture`), absent de sortie.js.
//
// Piege evite (memoire feedback-test-pwa-offline) : `hidden`/`disabled` des
// elements simules sont initialises a la valeur REELLE posee dans index.html
// (ex. `reception-panneau` a l'attribut `hidden`, `btn-reception-valider` a
// l'attribut `disabled`), sinon une assertion "c'est bien cache au depart"
// passerait par coincidence.
//
// Lancer avec (depuis la racine du workspace) :
//   deno test livrables/sites-web/stovo/app/reception_test.js

import { assertEquals, assertMatch } from "jsr:@std/assert";
import { creerModeReception } from "./reception.js";

// --- Un noeud DOM minimal : className/textContent/children/addEventListener,
// et un `click()` qui respecte `disabled` (comme un vrai bouton HTML ne
// declenche pas 'click' quand il est desactive). Copie a l'identique de
// sortie_test.js. ---
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
  // `innerHTML = ''` (pose par reception.js avant de re-remplir la liste ou
  // le journal de lecture) doit vider `children`, sinon deux rendus
  // successifs s'accumuleraient.
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

// Valeurs initiales calquees sur index.html (attribut `hidden`/`disabled`
// reellement pose par defaut sur chaque noeud du bloc reception).
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
  const lecture = crearElemento();
  lecture.hidden = true;
  const champPhoto = crearElemento();
  champPhoto.hidden = true;
  const boutonPhoto = crearElemento();
  boutonPhoto.hidden = false;

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
    boutonPhoto,
    champPhoto,
    lecture,
  };
}

// Construit un contexte de test frais : elements + modo + espions (appels
// reseau captures, messages affiches, confirmations demandees, reduction
// photo simulee).
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
  let reduirePhotoImpl = options.reduirePhotoImpl;

  const config = {
    elements,
    appeler,
    confirmer,
    afficher,
    doc,
    prendreVerrou: options.prendreVerrou,
    rendreVerrou: options.rendreVerrou,
    afficherChoix: options.afficherChoix,
  };
  // reduirePhoto n'est injecte QUE si le test le fournit explicitement,
  // pour pouvoir aussi tester le cas "non fourni" (reception.js doit alors
  // se rabattre sur le message de panne de lecture).
  if (options.avecReduirePhoto !== false) {
    config.reduirePhoto = (fichier) => reduirePhotoImpl(fichier);
  }

  const modo = creerModeReception(config);

  return {
    elements,
    modo,
    llamadas,
    mensajes,
    confirmaciones,
    setRespuesta(fn) {
      appelerImpl = fn;
    },
    setReduirePhoto(fn) {
      reduirePhotoImpl = fn;
    },
  };
}

const LIGNE_PATES = { produitId: 1, nom: "Pâtes", quantite: 10 };

// ---------------------------------------------------------------------------
// Creation du mode
// ---------------------------------------------------------------------------

Deno.test("reception.js : creerModeReception expose estEnReception/ajouterLigne/envoyerPhoto/verifierReprise, rien n'est demarre au depart", () => {
  const ctx = crearContexto();
  assertEquals(typeof ctx.modo.estEnReception, "function");
  assertEquals(typeof ctx.modo.ajouterLigne, "function");
  assertEquals(typeof ctx.modo.envoyerPhoto, "function");
  assertEquals(typeof ctx.modo.verifierReprise, "function");
  assertEquals(ctx.modo.estEnReception(), false);
});

// ---------------------------------------------------------------------------
// Demarrage : verrou pris, panneau affiche
// ---------------------------------------------------------------------------

Deno.test("reception.js : demarrer une reception prend le verrou, affiche le panneau et masque Demarrer/Import/Confirmation", () => {
  const appelsVerrou = [];
  const ctx = crearContexto({
    prendreVerrou: (nom) => {
      appelsVerrou.push(nom);
      return true;
    },
  });
  ctx.elements.demarrer.click();

  assertEquals(appelsVerrou, ["reception"]); // verrou pris avant tout affichage
  assertEquals(ctx.modo.estEnReception(), true);
  assertEquals(ctx.elements.panneau.hidden, false);
  assertEquals(ctx.elements.demarrer.hidden, true);
  assertEquals(ctx.elements.actions.hidden, false);
  assertEquals(ctx.elements.boutonImport.hidden, true);
  assertEquals(ctx.elements.confirmation.hidden, true); // R3 : pas de Oui/Non normal en session
  assertEquals(ctx.elements.champ.placeholder, "Ex : 10 pâtes");
  assertEquals(ctx.elements.liste.children.length, 1); // liste vide rendue
  assertEquals(ctx.elements.liste.children[0].className, "reception-vide");
  assertMatch(ctx.mensajes.at(-1), /Réception en cours/);
});

Deno.test("reception.js : un refus du verrou empeche d'entrer, panneau et bouton Demarrer inchanges", () => {
  const appelsVerrou = [];
  const ctx = crearContexto({
    prendreVerrou: (nom) => {
      appelsVerrou.push(nom);
      return false;
    },
    rendreVerrou: () => {},
  });
  ctx.elements.demarrer.click();

  assertEquals(appelsVerrou, ["reception"]);
  assertEquals(ctx.modo.estEnReception(), false);
  assertEquals(ctx.elements.panneau.hidden, true); // inchange : toujours cache
  assertEquals(ctx.elements.demarrer.hidden, false); // inchange : toujours visible
});

// ---------------------------------------------------------------------------
// Ligne dictee : corps envoye, rendu de la liste, boutons
// ---------------------------------------------------------------------------

Deno.test("reception.js : dicter une ligne appelle reception-ligne avec le texte, rend la liste avec le signe plus et active Valider", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();

  ctx.setRespuesta(() => ({
    reply: "Réception : Pâtes +10.",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  assertEquals(ctx.llamadas.at(-1), { kind: "reception-ligne", texte: "10 pâtes" });
  const item = ctx.elements.liste.children[0];
  assertEquals(item.className, "reception-item");
  assertEquals(item.children[0].textContent, "Pâtes");
  assertEquals(item.children[1].textContent, "+10"); // signe PLUS (vs sortie.js)
  assertEquals(ctx.elements.valider.disabled, false); // au moins une ligne -> Valider actif
  assertEquals(ctx.elements.titreTotal.textContent, "10 lignes");
  assertEquals(ctx.elements.champ.value, ""); // champ vide une fois l'ajout aboutit
});

// ---------------------------------------------------------------------------
// Retirer une ligne (la croix)
// ---------------------------------------------------------------------------

Deno.test("reception.js : la croix retire une ligne (appelle reception-retirer avec le bon produitId), on reste en session", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  const croix = ctx.elements.liste.children[0].children[2];
  ctx.setRespuesta(() => ({
    reply: "Ligne retirée.",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
  }));
  await croix.click();

  assertEquals(ctx.llamadas.at(-1), { kind: "reception-retirer", produitId: 1 });
  assertEquals(ctx.elements.liste.children.length, 1);
  assertEquals(ctx.elements.liste.children[0].className, "reception-vide");
  // On reste en session meme si la liste redevient vide (l'utilisateur peut redicter),
  // et meme si le serveur renvoie active:false (l'etat "en reception" est purement front).
  assertEquals(ctx.modo.estEnReception(), true);
});

// ---------------------------------------------------------------------------
// Valider : appelle reception-valider et sort de la session
// ---------------------------------------------------------------------------

Deno.test("reception.js : valider appelle reception-valider et sort de la session apres succes (aucune confirmation demandee ici)", async () => {
  const ctx = crearContexto({ confirmerRepond: true });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  ctx.setRespuesta(() => ({
    reply: "Réception enregistrée : 1 ligne.",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
  }));
  await ctx.elements.valider.click();

  assertEquals(ctx.llamadas.at(-1), { kind: "reception-valider" });
  assertEquals(ctx.confirmaciones.length, 0); // valider() ne demande PAS confirmation (rempart deja passe a la dictee)
  assertEquals(ctx.modo.estEnReception(), false);
  assertEquals(ctx.elements.panneau.hidden, true);
  assertEquals(ctx.elements.demarrer.hidden, false);
});

// ---------------------------------------------------------------------------
// Double-clic sur Valider : un seul appel API (controles desactives)
// ---------------------------------------------------------------------------

Deno.test("reception.js : double-clic sur Valider n'appelle l'API qu'une seule fois (controles desactives pendant l'appel)", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes");
  assertEquals(ctx.elements.valider.disabled, false);

  let resolver;
  const enAttente = new Promise((resolve) => {
    resolver = resolve;
  });
  let appelsValidation = 0;
  ctx.setRespuesta(async (corps) => {
    if (corps.kind === "reception-valider") appelsValidation++;
    return await enAttente;
  });

  const p1 = ctx.elements.valider.click(); // 1er clic : desactive AVANT le premier await reel
  assertEquals(ctx.elements.valider.disabled, true);
  assertEquals(ctx.elements.abandon.disabled, true);
  assertEquals(ctx.elements.champ.disabled, true);

  const p2 = ctx.elements.valider.click(); // 2e clic : bouton desactive, click() ne declenche rien
  assertEquals(p2, undefined);

  resolver({
    reply: "Réception enregistrée : 1 ligne.",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
  });
  await p1;

  assertEquals(appelsValidation, 1);
  assertEquals(ctx.elements.valider.disabled, false); // re-active apres l'appel (finally de executer)
  assertEquals(ctx.modo.estEnReception(), false); // sortir() n'a ete appele qu'une seule fois
});

// ---------------------------------------------------------------------------
// Abandon : confirmation demandee, message dedie, appel reception-abandon
// ---------------------------------------------------------------------------

Deno.test("reception.js : abandonner demande confirmation avec le message dedie et appelle reception-abandon", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  ctx.setRespuesta(() => ({
    reply: "Réception abandonnée.",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
  }));
  await ctx.elements.abandon.click();

  assertEquals(ctx.confirmaciones, ["Abandonner cette réception ? Rien ne sera enregistré."]);
  assertEquals(ctx.llamadas.at(-1), { kind: "reception-abandon" });
  assertEquals(ctx.modo.estEnReception(), false);
});

Deno.test("reception.js : abandonner sans confirmation (confirmer renvoie false) n'appelle pas l'API et reste en session", async () => {
  const ctx = crearContexto({ confirmerRepond: false });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "ok",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes");
  const appelsAvant = ctx.llamadas.length;

  await ctx.elements.abandon.click();

  assertEquals(ctx.llamadas.length, appelsAvant); // aucun nouvel appel
  assertEquals(ctx.modo.estEnReception(), true); // toujours en session
});

// ---------------------------------------------------------------------------
// Erreur reseau : message affiche, controles reactives (verrou UI leve)
// ---------------------------------------------------------------------------

Deno.test("reception.js : un echec reseau sur l'ajout d'une ligne affiche le message d'erreur et relache les controles", async () => {
  const ctx = crearContexto();
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => null); // appeler() renvoie null = vrai echec reseau/serveur

  await ctx.modo.ajouterLigne("10 pâtes");

  assertEquals(ctx.mensajes.at(-1), "Désolé, une erreur est survenue. Réessaie dans quelques instants.");
  // Le "verrou" UI anti-double-clic est relache (finally de executer), meme en echec.
  assertEquals(ctx.elements.boutonEnvoyer.disabled, false);
  assertEquals(ctx.elements.champ.disabled, false);
  assertEquals(ctx.modo.estEnReception(), true); // on reste en session pour reessayer
});

// ---------------------------------------------------------------------------
// Chemin photo : reduirePhoto injecte, appel reception-photo, journal de lecture
// ---------------------------------------------------------------------------

Deno.test("reception.js : envoyerPhoto reduit la photo puis appelle reception-photo avec le base64 et le mime, et affiche le journal de lecture", async () => {
  const ctx = crearContexto({
    reduirePhotoImpl: () => ({ base64: "QUJD", mimeType: "image/jpeg" }),
  });
  ctx.elements.demarrer.click();

  ctx.setRespuesta((corps) => {
    assertEquals(corps, { kind: "reception-photo", contenuBase64: "QUJD", mimeType: "image/jpeg" });
    return {
      reply: "J'ai lu 1 produit sur ta photo.",
      session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
      lecture: [{ libelle: "PATE FEUILLETEE 230G", nom: "Pâtes", quantite: 10 }],
    };
  });

  await ctx.modo.envoyerPhoto({ name: "bl.jpg" });

  assertEquals(ctx.llamadas.at(-1).kind, "reception-photo");
  // MSG_PHOTO_ENVOI est affiche AVANT l'appel API (pendant la reduction) : il
  // doit donc figurer quelque part dans l'historique des messages affiches.
  assertEquals(ctx.mensajes.includes("Je lis ta photo, un instant…"), true);
  assertEquals(ctx.mensajes.at(-1), "J'ai lu 1 produit sur ta photo.");
  assertEquals(ctx.elements.lecture.hidden, false);
  assertMatch(ctx.elements.lecture.children[0].textContent, /vérifie les rapprochements/);
  const item = ctx.elements.lecture.children[1];
  assertEquals(item.children[0].textContent, "PATE FEUILLETEE 230G");
  assertEquals(item.children[2].textContent, "Pâtes +10");
});

Deno.test("reception.js : reduirePhoto qui echoue (renvoie null) affiche le message de panne de lecture, sans appel API", async () => {
  const ctx = crearContexto({
    reduirePhotoImpl: () => null,
  });
  ctx.elements.demarrer.click();
  const appelsAvant = ctx.llamadas.length;

  await ctx.modo.envoyerPhoto({ name: "bl.jpg" });

  assertEquals(ctx.llamadas.length, appelsAvant); // aucun appel reception-photo
  assertEquals(ctx.mensajes.at(-1), "Je n'ai pas réussi à préparer cette photo. Reprends-la, ou dicte les lignes.");
});

Deno.test("reception.js : sans reduirePhoto injecte, envoyerPhoto affiche directement le message de panne de lecture", async () => {
  const ctx = crearContexto({ avecReduirePhoto: false });
  ctx.elements.demarrer.click();
  const appelsAvant = ctx.llamadas.length;

  await ctx.modo.envoyerPhoto({ name: "bl.jpg" });

  assertEquals(ctx.llamadas.length, appelsAvant);
  assertEquals(ctx.mensajes.at(-1), "Je n'ai pas réussi à préparer cette photo. Reprends-la, ou dicte les lignes.");
});

Deno.test("reception.js : le journal de lecture d'une photo est efface par une ligne dictee ensuite (rempart contre un journal perime)", async () => {
  const ctx = crearContexto({
    reduirePhotoImpl: () => ({ base64: "QUJD", mimeType: "image/jpeg" }),
  });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "J'ai lu 1 produit sur ta photo.",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
    lecture: [{ libelle: "PATE FEUILLETEE 230G", nom: "Pâtes", quantite: 10 }],
  }));
  await ctx.modo.envoyerPhoto({ name: "bl.jpg" });
  assertEquals(ctx.elements.lecture.hidden, false);

  // Une ligne dictee normalement ne renvoie pas de champ `lecture` -> le journal se vide.
  ctx.setRespuesta(() => ({
    reply: "ok",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 20 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  assertEquals(ctx.elements.lecture.hidden, true);
});

// ---------------------------------------------------------------------------
// Lot A10-6 (23/08/2026) : choix numerote sur une ligne de reception
// ---------------------------------------------------------------------------

// Fabrique un `afficherChoix` espion : capture chaque appel (candidats, et
// les deux rappels recus -- on ne peut pas comparer une fonction a une autre
// fonction, donc on les garde et on les invoque au besoin dans le test).
// Lot A10-6b (23/08/2026) : `surAucun` s'ajoute a `surChoix` (troisieme
// parametre de afficherChoix depuis le polish).
function crearEspionAfficherChoix() {
  const appels = [];
  const fn = (candidats, surChoix, surAucun) => {
    appels.push({ candidats, surChoix, surAucun });
  };
  return { fn, appels };
}

const CANDIDATS = [{ numero: 1, nom: "Pâtes 500 g" }, { numero: 2, nom: "Pâtes complètes" }];

Deno.test("reception.js : une reponse avec choix rend les candidats via afficherChoix, sans toucher la liste", async () => {
  const espion = crearEspionAfficherChoix();
  const ctx = crearContexto({ afficherChoix: espion.fn });
  ctx.elements.demarrer.click(); // appel 1 : R3, efface un choix eventuel a l'entree

  ctx.setRespuesta(() => ({
    reply: "Tu veux dire 1) Pâtes 500 g ou 2) Pâtes complètes ? Dis le numéro.",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
    choix: CANDIDATS,
  }));
  await ctx.modo.ajouterLigne("10 pâtes"); // appel 2 : le vrai choix

  assertEquals(espion.appels.length, 2);
  assertEquals(espion.appels.at(-1).candidats, CANDIDATS);
  assertEquals(typeof espion.appels.at(-1).surChoix, "function");
});

Deno.test("reception.js : le rappel de afficherChoix envoie exactement { kind: 'choix', numero } par appeler", async () => {
  const espion = crearEspionAfficherChoix();
  const ctx = crearContexto({ afficherChoix: espion.fn });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "Tu veux dire...",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
    choix: CANDIDATS,
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  ctx.setRespuesta(() => ({
    reply: "Ajoute : Pâtes 500 g +10.",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await espion.appels.at(-1).surChoix(1);

  assertEquals(ctx.llamadas.at(-1), { kind: "choix", numero: 1 });
});

Deno.test("reception.js : repondre a un choix met a jour la liste de session comme une ligne normale", async () => {
  const espion = crearEspionAfficherChoix();
  const ctx = crearContexto({ afficherChoix: espion.fn });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "Tu veux dire...",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
    choix: CANDIDATS,
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  ctx.setRespuesta(() => ({
    reply: "Ajoute : Pâtes 500 g +10.",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await espion.appels.at(-1).surChoix(1);

  assertEquals(ctx.elements.titreTotal.textContent, "10 lignes");
  const item = ctx.elements.liste.children[0];
  assertEquals(item.children[0].textContent, "Pâtes");
  assertEquals(item.children[1].textContent, "+10");
  assertEquals(ctx.mensajes.at(-1), "Ajoute : Pâtes 500 g +10.");
});

Deno.test("reception.js : une reponse sans choix efface la zone (afficherChoix appele avec [] et null)", async () => {
  const espion = crearEspionAfficherChoix();
  const ctx = crearContexto({ afficherChoix: espion.fn });
  ctx.elements.demarrer.click(); // appel 1 : R3 (deja [] / null)

  ctx.setRespuesta(() => ({
    reply: "Réception : Pâtes +10.",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
  }));
  await ctx.modo.ajouterLigne("10 pâtes"); // appel 2 : ajouterLigne efface a nouveau (pas de choix)

  assertEquals(espion.appels.length, 2);
  assertEquals(espion.appels.at(-1).candidats, []);
  assertEquals(espion.appels.at(-1).surChoix, null);
});

Deno.test("reception.js : sans afficherChoix injecte (defaut permissif), un choix recu ne casse rien", async () => {
  const ctx = crearContexto(); // pas de afficherChoix fourni
  ctx.elements.demarrer.click();

  ctx.setRespuesta(() => ({
    reply: "Tu veux dire...",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
    choix: CANDIDATS,
  }));
  // Ne doit lever aucune exception (afficherChoixMode par defaut ne fait rien).
  await ctx.modo.ajouterLigne("10 pâtes");

  assertEquals(ctx.mensajes.at(-1), "Tu veux dire...");
});

Deno.test("reception.js : demarrer une reception efface un choix qui trainait (R3, meme regle que la confirmation)", () => {
  const espion = crearEspionAfficherChoix();
  const ctx = crearContexto({ afficherChoix: espion.fn });

  ctx.elements.demarrer.click();

  assertEquals(espion.appels.length, 1);
  assertEquals(espion.appels[0].candidats, []);
  assertEquals(espion.appels[0].surChoix, null);
});

// ---------------------------------------------------------------------------
// Lot A10-6b (23/08/2026) : le rappel "Aucun de ceux-la"
// ---------------------------------------------------------------------------

Deno.test("reception.js : le rappel 'Aucun de ceux-la' envoie exactement { kind: 'reception-ligne', texte: 'non' }, comme taper non au clavier", async () => {
  const espion = crearEspionAfficherChoix();
  const ctx = crearContexto({ afficherChoix: espion.fn });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "Tu veux dire...",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
    choix: CANDIDATS,
  }));
  await ctx.modo.ajouterLigne("10 pâtes");

  assertEquals(typeof espion.appels.at(-1).surAucun, "function");

  ctx.setRespuesta(() => ({
    reply: "D'accord, j'oublie. Redis ta phrase quand tu veux.",
    session: { active: true, lignes: [], inconnus: [], total: 0 },
  }));
  await espion.appels.at(-1).surAucun();

  assertEquals(ctx.llamadas.at(-1), { kind: "reception-ligne", texte: "non" });
  assertEquals(ctx.mensajes.at(-1), "D'accord, j'oublie. Redis ta phrase quand tu veux.");
  // La reponse efface la zone de choix (pas de nouveau choix pose).
  assertEquals(espion.appels.at(-1).candidats, []);
  assertEquals(espion.appels.at(-1).surChoix, null);
});

Deno.test("reception.js : valider avec un choix affiche efface la zone (sortir() ne doit pas laisser une zone de choix perimee)", async () => {
  const espion = crearEspionAfficherChoix();
  const ctx = crearContexto({ afficherChoix: espion.fn });
  ctx.elements.demarrer.click();
  ctx.setRespuesta(() => ({
    reply: "Tu veux dire...",
    session: { active: true, lignes: [LIGNE_PATES], inconnus: [], total: 10 },
    choix: CANDIDATS,
  }));
  await ctx.modo.ajouterLigne("3 pâtes"); // pose un choix affiche, en plus de la ligne deja connue

  ctx.setRespuesta(() => ({
    reply: "Réception enregistrée : 1 ligne.",
    session: { active: false, lignes: [], inconnus: [], total: 0 },
  }));
  await ctx.elements.valider.click();

  assertEquals(espion.appels.at(-1).candidats, []);
  assertEquals(espion.appels.at(-1).surChoix, null);
});

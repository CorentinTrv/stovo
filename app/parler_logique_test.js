// parler_logique_test.js - Lot A11-2 (tests front de la boucle vocale, 23/08/2026)
//
// Banc du module PUR app/parler_logique.js : zero DOM, zero reseau, zero
// mock necessaire (meme famille que pilotage_test.js/pertes_test.js). Un
// simple `Deno.test` suffit (memoire feedback-test-pwa-offline, decouverte
// du lot P-1).
//
// Lancer avec (depuis la racine du workspace) :
//   deno test livrables/sites-web/stovo/app/parler_logique_test.js

import { assertEquals } from "jsr:@std/assert";
import {
  ajouterAuJournalMicro,
  analyserJournalMicro,
  calculerPliChoix,
  calculerVisibiliteAutresDemarrer,
  choisirBranche,
  corpsChoix,
  corpsConfirmation,
  corpsDeclaration,
  corpsErreurExploitable,
  corpsImport,
  creerEntreeJournalMicro,
  creerMachineMicro,
  creerVerrouDeMode,
  extraireBase64DepuisDataUrl,
  formaterEnvironnementMicro,
  formaterHeureLocale,
  formaterJournalMicroPourAffichage,
  interpreterReponsePwaApi,
  lireCorpsReponse,
  normaliserChoix,
  texteErreurMicro,
  texteRefusVerrou,
  toucheEnvoie,
} from "./parler_logique.js";

// ---------------------------------------------------------------------------
// lireCorpsReponse
// ---------------------------------------------------------------------------

Deno.test("lireCorpsReponse : lit le JSON de error.context quand il existe", async () => {
  const error = { context: { json: () => ({ reply: "ok", session: { active: true } }) } };
  const corps = await lireCorpsReponse(error);
  assertEquals(corps, { reply: "ok", session: { active: true } });
});

Deno.test("lireCorpsReponse : renvoie null si error.context est absent", async () => {
  assertEquals(await lireCorpsReponse({}), null);
  assertEquals(await lireCorpsReponse(null), null);
  assertEquals(await lireCorpsReponse(undefined), null);
});

Deno.test("lireCorpsReponse : renvoie null si .json() n'est pas une fonction", async () => {
  assertEquals(await lireCorpsReponse({ context: {} }), null);
});

Deno.test("lireCorpsReponse : renvoie null si .json() leve une exception (corps illisible)", async () => {
  const error = { context: { json: () => { throw new Error("corps illisible"); } } };
  assertEquals(await lireCorpsReponse(error), null);
});

// ---------------------------------------------------------------------------
// corpsErreurExploitable
// ---------------------------------------------------------------------------

Deno.test("corpsErreurExploitable : vrai si `reply` OU `session` est present", () => {
  assertEquals(corpsErreurExploitable({ reply: "Tu as une réception en cours." }), true);
  assertEquals(corpsErreurExploitable({ session: { active: true } }), true);
  assertEquals(corpsErreurExploitable({ reply: "ok", session: { active: true } }), true);
});

Deno.test("corpsErreurExploitable : faux si aucun champ, ou corps absent", () => {
  assertEquals(corpsErreurExploitable({}), false);
  assertEquals(corpsErreurExploitable(null), false);
  assertEquals(corpsErreurExploitable(undefined), false);
  // Copie fidele du comportement d'origine : `sortie`/`inventaire` seuls ne
  // suffisent pas (parler.js ne verifiait que reply/session avant ce lot).
  assertEquals(corpsErreurExploitable({ sortie: { active: true } }), false);
});

// ---------------------------------------------------------------------------
// interpreterReponsePwaApi
// ---------------------------------------------------------------------------

Deno.test("interpreterReponsePwaApi : reprend reply et enAttente tels quels, choix absent -> []", () => {
  assertEquals(
    interpreterReponsePwaApi({ reply: "3 pâtes ajoutées.", enAttente: true }),
    { texte: "3 pâtes ajoutées.", enAttente: true, choix: [] },
  );
});

Deno.test("interpreterReponsePwaApi : message par defaut si reply absent, enAttente force en booleen", () => {
  assertEquals(interpreterReponsePwaApi({}), { texte: "Pas de réponse du serveur.", enAttente: false, choix: [] });
  assertEquals(interpreterReponsePwaApi(null), { texte: "Pas de réponse du serveur.", enAttente: false, choix: [] });
  assertEquals(interpreterReponsePwaApi(undefined), { texte: "Pas de réponse du serveur.", enAttente: false, choix: [] });
  // enAttente est une valeur truthy quelconque cote serveur (jamais garanti bool) : Boolean(...) l'assainit.
  assertEquals(interpreterReponsePwaApi({ reply: "ok", enAttente: 1 }), { texte: "ok", enAttente: true, choix: [] });
});

// ---------------------------------------------------------------------------
// interpreterReponsePwaApi : le champ `choix` (lot A10-6)
// ---------------------------------------------------------------------------

Deno.test("interpreterReponsePwaApi : choix null -> []", () => {
  assertEquals(
    interpreterReponsePwaApi({ reply: "ok", enAttente: false, choix: null }),
    { texte: "ok", enAttente: false, choix: [] },
  );
});

Deno.test("interpreterReponsePwaApi : choix [] -> [], enAttente inchange", () => {
  assertEquals(
    interpreterReponsePwaApi({ reply: "ok", enAttente: true, choix: [] }),
    { texte: "ok", enAttente: true, choix: [] },
  );
});

Deno.test("interpreterReponsePwaApi : deux candidats -> repris tels quels, enAttente force a false", () => {
  const choix = [{ numero: 1, nom: "Pâtes 500 g" }, { numero: 2, nom: "Pâtes complètes" }];
  assertEquals(
    interpreterReponsePwaApi({ reply: "Tu veux dire...", enAttente: false, choix }),
    { texte: "Tu veux dire...", enAttente: false, choix },
  );
});

Deno.test("interpreterReponsePwaApi : quatre candidats -> repris tels quels", () => {
  const choix = [
    { numero: 1, nom: "A" }, { numero: 2, nom: "B" }, { numero: 3, nom: "C" }, { numero: 4, nom: "D" },
  ];
  assertEquals(
    interpreterReponsePwaApi({ reply: "Tu veux dire...", enAttente: false, choix }),
    { texte: "Tu veux dire...", enAttente: false, choix },
  );
});

Deno.test("interpreterReponsePwaApi : cinq candidats -> tronque aux quatre premiers (choix documente, jamais rejete en bloc)", () => {
  const choix = [
    { numero: 1, nom: "A" }, { numero: 2, nom: "B" }, { numero: 3, nom: "C" },
    { numero: 4, nom: "D" }, { numero: 5, nom: "E" },
  ];
  assertEquals(
    interpreterReponsePwaApi({ reply: "Tu veux dire...", enAttente: false, choix }).choix,
    [{ numero: 1, nom: "A" }, { numero: 2, nom: "B" }, { numero: 3, nom: "C" }, { numero: 4, nom: "D" }],
  );
});

Deno.test("interpreterReponsePwaApi : un candidat sans nom (ou nom vide/blanc) est ecarte, les autres restent", () => {
  const choix = [
    { numero: 1, nom: "Pâtes 500 g" },
    { numero: 2, nom: "" },
    { numero: 3 },
    { numero: 4, nom: "   " },
    { numero: 5, nom: "Pâtes complètes" },
  ];
  assertEquals(
    interpreterReponsePwaApi({ reply: "ok", enAttente: false, choix }).choix,
    [{ numero: 1, nom: "Pâtes 500 g" }, { numero: 5, nom: "Pâtes complètes" }],
  );
});

Deno.test("interpreterReponsePwaApi : serveur dit enAttente:true ET choix non vide -> enAttente rendu false (jamais les deux zones a l'ecran)", () => {
  const choix = [{ numero: 1, nom: "Pâtes 500 g" }, { numero: 2, nom: "Pâtes complètes" }];
  assertEquals(
    interpreterReponsePwaApi({ reply: "Tu veux dire...", enAttente: true, choix }),
    { texte: "Tu veux dire...", enAttente: false, choix },
  );
});

// ---------------------------------------------------------------------------
// normaliserChoix, exportee (reprise apres relecture du Jarvis, 23/08/2026) :
// utilisee aussi par afficherChoix (parler.js), point de rendu PARTAGE des
// trois contextes (declaration, reception, sortie). Le filtrage doit donc
// s'appliquer meme quand l'appelant n'est pas interpreterReponsePwaApi.
// ---------------------------------------------------------------------------

Deno.test("normaliserChoix : un candidat sans nom et un valide -> un seul element garde", () => {
  const choix = [{ numero: 1, nom: "Pâtes 500 g" }, { numero: 2 }];
  assertEquals(normaliserChoix(choix), [{ numero: 1, nom: "Pâtes 500 g" }]);
});

// ---------------------------------------------------------------------------
// calculerPliChoix (lot A10-6b, 23/08/2026) : les quatre combinaisons
// ---------------------------------------------------------------------------

Deno.test("calculerPliChoix : choix visible ET aucun mode ouvert -> le menu se replie", () => {
  assertEquals(calculerPliChoix(true, null), { masquerMenu: true });
});

Deno.test("calculerPliChoix : choix visible MAIS un mode est ouvert -> on ne touche a rien (le mode gere son propre ecran)", () => {
  assertEquals(calculerPliChoix(true, "reception"), { masquerMenu: false });
  assertEquals(calculerPliChoix(true, "sortie"), { masquerMenu: false });
  assertEquals(calculerPliChoix(true, "inventaire"), { masquerMenu: false });
});

Deno.test("calculerPliChoix : zone de choix masquee, aucun mode ouvert -> le menu reste visible", () => {
  assertEquals(calculerPliChoix(false, null), { masquerMenu: false });
});

Deno.test("calculerPliChoix : zone de choix masquee ET un mode ouvert -> on ne touche a rien", () => {
  assertEquals(calculerPliChoix(false, "reception"), { masquerMenu: false });
});

// ---------------------------------------------------------------------------
// creerVerrouDeMode (machine d'etat)
// ---------------------------------------------------------------------------

Deno.test("creerVerrouDeMode : aucun mode au depart, prendre() reussit et devient le detenteur", () => {
  const verrou = creerVerrouDeMode();
  assertEquals(verrou.modeCourant(), null);

  const resultat = verrou.prendre("reception");
  assertEquals(resultat, { autorise: true, modeBloquant: null });
  assertEquals(verrou.modeCourant(), "reception");
});

Deno.test("creerVerrouDeMode : un second mode se voit refuser le verrou et connait le coupable", () => {
  const verrou = creerVerrouDeMode();
  verrou.prendre("reception");

  const resultat = verrou.prendre("sortie");
  assertEquals(resultat, { autorise: false, modeBloquant: "reception" });
  assertEquals(verrou.modeCourant(), "reception"); // inchange : le refus ne touche a rien
});

Deno.test("creerVerrouDeMode : redemander le meme mode reussit (reprise du meme mode)", () => {
  const verrou = creerVerrouDeMode();
  verrou.prendre("inventaire");

  const resultat = verrou.prendre("inventaire");
  assertEquals(resultat, { autorise: true, modeBloquant: null });
  assertEquals(verrou.modeCourant(), "inventaire");
});

Deno.test("creerVerrouDeMode : rendre() par le detenteur libere le verrou et renvoie true", () => {
  const verrou = creerVerrouDeMode();
  verrou.prendre("sortie");

  const relache = verrou.rendre("sortie");
  assertEquals(relache, true);
  assertEquals(verrou.modeCourant(), null);
});

Deno.test("creerVerrouDeMode : rendre() par un AUTRE mode que le detenteur ne fait rien et renvoie false", () => {
  const verrou = creerVerrouDeMode();
  verrou.prendre("reception");

  const relache = verrou.rendre("sortie");
  assertEquals(relache, false);
  assertEquals(verrou.modeCourant(), "reception"); // toujours detenu par reception
});

Deno.test("creerVerrouDeMode : rendre() sans verrou pris (modeCourant null) ne fait rien", () => {
  const verrou = creerVerrouDeMode();
  assertEquals(verrou.rendre("reception"), false);
  assertEquals(verrou.modeCourant(), null);
});

// ---------------------------------------------------------------------------
// texteRefusVerrou
// ---------------------------------------------------------------------------

Deno.test("texteRefusVerrou : une phrase dediee par mode, avec le bon accord (LA/LE)", () => {
  assertEquals(texteRefusVerrou("reception"), "Tu as une réception en cours. Termine-la ou abandonne-la d'abord.");
  assertEquals(texteRefusVerrou("inventaire"), "Tu as un inventaire en cours. Termine-le ou abandonne-le d'abord.");
  assertEquals(texteRefusVerrou("sortie"), "Tu as une sortie en cours. Termine-la ou abandonne-la d'abord.");
});

Deno.test("texteRefusVerrou : phrase generique de repli pour un mode inconnu", () => {
  assertEquals(texteRefusVerrou("autre-chose"), "Tu as déjà une opération en cours. Termine-la ou abandonne-la d'abord.");
  assertEquals(texteRefusVerrou(null), "Tu as déjà une opération en cours. Termine-la ou abandonne-la d'abord.");
});

// ---------------------------------------------------------------------------
// calculerVisibiliteAutresDemarrer
// ---------------------------------------------------------------------------

Deno.test("calculerVisibiliteAutresDemarrer : aucun mode actif -> tous les AUTRES boutons redeviennent visibles", () => {
  const visibilite = calculerVisibiliteAutresDemarrer(["reception", "inventaire", "sortie"], null);
  assertEquals(visibilite, { reception: false, inventaire: false, sortie: false });
});

Deno.test("calculerVisibiliteAutresDemarrer : un mode actif -> les AUTRES sont masques, le sien est absent du resultat", () => {
  const visibilite = calculerVisibiliteAutresDemarrer(["reception", "inventaire", "sortie"], "reception");
  // "reception" ne figure PAS dans le resultat : c'est le mode actif qui gere lui-meme son propre bouton.
  assertEquals(visibilite, { inventaire: true, sortie: true });
});

// ---------------------------------------------------------------------------
// choisirBranche
// ---------------------------------------------------------------------------

Deno.test("choisirBranche : le verrou ET l'etat reel du mode doivent concorder pour router vers ce mode", () => {
  assertEquals(choisirBranche("reception", { reception: true, inventaire: false, sortie: false }), "reception");
  assertEquals(choisirBranche("inventaire", { reception: false, inventaire: true, sortie: false }), "inventaire");
  assertEquals(choisirBranche("sortie", { reception: false, inventaire: false, sortie: true }), "sortie");
});

Deno.test("choisirBranche : aucun mode courant -> 'normal'", () => {
  assertEquals(choisirBranche(null, { reception: false, inventaire: false, sortie: false }), "normal");
});

Deno.test("choisirBranche : verrou pris par un mode dont l'etat REEL n'est pas encore actif -> 'normal' (banniere de reprise pas encore ouverte)", () => {
  // Cas concret documente dans parler.js : une banniere de reprise prend le
  // verrou avant le clic sur "Reprendre", modeCourant='reception' mais
  // modeReception.estEnReception() est encore faux. La phrase doit repartir
  // en saisie normale, jamais dans un tampon de session pas encore ouvert.
  assertEquals(choisirBranche("reception", { reception: false, inventaire: false, sortie: false }), "normal");
});

// ---------------------------------------------------------------------------
// toucheEnvoie (lot saisie multiligne, 23/08/2026)
// ---------------------------------------------------------------------------

Deno.test("toucheEnvoie : Entree seule envoie", () => {
  assertEquals(toucheEnvoie({ key: "Enter", shiftKey: false, isComposing: false }), true);
});

Deno.test("toucheEnvoie : Maj+Entree n'envoie pas (insere une ligne)", () => {
  assertEquals(toucheEnvoie({ key: "Enter", shiftKey: true, isComposing: false }), false);
});

Deno.test("toucheEnvoie : Entree en composition n'envoie pas (clavier japonais, dictee en cours)", () => {
  assertEquals(toucheEnvoie({ key: "Enter", shiftKey: false, isComposing: true }), false);
});

Deno.test("toucheEnvoie : une autre touche n'envoie jamais", () => {
  assertEquals(toucheEnvoie({ key: "a", shiftKey: false, isComposing: false }), false);
  assertEquals(toucheEnvoie({ key: "Escape", shiftKey: false, isComposing: false }), false);
});

Deno.test("toucheEnvoie : Ctrl+Entree ou Cmd+Entree envoie (pas de cas particulier, la spec ne le demande pas)", () => {
  assertEquals(toucheEnvoie({ key: "Enter", shiftKey: false, isComposing: false, ctrlKey: true }), true);
  assertEquals(toucheEnvoie({ key: "Enter", shiftKey: false, isComposing: false, metaKey: true }), true);
});

// ---------------------------------------------------------------------------
// corpsDeclaration / corpsConfirmation / corpsImport
// ---------------------------------------------------------------------------

Deno.test("corpsDeclaration : construit { kind: 'declaration', texte }", () => {
  assertEquals(corpsDeclaration("j'ai reçu 10 pâtes"), { kind: "declaration", texte: "j'ai reçu 10 pâtes" });
});

Deno.test("corpsConfirmation : construit { kind: 'confirmation', reponse }", () => {
  assertEquals(corpsConfirmation("oui"), { kind: "confirmation", reponse: "oui" });
  assertEquals(corpsConfirmation("non"), { kind: "confirmation", reponse: "non" });
});

Deno.test("corpsChoix : construit { kind: 'choix', numero }", () => {
  assertEquals(corpsChoix(1), { kind: "choix", numero: 1 });
  assertEquals(corpsChoix(4), { kind: "choix", numero: 4 });
});

Deno.test("corpsImport : construit { kind: 'import', nomFichier, contenuBase64 }", () => {
  assertEquals(
    corpsImport("catalogue.xlsx", "QUJD"),
    { kind: "import", nomFichier: "catalogue.xlsx", contenuBase64: "QUJD" },
  );
});

// ---------------------------------------------------------------------------
// extraireBase64DepuisDataUrl
// ---------------------------------------------------------------------------

Deno.test("extraireBase64DepuisDataUrl : isole la partie apres la virgule d'une data URL", () => {
  assertEquals(extraireBase64DepuisDataUrl("data:application/xlsx;base64,QUJD"), "QUJD");
});

Deno.test("extraireBase64DepuisDataUrl : sans virgule, renvoie une chaine vide (fusion avec photo.js, 27/08/2026)", () => {
  assertEquals(extraireBase64DepuisDataUrl("QUJD"), "");
});

Deno.test("extraireBase64DepuisDataUrl : entree vide/absente ne leve jamais, renvoie une chaine vide", () => {
  assertEquals(extraireBase64DepuisDataUrl(""), "");
  assertEquals(extraireBase64DepuisDataUrl(null), "");
  assertEquals(extraireBase64DepuisDataUrl(undefined), "");
});

Deno.test("extraireBase64DepuisDataUrl : entree non chaine (nombre, objet) renvoie une chaine vide, jamais d'exception", () => {
  assertEquals(extraireBase64DepuisDataUrl(1234), "");
  assertEquals(extraireBase64DepuisDataUrl({ toString: () => "data:x;base64,QUJD" }), "");
});

// ---------------------------------------------------------------------------
// texteErreurMicro
// ---------------------------------------------------------------------------

Deno.test("texteErreurMicro : un message clair par code d'erreur connu", () => {
  assertEquals(texteErreurMicro("not-allowed"), "Micro refusé. Autorise le micro dans les réglages du navigateur.");
  assertEquals(texteErreurMicro("service-not-allowed"), "Micro refusé. Autorise le micro dans les réglages du navigateur.");
  assertEquals(texteErreurMicro("no-speech"), "Je n'ai rien entendu, réessaie.");
  assertEquals(texteErreurMicro("network"), "Souci réseau pour la reconnaissance vocale.");
});

Deno.test("texteErreurMicro : message generique pour un code inconnu", () => {
  assertEquals(texteErreurMicro("aborted"), "Problème avec le micro, réessaie ou utilise le clavier.");
  assertEquals(texteErreurMicro(undefined), "Problème avec le micro, réessaie ou utilise le clavier.");
});

// ---------------------------------------------------------------------------
// Lot D28 (05/09/2026) : creerMachineMicro
// ---------------------------------------------------------------------------
// Rejoue les transitions decrites dans l'analyse du 30/08 : c'est cette
// machine qui remplace le "enEcoute = true pose juste apres start()" qui
// causait le verrou definitif (un appui pendant l'attente appelait stop()
// sur une instance jamais demarree et sortait sans jamais retenter).

Deno.test("creerMachineMicro : etat initial 'inactif', un premier appui demande le demarrage", () => {
  const m = creerMachineMicro();
  assertEquals(m.etat(), "inactif");
  assertEquals(m.appui(), "demarrer");
  assertEquals(m.etat(), "attente");
});

Deno.test("creerMachineMicro : un appui pendant l'attente ANNULE et repasse a 'inactif' (au lieu du verrou d'origine)", () => {
  const m = creerMachineMicro();
  m.appui(); // inactif -> attente
  assertEquals(m.appui(), "annuler");
  assertEquals(m.etat(), "inactif");
  // Preuve que ce n'est pas mort : un nouvel appui redemande normalement un demarrage.
  assertEquals(m.appui(), "demarrer");
});

Deno.test("creerMachineMicro : confirmerDemarrage() (onstart) ne fait passer a 'ecoute' que depuis 'attente'", () => {
  const m = creerMachineMicro();
  assertEquals(m.confirmerDemarrage(), false); // onstart tardif, rien n'etait en attente
  assertEquals(m.etat(), "inactif");
  m.appui();
  assertEquals(m.confirmerDemarrage(), true);
  assertEquals(m.etat(), "ecoute");
  assertEquals(m.confirmerDemarrage(), false); // deja confirme, un second onstart ne rejoue rien
});

Deno.test("creerMachineMicro : expirerGarde() (delai de 2s ecoule) ne joue qu'en 'attente'", () => {
  const m = creerMachineMicro();
  assertEquals(m.expirerGarde(), false); // rien en attente
  m.appui();
  assertEquals(m.expirerGarde(), true);
  assertEquals(m.etat(), "inactif");
  m.appui();
  m.confirmerDemarrage(); // deja en 'ecoute'
  assertEquals(m.expirerGarde(), false); // la garde n'a plus cours une fois l'ecoute confirmee
  assertEquals(m.etat(), "ecoute");
});

Deno.test("creerMachineMicro : un appui en 'ecoute' demande l'arret (toggle), sans changer l'etat tout de suite", () => {
  const m = creerMachineMicro();
  m.appui();
  m.confirmerDemarrage();
  assertEquals(m.appui(), "arreter");
  // L'etat ne redevient 'inactif' qu'au vrai onend() (terminer()), jamais au moment de l'appui.
  assertEquals(m.etat(), "ecoute");
});

Deno.test("creerMachineMicro : terminer() (onerror/onend) remet toujours a 'inactif', idempotent", () => {
  const m = creerMachineMicro();
  assertEquals(m.terminer(), false); // deja inactif, rien a faire
  m.appui();
  m.confirmerDemarrage();
  assertEquals(m.terminer(), true);
  assertEquals(m.etat(), "inactif");
  assertEquals(m.terminer(), false); // rappele deux fois (onerror puis onend) : sans effet la 2e fois
});

// ---------------------------------------------------------------------------
// Lot D28 : formaterHeureLocale / creerEntreeJournalMicro
// ---------------------------------------------------------------------------

Deno.test("formaterHeureLocale : heure locale a deux chiffres, zero en tete si besoin", () => {
  assertEquals(formaterHeureLocale(new Date(2026, 8, 5, 9, 3, 7)), "09:03:07");
  assertEquals(formaterHeureLocale(new Date(2026, 8, 5, 23, 59, 0)), "23:59:00");
});

Deno.test("creerEntreeJournalMicro : associe l'evenement a l'heure locale exacte", () => {
  const date = new Date(2026, 8, 5, 14, 7, 32);
  assertEquals(creerEntreeJournalMicro("start", date), { heure: "14:07:32", evenement: "start" });
});

// ---------------------------------------------------------------------------
// Lot D28 : ajouterAuJournalMicro
// ---------------------------------------------------------------------------

Deno.test("ajouterAuJournalMicro : ajoute a la fin d'un journal vide", () => {
  const journal = ajouterAuJournalMicro([], { heure: "10:00:00", evenement: "start" });
  assertEquals(journal, [{ heure: "10:00:00", evenement: "start" }]);
});

Deno.test("ajouterAuJournalMicro : plafonne, les entrees les plus anciennes tombent en premier", () => {
  let journal = [];
  for (let i = 0; i < 25; i++) {
    journal = ajouterAuJournalMicro(journal, { heure: String(i), evenement: "e" + i }, 20);
  }
  assertEquals(journal.length, 20);
  assertEquals(journal[0].evenement, "e5"); // e0..e4 sont tombees
  assertEquals(journal[19].evenement, "e24");
});

Deno.test("ajouterAuJournalMicro : un journal corrompu (pas un tableau) redemarre a zero plutot que de planter", () => {
  const journal = ajouterAuJournalMicro("pas un tableau", { heure: "1", evenement: "x" });
  assertEquals(journal, [{ heure: "1", evenement: "x" }]);
});

// ---------------------------------------------------------------------------
// Lot D28 : analyserJournalMicro
// ---------------------------------------------------------------------------

Deno.test("analyserJournalMicro : lit un JSON de tableau valide", () => {
  const brut = JSON.stringify([{ heure: "10:00:00", evenement: "start" }]);
  assertEquals(analyserJournalMicro(brut), [{ heure: "10:00:00", evenement: "start" }]);
});

Deno.test("analyserJournalMicro : renvoie [] si absent, corrompu, ou pas un tableau", () => {
  assertEquals(analyserJournalMicro(null), []);
  assertEquals(analyserJournalMicro(undefined), []);
  assertEquals(analyserJournalMicro("{pas du json valide"), []);
  assertEquals(analyserJournalMicro(JSON.stringify({ pas: "un tableau" })), []);
});

Deno.test("analyserJournalMicro : filtre les entrees mal formees (localStorage modifie a la main)", () => {
  const brut = JSON.stringify([
    { heure: "10:00:00", evenement: "start" },
    { heure: "10:00:01" },
    "pas un objet",
    null,
    { evenement: "end" },
  ]);
  assertEquals(analyserJournalMicro(brut), [{ heure: "10:00:00", evenement: "start" }]);
});

// ---------------------------------------------------------------------------
// Lot D28 : formaterEnvironnementMicro / formaterJournalMicroPourAffichage
// ---------------------------------------------------------------------------

Deno.test("formaterEnvironnementMicro : mentionne le mode PWA installee ou navigateur", () => {
  assertEquals(formaterEnvironnementMicro("Mozilla/5.0 iPhone", true), "Mozilla/5.0 iPhone — PWA installée");
  assertEquals(formaterEnvironnementMicro("Mozilla/5.0 iPhone", false), "Mozilla/5.0 iPhone — navigateur (onglet)");
});

Deno.test("formaterEnvironnementMicro : repli si le user-agent est absent", () => {
  assertEquals(formaterEnvironnementMicro("", true), "user-agent inconnu — PWA installée");
  assertEquals(formaterEnvironnementMicro(undefined, false), "user-agent inconnu — navigateur (onglet)");
});

Deno.test("formaterJournalMicroPourAffichage : environnement en tete, evenements du plus recent au plus ancien", () => {
  const journal = [
    { heure: "10:00:00", evenement: "demande-start" },
    { heure: "10:00:02", evenement: "garde-2s-sans-start" },
  ];
  const texte = formaterJournalMicroPourAffichage(journal, "Mozilla/5.0 — navigateur (onglet)");
  const lignes = texte.split("\n");
  assertEquals(lignes[0], "Mozilla/5.0 — navigateur (onglet)");
  assertEquals(lignes[1], "");
  assertEquals(lignes[2], "10:00:02 — garde-2s-sans-start");
  assertEquals(lignes[3], "10:00:00 — demande-start");
});

Deno.test("formaterJournalMicroPourAffichage : journal vide, message explicite plutot qu'une liste blanche", () => {
  const texte = formaterJournalMicroPourAffichage([], "env");
  assertEquals(texte, "env\n\nAucun événement enregistré pour le moment.");
});

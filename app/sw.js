// STOVO — service worker de la PWA (lot 9a)
// =============================================
// Choix n°5 de l'Architecte (marche a suivre phase 2, 2026-07-10) :
// mise a jour AU PROCHAIN LANCEMENT, jamais en pleine session. On n'appelle
// donc JAMAIS self.skipWaiting() ici : un nouveau service worker installe
// reste "en attente" tant qu'un onglet utilise encore l'ancienne version. Il
// ne prend le relais qu'au prochain demarrage a froid de l'app (tous les
// onglets fermes puis rouverts). Pas de reload force, pas de risque de
// couper une saisie en cours.

// v2 (lot 9b) : bump necessaire car la liste de precache change
// (supabase.js + auth.js). Rappel du choix n°5 de l'Architecte : la mise a
// jour ne prend effet qu'au prochain demarrage a froid (pas de
// skipWaiting), donc ce bump seul ne casse aucun onglet deja ouvert.
// v3 (correctif 11/07) : styles.css corrige ([hidden] doit l'emporter, sinon
// l'ecran de connexion restait affiche apres login). Bump pour rafraichir le cache.
// v4 (lot 10b, 11/07/2026) : parler.js ajoute au precache (ecran "Parler" au clavier,
// branche sur l'Edge Function pwa-api).
// v5 (lot 11a, 12/07/2026) : parler.js modifie (micro on-device Web Speech API,
// remplit le champ texte). Pas de nouveau fichier a precacher, seulement le
// contenu de parler.js qui change.
// v6 (lot 12a, 12/07/2026) : import catalogue .xlsx (index.html + parler.js +
// styles.css modifies : selecteur de fichier + bouton dedie sur l'ecran
// "Parler"). Pas de nouveau fichier a precacher, seulement du contenu qui change.
// v7 (brique 1 "ecran du matin", 14/07/2026) : bandeau de brief en tete du
// tableau de bord (index.html + dashboard.js + styles.css modifies). Pas de
// nouveau fichier a precacher, seulement du contenu qui change.
// v8 (brique 2 + ajustements, 14/07/2026) : inventaire regroupe par etat en
// sections depliables, bandeau du matin repliable (etat memorise), et bandeau
// moins chevauchant sur l'en-tete. index.html + dashboard.js + styles.css
// modifies. Pas de nouveau fichier a precacher, seulement du contenu qui change.
// v9 (chantier desactiver un produit, 14/07/2026) : dashboard.js ne charge que
// les produits actifs (.eq actif true) -> les produits desactives disparaissent
// du tableau de bord. Seul dashboard.js change, rien de nouveau a precacher.
// v10 (libelle "a commander", 18/07/2026) : la quantite de la liste de courses
// du bandeau du matin porte son libelle (friction du 16/07). dashboard.js +
// styles.css modifies, rien de nouveau a precacher.
// v11 (QW-C onglet "Stock", 18/07/2026) : 3e onglet, liste compacte +
// recherche a la frappe. NOUVEAU fichier stock.js ajoute au precache ;
// index.html, app.js, dashboard.js, styles.css modifies.
// v12 (chantier N1 mode reception, lots FR-4+FR-5) : mode reception
// multi-produits sur l'ecran "Parler" (liste vivante + validation groupee).
// NOUVEAU fichier reception.js ajoute au precache ; index.html, parler.js,
// styles.css modifies.
// v13 (onglet "Aide", 25/07/2026) : 4e onglet, mode d'emploi de Stovo dans
// Stovo (comprendre / les phrases / astuces), avec exemples cliquables qui
// remplissent le champ de l'ecran "Parler". NOUVEAU fichier aide.js ajoute au
// precache ; index.html, app.js, styles.css modifies. Aucun fichier backend
// touche, aucun appel reseau ajoute.
// v14 (CM-C, 25/07/2026) : parcours d'inventaire complet guide. Nouveau module
// front `inventaire.js` (a precacher), + index.html/parler.js/styles.css modifies.
// v16 (mise a jour de l'aide, 25/07/2026) : l'onglet "Aide" rattrape les
// chantiers livres dans la journee (CM-B unite, CM-C inventaire guide, CM-D
// renommer, N4 question de reappro, S-0 verrou de mode). Seul aide.js change,
// rien de nouveau a precacher. Contenu re-verifie phrase par phrase contre le
// cerveau deterministe reel (banc offline, 65/65).
// v17 (lot P-3, 25/07/2026) : lecture d'un bon de livraison PHOTOGRAPHIE depuis
// le mode reception. NOUVEAU fichier photo.js (reduction de l'image cote
// navigateur, ~2000 px, EXIF respecte) ajoute au precache ; index.html,
// parler.js, reception.js, styles.css modifies. Le geste change, le rempart ne
// change pas : les lignes lues rejoignent la liste vivante et ne partent en base
// qu'a la validation groupee.
// v18 (lot P-1 du chantier PILOTAGE, 26/07/2026) : la formule de consommation/
// reappro (dashboard.js) est extraite dans un module partage. NOUVEAU fichier
// pilotage.js ajoute au precache ; dashboard.js modifie (aucun changement de
// chiffre, pur refactor juge par _shared/pilotage_cas.ts).
// v19 (chantier C1 "ce que tu as jete", 26/07/2026) : demarque valorisee
// (casse/peremption/vol) sur les 30 jours de mouvements deja charges, zero
// requete supplementaire. NOUVEAU fichier pertes.js (module pur, calcul +
// rendu HTML) ajoute au precache ; dashboard.js (jointure mouvements +
// prix_achat, appel du rendu), index.html et styles.css modifies.
// v20 (lot S-5, 27/07/2026) : mode sortie de stock multi-produits sur l'ecran
// "Parler", jumeau du mode reception. NOUVEAU fichier sortie.js ajoute au
// precache ; index.html, parler.js, styles.css modifies.
// v21 (lot A1 accessibilite, 31/07/2026) : regions live (aria-live), aria-label
// du champ principal, contrastes remontes au-dessus de 4,5:1, cible tactile de
// 44 px sur la croix de suppression, prefers-reduced-motion. index.html,
// styles.css, app.js modifies. Pas de nouveau fichier a precacher, seulement
// du contenu qui change.
// v22 (lot A2 accessibilite, 31/07/2026, seconde passe) : contrastes des
// boutons pleins et de l'en-tete portes au-dessus de 4,5:1, anneau de focus
// au clavier, reperes de structure (main et h1) sur les ecrans Stock, Parler
// et Aide, cibles tactiles a 44 px. index.html, styles.css modifies. Pas de
// nouveau fichier a precacher.
// v23 (lot A3 accessibilite, 01/08/2026, troisieme passe) : l'ecran du matin,
// oublie par A1 et A2. Sa cible tactile passe de 22 a 44 px (mesure
// Playwright), "Ce matin" devient un vrai <h2> pour exister dans la
// hierarchie des titres, aria-controls ajoute, la liste de courses devient une
// <ul>/<li>, le nom du produit est echappe avant insertion HTML, et l'unite
// s'accorde au singulier ("1 piece" et non "1 pieces"). Meme lot : la collision
// de classe de la tuile KPI "Produits suivis" et le debordement horizontal de
// la ligne du matin. index.html, styles.css, dashboard.js modifies. Pas de
// nouveau fichier a precacher.
// v24 (lot A4 accessibilite, 01/08/2026) : contraste du bouton micro (WCAG
// 1.4.11), sa bordure au repos passe a 5:1 et sa bordure en ecoute a 5,91:1
// contre le fond de page (le 2,08:1 signale par le balayage etait un faux
// positif : l'emoji n'est pas colore par `color`, et c'etait l'etat
// desactive, jamais vu). styles.css seul modifie. Pas de nouveau fichier a
// precacher.
// v25 (chantier C2 "les exports", lot C2-3, 22/08/2026) : bloc replie
// "Exporter mes donnees" en bas du tableau de bord, deux fichiers CSV
// (etat de stock + journal des mouvements) fabriques ENTIEREMENT au front,
// zero appel a pwa-api, zero ecriture. NOUVEAU fichier export.js (module pur,
// deja teste 81/81 aux lots C2-1/C2-2) ajoute au precache ; index.html,
// dashboard.js, styles.css modifies.
// Complement C2-5 (22/08/2026, meme v25 non deployee) : l'onglet Aide
// documente le bloc d'export. Le contenu de aide.js est scinde en deux :
// aide-contenu.js (donnees pures, NOUVEAU fichier ajoute au precache) et
// aide.js (rendu + glu DOM, modifie). Pas de bump : un seul lot C2 n'a pas
// encore ete deploye, donc une seule version suffit pour tout le chantier.
// v26 (23/08/2026) : l'app rejoint le monde clair de la vitrine, coquille et
// Pilotage. NOUVEAU fichier fonts/dm-sans-latin.woff2 au precache ;
// index.html, styles.css, dashboard.js modifies.
// Complement "app court" (23/08/2026, meme v26 non deployee) : l'onglet Aide
// documente le mode sortie et la photo du bon de livraison (deja en prod
// depuis fin juillet mais jamais decrits). aide-contenu.js modifie (deja au
// precache depuis le complement C2-5). Safari iOS : -webkit-user-select
// ajoute devant les 3 user-select existants de styles.css. .pertes-total
// passe du teal a l'encre (--text), regle "un role, une couleur". Aucun
// nouveau fichier a precacher, pas de bump : le meme lot v26 n'a pas encore
// ete deploye.
// v27 (lot "l'app rejoint le monde clair, suite", 23/08/2026) : Parler,
// Stock, Aide, la connexion et les icones PWA rejoignent le monde clair
// (bouton Oui/Non repris de la demo jouable de la vitrine, micro et boutons
// de Parler en flamme/contour, connexion sur creme sans degrade, icones PWA
// #FA5D00). NOUVEAU fichier icones.js (registre des icones SVG en trait,
// utilise par aide.js et dashboard.js) ajoute au precache ; index.html,
// styles.css, aide.js, aide-contenu.js, dashboard.js, parler.js et les
// icones PNG/SVG de app/icons/ modifies.
// v28 (lot A10-6, 23/08/2026) : choix numerote a l'ecran ("Tu veux dire
// 1) A ou 2) B ? Dis le numero."), une zone de boutons #parler-choix
// PARTAGEE entre declaration, reception et sortie, mutuellement exclusive
// avec Oui/Non (jamais les deux zones affichees ensemble, garanti par
// interpreterReponsePwaApi + afficherReponse/afficherChoix). index.html,
// styles.css, parler.js, parler_logique.js, reception.js, sortie.js,
// aide-contenu.js modifies. Meme v28 (non deployee) : lot A11 (23/08/2026)
// -- NOUVEAU fichier parler_logique.js (extrait de parler.js sans
// changement de comportement, teste par parler_logique_test.js, relu par
// Codex) ajoute au precache, il manquait a la liste depuis son extraction.
// v29 (lots D15 et saisie multiligne, 23/08/2026) : D15 (commit a50107b,
// non accompagne d'un bump a l'epoque) -- aide-contenu.js (nouvel exemple
// « renomme le produit coca en coca 50 cl »). Saisie multiligne -- le champ
// de l'ecran "Parler" devient un textarea a hauteur automatique (2 a 5
// lignes) au lieu d'un input qui faisait defiler le texte hors du cadre ;
// Entree envoie toujours, Maj+Entree insere une ligne (toucheEnvoie,
// parler_logique.js). index.html, styles.css, parler.js, parler_logique.js,
// aide.js, dashboard.js modifies. Aucun nouveau fichier a precacher.
// v30 (lot G D14+D16, 25/08/2026) : aide-contenu.js modifie (« l'article »,
// exemple a nom chiffre, astuce reformulee), deja au precache, rien de
// nouveau a precacher, seul le contenu change. Pas de skipWaiting, mise a
// jour au prochain demarrage a froid, comme toujours.
// v31 (lot A6, 25/08/2026) : bandeau "nouvelle version prete" cote app.js.
// Fichiers modifies : app.js (detection registration.waiting +
// updatefound/statechange, affichage, garde anti-double-reload sur
// controllerchange), sw.js (ce fichier), index.html (le bandeau),
// styles.css (son style). NOUVEAU fichier maj_worker.js (module pur,
// decision d'affichage + garde, teste par maj_worker_test.js) ajoute au
// precache. Rappel qui ne change pas ici : pas de skipWaiting automatique,
// SEULEMENT sur un geste utilisateur relaye par le message SKIP_WAITING
// ci-dessous (choix n°5 de l'Architecte, toujours en vigueur).
// v32 (lot A4, 24/08/2026) : mot de passe perdu PAR CODE (jamais par lien,
// decision du 23/08) et ecran Reglages (compte, contact, version -- la
// deconnexion QUITTE l'en-tete pour cet ecran). QUATRE nouveaux fichiers au
// precache : ecran_session.js (afficherApp/afficherLogin, extraits de
// app.js sans changement de comportement), recuperation_logique.js (module
// pur : garde de recuperation + minuterie des 60 s), contact.js (module pur :
// construction du lien mailto + numero de version affiche), recuperation.js
// et reglages.js (glu DOM des nouveaux ecrans). Fichiers modifies : app.js
// (ECRANS map etendue, import de la garde, afficherApp/afficherLogin
// deplaces), auth.js (messageLisible exportee et etendue a 5 nouvelles
// erreurs, 3 fonctions reseau ajoutees), icones.js (cle 'reglages'),
// aide-contenu.js (section "Mon compte et contact"), index.html (4 nouveaux
// ecrans + l'engrenage remplace la deconnexion dans l'en-tete), styles.css
// (leurs styles). pwa-api INCHANGEE : tout passe par l'API Auth de Supabase.
// v33 (lot A15, R-2, 25/08/2026) : la couleur d'action au choix, cinq
// teintes (Flamme, Bleu, Prune, Framboise, Encre), memorisee SUR L'APPAREIL
// (localStorage, jamais par compte, jamais d'appel reseau). NOUVEAU fichier
// couleur_logique.js (module pur : normalisation, decision d'attribut,
// liste des teintes et leurs valeurs, rendu du nuancier) ajoute au
// precache. Fichiers modifies : styles.css (jetons --action/--action-sombre
// + cinq blocs html[data-couleur], remplacent --flamme sur tout ce qui est
// touchable ; --flamme reste sur le logotype "Stovo" et le decor),
// reglages.js (carte "Couleur de Stovo" en tete de l'ecran), index.html
// (script en tete qui pose data-couleur AVANT le premier rendu, markup de
// la carte), aide-contenu.js (une ligne dans "Mon compte et contact").
// v34 (lot "sortie de session propre", 25/08/2026) : plus aucune donnee d'un
// compte visible ni recuperable a l'ecran apres sa deconnexion. Avant ce lot,
// afficherLogin() (ecran_session.js) masquait #app-shell SANS rien vider, et
// la garde anti-double-demarrage de demarrerDashboard() (dashboard.js)
// empechait tout nouveau charger() a la reconnexion -- l'ecran montrait donc
// le stock du compte precedent jusqu'a 30 s (prochain tick du setInterval).
// Fichiers modifies : dashboard.js (charger() separe du cablage a usage
// unique, rejoue a CHAQUE afficherApp() ; nouvelle fonction viderDashboard()
// exportee), ecran_session.js (afficherLogin() appelle viderDashboard() +
// viderParler(), vide les champs de connexion), parler.js (nouvelle fonction
// viderParler() exportee : bulle de reponse, zone de choix, delegue aux 3
// modes), reception.js/sortie.js/inventaire.js (nouvelle fonction
// reinitialiser() par mode : liste vivante, banniere de reprise, journal de
// lecture d'une photo). Aucun nouveau fichier a precacher. Le comportement du
// lot A4 (garde de recuperation de mot de passe) est INCHANGE : afficherLogin()
// n'est jamais invoquee pendant ce parcours (voir le registre du rapport de
// passation).
// Corrections apres relecture du Jarvis (25/08/2026, meme v34, jour meme) :
// (1) regression trouvee avant deploiement -- afficherApp() est appelee
// PLUSIEURS FOIS par ouverture reelle de session (getSessionActuelle() +
// onAuthChange qui recoit INITIAL_SESSION/SIGNED_IN en plus, et un
// TOKEN_REFRESHED a chaque renouvellement de jeton), donc appeler charger()
// sans garde a chaque demarrerDashboard() partait en double, voire triple.
// dashboard.js : nouveau drapeau de module `donneesACharger` (vrai au
// demarrage, remis a vrai par viderDashboard()), consomme UNE fois par
// ouverture reelle, jamais par le bouton Rafraichir ni le setInterval (qui
// appellent charger() directement, inchange). Mesure au harnais : 1 appel
// reseau vers /rest/v1/produits par ouverture (voir le rapport de passation,
// paragraphe des corrections). (2) l'ecran actif restait sur Reglages apres
// une reconnexion (seule porte de sortie du compte) : ecran_session.js
// (afficherLogin()) emet desormais 'stovo:onglet' -> 'dashboard' (evenement
// deja ecoute par app.js, aucune ligne changee la-bas).
// v35 (lot "apres S-6, premiere brique", 27/08/2026) : PREMIER FRONT PREVU
// APRES LE GEL DU 07-13/09 (verdict S-6), code des maintenant mais garde sur
// le disque, non deploye tant que le verdict n'est pas tombe. Trois
// corrections, zero fichier nouveau : (1) D22 -- l'astuce "Deux produits qui
// se ressemblent ? Precise" (aide-contenu.js) mentait sur son propre
// exemple ("Lait"/"Lait entier" ne declenchent JAMAIS le choix numerote,
// verifie contre _shared/matching.ts et prouve par un script jetable, voir
// le rapport de passation) -- corrigee avec un exemple reel ("Lait entier"/
// "Lait demi-ecreme") et une phrase positive sur la regle inverse. (2)
// l'adresse de contact bonjour.stovo@outlook.com devient bonjour@stovo.fr
// (boite OVH qui recoit et envoie, prouve le 27/08) -- contact.js,
// aide-contenu.js, et un dernier endroit trouve au grep : le texte statique
// de index.html (#reglages-adresse) qui ne suivait pas DESTINATAIRE_CONTACT.
// (3) D6 -- extraireBase64 (photo.js) et extraireBase64DepuisDataUrl
// (parler_logique.js) divergeaient sur le cas "sans virgule" (ecart signale
// au lot A11, jamais corrige) -- fusionnees en UNE fonction dans
// parler_logique.js, que photo.js importe desormais (plus de copie locale).
// Fichiers modifies : aide-contenu.js, contact.js, contact_test.js,
// parler_logique.js, parler_logique_test.js, photo.js, index.html, sw.js
// (ce fichier).
// v36 (lot D28, 05/09/2026) : le micro qui ne demarrait pas un lancement sur
// deux (verrou definitif -- voir 2026-08-30_analyse-D28-micro.md et le
// rapport de passation du 05/09). Etage 1 : l'ecoute ne s'annonce plus qu'a
// `onstart` (jamais plus juste apres `start()`), un delai de garde de 2 s
// (DELAI_GARDE_MICRO_MS) remet tout a zero si `onstart` n'arrive jamais, un
// appui pendant l'attente ANNULE proprement au lieu de rester bloque, et une
// remise a zero silencieuse joue sur `visibilitychange`/`pagehide`. Toute
// cette machine d'etat (creerMachineMicro) vit desormais dans
// parler_logique.js, testee (18 nouveaux tests). Etage 2 : un journal des 20
// derniers evenements micro, dans localStorage (survit a un rechargement
// complet -- le contournement que Corentin utilisait), lu par une nouvelle
// carte "Diagnostic micro" dans Reglages (boutons Copier/Effacer). Fichiers
// modifies : parler.js, parler_logique.js, parler_logique_test.js,
// reglages.js, aide-contenu.js, index.html, styles.css, sw.js (ce fichier).
// Aucun nouveau fichier a precacher (aucun module neuf).
// Corrections apres relecture du Jarvis (05/09/2026, meme v36, jour meme,
// rien deploye) : (1) `onresult` (interimResults=true) declenche a CHAQUE
// mot pendant la dictee -- journaliser a chaque appel saturait le plafond
// de 20 lignes en une seule phrase, `demande-start`/`start`/`error:...`
// disparaissaient tous. Un seul evenement `result-1er`, au tout premier
// resultat de chaque instance, suffit au diagnostic. (2) `onerror` comptait
// sur `onend` pour remettre la machine a zero ("la spec dit qu'il arrive
// toujours"), alors que ce lot part du constat inverse (D18, iOS ne tient
// pas les evenements) -- `onerror` remet desormais l'etat a zero tout de
// suite (`terminer()` + `abandonnerInstanceEnCours()`), le message reste
// affiche (`erreurEnCours`). Meme raisonnement ajoute pour l'arret
// volontaire : `armerGardeArret()`/`annulerGardeArret()`, une garde de 2 s
// (DELAI_GARDE_MICRO_MS) qui force la remise a zero si `onend` n'arrive
// jamais apres un `stop()` demande par l'utilisateur. (3) la remise a zero
// silencieuse sur `visibilitychange`/`pagehide` (`reinitialiserEcouteEn
// ArrierePlan`, renommee) se limite desormais a l'etat 'ecoute' -- une
// 'attente' reste couverte par sa propre garde de 2 s, et l'annuler ici
// aurait pu casser le tout premier demarrage sur un changement de
// visibilite lie a l'alerte de permission micro d'iOS. Seul parler.js
// modifie pour ces trois corrections ; 369/369 toujours au vert.
const CACHE_NAME = 'stovo-app-v36';

// Coquille locale a precacher : uniquement les fichiers de l'app elle-meme.
// Les requetes cross-origin (esm.sh, supabase) ne sont JAMAIS precachees ici,
// elles partent au reseau normalement (voir le handler "fetch" plus bas).
const FICHIERS_COQUILLE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './dashboard.js',
  './pilotage.js',
  './pertes.js',
  './stock.js',
  './aide.js',
  './aide-contenu.js',
  './icones.js',
  './supabase.js',
  './auth.js',
  './ecran_session.js',
  './recuperation_logique.js',
  './recuperation.js',
  './contact.js',
  './couleur_logique.js',
  './reglages.js',
  './parler.js',
  './parler_logique.js',
  './reception.js',
  './inventaire.js',
  './sortie.js',
  './photo.js',
  './export.js',
  './maj_worker.js',
  './fonts/dm-sans-latin.woff2',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon-180.png',
];

// Lot A6 (25/08/2026) : le SEUL déclencheur de self.skipWaiting() dans tout
// ce fichier. Il ne réagit qu'au message précis envoyé par app.js quand
// l'utilisateur tape sur la bannière (majBouton) — jamais à un autre
// message, jamais tout seul. Sans ce tap, ce service worker reste "en
// attente" indéfiniment, exactement comme avant le lot A6.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS_COQUILLE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Nettoie les caches des anciennes versions (nom different de l'actuel).
      const noms = await caches.keys();
      await Promise.all(
        noms.filter((nom) => nom !== CACHE_NAME).map((nom) => caches.delete(nom))
      );
      // Prend le controle des pages ouvertes des cette activation. Sans
      // risque ici : l'activation n'arrive JAMAIS toute seule (toujours pas
      // de skipWaiting automatique). Elle survient soit au prochain
      // demarrage a froid (aucun onglet n'ecoutait, rien a surprendre), soit
      // juste apres le message SKIP_WAITING envoye par app.js au tap de
      // l'utilisateur sur la banniere (lot A6) -- et dans ce cas
      // app.js ecoute deja 'controllerchange' pour recharger la page
      // lui-meme, avec une garde anti-double-reload.
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  const url = new URL(requete.url);

  // Requetes cross-origin (esm.sh pour supabase-js, l'API Supabase elle-meme,
  // etc.) : jamais interceptees, elles partent au reseau normalement.
  if (url.origin !== self.location.origin) return;

  // Seules les requetes GET sont concernees par le cache (pas de sens a
  // mettre en cache un POST).
  if (requete.method !== 'GET') return;

  // Network-first : quand le reseau repond, on sert la derniere version en
  // ligne et on rafraichit le cache. Hors ligne (ou reseau en echec), on
  // retombe sur la version en cache, c'est le filet de secours.
  event.respondWith(
    fetch(requete)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(requete, copie));
        return reponse;
      })
      .catch(() => caches.match(requete))
  );
});

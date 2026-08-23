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
const CACHE_NAME = 'stovo-app-v27';

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
  './parler.js',
  './reception.js',
  './inventaire.js',
  './sortie.js',
  './photo.js',
  './export.js',
  './fonts/dm-sans-latin.woff2',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon-180.png',
];

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
      // Prend le controle des pages ouvertes des cette activation. Sans risque
      // ici puisque l'activation elle-meme n'arrive qu'au prochain demarrage
      // a froid (pas de skipWaiting), donc pas d'onglet "surpris" en pleine
      // session par ce changement de controleur.
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

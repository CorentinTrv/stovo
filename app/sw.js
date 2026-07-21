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
const CACHE_NAME = 'stovo-app-v12';

// Coquille locale a precacher : uniquement les fichiers de l'app elle-meme.
// Les requetes cross-origin (esm.sh, supabase) ne sont JAMAIS precachees ici,
// elles partent au reseau normalement (voir le handler "fetch" plus bas).
const FICHIERS_COQUILLE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './dashboard.js',
  './stock.js',
  './supabase.js',
  './auth.js',
  './parler.js',
  './reception.js',
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

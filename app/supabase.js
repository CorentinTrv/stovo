// STOVO — client Supabase centralisé (lot 9b)
// ================================================
// Un SEUL client pour toute l'app (dashboard.js ET auth.js l'importent
// d'ici). Avant ce lot, dashboard.js créait son propre client : ça
// marchait tant qu'il n'y avait pas d'auth, mais deux clients auraient
// signifié deux sessions potentiellement désynchronisées. Un seul client
// = une seule session, gérée au même endroit.
//
// Clé PUBLISHABLE (comme avant, reprise telle quelle depuis dashboard.js) :
// c'est une clé publique par nature, elle ne donne aucun accès en écriture
// (Row Level Security côté base). L'authentification ci-dessous ne change
// pas ça : elle pose une session utilisateur, elle n'élève pas les droits
// du client Supabase lui-même.
//
// auth.persistSession + autoRefreshToken : la session survit à la
// fermeture de l'app (stockée en localStorage par supabase-js) et se
// renouvelle toute seule avant expiration, sans reconnexion manuelle.
//
// Lot RGPD F2 (22/09/2026, audit du 18/09, lot 9) : supabase-js ne vient
// plus d'un CDN tiers en direct. Avant ce lot, chaque ouverture de l'app
// envoyait une requête à ce CDN (adresse IP, user-agent, referer), et le
// code exécuté dépendait d'un tiers sans contrat. Le fichier
// vendor/supabase-2.117.0.umd.js (build UMD officielle, chargée par une
// balise <script> classique dans index.html AVANT ce module, voir son
// commentaire) pose le global `supabase`, lu ci-dessous. Version épinglée
// à 2.117.0 (celle que le CDN tiers précédent servait le 22/09/2026,
// vérifiée identique sur jsdelivr et unpkg, SHA-256
// 7b9e9c64109e15c338fa58c2bc77c32fb1c459bd587e22fc6b72cca80a388645).
// Pourquoi l'UMD et pas le bundle `?bundle` de ce CDN : ce dernier n'est
// pas autonome, il importe encore /node/buffer.mjs et /node/process.mjs
// (vérifié le 22/09/2026). Pour mettre à jour cette version : télécharger
// dist/umd/supabase.js depuis jsdelivr ET unpkg pour la nouvelle version,
// comparer leurs SHA-256 (doivent être identiques), renommer le fichier
// et la licence avec la nouvelle version, changer la balise
// <script src="vendor/..."> d'index.html, l'entrée correspondante de
// FICHIERS_COQUILLE et le CACHE_NAME de sw.js (bump obligatoire), et les
// constantes SHA256_ATTENDU/TAILLE_ATTENDUE de supabase_test.js.

const bibliotheque = globalThis.supabase;
// Ecart trouve et corrige le 22/09/2026 : auth_test.js importe transitivement
// ce module (via auth.js), et deno test tourne hors navigateur -- aucune
// balise <script> n'y a jamais charge le fichier vendore, globalThis.supabase
// y est donc absent PAR CONSTRUCTION, sans rapport avec une vraie panne de
// chargement. Le garde-fou fail-fast ne s'applique donc qu'en dehors de
// l'environnement Deno (globalThis.Deno n'existe que la, jamais dans un
// navigateur) : en Deno, `supabase` reste simplement `undefined`, jamais
// utilise par un banc de test (voir supabase_test.js pour la preuve).
const dansDeno = typeof globalThis.Deno !== 'undefined';
if (!dansDeno && (!bibliotheque || typeof bibliotheque.createClient !== 'function')) {
  throw new Error('supabase-js introuvable : index.html doit charger vendor/supabase-2.117.0.umd.js avant app.js');
}

export const SUPABASE_URL = 'https://hivaawwjrimacfkguauc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_h-tBhpJfbAP4YUS6OmYsaA_GNAfWkjh';

export const supabase = bibliotheque?.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

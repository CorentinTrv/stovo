// STOVO — coquille de la PWA (lot 9a)
// =======================================
// Deux responsabilites, volontairement simples :
//   1. Faire vivre le dashboard comme un ecran parmi d'autres (import).
//   2. Basculer entre les 2 onglets ("dashboard" / "parler") et enregistrer
//      le service worker.
// Rien d'autre ici : pas d'auth (lot 9b), pas de micro (etape 11).

// L'import declenche l'execution du script du dashboard (connexion Supabase,
// chargement des donnees, rafraichissement toutes les 30 s), exactement
// comme le <script type="module"> du dashboard actuel.
import './dashboard.js';

const ECRANS = {
  dashboard: document.getElementById('ecran-dashboard'),
  parler: document.getElementById('ecran-parler'),
};
const ONGLETS = document.querySelectorAll('.nav-item');

function afficherOnglet(nomOnglet) {
  for (const [nom, element] of Object.entries(ECRANS)) {
    element.classList.toggle('ecran-actif', nom === nomOnglet);
  }
  ONGLETS.forEach((bouton) => {
    bouton.classList.toggle('actif', bouton.dataset.onglet === nomOnglet);
  });
}

ONGLETS.forEach((bouton) => {
  bouton.addEventListener('click', () => afficherOnglet(bouton.dataset.onglet));
});

// Écran par défaut : le tableau de bord (rappel du lot 9a, la spec l'impose).
afficherOnglet('dashboard');

// Enregistrement du service worker (installabilite + mise a jour auto).
// Garde classique : navigator.serviceWorker n'existe pas sur tous les
// navigateurs (ex. anciens Safari desktop), on ne casse rien si absent.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((enregistrement) => {
        console.log('Service worker Stovo enregistré, scope :', enregistrement.scope);
      })
      .catch((erreur) => {
        console.error('Échec de l’enregistrement du service worker Stovo :', erreur);
      });
  });
}

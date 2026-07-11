// STOVO — coquille de la PWA (lot 9a) + garde de session (lot 9b)
// ====================================================================
// Trois responsabilités, volontairement simples :
//   1. Vérifier la session au démarrage et basculer entre l'écran de
//      connexion (#ecran-login) et l'application (#app-shell).
//   2. Brancher le formulaire de connexion et le bouton de déconnexion.
//   3. Basculer entre les 2 onglets ("dashboard" / "parler") et enregistrer
//      le service worker (inchangé depuis le lot 9a).
// Rien d'autre ici : pas de micro (étape 11). L'écriture sécurisée en base
// (écran « Parler » au clavier, branché sur pwa-api) vit dans parler.js
// (lot 10b), simplement importé ci-dessous.

// L'import charge le module dashboard mais ne démarre plus rien tout seul
// (lot 9b) : c'est demarrerDashboard() qui déclenche le chargement, appelé
// ci-dessous seulement une fois la session confirmée.
import { demarrerDashboard } from './dashboard.js';
import { getSessionActuelle, seConnecter, seDeconnecter, onAuthChange } from './auth.js';
// Lot 10b : écran « Parler » au clavier. Import pour effet de bord uniquement
// (branche ses propres écouteurs sur les éléments de #ecran-parler, qui
// existent dès le chargement de la page, comme le formulaire de login
// ci-dessous — pas besoin d'attendre la session, les boutons ne font
// simplement rien tant que l'utilisateur ne s'en sert pas).
import './parler.js';

const ecranLogin = document.getElementById('ecran-login');
const appShell = document.getElementById('app-shell');
const formLogin = document.getElementById('form-login');
const champEmail = document.getElementById('login-email');
const champMdp = document.getElementById('login-mdp');
const zoneErreur = document.getElementById('login-erreur');
const btnLogin = document.getElementById('btn-login');
const btnDeconnexion = document.getElementById('btn-deconnexion');

// --- Garde de session : affiche l'app OU l'écran de connexion ---

function afficherApp() {
  ecranLogin.hidden = true;
  appShell.hidden = false;
  demarrerDashboard();
}

function afficherLogin() {
  appShell.hidden = true;
  ecranLogin.hidden = false;
}

// Session déjà active (persistSession) → on saute directement dans l'app.
// Sinon → écran de connexion. C'est la garde qui protège le dashboard.
getSessionActuelle().then((session) => {
  if (session) {
    afficherApp();
  } else {
    afficherLogin();
  }
});

// Reste cohérent si la session change en cours de vie de la page (ex.
// expiration sans renouvellement possible, ou connexion depuis le
// formulaire ci-dessous qui passe aussi par ce canal).
onAuthChange((session) => {
  if (session) {
    afficherApp();
  } else {
    afficherLogin();
  }
});

// --- Formulaire de connexion ---

formLogin.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  zoneErreur.style.display = 'none';
  btnLogin.disabled = true;
  btnLogin.textContent = 'Connexion…';

  const resultat = await seConnecter(champEmail.value.trim(), champMdp.value);

  btnLogin.disabled = false;
  btnLogin.textContent = 'Se connecter';

  if (!resultat.ok) {
    zoneErreur.textContent = resultat.message;
    zoneErreur.style.display = 'block';
    return;
  }
  // Succès : onAuthChange ci-dessus prend le relais (affiche l'app), mais
  // on bascule aussi tout de suite pour ne pas attendre l'événement.
  champMdp.value = '';
  afficherApp();
});

// --- Déconnexion ---

btnDeconnexion.addEventListener('click', async () => {
  await seDeconnecter();
  // onAuthChange ci-dessus rebasculera vers l'écran de connexion.
});

// --- Bascule entre les 2 onglets de l'app (dashboard / parler) ---

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

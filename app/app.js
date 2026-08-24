// STOVO — coquille de la PWA (lot 9a) + garde de session (lot 9b)
// ====================================================================
// Trois responsabilités, volontairement simples :
//   1. Vérifier la session au démarrage et basculer entre l'écran de
//      connexion (#ecran-login) et l'application (#app-shell).
//   2. Brancher le formulaire de connexion.
//   3. Basculer entre les onglets/écrans et enregistrer le service worker
//      (inchangé depuis le lot 9a) + afficher la bannière « nouvelle version
//      prête » (lot A6, 25/08/2026) quand un service worker installé attend
//      son tour. Toujours pas de mise à jour automatique (choix n°5 de
//      l'Architecte) : la bannière n'agit que sur un tap explicite, voir la
//      partie enregistrement plus bas et maj_worker.js.
// Rien d'autre ici : pas de micro (étape 11). L'écriture sécurisée en base
// (écran « Parler » au clavier, branché sur pwa-api) vit dans parler.js
// (lot 10b), simplement importé ci-dessous.
//
// Lot A4 (24/08/2026) : le mot de passe perdu (avant connexion) et l'écran
// Réglages (connecté, dont la déconnexion — elle a QUITTÉ l'en-tête) vivent
// dans deux modules importés pour effet de bord juste en dessous
// (recuperation.js, reglages.js), sur le même modèle que parler.js/stock.js/
// aide.js. `afficherApp`/`afficherLogin` ont été EXTRAITES vers
// ecran_session.js (comportement inchangé, seul l'emplacement bouge) : le
// parcours de récupération doit lui aussi pouvoir ouvrir l'app une fois le
// mot de passe changé, sans import circulaire avec ce fichier.

import { getSessionActuelle, seConnecter, onAuthChange } from './auth.js';
import { afficherApp, afficherLogin } from './ecran_session.js';
// Lot A6 (25/08/2026) : la bannière « nouvelle version prête ». Module pur
// (aucun DOM), il décide seulement QUAND l'afficher et garantit un seul
// reload ; c'est ci-dessous, dans la partie enregistrement du service
// worker, qu'on lui fournit les vrais événements du navigateur.
import { TEXTE_BANNIERE_MAJ, fautIlAfficherLaBanniereMaj, creerGardeUnSeulReload } from './maj_worker.js';
// Lot 10b : écran « Parler » au clavier. Import pour effet de bord uniquement
// (branche ses propres écouteurs sur les éléments de #ecran-parler, qui
// existent dès le chargement de la page, comme le formulaire de login
// ci-dessous — pas besoin d'attendre la session, les boutons ne font
// simplement rien tant que l'utilisateur ne s'en sert pas).
import './parler.js';
// QW-C (18/07) : onglet « Stock » (liste compacte + recherche). Import pour
// effet de bord comme parler.js : stock.js branche ses écouteurs (recherche,
// dépli des lignes) et attend les données publiées par dashboard.js.
import './stock.js';
// Onglet « Aide » (25/07) : import pour effet de bord, comme stock.js. Le
// module rend son contenu (écrit en dur, aucune donnée, aucun réseau) et
// branche les exemples cliquables, qui remplissent le champ de l'écran
// « Parler » puis demandent la bascule via l'événement 'stovo:onglet'.
import './aide.js';
// Lot A4 (24/08/2026) : mot de passe perdu (écrans pré-connexion) et écran
// Réglages (connecté). `gardeRecuperation` est un import NOMMÉ (pas
// seulement un effet de bord) : onAuthChange plus bas doit consulter le même
// état que recuperation.js pour ne jamais ouvrir l'app avant la fin du
// changement de mot de passe (le piège majeur du lot, voir
// recuperation_logique.js).
import { gardeRecuperation } from './recuperation.js';
import './reglages.js';

const formLogin = document.getElementById('form-login');
const champEmail = document.getElementById('login-email');
const champMdp = document.getElementById('login-mdp');
const zoneErreur = document.getElementById('login-erreur');
const btnLogin = document.getElementById('btn-login');

// Lot A6 : bannière « nouvelle version prête ».
const majBandeau = document.getElementById('maj-bandeau');
const majTexte = document.getElementById('maj-texte');
const majBouton = document.getElementById('maj-bouton');

// --- Garde de session : affiche l'app OU l'écran de connexion ---

// Session déjà active (persistSession) → on saute directement dans l'app.
// Sinon → écran de connexion. C'est la garde qui protège le dashboard. Au
// tout premier chargement de la page, la récupération ne peut pas être "en
// cours" (elle nécessite un geste de l'utilisateur déjà dans la page) : pas
// besoin de consulter gardeRecuperation ici, seulement dans onAuthChange
// ci-dessous.
getSessionActuelle().then((session) => {
  if (session) {
    afficherApp();
  } else {
    afficherLogin();
  }
});

// Reste cohérent si la session change en cours de vie de la page (ex.
// expiration sans renouvellement possible, connexion depuis le formulaire
// ci-dessous, ou déconnexion depuis l'écran Réglages, qui passent tous par ce
// canal). Lot A4 : PENDANT une récupération de mot de passe, `verifyOtp` pose
// une session AVANT que le nouveau mot de passe ne soit enregistré
// (updateUser) — sans cette garde, l'app s'ouvrirait avec l'ancien mot de
// passe encore valide (le piège majeur du lot, §1.3 de l'analyse). Tant que
// `gardeRecuperation.estEnCours()` est vrai, c'est recuperation.js qui décide
// seul de la suite (écran « Fait », ou déconnexion propre en cas d'échec) :
// cet événement est ignoré ici, ni afficherApp ni afficherLogin.
onAuthChange((session) => {
  if (gardeRecuperation.estEnCours()) return;
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

// La déconnexion a QUITTÉ l'en-tête au lot A4 (24/08/2026) : « Se déconnecter »
// vit désormais dans l'écran Réglages, câblé par reglages.js (import
// ci-dessus). Rien à faire ici, `seDeconnecter()` déclenche `onAuthChange`
// ci-dessus exactement comme avant.

// --- Bascule entre les écrans de l'app (dashboard / stock / parler / aide,
// + reglages / changerMdp depuis le lot A4 — PAS un 5e onglet : ces deux
// écrans n'ont aucun bouton dans .nav-item, voir index.html) ---

const ECRANS = {
  dashboard: document.getElementById('ecran-dashboard'),
  stock: document.getElementById('ecran-stock'),
  parler: document.getElementById('ecran-parler'),
  aide: document.getElementById('ecran-aide'),
  reglages: document.getElementById('ecran-reglages'),
  changerMdp: document.getElementById('ecran-changer-mdp'),
};
const ONGLETS = document.querySelectorAll('.nav-item');

function afficherOnglet(nomOnglet) {
  for (const [nom, element] of Object.entries(ECRANS)) {
    element.classList.toggle('ecran-actif', nom === nomOnglet);
  }
  ONGLETS.forEach((bouton) => {
    const estActif = bouton.dataset.onglet === nomOnglet;
    bouton.classList.toggle('actif', estActif);
    if (estActif) {
      bouton.setAttribute('aria-current', 'page');
    } else {
      bouton.removeAttribute('aria-current');
    }
  });
}

ONGLETS.forEach((bouton) => {
  bouton.addEventListener('click', () => afficherOnglet(bouton.dataset.onglet));
});

// Bascule demandée par un autre module (aide.js quand on tape un exemple).
// Garde : on ne bascule que vers un écran connu, jamais sur un nom arbitraire.
document.addEventListener('stovo:onglet', (evenement) => {
  const cible = evenement.detail && evenement.detail.onglet;
  if (cible && Object.prototype.hasOwnProperty.call(ECRANS, cible)) {
    afficherOnglet(cible);
  }
});

// Écran par défaut : le tableau de bord (rappel du lot 9a, la spec l'impose).
afficherOnglet('dashboard');

// --- Lot A6 (25/08/2026) : bannière « nouvelle version prête » ---
//
// Retient QUEL service worker en attente contacter au tap (postMessage ne
// se fait que sur celui-là). Rempli par afficherBanniereMaj, lu par le
// clic sur majBouton juste en dessous.
let workerEnAttentePourMaj = null;

function afficherBanniereMaj(worker) {
  workerEnAttentePourMaj = worker;
  majTexte.textContent = TEXTE_BANNIERE_MAJ;
  majBandeau.hidden = false;
}

// Choix n°5 de l'Architecte, gravé : RIEN ne se déclenche tout seul. Ce clic
// est le SEUL geste qui prévient le service worker en attente ; sans lui,
// la bannière reste affichée indéfiniment et le comportement d'avant (mise
// à jour au prochain démarrage à froid) continue de s'appliquer.
majBouton.addEventListener('click', () => {
  if (workerEnAttentePourMaj) {
    workerEnAttentePourMaj.postMessage({ type: 'SKIP_WAITING' });
  }
});

// Enregistrement du service worker (installabilite + mise a jour auto).
// Garde classique : navigator.serviceWorker n'existe pas sur tous les
// navigateurs (ex. anciens Safari desktop), on ne casse rien si absent.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((enregistrement) => {
        console.log('Service worker Stovo enregistré, scope :', enregistrement.scope);

        // Chemin 1 de la détection (lot A6) : l'attente existait déjà avant
        // même que cette page ne finisse de charger (un autre onglet avait
        // laissé une version installée, jamais activée — choix n°5).
        if (fautIlAfficherLaBanniereMaj({ waitingAuChargement: enregistrement.waiting })) {
          afficherBanniereMaj(enregistrement.waiting);
        }

        // Chemin 2 de la détection (lot A6) : la mise à jour survient EN
        // COURS DE SESSION. `updatefound` se déclenche dès qu'un nouveau
        // worker commence à s'installer ; on attend ensuite qu'il atteigne
        // l'état "installed" pour savoir s'il attend son tour.
        enregistrement.addEventListener('updatefound', () => {
          const nouveauWorker = enregistrement.installing;
          if (!nouveauWorker) return;
          nouveauWorker.addEventListener('statechange', () => {
            const installeEnSessionAvecControlleur =
              nouveauWorker.state === 'installed' && Boolean(navigator.serviceWorker.controller);
            if (fautIlAfficherLaBanniereMaj({ installeEnSessionAvecControlleur })) {
              afficherBanniereMaj(nouveauWorker);
            }
          });
        });
      })
      .catch((erreur) => {
        console.error('Échec de l’enregistrement du service worker Stovo :', erreur);
      });
  });

  // Le nouveau service worker prend le contrôle UNIQUEMENT après le
  // self.skipWaiting() du sw (lui-même déclenché uniquement par le message
  // SKIP_WAITING envoyé au tap ci-dessus, voir sw.js). La garde empêche un
  // double reload si l'événement arrivait plusieurs fois.
  const autoriserReload = creerGardeUnSeulReload();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (autoriserReload()) {
      location.reload();
    }
  });
}

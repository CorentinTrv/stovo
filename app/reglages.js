// STOVO — écran Réglages : mon compte, contact, version (lot A4, 24/08/2026)
// ====================================================================
// Regroupe tout ce qui n'est pas du stock (§3.2 de l'analyse, option A
// retenue) : le compte (e-mail, changer le mot de passe, se déconnecter — la
// déconnexion QUITTE l'en-tête et arrive ici), le contact par mail, et la
// version affichée. Ouvert par l'engrenage de l'en-tête du Pilotage, PAS un
// 5e onglet (aucun bouton .nav-item ne pointe ici, voir index.html) : la
// navigation passe par le même événement 'stovo:onglet' que le reste de
// l'app (déjà utilisé par aide.js et dashboard.js), qu'app.js écoute pour
// savoir QUEL écran montrer (ECRANS map, app.js) — ce module ne fait
// qu'ÉMETTRE l'événement et remplir le contenu quand il devient actif, il ne
// connaît pas la mécanique d'affichage elle-même.
//
// Import pour effet de bord, comme stock.js/aide.js.

import { changerMotDePasse, getSessionActuelle, seDeconnecter } from './auth.js';
import { construireLienMailto, DESTINATAIRE_CONTACT, extraireNumeroVersion } from './contact.js';

const $ = (id) => document.getElementById(id);

function demanderOnglet(nom) {
  document.dispatchEvent(new CustomEvent('stovo:onglet', { detail: { onglet: nom } }));
}

// --- Numéro de version affiché (footer de Réglages + ligne du mail) --------
// Lu depuis le nom du cache actif du service worker (CACHE_NAME de sw.js,
// ex. "stovo-app-v32") : AUCUNE constante de version à maintenir en double
// dans ce fichier. `caches` est absent de très vieux navigateurs (garde
// classique, comme ailleurs dans l'app) ; sans lui, ou si aucun cache Stovo
// n'est trouvé (site jamais visité hors ligne, PWA pas encore installée),
// repli explicite "?" plutôt qu'un chiffre inventé.
async function lireVersion() {
  if (!('caches' in globalThis)) return '?';
  try {
    const noms = await caches.keys();
    const nom = noms.find((n) => extraireNumeroVersion(n) !== null);
    return nom ? extraireNumeroVersion(nom) : '?';
  } catch (_e) {
    return '?';
  }
}

// --- Remplissage de l'écran Réglages, à chaque fois qu'il s'affiche --------
// (et non une seule fois au chargement : l'e-mail de session, la version et
// le lien mailto doivent rester à jour même si la page vit longtemps).

async function remplirReglages() {
  const session = await getSessionActuelle();
  const email = session?.user?.email || '';
  $('reglages-email').textContent = email;

  const version = await lireVersion();
  $('reglages-version-num').textContent = version;

  const lien = construireLienMailto({ version, email, userAgent: navigator.userAgent });
  $('reglages-mailto').href = lien;
}

document.addEventListener('stovo:onglet', (evenement) => {
  if (evenement.detail && evenement.detail.onglet === 'reglages') {
    remplirReglages();
  }
});

// --- Navigation --------------------------------------------------------------

$('btn-reglages').addEventListener('click', () => demanderOnglet('reglages'));
$('lien-reglages-retour').addEventListener('click', (e) => { e.preventDefault(); demanderOnglet('dashboard'); });
$('reglages-changer-mdp').addEventListener('click', () => demanderOnglet('changerMdp'));
$('lien-changer-mdp-retour').addEventListener('click', (e) => { e.preventDefault(); demanderOnglet('reglages'); });

// --- Se déconnecter ---------------------------------------------------------
// onAuthChange (app.js) rebascule vers l'écran de connexion, comme avant que
// ce bouton ne vive dans l'en-tête.
$('reglages-deconnexion').addEventListener('click', async () => {
  await seDeconnecter();
});

// --- Contact : adresse en clair + bouton Copier -----------------------------
// Même filet que le bouton "Copier la liste" du tableau de bord
// (dashboard.js) : `navigator.clipboard` peut échouer (contexte non
// sécurisé, vieux navigateur), repli par une invite.
$('reglages-copier').addEventListener('click', async () => {
  const bouton = $('reglages-copier');
  const libelle = bouton.querySelector('.btn-libelle');
  try {
    await navigator.clipboard.writeText(DESTINATAIRE_CONTACT);
    const origine = libelle.textContent;
    libelle.textContent = 'Copié';
    setTimeout(() => { libelle.textContent = origine; }, 1500);
  } catch (_e) {
    globalThis.prompt('Copie cette adresse (Ctrl+C) :', DESTINATAIRE_CONTACT);
  }
});

// --- Écran « Changer mon mot de passe » -------------------------------------

const formChangerMdp = $('form-changer-mdp');
const champMdp1 = $('changer-mdp-1');
const champMdp2 = $('changer-mdp-2');
const btnChangerMdp = $('btn-changer-mdp');
const messageChangerMdp = $('changer-mdp-message');

function afficherMessageMdp(texte, estErreur) {
  messageChangerMdp.textContent = texte;
  messageChangerMdp.classList.toggle('est-erreur', !!estErreur);
  messageChangerMdp.hidden = !texte;
}

formChangerMdp.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  afficherMessageMdp('', false);

  if (champMdp1.value !== champMdp2.value) {
    afficherMessageMdp('Les deux mots de passe ne correspondent pas.', true);
    return;
  }

  btnChangerMdp.disabled = true;
  const origine = btnChangerMdp.textContent;
  btnChangerMdp.textContent = 'Enregistrement…';

  const resultat = await changerMotDePasse(champMdp1.value);

  btnChangerMdp.disabled = false;
  btnChangerMdp.textContent = origine;

  if (!resultat.ok) {
    afficherMessageMdp(resultat.message, true);
    return;
  }
  champMdp1.value = '';
  champMdp2.value = '';
  afficherMessageMdp('Mot de passe changé.', false);
});

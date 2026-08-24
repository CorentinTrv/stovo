// STOVO — mot de passe perdu, PAR CODE (lot A4, 24/08/2026)
// ====================================================================
// Décision tranchée le 23/08 (§1.2 de l'analyse) : un code à 6 chiffres tapé
// dans Stovo, JAMAIS un lien à cliquer (un lien ouvrirait Safari sur iPhone,
// pas la PWA installée). Quatre écrans avant connexion, tous des variantes
// de `.ecran-login` (comme #ecran-login lui-même) : Recevoir un code, Nouveau
// mot de passe (avec son état erreur replié dans la MÊME carte plutôt qu'un
// 5e écran séparé — simplification signalée au rapport de passation), Fait.
//
// Import pour effet de bord (comme parler.js/stock.js/aide.js) : ce module
// branche ses propres écouteurs sur des éléments qui existent dès le
// chargement de la page, avant toute session. `gardeRecuperation` est
// exportée en plus : app.js la consulte dans son propre `onAuthChange` pour
// ne jamais ouvrir l'app avant la fin du changement de mot de passe (voir
// recuperation_logique.js pour le pourquoi du piège).

import {
  changerMotDePasse,
  demanderCodeRecuperation,
  seDeconnecter,
  verifierCode,
} from './auth.js';
import { afficherApp } from './ecran_session.js';
import {
  calculerSecondesRestantesRenvoi,
  creerGardeRecuperation,
  libelleRenvoi,
} from './recuperation_logique.js';

export const gardeRecuperation = creerGardeRecuperation();

const $ = (id) => document.getElementById(id);

const ecranLogin = $('ecran-login');
const ecranCodeDemande = $('ecran-code-demande');
const ecranCodeSaisie = $('ecran-code-saisie');
const ecranCodeFait = $('ecran-code-fait');
const ECRANS_RECUP = [ecranLogin, ecranCodeDemande, ecranCodeSaisie, ecranCodeFait];

// Un seul de ces 4 écrans visible à la fois. Même mécanique que la garde de
// session (#ecran-login / #app-shell) : l'attribut `hidden`, jamais une
// classe (ces écrans existent HORS de #app-shell, avant toute session, ils ne
// passent donc pas par le système .ecran/.ecran-actif d'app.js).
function afficherEcranRecup(ecran) {
  for (const el of ECRANS_RECUP) {
    el.hidden = (el !== ecran);
  }
}

function afficherErreur(el, message) {
  el.textContent = message;
  el.style.display = 'block';
}

function masquerErreur(el) {
  el.style.display = 'none';
  el.textContent = '';
}

// --- Écran Connexion : le lien « Mot de passe oublié ? » -------------------

const lienMdpOublie = $('lien-mdp-oublie');
const champEmailConnexion = $('login-email');

lienMdpOublie.addEventListener('click', (evenement) => {
  evenement.preventDefault();
  // Pré-remplissage (point 2 du comportement attendu) : l'email déjà tapé
  // sur l'écran de connexion suit l'utilisateur, jamais ressaisi pour rien.
  $('recup-email').value = champEmailConnexion.value.trim();
  masquerErreur($('code-demande-erreur'));
  afficherEcranRecup(ecranCodeDemande);
});

// --- Écran « Recevoir un code » ---------------------------------------------

const formCodeDemande = $('form-code-demande');
const champRecupEmail = $('recup-email');
const btnCodeDemande = $('btn-code-demande');
const erreurCodeDemande = $('code-demande-erreur');

$('lien-code-demande-retour').addEventListener('click', (evenement) => {
  evenement.preventDefault();
  afficherEcranRecup(ecranLogin);
});

// Horodatage du dernier envoi réussi (pour la minuterie de renvoi ci-dessous).
// `null` tant qu'aucun code n'a encore été envoyé dans cette page.
let dernierEnvoiMs = null;
let intervalleRenvoi = null;

function demarrerMinuteurRenvoi() {
  dernierEnvoiMs = Date.now();
  const lien = $('lien-renvoyer-code');
  const majLien = () => {
    const restant = calculerSecondesRestantesRenvoi(dernierEnvoiMs, Date.now());
    lien.textContent = libelleRenvoi(restant);
    // Grisé pendant le compte à rebours (planche Code2Saisie : lien --muted
    // tant qu'il reste du temps, --flamme une fois actif) : classe CSS
    // dédiée plutôt qu'un style inline, pour rester cohérent avec le reste
    // de la feuille de style.
    lien.classList.toggle('lien-recup-inactif', restant > 0);
    if (restant <= 0 && intervalleRenvoi) {
      clearInterval(intervalleRenvoi);
      intervalleRenvoi = null;
    }
  };
  if (intervalleRenvoi) clearInterval(intervalleRenvoi);
  majLien();
  intervalleRenvoi = setInterval(majLien, 1000);
}

async function envoyerCode(email) {
  btnCodeDemande.disabled = true;
  const texteOrigine = btnCodeDemande.textContent;
  btnCodeDemande.textContent = 'Envoi…';
  const resultat = await demanderCodeRecuperation(email);
  btnCodeDemande.disabled = false;
  btnCodeDemande.textContent = texteOrigine;
  return resultat;
}

formCodeDemande.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  masquerErreur(erreurCodeDemande);
  const email = champRecupEmail.value.trim();
  const resultat = await envoyerCode(email);
  if (!resultat.ok) {
    afficherErreur(erreurCodeDemande, resultat.message);
    return;
  }
  // Message neutre (point 2 du comportement attendu) : cet écran ne dit RIEN
  // sur l'existence du compte, il se contente de basculer — la phrase "Un
  // code vient de partir vers …" est portée par l'écran suivant lui-même.
  $('recup-email-affiche').textContent = email;
  masquerErreur($('code-saisie-erreur'));
  $('recup-code').classList.remove('champ-erreur');
  $('recup-code').value = '';
  $('recup-nouveau-mdp').value = '';
  demarrerMinuteurRenvoi();
  afficherEcranRecup(ecranCodeSaisie);
});

// --- Écran « Nouveau mot de passe » (+ son état erreur, même carte) --------

const formCodeSaisie = $('form-code-saisie');
const champCode = $('recup-code');
const champNouveauMdp = $('recup-nouveau-mdp');
const btnCodeSaisie = $('btn-code-saisie');
const erreurCodeSaisie = $('code-saisie-erreur');
const lienRenvoyer = $('lien-renvoyer-code');

$('lien-code-saisie-retour').addEventListener('click', (evenement) => {
  evenement.preventDefault();
  afficherEcranRecup(ecranCodeDemande);
});

lienRenvoyer.addEventListener('click', async (evenement) => {
  evenement.preventDefault();
  // Grisé pendant le compte à rebours (Supabase refuse un 2e envoi avant 60 s,
  // `max_frequency`) : un clic pendant cette fenêtre ne déclenche rien.
  const restant = dernierEnvoiMs
    ? calculerSecondesRestantesRenvoi(dernierEnvoiMs, Date.now())
    : 0;
  if (restant > 0) return;
  const resultat = await envoyerCode($('recup-email-affiche').textContent);
  if (!resultat.ok) {
    afficherErreurCode(resultat.message);
    return;
  }
  demarrerMinuteurRenvoi();
});

// Bascule l'écran « Nouveau mot de passe » dans son état erreur (planche
// Code2Erreur) : bordure du champ code en encre, bloc d'alerte visible. Même
// carte, jamais un écran séparé (simplification signalée au rapport).
function afficherErreurCode(message) {
  champCode.classList.add('champ-erreur');
  afficherErreur(erreurCodeSaisie, message);
}

function masquerErreurCode() {
  champCode.classList.remove('champ-erreur');
  masquerErreur(erreurCodeSaisie);
}

formCodeSaisie.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  masquerErreurCode();
  const email = $('recup-email-affiche').textContent;
  const code = champCode.value.trim();
  const nouveauMdp = champNouveauMdp.value;

  btnCodeSaisie.disabled = true;
  btnCodeSaisie.textContent = 'Vérification…';

  // LE PIÈGE MAJEUR DU LOT (point 4 du brief, §1.3 de l'analyse) :
  // verifierCode (verifyOtp) pose une session AVANT que le mot de passe ne
  // soit changé. La garde retient app.js pendant toute cette section, du
  // premier appel réseau jusqu'au verdict final (succès -> écran "Fait",
  // échec -> déconnexion propre).
  gardeRecuperation.demarrer();
  const resultatCode = await verifierCode(email, code);
  if (!resultatCode.ok) {
    gardeRecuperation.terminer();
    btnCodeSaisie.disabled = false;
    btnCodeSaisie.textContent = 'Changer le mot de passe';
    afficherErreurCode(resultatCode.message);
    return;
  }

  const resultatMdp = await changerMotDePasse(nouveauMdp);
  btnCodeSaisie.disabled = false;
  btnCodeSaisie.textContent = 'Changer le mot de passe';
  if (!resultatMdp.ok) {
    // Échec APRÈS que le code a posé une session valide : on ne la laisse
    // jamais traîner (le code, lui, est déjà consommé — il faudra en
    // redemander un). Déconnexion propre, message d'erreur (point 4 du
    // brief, à la lettre).
    await seDeconnecter();
    gardeRecuperation.terminer();
    afficherErreurCode(resultatMdp.message);
    return;
  }

  gardeRecuperation.terminer();
  afficherEcranRecup(ecranCodeFait);
});

// --- Écran « Fait » ----------------------------------------------------------

// Défaut trouvé à la relecture du Jarvis (24/08/2026) : ce handler ne faisait
// qu'afficherApp(), qui ne bascule QUE #ecran-login/#app-shell (voir
// ecran_session.js) — #ecran-code-fait, révélé par afficherEcranRecup()
// juste avant (fin du submit de #form-code-saisie), restait hidden=false,
// empilé au-dessus de l'app, et resurgissait encore à la déconnexion
// suivante (afficherLogin() ne le touche pas non plus). INVARIANT à
// garantir : dès que l'app OU l'écran de connexion s'affiche, AUCUN écran de
// récupération ne doit rester visible. `afficherEcranRecup(ecranLogin)`
// remasque les 4 écrans de la famille récupération (dont ecranCodeFait) en
// ne laissant que #ecran-login visible ; afficherApp() bascule aussitôt
// après vers l'app, sans jamais laisser #ecran-login affiché à l'écran.
$('btn-ouvrir-stovo').addEventListener('click', () => {
  afficherEcranRecup(ecranLogin);
  // La session existe déjà (posée par verifyOtp, confirmée par updateUser) :
  // il ne reste qu'à ouvrir l'app, comme le ferait onAuthChange si la garde
  // n'avait pas retenu l'événement.
  afficherApp();
});

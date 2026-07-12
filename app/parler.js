// STOVO — écran « Parler » : clavier (lot 10b) + micro on-device (lot 11a)
// ====================================================
// Branche le champ texte de l'écran « Parler » sur l'Edge Function pwa-api,
// qui appelle EXACTEMENT le même cœur métier que Telegram (_shared/coeur.ts,
// traiterDeclaration + traiterConfirmation).
//
// Lot 11a : le micro utilise la reconnaissance vocale du NAVIGATEUR (Web
// Speech API SpeechRecognition, en fr-FR), sans aucun appel serveur. Il ne
// fait que REMPLIR #champ-parler (option A tranchée avec Corentin) : rien
// n'est envoyé automatiquement, l'envoi reste le clic sur "Envoyer" plus
// bas, le flux 10b n'est donc pas modifié. Le repli serveur pour les
// appareils sans cette API (MediaRecorder + transcription côté serveur) est
// le lot 11b, pas celui-ci.
//
// Le SDK supabase-js attache automatiquement le JWT de la session en cours à
// `supabase.functions.invoke(...)` (en-tête Authorization) : c'est pwa-api
// qui le valide côté serveur et calcule le sessionId à partir de l'identité
// (voir pwa-api/index.ts). Rien à faire côté client pour l'identité.
//
// Aucune écriture en base ne part d'ici directement : ce module ne fait que
// des appels HTTP vers pwa-api, qui applique lui-même toutes les gardes
// métier (matching produit, confirmation oui/non obligatoire, etc.).

import { supabase } from './supabase.js';

const zoneReponse = document.getElementById('parler-reponse');
const zoneConfirmation = document.getElementById('parler-confirmation');
const formParler = document.getElementById('form-parler');
const champTexte = document.getElementById('champ-parler');
const btnEnvoyer = document.getElementById('btn-envoyer');
const btnOui = document.getElementById('btn-oui');
const btnNon = document.getElementById('btn-non');
const btnMicro = document.getElementById('btn-micro');
const zoneEtat = document.getElementById('parler-etat');

// Affiche le message renvoyé par pwa-api et montre/cache les boutons Oui/Non
// selon `enAttente` (vrai s'il y a une déclaration en attente de confirmation).
function afficherReponse(texte, enAttente) {
  zoneReponse.textContent = texte;
  zoneConfirmation.hidden = !enAttente;
}

// Appel générique à pwa-api. Désactive les contrôles pendant l'appel
// (anti double-clic ; l'idempotence backend protège déjà l'écriture, ceci
// n'est qu'une protection d'UX pour ne pas envoyer deux fois la même chose).
async function appelerPwaApi(corps, controlesADesactiver) {
  controlesADesactiver.forEach((element) => { element.disabled = true; });
  try {
    const { data, error } = await supabase.functions.invoke('pwa-api', { body: corps });
    if (error) {
      console.error('Erreur pwa-api Stovo :', error.message || error);
      afficherReponse('Désolé, une erreur est survenue. Réessaie dans quelques instants.', false);
      return;
    }
    afficherReponse(data?.reply ?? 'Pas de réponse du serveur.', Boolean(data?.enAttente));
  } finally {
    controlesADesactiver.forEach((element) => { element.disabled = false; });
  }
}

// --- Déclaration (formulaire texte) ---
formParler.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const texte = champTexte.value.trim();
  if (!texte) return;

  btnEnvoyer.textContent = 'Envoi…';
  await appelerPwaApi({ kind: 'declaration', texte }, [btnEnvoyer, champTexte]);
  btnEnvoyer.textContent = 'Envoyer';
  champTexte.value = '';
});

// --- Confirmation Oui / Non ---
btnOui.addEventListener('click', async () => {
  await appelerPwaApi({ kind: 'confirmation', reponse: 'oui' }, [btnOui, btnNon]);
});

btnNon.addEventListener('click', async () => {
  await appelerPwaApi({ kind: 'confirmation', reponse: 'non' }, [btnOui, btnNon]);
});

// --- Micro on-device (lot 11a) ---
// Entrée externe (le navigateur / l'appareil) : on ne suppose jamais qu'un
// résultat arrive. onerror ET onend sont gérés systématiquement, et
// l'absence totale de l'API ne doit jamais empêcher d'utiliser le clavier.

// Certains navigateurs (Chrome, Safari) exposent encore l'API sous le
// préfixe "webkit" : on prend ce qui existe, sinon SR reste undefined.
const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

let enEcoute = false;
let erreurEnCours = false;
let instanceEnCours = null;

// Affiche ou efface le message d'état sous le micro (écoute / erreur /
// indisponibilité). Un texte vide masque la zone (attribut hidden).
function afficherEtatMicro(texte) {
  if (!texte) {
    zoneEtat.hidden = true;
    zoneEtat.textContent = '';
    return;
  }
  zoneEtat.hidden = false;
  zoneEtat.textContent = texte;
}

// Messages clairs par code d'erreur SpeechRecognition (voir la spec Web
// Speech API pour la liste des valeurs possibles de event.error).
const MESSAGES_ERREUR_MICRO = {
  'not-allowed': 'Micro refusé. Autorise le micro dans les réglages du navigateur.',
  'service-not-allowed': 'Micro refusé. Autorise le micro dans les réglages du navigateur.',
  'no-speech': "Je n'ai rien entendu, réessaie.",
  'network': 'Souci réseau pour la reconnaissance vocale.',
};

// Construit une instance fraîche à chaque écoute (une instance ne se
// réutilise pas après avoir terminé, c'est l'usage recommandé de l'API).
function creerReconnaissance() {
  const reconnaissance = new SR();
  reconnaissance.lang = 'fr-FR';
  reconnaissance.continuous = false;
  reconnaissance.interimResults = true;
  reconnaissance.maxAlternatives = 1;

  // Dépose le transcript (interim puis final) dans le champ texte : c'est
  // tout ce que fait le micro ici (option A), l'envoi reste manuel.
  reconnaissance.onresult = (evenement) => {
    let transcript = '';
    for (let i = 0; i < evenement.results.length; i++) {
      transcript += evenement.results[i][0].transcript;
    }
    champTexte.value = transcript;
  };

  reconnaissance.onerror = (evenement) => {
    console.error('Erreur reconnaissance vocale Stovo :', evenement.error);
    erreurEnCours = true;
    afficherEtatMicro(MESSAGES_ERREUR_MICRO[evenement.error] || 'Problème avec le micro, réessaie ou utilise le clavier.');
  };

  // onend arrive toujours (fin normale, arrêt manuel, ou juste après une
  // erreur) : c'est le seul endroit sûr pour sortir de l'état "écoute".
  reconnaissance.onend = () => {
    enEcoute = false;
    instanceEnCours = null;
    btnMicro.classList.remove('ecoute');
    if (!erreurEnCours) afficherEtatMicro('');
  };

  return reconnaissance;
}

function demarrerEcoute() {
  erreurEnCours = false;
  const reconnaissance = creerReconnaissance();
  try {
    reconnaissance.start();
  } catch (erreur) {
    console.error('Impossible de démarrer le micro Stovo :', erreur);
    afficherEtatMicro('Impossible de démarrer le micro, réessaie ou utilise le clavier.');
    return;
  }
  instanceEnCours = reconnaissance;
  enEcoute = true;
  btnMicro.classList.add('ecoute');
  afficherEtatMicro("J'écoute…");
}

if (!SR) {
  // Progressive enhancement : sans l'API, le micro reste désactivé (attribut
  // HTML `disabled` déjà posé) et le clavier fonctionne sans rien de plus.
  afficherEtatMicro('Reconnaissance vocale non disponible sur cet appareil, utilise le clavier (le vocal serveur arrive bientôt).');
} else {
  btnMicro.disabled = false;
  // Toggle : un clic pendant l'écoute arrête la reconnaissance en cours.
  btnMicro.addEventListener('click', () => {
    if (enEcoute) {
      instanceEnCours?.stop();
      return;
    }
    demarrerEcoute();
  });
}

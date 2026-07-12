// STOVO — écran « Parler » : clavier (lot 10b) + micro on-device (lot 11a)
// + import catalogue .xlsx (lot 12a)
// ====================================================
// Branche le champ texte de l'écran « Parler » sur l'Edge Function pwa-api,
// qui appelle EXACTEMENT le même cœur métier que Telegram (_shared/coeur.ts,
// traiterDeclaration + traiterConfirmation + ingererImportXlsx).
//
// Lot 11a : le micro utilise la reconnaissance vocale du NAVIGATEUR (Web
// Speech API SpeechRecognition, en fr-FR), sans aucun appel serveur. Il ne
// fait que REMPLIR #champ-parler (option A tranchée avec Corentin) : rien
// n'est envoyé automatiquement, l'envoi reste le clic sur "Envoyer" plus
// bas, le flux 10b n'est donc pas modifié. Le repli serveur pour les
// appareils sans cette API (MediaRecorder + transcription côté serveur) est
// le lot 11b, pas celui-ci.
//
// Lot 12a : le bouton « Importer un catalogue (.xlsx) » lit le fichier choisi
// en base64 (FileReader) et le poste à pwa-api (kind="import"). Aucune
// lecture du fichier ni décision métier côté client : tout (taille, format,
// mapping des colonnes, écriture du tampon) se passe côté serveur
// (ingererImportXlsx, _shared/coeur.ts). La réponse réutilise le même
// affichage et les mêmes boutons Oui/Non que le clavier.
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
const champImport = document.getElementById('champ-import');
const btnImport = document.getElementById('btn-import');

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

// --- Import catalogue .xlsx (lot 12a) ---
// Le fichier transite en base64 dans le JSON envoyé à pwa-api (pas de multipart,
// transport tranché par l'Architecte pour ce lot). La réponse s'affiche via
// afficherReponse (déjà appelée par appelerPwaApi) : le message « J'ai lu N
// produits… » et les boutons Oui/Non déjà câblés plus haut appliquent l'import.

// Le bouton visible déclenche le sélecteur natif : l'input reste `hidden`,
// c'est la pratique standard pour styliser le déclencheur d'un <input type="file">.
btnImport.addEventListener('click', () => {
  champImport.click();
});

// Lit un File en base64 (FileReader.readAsDataURL renvoie une data URL du type
// "data:...;base64,XXXX" : on ne garde que la partie après la virgule).
function lireFichierEnBase64(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const resultat = String(lecteur.result || '');
      const virgule = resultat.indexOf(',');
      resolve(virgule === -1 ? resultat : resultat.slice(virgule + 1));
    };
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsDataURL(fichier);
  });
}

champImport.addEventListener('change', async () => {
  const fichier = champImport.files && champImport.files[0];
  // Garde front légère : sélecteur annulé sans choix de fichier -> on ne fait rien.
  // Le vrai contrôle taille/format est côté serveur (ingererImportXlsx).
  if (!fichier) return;

  try {
    const contenuBase64 = await lireFichierEnBase64(fichier);
    btnImport.textContent = 'Import en cours…';
    await appelerPwaApi({ kind: 'import', nomFichier: fichier.name, contenuBase64 }, [btnImport]);
  } catch (erreur) {
    console.error('Erreur lecture fichier import Stovo :', erreur);
    afficherReponse("Je n'ai pas pu lire ce fichier. Réessaie.", false);
  } finally {
    btnImport.textContent = '📄 Importer un catalogue (.xlsx)';
    // Réinitialise la valeur : sinon 'change' ne se redéclenche pas si l'utilisateur
    // choisit deux fois de suite le même fichier.
    champImport.value = '';
  }
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

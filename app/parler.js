// STOVO — écran « Parler » au clavier (lot 10b)
// ====================================================
// Branche le champ texte de l'écran « Parler » sur l'Edge Function pwa-api,
// qui appelle EXACTEMENT le même cœur métier que Telegram (_shared/coeur.ts,
// traiterDeclaration + traiterConfirmation). Pas de micro ici : c'est
// l'étape 11 qui ajoutera la transcription vocale, cet écran écrit au clavier.
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

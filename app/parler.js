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
import { creerModeReception } from './reception.js';
import { creerModeInventaire } from './inventaire.js';
import { getSessionActuelle } from './auth.js';

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

// --- Verrou de mode unique (lot S-0, 25/07/2026) ---
// Stovo a plusieurs modes de session (réception N1, inventaire guidé CM-C, et
// bientôt sortie N3). Avant ce lot, chaque mode ne masquait QUE son propre bouton
// « Démarrer » et le routage de la phrase dictée testait les modes en cascade :
// on pouvait donc avoir deux modes ouverts en même temps, et un chiffre dicté
// pour l'inventaire partait dans le tampon de la réception (risque R4 du cadrage
// N1, dans sa version humaine).
//
// parler.js est le seul module qui connaît TOUS les modes (c'est lui qui les
// construit), donc c'est lui qui arbitre. Les modes reçoivent prendreVerrou /
// rendreVerrou par injection, comme ils reçoivent déjà `appeler` et `afficher` :
// ils ne connaissent toujours ni le DOM réel ni les autres modes, ce qui garde le
// banc d'essai offline valable.
let modeCourant = null; // null | 'reception' | 'inventaire'  (+ 'sortie' au lot S-5)

const boutonsDemarrer = {
  reception: document.getElementById('btn-reception-demarrer'),
  inventaire: document.getElementById('btn-inventaire-demarrer'),
};

// Masque les boutons « Démarrer » de tous les modes SAUF celui passé (null =
// tous visibles). Chaque mode continue de masquer le sien dans son propre
// entrer()/demarrer() : ici on ne s'occupe que des autres.
function majBoutonsDemarrer(modeActif) {
  for (const [nom, bouton] of Object.entries(boutonsDemarrer)) {
    if (!bouton || nom === modeActif) continue;
    bouton.hidden = modeActif !== null;
  }
}

// Messages de refus, écrits en entier pour que l'accord soit juste (« Termine-LA »
// pour une réception, « Termine-LE » pour un inventaire). Mêmes phrases que le
// filet serveur (_shared/verrou_mode.ts), pour que l'utilisateur lise la même
// chose quel que soit l'étage qui a refusé.
const MESSAGES_VERROU = {
  reception: 'Tu as une réception en cours. Termine-la ou abandonne-la d\'abord.',
  inventaire: 'Tu as un inventaire en cours. Termine-le ou abandonne-le d\'abord.',
};

// Renvoie false si un AUTRE mode détient déjà le verrou, et explique alors le
// refus à l'écran : c'est l'arbitre qui sait nommer le mode bloquant, un module
// de mode ne connaît pas les autres. L'appelant n'a plus qu'à renoncer sans rien
// changer à l'affichage.
// `silencieux` sert aux bannières de reprise, jouées automatiquement au
// chargement : un refus y est normal (deux résidus de session peuvent coexister,
// c'est justement le défaut qu'on répare) et afficher un reproche alors que
// l'utilisateur n'a rien demandé serait déroutant.
function prendreVerrou(nom, silencieux) {
  if (modeCourant !== null && modeCourant !== nom) {
    if (!silencieux) {
      zoneReponse.textContent = MESSAGES_VERROU[modeCourant]
        || 'Tu as déjà une opération en cours. Termine-la ou abandonne-la d\'abord.';
    }
    return false;
  }
  modeCourant = nom;
  majBoutonsDemarrer(nom);
  return true;
}

// Le paramètre `nom` n'est pas décoratif : sans lui, un mode pourrait libérer le
// verrou d'un autre (par exemple une reprise refusée qui appellerait quand même
// son nettoyage). On ne libère que si on est bien le détenteur.
function rendreVerrou(nom) {
  if (modeCourant !== nom) return;
  modeCourant = null;
  majBoutonsDemarrer(null);
}

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
// Le formulaire est PARTAGÉ entre la saisie normale et le mode réception (N1) :
// en réception, « Envoyer » devient « Ajouter » et la phrase part vers
// reception-ligne au lieu de declaration (voir reception.js). Le micro (option A)
// remplit le champ dans les deux cas, l'envoi reste ce submit.
formParler.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const texte = champTexte.value.trim();
  if (!texte) return;

  // Lot S-0 : routage EXPLICITE par le verrou, au lieu d'une cascade de `if` où
  // le premier mode écrit dans le code gagnait. Il n'y a plus d'ordre de priorité
  // implicite à connaître pour savoir où part une phrase.
  //
  // Le `switch` lit modeCourant pour choisir la BRANCHE, mais chaque mode garde
  // son propre état interne, qui reste la vérité de « suis-je dans le panneau ».
  // Les deux ne disent pas la même chose, et c'est normal : une bannière de
  // reprise prend le verrou alors que le mode n'est pas encore ouvert (on n'a pas
  // cliqué « Reprendre »). Dans ce cas la phrase doit partir en saisie normale,
  // avec son rempart Oui/Non. On ne libère PAS le verrou au passage : la bannière
  // est toujours à l'écran et le résidu existe toujours.
  //
  // Donc la règle : le verrou choisit la branche, l'état du mode confirme, et à
  // défaut on retombe sur le comportement le plus sûr (la saisie normale), jamais
  // sur un tampon de session.
  switch (modeCourant) {
    case 'reception':
      if (modeReception.estEnReception()) {
        btnEnvoyer.textContent = 'Ajout…';
        await modeReception.ajouterLigne(texte);
        btnEnvoyer.textContent = 'Ajouter';
        return;
      }
      break;

    // Lot CM-C (25/07/2026) : en inventaire guidé, la phrase est le CHIFFRE
    // compté du produit affiché à l'écran, pas une déclaration.
    case 'inventaire':
      if (modeInventaire.estEnInventaire()) {
        btnEnvoyer.textContent = 'Compte…';
        await modeInventaire.compter(texte);
        btnEnvoyer.textContent = 'Compter';
        champTexte.value = '';
        return;
      }
      break;

    default:
      break;
  }

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

// --- Mode réception multi-produits (N1, lots FR-4 + FR-5) ---
// La logique vit dans reception.js (module isolé, testable au banc offline). Ici
// on lui injecte le vrai Supabase et le vrai DOM. Les kinds reception-* renvoient
// { reply, session } (et non { reply, enAttente }) : on lit `session` pour rendre
// la liste vivante.

// Lit le corps JSON d'une réponse d'erreur si possible. pwa-api répond 400 sur
// un corps de kind reception-* malformé, MAIS renvoie quand même { reply, session }
// (choix §3.4/§3.5 du rapport API-3) : supabase-js expose alors la Response dans
// error.context, il faut la lire au lieu de traiter ça comme un échec sec.
async function lireCorpsReponse(error) {
  try {
    const reponse = error && error.context;
    if (reponse && typeof reponse.json === 'function') return await reponse.json();
  } catch (_erreur) {
    /* corps illisible : on retombera sur le message d'erreur générique */
  }
  return null;
}

// Appel API pour les kinds reception-* : renvoie { reply, session } ou null (null
// = vrai échec réseau/serveur sans corps exploitable). Aucun effet DOM ici : c'est
// reception.js qui décide quoi afficher.
async function appelerReceptionApi(corps) {
  try {
    const { data, error } = await supabase.functions.invoke('pwa-api', { body: corps });
    if (error) {
      const corpsErreur = await lireCorpsReponse(error);
      if (corpsErreur && (corpsErreur.reply || corpsErreur.session)) return corpsErreur;
      console.error('Erreur pwa-api réception Stovo :', error.message || error);
      return null;
    }
    return data || null;
  } catch (erreur) {
    console.error('Erreur réseau réception Stovo :', erreur);
    return null;
  }
}

const modeReception = creerModeReception({
  elements: {
    demarrer: document.getElementById('btn-reception-demarrer'),
    panneau: document.getElementById('reception-panneau'),
    titreTotal: document.getElementById('reception-total'),
    liste: document.getElementById('reception-liste'),
    inconnus: document.getElementById('reception-inconnus'),
    actions: document.getElementById('reception-actions'),
    valider: document.getElementById('btn-reception-valider'),
    abandon: document.getElementById('btn-reception-abandon'),
    reprise: document.getElementById('reception-reprise'),
    repriseTexte: document.getElementById('reception-reprise-texte'),
    reprendre: document.getElementById('btn-reprendre'),
    repriseAbandon: document.getElementById('btn-reprise-abandon'),
    champ: champTexte,
    boutonEnvoyer: btnEnvoyer,
    boutonImport: btnImport,
    confirmation: zoneConfirmation,
  },
  appeler: appelerReceptionApi,
  confirmer: (message) => globalThis.confirm(message),
  afficher: (texte) => { zoneReponse.textContent = texte; },
  doc: document,
  // Lot S-0 : exclusivité des modes (voir le bloc verrou en haut de ce fichier).
  prendreVerrou,
  rendreVerrou,
});

// --- Mode inventaire complet guidé (CM-C, 25/07/2026) ---
// Même montage que la réception : la logique vit dans inventaire.js (module
// isolé), on lui injecte ici le vrai Supabase et le vrai DOM. Les kinds
// inventaire-* renvoient { reply, inventaire }.

// La liste des produits actifs est lue en direct (mêmes colonnes et même clé
// publishable que le dashboard, lecture seule). L'ordre alphabétique est
// appliqué par le module.
async function chargerProduitsActifs() {
  const { data, error } = await supabase
    .from('produits')
    .select('id, nom, stock_actuel, unite')
    .eq('actif', true);
  if (error) {
    console.error('Erreur lecture produits (inventaire) :', error.message || error);
    return [];
  }
  return data || [];
}

const modeInventaire = creerModeInventaire({
  elements: {
    demarrer: document.getElementById('btn-inventaire-demarrer'),
    panneau: document.getElementById('inventaire-panneau'),
    parcours: document.getElementById('inventaire-parcours'),
    cloture: document.getElementById('inventaire-cloture'),
    progression: document.getElementById('inventaire-progression'),
    nomProduit: document.getElementById('inventaire-nom-produit'),
    stockTheorique: document.getElementById('inventaire-stock-theorique'),
    dejaCompte: document.getElementById('inventaire-deja-compte'),
    aveugle: document.getElementById('inventaire-aveugle'),
    total: document.getElementById('inventaire-total'),
    passer: document.getElementById('btn-inventaire-passer'),
    terminer: document.getElementById('btn-inventaire-terminer'),
    recap: document.getElementById('inventaire-recap'),
    valider: document.getElementById('btn-inventaire-valider'),
    abandon: document.getElementById('btn-inventaire-abandon'),
    reprise: document.getElementById('inventaire-reprise'),
    repriseTexte: document.getElementById('inventaire-reprise-texte'),
    reprendre: document.getElementById('btn-inventaire-reprendre'),
    repriseAbandon: document.getElementById('btn-inventaire-reprise-abandon'),
    champ: champTexte,
    boutonEnvoyer: btnEnvoyer,
    boutonImport: btnImport,
    confirmation: zoneConfirmation,
  },
  // Les kinds inventaire-* utilisent le même transport que reception-* (et donc
  // la même lecture du corps sur un 400).
  appeler: appelerReceptionApi,
  chargerProduits: chargerProduitsActifs,
  confirmer: (message) => globalThis.confirm(message),
  afficher: (texte) => { zoneReponse.textContent = texte; },
  // Lot S-0 : exclusivité des modes (voir le bloc verrou en haut de ce fichier).
  prendreVerrou,
  rendreVerrou,
});

// Reprise : si une réception a été laissée en cours (app fermée en plein milieu),
// on la fait remonter au chargement, une fois la session confirmée (l'appel
// reception-etat exige un JWT valide). Sans session, on ne tente rien.
// Même chose pour un inventaire interrompu (CM-C).
getSessionActuelle().then((session) => {
  if (session) {
    modeReception.verifierReprise();
    modeInventaire.verifierReprise();
  }
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

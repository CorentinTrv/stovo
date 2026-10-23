// STOVO : le moteur vocal « serveur », partie PURE (lot « vocal serveur V2 », 12/10/2026)
// ====================================================================
// Ce module ne touche ni le DOM, ni le navigateur (pas de navigator, pas de
// localStorage, pas de minuteur), ni le réseau : il PREND ses entrées en
// paramètre et RENDS une décision. Il est testé par moteur_serveur_logique_test.js.
// La glue qui parle au micro, à MediaRecorder et aux minuteurs vit dans
// moteur_serveur.js ; l'aiguillage entre la dictée et ce moteur vit dans
// parler.js. Plan : context/import/app-stock/2026-10-12_architecte_plan-vocal-serveur.md
// (§2.1 à §2.4, §2.8, §2.9) ; la consigne du lot fait foi en cas d'écart.
//
// À ne pas confondre avec les « dettes de la voix V1 à V10 », un autre chantier.

// ---------------------------------------------------------------------------
// Les textes visibles. PROVISOIRES jusqu'au lot V6 (ecrire-stovo), sauf
// « Je transcris… » (validé, décision 5 du grilling). Tous ici, pour que V6 n'ait
// qu'un endroit à changer.
// ---------------------------------------------------------------------------
export const TEXTE_TRANSCRIPTION = 'Je transcris…';
export const TEXTE_ECOUTE_SERVEUR = "J'écoute…";
// Copie de MSG_VOCAL_RELAIS (backend, _shared/vocal.ts), pour les relais sans
// `reply` : réseau, délai du front.
export const MSG_RELAIS_DICTEE = 'Le vocal ne répond pas, je repasse sur la dictée du téléphone. Redis ta phrase.';
// Quand aucune dictée n'existe sur l'appareil.
export const MSG_RELAIS_CLAVIER = 'Le vocal ne répond pas. Tape ta phrase, ou réessaie dans quelques minutes.';
export const MSG_RIEN_ENTENDU = "Je n'ai rien entendu, réessaie.";
export const MSG_MICRO_MUET = 'Le micro ne capte aucun son, réessaie.';
// Même texte que la garde de la dictée (parler.js).
export const MSG_PAS_DEMARRE = "Le micro n'a pas démarré, réessaie.";

// ---------------------------------------------------------------------------
// Le format d'enregistrement
// ---------------------------------------------------------------------------
// Dans l'ordre : le premier que l'appareil sait enregistrer. `estPrisEnCharge`
// est MediaRecorder.isTypeSupported en vrai.
const MIMES_ENREGISTREMENT = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

// 32 kbit/s : une phrase de 4 s fait environ 16 Ko. Que Safari l'honore est a
// verifier sur l'iPhone (la taille du fichier s'ecrit au journal du micro).
export const BITS_PAR_SECONDE = 32000;
// Garde sur le SEUL demarrage de l'enregistreur, une fois la piste obtenue. Jamais
// sur getUserMedia : la promesse reste en attente tant que l'alerte de permission
// d'iOS est affichee, la couper referait D28.
export const GARDE_DEMARRAGE_MS = 2000;
// Garde sur l'envoi du son : au-dela, relais « delai ».
export const DELAI_ENVOI_MS = 15000;

export function choisirMime(estPrisEnCharge) {
  for (const mime of MIMES_ENREGISTREMENT) {
    if (estPrisEnCharge(mime)) return mime;
  }
  return null;
}

// ---------------------------------------------------------------------------
// L'AudioContext tourne-t-il ? (correctif de relecture, point 4)
// ---------------------------------------------------------------------------
// Si le contexte n'est pas « running » quand l'enregistreur démarre (resume refusé,
// iOS « interrupted », contexte absent), l'analyseur lit des zéros : un vrai vocal
// serait jeté en « muet ». Ce vocal-là se passe donc de détection : ni muet, ni
// rien-entendu, ni fin sur silence ; il s'arrête par un appui ou au plafond de 30 s
// pile, et part normalement. `evenement` est la ligne de journal à écrire.
// Avec détection, le filet de temps réel garde une seconde de marge pour que le
// plafond du détecteur (600 trames) tombe en premier d'ordinaire.
export function decisionDetection(etatContexte) {
  if (etatContexte === 'running') {
    return { detecter: true, evenement: null, plafondMs: PLAFOND_ENREGISTREMENT_MS + 1000 };
  }
  const etat = typeof etatContexte === 'string' && etatContexte !== '' ? etatContexte : 'absent';
  return { detecter: false, evenement: `srv:contexte:${etat}`, plafondMs: PLAFOND_ENREGISTREMENT_MS };
}

// ---------------------------------------------------------------------------
// La détection de fin d'enregistrement, trame par trame
// ---------------------------------------------------------------------------
// Une trame = 50 ms, son énergie = le RMS de getFloatTimeDomainData. Constantes
// exportées : elles se règlent sur l'iPhone (jamais au jugé), voir le rapport
// du lot.
export const TRAME_MS = 50;
// Le plancher de bruit est la médiane des 6 premières trames (300 ms).
export const NB_TRAMES_PLANCHER = 6;
// Plafonné : quelqu'un qui parle dès l'appui ferait sinon du plancher sa propre
// voix, et ne serait jamais entendu.
export const PLANCHER_MAX = 0.02;
// Parole : au-dessus de max(0,02 ; plancher x 3), pendant 150 ms CUMULÉES.
export const SEUIL_PAROLE_MIN = 0.02;
export const FACTEUR_PAROLE = 3;
export const TRAMES_PAROLE_MIN = 3;
// Fin : `silenceMs` continus sous max(0,012 ; plancher x 2), APRÈS la parole.
export const SEUIL_FIN_MIN = 0.012;
export const FACTEUR_FIN = 2;
// Une piste morte (le symptôme d'origine du chantier) : tout sous 0,0001.
export const SEUIL_MUET = 0.0001;
// 8 s sans parole : rien entendu. 30 s : plafond.
export const RIEN_ENTENDU_TRAMES = 160;
export const PLAFOND_TRAMES = 600;
export const PLAFOND_ENREGISTREMENT_MS = PLAFOND_TRAMES * TRAME_MS;

export const SILENCES_ADMIS_MS = [1500, 2000, 2500];
export const SILENCE_PAR_DEFAUT_MS = 2000;

// Toute valeur hors des trois admises (réglage abîmé, entrée douteuse) donne 2 s.
export function normaliserSilenceMs(valeur) {
  return SILENCES_ADMIS_MS.includes(valeur) ? valeur : SILENCE_PAR_DEFAUT_MS;
}

// RMS d'une trame (Float32Array de getFloatTimeDomainData, ou tableau).
export function energieRms(echantillons) {
  if (!echantillons || !echantillons.length) return 0;
  let somme = 0;
  for (let i = 0; i < echantillons.length; i++) somme += echantillons[i] * echantillons[i];
  return Math.sqrt(somme / echantillons.length);
}

// Médiane d'un nombre PAIR de valeurs (les 6 premières trames) : la moyenne des deux du milieu.
function mediane(valeurs) {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = triees.length / 2;
  return (triees[milieu - 1] + triees[milieu]) / 2;
}

// Le cœur incrémental : le moteur lui pousse une énergie toutes les 50 ms, les
// tests lui rejouent des suites. `trame(energie)` rend null tant qu'il n'y a pas
// d'issue, puis TOUJOURS la même décision { issue, trame } (trame = indice, base
// 0, de la trame qui décide). Issues : fin, rien-entendu, plafond, muet.
//
// Les six premières trames sont gardées de côté : le plancher n'est connu qu'à
// la sixième, elles sont alors jugées (parole, silence) dans l'ordre, comme les
// suivantes. Aucune issue ne peut tomber avant la trame 5 (la plus courte,
// `fin`, demande de la parole puis au moins 30 trames de silence).
export function creerDetecteurFin({ silenceMs } = {}) {
  const trameSilence = normaliserSilenceMs(silenceMs) / TRAME_MS;
  const ouverture = [];
  let recues = 0;
  let seuilParole = SEUIL_PAROLE_MIN;
  let seuilFin = SEUIL_FIN_MIN;
  let nbParole = 0;
  let silenceContinu = 0;
  let toutesMuettes = true;
  let decision = null;

  function juger(energie) {
    if (energie > seuilParole) nbParole += 1;
    if (nbParole >= TRAMES_PAROLE_MIN) {
      silenceContinu = energie < seuilFin ? silenceContinu + 1 : 0;
    }
  }

  function verdict(indice) {
    const nombre = indice + 1;
    let issue = null;
    if (silenceContinu >= trameSilence) issue = 'fin';
    else if (nombre >= PLAFOND_TRAMES) issue = 'plafond';
    else if (nombre >= RIEN_ENTENDU_TRAMES && nbParole < TRAMES_PAROLE_MIN) issue = 'rien-entendu';
    // Muet est prioritaire : une piste morte n'est pas un silence de boutique.
    if (issue !== null && toutesMuettes) issue = 'muet';
    return issue === null ? null : { issue, trame: indice };
  }

  return {
    trame(brute) {
      if (decision !== null) return decision;
      const energie = Number.isFinite(brute) && brute > 0 ? brute : 0;
      const indice = recues;
      recues += 1;
      if (energie >= SEUIL_MUET) toutesMuettes = false;
      if (indice < NB_TRAMES_PLANCHER) {
        ouverture.push(energie);
        if (ouverture.length < NB_TRAMES_PLANCHER) return null;
        const plancher = Math.min(mediane(ouverture), PLANCHER_MAX);
        seuilParole = Math.max(SEUIL_PAROLE_MIN, plancher * FACTEUR_PAROLE);
        seuilFin = Math.max(SEUIL_FIN_MIN, plancher * FACTEUR_FIN);
        ouverture.forEach(juger);
      } else {
        juger(energie);
      }
      decision = verdict(indice);
      return decision;
    },
  };
}

// Commodité : replie le cœur sur un tableau d'énergies. Rend la décision, ou
// null si la suite s'arrête avant.
export function detecterFin(energies, { silenceMs } = {}) {
  const detecteur = creerDetecteurFin({ silenceMs });
  for (const energie of energies) {
    const decision = detecteur.trame(energie);
    if (decision !== null) return decision;
  }
  return null;
}

// ---------------------------------------------------------------------------
// La machine du moteur (jumelle de creerMachineMicro, parler_logique.js)
// ---------------------------------------------------------------------------
// Quatre états :
//  - 'inactif'   : rien en cours.
//  - 'demande'   : appui reçu, l'enregistreur n'a pas encore réellement démarré
//                  (piste micro pas encore accordée, ou accordée et `start` de
//                  MediaRecorder pas encore arrivé).
//  - 'enregistre': l'enregistreur a démarré pour de bon (son événement `start`).
//  - 'transcrit' : enregistrement fini, le son est parti (ou part), on attend le texte.
//
// Écart assumé à la consigne : le passage à 'enregistre' se fait à l'événement
// `start` de l'enregistreur et pas à l'obtention de la piste. C'est la leçon du
// défaut D28 : on ne montre « J'écoute… » que sur la preuve que ça enregistre.
export function creerMachineServeur() {
  let etat = 'inactif';

  return {
    etat: () => etat,

    // Un appui sur le bouton micro. Rend l'action à exécuter :
    //  - 'demarrer' : demander la piste et lancer l'enregistreur ;
    //  - 'annuler'  : l'attente de démarrage est abandonnée (la piste accordée
    //                 plus tard sera coupée aussitôt, rien enregistré) ;
    //  - 'arreter'  : arrêter l'enregistrement et envoyer le son ;
    //  - 'ignorer'  : le texte est attendu, un appui ne fait rien.
    appui() {
      if (etat === 'inactif') { etat = 'demande'; return 'demarrer'; }
      if (etat === 'demande') { etat = 'inactif'; return 'annuler'; }
      if (etat === 'enregistre') { etat = 'transcrit'; return 'arreter'; }
      return 'ignorer';
    },

    // L'enregistreur a réellement démarré. Faux si l'appui a été annulé entre-temps.
    confirmerDemarrage() {
      if (etat !== 'demande') return false;
      etat = 'enregistre';
      return true;
    },

    // La détection a décidé d'arrêter et d'envoyer (fin, plafond). Faux si un
    // appui l'a devancée.
    finDetectee() {
      if (etat !== 'enregistre') return false;
      etat = 'transcrit';
      return true;
    },

    // Retour à 'inactif' depuis n'importe quel état (texte reçu, erreur, garde,
    // rien entendu). Idempotent : rend vrai seulement s'il y avait quelque chose à finir.
    terminer() {
      const changement = etat !== 'inactif';
      etat = 'inactif';
      return changement;
    },
  };
}

// ---------------------------------------------------------------------------
// Lire ce que la route `transcrire` répond
// ---------------------------------------------------------------------------
// La route (pwa-api, vocal serveur V1) répond toujours en HTTP 200 :
// { texte } | { texte: '', reply } | { relais, reply } | { reply, enAttente }
// (refus d'une démo expirée). `data` vaut null quand invoke() a rendu une erreur.
const CAUSES_RELAIS = ['ferme', 'config', 'credit', 'quota', 'panne', 'delai', 'format', 'taille', 'plafond'];

const estTexteNonVide = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';

export function relaisSansReponse(cause) {
  return { type: 'relais', cause, message: MSG_RELAIS_DICTEE };
}

export function interpreterReponseTranscrire(data) {
  if (data === null || typeof data !== 'object') return relaisSansReponse('reseau');
  if (typeof data.texte === 'string') {
    const texte = data.texte.trim();
    if (texte !== '') return { type: 'texte', texte };
    return { type: 'rien', message: estTexteNonVide(data.reply) ? data.reply : MSG_RIEN_ENTENDU };
  }
  if (data.relais !== undefined && data.relais !== null) {
    const cause = CAUSES_RELAIS.includes(data.relais) ? data.relais : 'panne';
    return { type: 'relais', cause, message: estTexteNonVide(data.reply) ? data.reply : MSG_RELAIS_DICTEE };
  }
  // Ni texte ni relais : un refus de démo expirée, traité comme un relais « ferme ».
  if (estTexteNonVide(data.reply)) return { type: 'relais', cause: 'ferme', message: data.reply };
  return relaisSansReponse('reseau');
}

// `capacites` : { vocal: 'ferme' | 'essai' | 'defaut' }. Toute autre forme (null,
// une 400 de la prod qui n'a pas encore la route, une casse différente) est
// « inconnue » : null. L'appelant garde alors la dernière valeur connue, sinon 'ferme'.
const CAPACITES = ['ferme', 'essai', 'defaut'];

export function normaliserCapacite(data) {
  if (data === null || typeof data !== 'object') return null;
  return CAPACITES.includes(data.vocal) ? data.vocal : null;
}

// ---------------------------------------------------------------------------
// Le secours : quand le serveur ne répond pas, la dictée du téléphone reprend
// ---------------------------------------------------------------------------
export const DELAI_SECOURS_COURT_MS = 5 * 60 * 1000;

// Ce que devient le secours après un relais de cause `cause` :
//  - null : aucun secours (format, taille : le message seul, une seconde
//    tentative a ses chances) ;
//  - { jusquaMs: Infinity } : la dictée jusqu'au rechargement de l'app (en
//    mémoire, jamais en localStorage) ;
//  - { jusquaMs } : la dictée pendant 5 minutes.
export function etatSecours(cause, maintenantMs) {
  if (cause === 'format' || cause === 'taille') return null;
  if (cause === 'credit' || cause === 'config' || cause === 'ferme' || cause === 'plafond') {
    return { jusquaMs: Infinity };
  }
  // quota, panne, delai, reseau, et tout ce qu'on ne connaît pas.
  return { jusquaMs: maintenantMs + DELAI_SECOURS_COURT_MS };
}

export function secoursEstActif(secours, maintenantMs) {
  return Boolean(secours) && maintenantMs < secours.jusquaMs;
}

// Quel moteur prend le micro : 'serveur', 'dictee' ou 'clavier' (aucun des deux
// possible sur cet appareil).
export function choisirMoteur({ capacite, caseAllumee, secoursActif, enregistreurDisponible, dicteeDisponible }) {
  const veutServeur = capacite === 'defaut' || (capacite === 'essai' && caseAllumee === true);
  const serveurPossible = veutServeur && !secoursActif && enregistreurDisponible === true;
  if (serveurPossible) return 'serveur';
  return dicteeDisponible ? 'dictee' : 'clavier';
}

// ---------------------------------------------------------------------------
// Les réglages stockés sur l'appareil (localStorage, jamais envoyés au serveur)
// ---------------------------------------------------------------------------
// Ce sont les clés de BASE : on les passe toujours par cleVocal avant de lire ou d'écrire.
export const CLE_VOCAL_CAPACITE = 'stovo-vocal-capacite';
export const CLE_VOCAL_ESSAI = 'stovo-vocal-essai';
export const CLE_VOCAL_SILENCE = 'stovo-vocal-silence-ms';
export const CLE_VOCAL_STRATEGIE = 'stovo-vocal-strategie';

// /app/ et /app-bac/ sont servis sur la MÊME origine (stovo.fr) et partagent donc
// localStorage : un « essai » et une case cochée sur /app-bac/ s'appliqueraient sur
// /app/, où la prod n'a pas la route (relais toutes les 5 minutes). Chaque famille a
// donc ses quatre clés, même découpage que cleStockageDemo (demo_logique.js) et que
// le nom de cache de sw.js : /app-bac/ ajoute _bac, tout le reste garde la clé de base.
export function cleVocal(base, cheminPage) {
  const bac = /(^|\/)app-bac(\/|$)/.test(typeof cheminPage === 'string' ? cheminPage : '');
  return bac ? `${base}_bac` : base;
}

// `lire` est `(cle) => localStorage.getItem(cle)` en vrai, `cheminPage` est
// `location.pathname`. Rend toujours une forme valide : une valeur absente ou
// abîmée prend son défaut, une lecture qui lève donne tous les défauts.
export function lireReglagesVocal(lire, cheminPage) {
  try {
    const capacite = lire(cleVocal(CLE_VOCAL_CAPACITE, cheminPage));
    const silence = Number(lire(cleVocal(CLE_VOCAL_SILENCE, cheminPage)));
    return {
      capacite: CAPACITES.includes(capacite) ? capacite : 'ferme',
      caseAllumee: lire(cleVocal(CLE_VOCAL_ESSAI, cheminPage)) === '1',
      silenceMs: normaliserSilenceMs(silence),
      strategie: lire(cleVocal(CLE_VOCAL_STRATEGIE, cheminPage)) === 'B' ? 'B' : 'A',
    };
  } catch (_erreur) {
    return { capacite: 'ferme', caseAllumee: false, silenceMs: SILENCE_PAR_DEFAUT_MS, strategie: 'A' };
  }
}

// ---------------------------------------------------------------------------
// Le journal du micro (carte « Diagnostic micro » de Réglages)
// ---------------------------------------------------------------------------
// Une décimale, à la virgule. Entier en dixièmes : 1 249 ms -> 1,2 et 1 250 ms
// -> 1,3 (la moitié monte), sans passer par un flottant.
function secondes(ms) {
  const dixiemes = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 100) : 0;
  return `${Math.floor(dixiemes / 10)},${dixiemes % 10}`;
}

// « audio/webm;codecs=opus » -> « webm ». Une entrée vide donne « audio ».
function etiquetteType(type) {
  if (typeof type !== 'string') return 'audio';
  const base = type.split(';')[0].trim().replace(/^audio\//, '');
  return base === '' ? 'audio' : base;
}

// Une ligne compacte par vocal reçu : `srv ok 1,2 s (fin→texte) 3,4 s parlé 14 Ko webm,
// arrêt silence`. `latenceMs` se mesure de la FIN DE L'ENREGISTREMENT (arrêt sur
// silence ou appui) au texte posé dans le champ (condition 7c corrigée, Q1 du
// grilling). `issue` : silence, appui ou 30 s. Les Ko valent 1 024 octets.
export function formaterLigneVocal({ latenceMs, dureeMs, octets, type, issue }) {
  const ko = Number.isFinite(octets) && octets > 0 ? Math.round(octets / 1024) : 0;
  return `srv ok ${secondes(latenceMs)} s (fin→texte) ${secondes(dureeMs)} s parlé ${ko} Ko ${etiquetteType(type)}, arrêt ${issue}`;
}

// L'escalier de « Premiers pas » lit les événements stovo:micro à la chaîne
// exacte : `error:not-allowed` = marche 2, tout autre `error:…` = marche 3. On
// parle donc cette langue pour les refus de getUserMedia.
export function codeErreurMicro(erreur) {
  const nom = erreur && typeof erreur.name === 'string' ? erreur.name : '';
  if (nom === 'NotAllowedError' || nom === 'SecurityError') return 'not-allowed';
  return nom === '' ? 'exception-start' : nom;
}

// Un refus de getUserMedia (ou une erreur de l'enregistreur) pour un vocal déjà
// ANNULÉ (appui, page cachée) n'est pas une panne : `srv:annule:<code>`, jamais
// `error:…`, que l'escalier de « Premiers pas » lirait comme un micro en panne.
export function evenementErreurMicro(code, perime) {
  return perime ? `srv:annule:${code}` : `error:${code}`;
}

// Un relais s'écrit `srv:relais:<cause>` au journal ; format et taille ne sont
// pas des relais (pas de secours), ils s'écrivent `srv:refus:<cause>`.
export function evenementJournalRelais(cause) {
  return cause === 'format' || cause === 'taille' ? `srv:refus:${cause}` : `srv:relais:${cause}`;
}

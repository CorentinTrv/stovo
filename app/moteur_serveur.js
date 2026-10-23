// STOVO : le moteur vocal « serveur », partie NAVIGATEUR (lot « vocal serveur V2 », 12/10/2026)
// ====================================================================
// Enregistre la voix (getUserMedia + MediaRecorder), s'arrête seul après un
// silence (AudioContext + AnalyserNode lus toutes les 50 ms), envoie le son à
// pwa-api (kind « transcrire ») et rend le texte à parler.js, qui le pose dans
// #champ-parler comme le fait la dictée. Plan :
// context/import/app-stock/2026-10-12_architecte_plan-vocal-serveur.md (§2.2, §2.3, §2.14).
//
// Ce fichier est de la GLUE : il exécute les effets (micro, minuteurs, lecture du
// Blob) mais ne décide rien lui-même. Toutes les décisions (quand s'arrêter, que
// faire d'une réponse, quel texte, quelle ligne de journal) viennent de
// moteur_serveur_logique.js, testé à part. Il ne touche ni le DOM ni le réseau :
// l'affichage et l'appel à pwa-api lui sont INJECTÉS par parler.js, comme les
// modes (reception.js, sortie.js) reçoivent `appeler` et `afficher`.
//
// Le contrat (plan §2.14) est celui que la future boucle mains libres reprendra :
//   const moteur = creerMoteurServeur({ surEtat, surTexteFinal, surMessage,
//                                       surRelais, journaliser, envoyer, lireReglages });
//   moteur.appui() / annuler() / etat() / liberer()
// `envoyer(corps)` rend la réponse de pwa-api (data), ou null si invoke() a rendu
// une erreur. `lireReglages()` rend { silenceMs, strategie }, relu à chaque appui.

import { corpsTranscrire, extraireBase64DepuisDataUrl, texteErreurMicro } from './parler_logique.js';
import {
  BITS_PAR_SECONDE,
  choisirMime,
  codeErreurMicro,
  creerDetecteurFin,
  creerMachineServeur,
  DELAI_ENVOI_MS,
  decisionDetection,
  energieRms,
  evenementErreurMicro,
  evenementJournalRelais,
  formaterLigneVocal,
  GARDE_DEMARRAGE_MS,
  interpreterReponseTranscrire,
  MSG_MICRO_MUET,
  MSG_PAS_DEMARRE,
  MSG_RIEN_ENTENDU,
  relaisSansReponse,
  TRAME_MS,
} from './moteur_serveur_logique.js';

// --- Un seul AudioContext pour toute l'app ---------------------------------
// Safari bloque tout son qui ne descend pas d'un geste de l'utilisateur : le
// contexte est donc créé ou repris DANS le tap (moteur.appui()), jamais au
// chargement. La future boucle mains libres s'en servira pour ses bips (D-6).
let contexteAudio = null;

export function obtenirContexteAudio() {
  try {
    const Contexte = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Contexte) return null;
    if (!contexteAudio) contexteAudio = new Contexte();
    // resume() rend une promesse (ou rien sur un vieux WebKit) ; un refus ne doit rien casser.
    if (contexteAudio.state !== 'running') Promise.resolve(contexteAudio.resume()).catch(() => {});
  } catch (erreur) {
    console.error('AudioContext Stovo indisponible :', erreur);
  }
  return contexteAudio;
}

// Cet appareil sait-il enregistrer ? (getUserMedia, MediaRecorder, et au moins un format.)
export function enregistreurDisponible() {
  const Enregistreur = globalThis.MediaRecorder;
  return typeof Enregistreur === 'function'
    && typeof Enregistreur.isTypeSupported === 'function'
    && typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function'
    && choisirMime((type) => Enregistreur.isTypeSupported(type)) !== null;
}

const fluxVivant = (flux) => Boolean(flux) && flux.getTracks().some((piste) => piste.readyState === 'live');
const couperFlux = (flux) => flux.getTracks().forEach((piste) => piste.stop());

// Lit un Blob en base64 : même méthode que lireFichierEnBase64 (parler.js),
// FileReader.readAsDataURL puis le découpage testé de parler_logique.js.
function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(extraireBase64DepuisDataUrl(lecteur.result));
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsDataURL(blob);
  });
}

const DEPASSE = Symbol('delai-depasse');

// Attend `promesse` au plus `delaiMs`, sinon rend DEPASSE. Le minuteur est
// toujours relâché, quelle que soit l'issue.
function avecDelai(promesse, delaiMs) {
  let minuteur;
  const echeance = new Promise((resolve) => { minuteur = setTimeout(() => resolve(DEPASSE), delaiMs); });
  return Promise.race([promesse, echeance]).finally(() => clearTimeout(minuteur));
}

export function creerMoteurServeur({ surEtat, surTexteFinal, surMessage, surRelais, journaliser, envoyer, lireReglages }) {
  const machine = creerMachineServeur();
  // Le vocal en cours (null au repos). Chaque rappel (piste accordée, `start`,
  // `stop`, minuteurs) garde SON vocal `s` et ne fait rien si `session !== s` :
  // un appui annulé, une garde expirée ou un retour sur l'app ne peut donc plus
  // être rattrapé par un événement en retard.
  let session = null;
  // Stratégie B : la piste reste ouverte entre deux vocaux.
  let fluxGarde = null;

  // La piste du vocal est rendue : coupée en stratégie A, gardée en B (sauf si on
  // force, par exemple après un micro muet : l'appui suivant repart d'une piste neuve).
  function rendrePiste(s, forcerCoupe) {
    if (!s.flux || (s.strategie !== 'A' && !forcerCoupe)) return;
    couperFlux(s.flux);
    if (fluxGarde === s.flux) fluxGarde = null;
  }

  // Coupe les minuteurs, la mesure d'énergie et l'enregistreur d'un vocal.
  function arreterMesure(s) {
    clearTimeout(s.gardeDemarrage);
    clearTimeout(s.plafond);
    clearInterval(s.intervalle);
    try {
      if (s.source) s.source.disconnect();
    } catch (_erreur) {
      // Déjà déconnecté : sans conséquence.
    }
  }

  // Annule ou abandonne un vocal sans rien envoyer : tout est coupé, le moteur revient au repos.
  function abandonner(s, { forcerCoupe = false } = {}) {
    if (session === s) session = null;
    arreterMesure(s);
    try {
      if (s.enregistreur && s.enregistreur.state !== 'inactive') s.enregistreur.stop();
    } catch (_erreur) {
      // Un enregistreur déjà mort peut lever ici : sans conséquence.
    }
    rendrePiste(s, forcerCoupe);
    machine.terminer();
    surEtat('inactif');
  }

  // Un échec avant ou pendant l'enregistrement : le message s'affiche APRÈS le
  // retour à 'inactif' (le retour à l'inactif efface le message d'état).
  function echouer(s, message, forcerCoupe) {
    if (session !== s) return;
    abandonner(s, { forcerCoupe });
    surMessage(message);
  }

  // Journalise TOUJOURS (même un refus arrivé après une annulation sert au
  // diagnostic), mais ne touche l'écran que si le vocal est encore le courant.
  // Pour un vocal déjà annulé (session périmée) la ligne est `srv:annule:<code>`,
  // jamais `error:…` : l'escalier de Premiers pas passerait en panne pour un geste voulu.
  function echecMicro(s, erreur) {
    console.error('Erreur micro serveur Stovo :', erreur);
    const code = codeErreurMicro(erreur);
    journaliser(evenementErreurMicro(code, session !== s));
    echouer(s, texteErreurMicro(code), true);
  }

  // --- Le cycle d'un vocal ---------------------------------------------------

  function demarrer() {
    const { silenceMs, strategie } = lireReglages();
    const s = { silenceMs, strategie, flux: null, enregistreur: null, morceaux: [], mime: null };
    session = s;
    journaliser('demande-start');
    surEtat('demande');
    // Dans le geste du tap, AVANT toute attente : voir le commentaire de obtenirContexteAudio.
    obtenirContexteAudio();
    acquerirFlux(strategie).then((flux) => pisteAccordee(s, flux), (erreur) => echecMicro(s, erreur));
  }

  // AUCUNE garde de temps sur cette promesse : elle reste en attente tant que
  // l'alerte de permission d'iOS est affichée (couper à 2 s referait D28).
  // `async` sert à ce qu'un appareil sans mediaDevices (TypeError) soit un refus
  // comme un autre, jamais une exception levée dans le geste du tap.
  async function acquerirFlux(strategie) {
    if (strategie === 'B' && fluxVivant(fluxGarde)) return fluxGarde;
    if (fluxGarde) { couperFlux(fluxGarde); fluxGarde = null; }
    return globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
  }

  function pisteAccordee(s, flux) {
    if (session !== s) {
      // Appui annulé, page cachée ou garde expirée pendant l'attente : la piste
      // accordée si tard est coupée aussitôt, sans rien enregistrer (sauf la piste
      // gardée de la stratégie B, qui reste à sa place).
      if (flux !== fluxGarde) couperFlux(flux);
      return;
    }
    s.flux = flux;
    if (s.strategie === 'B') fluxGarde = flux;
    try {
      s.mime = choisirMime((type) => globalThis.MediaRecorder.isTypeSupported(type));
      const options = { audioBitsPerSecond: BITS_PAR_SECONDE };
      if (s.mime) options.mimeType = s.mime;
      // start() sans timeslice : un seul morceau, rendu au stop().
      s.enregistreur = new globalThis.MediaRecorder(flux, options);
      s.enregistreur.ondataavailable = (evenement) => {
        if (evenement.data && evenement.data.size > 0) s.morceaux.push(evenement.data);
      };
      s.enregistreur.onstart = () => enregistrementDemarre(s);
      s.enregistreur.onstop = () => enregistrementArrete(s);
      s.enregistreur.onerror = (evenement) => echecMicro(s, evenement.error);
      // Garde de 2 s sur le seul démarrage de l'enregistreur.
      s.gardeDemarrage = setTimeout(() => {
        journaliser('garde-2s-sans-start');
        echouer(s, MSG_PAS_DEMARRE, true);
      }, GARDE_DEMARRAGE_MS);
      s.enregistreur.start();
    } catch (erreur) {
      echecMicro(s, erreur);
    }
  }

  // L'enregistreur a RÉELLEMENT démarré (son événement `start`, jamais l'obtention de la piste).
  function enregistrementDemarre(s) {
    journaliser('start');
    if (session !== s || !machine.confirmerDemarrage()) return;
    clearTimeout(s.gardeDemarrage);
    s.debutMs = performance.now();
    surEtat('enregistre');
    // Si l'AudioContext ne tourne pas (resume refusé, iOS « interrupted »), l'analyseur
    // lirait des zéros et jetterait un vrai vocal en « muet » : ce vocal-là se passe de
    // détection (voir decisionDetection) et s'arrête par un appui ou au plafond de 30 s.
    const detection = decisionDetection(contexteAudio ? contexteAudio.state : null);
    if (detection.evenement) journaliser(detection.evenement);
    if (detection.detecter) mesurerEnergie(s);
    // Filet de temps réel : 30 s restent le maximum même sans détection ou si la
    // mesure est ralentie (marge d'une seconde quand elle tourne).
    s.plafond = setTimeout(() => decider(s, 'plafond'), detection.plafondMs);
  }

  // Lit l'énergie toutes les 50 ms par setInterval (pas requestAnimationFrame, qui
  // s'arrête écran éteint) et la pousse dans le détecteur. Si le graphe audio ne se
  // monte pas, l'enregistrement continue sans détection : l'appui l'arrête.
  function mesurerEnergie(s) {
    try {
      const analyseur = contexteAudio.createAnalyser();
      s.source = contexteAudio.createMediaStreamSource(s.flux);
      s.source.connect(analyseur);
      const tampon = new Float32Array(analyseur.fftSize);
      const detecteur = creerDetecteurFin({ silenceMs: s.silenceMs });
      s.intervalle = setInterval(() => {
        analyseur.getFloatTimeDomainData(tampon);
        const decision = detecteur.trame(energieRms(tampon));
        if (decision !== null) decider(s, decision.issue);
      }, TRAME_MS);
    } catch (erreur) {
      console.error('Mesure du silence Stovo indisponible :', erreur);
    }
  }

  // Une issue de la détection : fin et plafond arrêtent ET envoient ; rien-entendu
  // et muet arrêtent sans rien envoyer (zéro coût).
  function decider(s, issue) {
    if (session !== s) return;
    if (issue === 'fin' || issue === 'plafond') {
      if (machine.finDetectee()) arreterEtEnvoyer(s, issue === 'fin' ? 'silence' : '30 s');
      return;
    }
    journaliser(issue === 'muet' ? 'srv:muet' : 'srv:rien');
    echouer(s, issue === 'muet' ? MSG_MICRO_MUET : MSG_RIEN_ENTENDU, issue === 'muet');
  }

  // Fin de l'enregistrement : le chronomètre de la latence part ICI (condition 7c
  // corrigée : de la fin de l'enregistrement au texte posé dans le champ).
  function arreterEtEnvoyer(s, issue) {
    s.issue = issue;
    s.finMs = performance.now();
    s.dureeMs = Math.round(s.finMs - s.debutMs);
    arreterMesure(s);
    surEtat('transcrit');
    try {
      s.enregistreur.stop();
    } catch (erreur) {
      // Sans ce filet, l'état resterait 'transcrit' pour toujours (aucun stop, donc aucun texte).
      echecMicro(s, erreur);
    }
  }

  async function enregistrementArrete(s) {
    if (session !== s) return;
    if (machine.etat() !== 'transcrit') {
      // Le système a coupé l'enregistrement de lui-même (appel entrant, micro repris
      // par une autre app) : rien à envoyer, le moteur revient au repos et le dit.
      journaliser('srv:arret-inattendu');
      echouer(s, texteErreurMicro('audio-capture'), true);
      return;
    }
    rendrePiste(s, false);
    const type = s.enregistreur.mimeType || s.mime || '';
    const blob = new Blob(s.morceaux, { type });
    const lecture = await envoyerSon(s, blob);
    session = null;
    machine.terminer();
    surEtat('inactif');
    if (lecture.type === 'texte') {
      surTexteFinal(lecture.texte);
      journaliser(formaterLigneVocal({
        latenceMs: performance.now() - s.finMs,
        dureeMs: s.dureeMs,
        octets: blob.size,
        type,
        issue: s.issue,
      }));
    } else if (lecture.type === 'rien') {
      journaliser('srv:rien');
      surMessage(lecture.message);
    } else {
      journaliser(evenementJournalRelais(lecture.cause));
      surRelais(lecture.cause, lecture.message);
    }
  }

  // Envoie le son et rend toujours une lecture interprétée, jamais une exception.
  // Garde de 15 s sur l'ensemble : au-delà, relais « delai ».
  async function envoyerSon(s, blob) {
    try {
      const envoi = blobEnBase64(blob).then((base64) =>
        envoyer(corpsTranscrire(base64, blob.type || s.mime, s.dureeMs))
      );
      const reponse = await avecDelai(envoi, DELAI_ENVOI_MS);
      return reponse === DEPASSE ? relaisSansReponse('delai') : interpreterReponseTranscrire(reponse);
    } catch (erreur) {
      console.error('Envoi du son Stovo en échec :', erreur);
      return interpreterReponseTranscrire(null);
    }
  }

  return {
    etat: () => machine.etat(),

    // Un appui sur le bouton micro (à appeler DANS le geste du tap).
    appui() {
      const action = machine.appui();
      if (action === 'demarrer') demarrer();
      else if (action === 'annuler') abandonner(session);
      else if (action === 'arreter') arreterEtEnvoyer(session, 'appui');
    },

    // Coupe un vocal en attente de démarrage ou en cours d'enregistrement, sans
    // envoi ni message. Sans effet pendant la transcription : le texte, lui,
    // finit d'arriver.
    annuler() {
      const etat = machine.etat();
      if ((etat === 'demande' || etat === 'enregistre') && session) abandonner(session);
    },

    // Rend la piste gardée de la stratégie B (page cachée, pagehide).
    liberer() {
      if (fluxGarde) couperFlux(fluxGarde);
      fluxGarde = null;
    },
  };
}

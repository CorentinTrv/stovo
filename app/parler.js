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
import { creerModeSortie } from './sortie.js';
import { creerReducteurPhoto } from './photo.js';
import { getSessionActuelle } from './auth.js';
// Lot A11-2 (23/08/2026) : la logique PURE de cet ecran (zero DOM, zero
// reseau) vit desormais dans parler_logique.js, testee au banc
// parler_logique_test.js. Ce fichier ne fait plus que la CABLER au vrai DOM
// et au vrai Supabase, comme reception.js/sortie.js le font deja pour leur
// propre logique.
import {
  calculerPliChoix,
  calculerVisibiliteAutresDemarrer,
  choisirBranche,
  corpsChoix,
  corpsConfirmation,
  corpsDeclaration,
  corpsErreurExploitable,
  corpsImport,
  creerVerrouDeMode,
  extraireBase64DepuisDataUrl,
  interpreterReponsePwaApi,
  lireCorpsReponse,
  normaliserChoix,
  texteErreurMicro,
  texteRefusVerrou,
  toucheEnvoie,
} from './parler_logique.js';

const zoneReponse = document.getElementById('parler-reponse');
const zoneChoix = document.getElementById('parler-choix');
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
// Le libellé de #btn-import vit dans un <span> depuis le lot "monde clair,
// suite" (23/08/2026) : le bouton porte aussi une icône SVG (index.html), un
// textContent posé sur le bouton ENTIER l'effacerait au premier import.
const libelleImport = btnImport.querySelector('.btn-libelle');

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
//
// Lot A11-2 : la machine d'état (qui détient le verrou) vit dans
// creerVerrouDeMode() (parler_logique.js, testée isolément). Ici on ne garde
// que le câblage DOM : quels boutons masquer/montrer, quel message afficher.
const verrou = creerVerrouDeMode(); // null | 'reception' | 'inventaire' | 'sortie'

const boutonsDemarrer = {
  reception: document.getElementById('btn-reception-demarrer'),
  inventaire: document.getElementById('btn-inventaire-demarrer'),
  sortie: document.getElementById('btn-sortie-demarrer'),
};

// Masque les boutons « Démarrer » de tous les modes SAUF celui passé (null =
// tous visibles). Chaque mode continue de masquer le sien dans son propre
// entrer()/demarrer() : ici on ne s'occupe que des autres.
function majBoutonsDemarrer(modeActif) {
  const visibilite = calculerVisibiliteAutresDemarrer(Object.keys(boutonsDemarrer), modeActif);
  for (const [nom, hidden] of Object.entries(visibilite)) {
    const bouton = boutonsDemarrer[nom];
    if (bouton) bouton.hidden = hidden;
  }
}

// Renvoie false si un AUTRE mode détient déjà le verrou, et explique alors le
// refus à l'écran : c'est l'arbitre qui sait nommer le mode bloquant, un module
// de mode ne connaît pas les autres. L'appelant n'a plus qu'à renoncer sans rien
// changer à l'affichage.
// `silencieux` sert aux bannières de reprise, jouées automatiquement au
// chargement : un refus y est normal (deux résidus de session peuvent coexister,
// c'est justement le défaut qu'on répare) et afficher un reproche alors que
// l'utilisateur n'a rien demandé serait déroutant.
function prendreVerrou(nom, silencieux) {
  const resultat = verrou.prendre(nom);
  if (!resultat.autorise) {
    if (!silencieux) {
      zoneReponse.textContent = texteRefusVerrou(resultat.modeBloquant);
    }
    return false;
  }
  majBoutonsDemarrer(nom);
  return true;
}

// Le paramètre `nom` n'est pas décoratif : sans lui, un mode pourrait libérer le
// verrou d'un autre (par exemple une reprise refusée qui appellerait quand même
// son nettoyage). On ne libère que si on est bien le détenteur.
function rendreVerrou(nom) {
  if (verrou.rendre(nom)) majBoutonsDemarrer(null);
}

// --- Lot A10-6 (23/08/2026) : zone de choix numéroté partagée ---
// « Tu veux dire 1) Pâtes 500 g ou 2) Pâtes complètes ? » : un bouton par
// candidat (pastille numéro + nom), un dernier bouton « Aucun de ceux-là »,
// empilés, toute la largeur. C'est le SEUL endroit où ces boutons sont
// construits : la même fonction est injectée telle quelle dans reception.js
// et sortie.js (voir plus bas), pour que le rendu ne vive qu'à un seul
// endroit (consigne §2.3 du lot A10-6).
//
// `surChoix` est appelé avec le numéro cliqué, `surAucun` sans argument :
// c'est l'appelant (déclaration ici, reception.js/sortie.js plus bas) qui
// sait quoi en faire. Le nom du candidat vient du serveur : jamais
// d'innerHTML, uniquement des nœuds créés via createElement + textContent,
// comme le reste de l'app.
//
// Poli au lot A10-6b (23/08/2026, après critique Impeccable) : pastille
// numéro (au lieu d'un « 1) » en tête de texte), état pressé pendant l'appel,
// bouton « Aucun de ceux-là », pli du menu pendant un choix en déclaration,
// focus clavier qui suit la réponse. Rien de tout ça ne change ce qui est
// envoyé au serveur ni les messages affichés.
//
// `choixEnCours` est un garde de MODULE (pas par rendu) : tant qu'un clic
// (candidat ou « Aucun ») attend sa réponse, tout autre clic dans la zone est
// ignoré, quel que soit le bouton visé.
let choixEnCours = false;

// `focusVenaitDuChoix` (corrigé après relecture du Jarvis, 23/08/2026) : vrai
// si le clic qui a déclenché l'appel en cours avait le focus dans
// #parler-choix. Consommé (et remis à faux) par afficherReponse, plus bas :
// c'est ce qui empêche Envoyer/Oui/Non/import de déplacer le focus par
// erreur (eux ne passent jamais par gererClicChoix, donc ce booléen reste à
// sa valeur précédente, presque toujours faux, pour ces chemins-là).
let focusVenaitDuChoix = false;

// Un clic dans #parler-choix (candidat ou « Aucun de ceux-là ») : anti
// double-clic partagé, et état pressé optionnel (`avecEtatPresse`, réservé
// aux candidats, « Aucun » ne propose rien, il n'y a rien à montrer « en
// train d'être dit »). Le bouton cliqué reste actif (jamais `disabled`) pour
// ne pas perdre le focus ; tous les AUTRES boutons de la zone se désactivent
// le temps de l'appel (§1.2 et §1.4 de la consigne).
//
// Sur un échec (réseau, ou l'action qui lève), rien ne rappelle
// `afficherChoix` : le `finally` réactive les boutons ENCORE rattachés à
// `#parler-choix` et retire l'état pressé. Sur un succès, `afficherChoix` a
// déjà été rappelée entre-temps (par `afficherReponse` en déclaration, ou par
// `afficherChoixDepuisPayload` en réception/sortie) : ces nœuds sont détachés,
// la boucle ne fait rien, sans risque.
//
// Corrigé après relecture du Jarvis (23/08/2026) : mémorise ici, AVANT tout
// le reste, si le focus était dans #parler-choix au moment du clic
// (`focusVenaitDuChoix`, booléen de MODULE, consommé par afficherReponse
// plus bas). Sans cette restriction, `afficherReponse` déplaçait le focus
// après N'IMPORTE QUELLE réponse en attente (y compris un simple Envoyer,
// où le champ/bouton désactivés font tomber le focus sur `body` pendant
// l'appel) : un second Entrée par réflexe aurait alors activé Oui, ce qui
// n'arrivait jamais avant ce lot.
async function gererClicChoix(boutonClique, action, avecEtatPresse) {
  if (choixEnCours) return;
  choixEnCours = true;
  focusVenaitDuChoix = zoneChoix.contains(document.activeElement);
  if (avecEtatPresse) {
    boutonClique.classList.add('est-choisi');
    boutonClique.setAttribute('aria-pressed', 'true');
  }
  for (const b of zoneChoix.children) {
    if (b !== boutonClique) b.disabled = true;
  }
  try {
    await action();
  } finally {
    for (const b of zoneChoix.children) {
      b.classList.remove('est-choisi');
      b.removeAttribute('aria-pressed');
      b.disabled = false;
    }
    choixEnCours = false;
  }
}

// Pli d'écran (lot A10-6b, §1.3) : EN CONTEXTE DÉCLARATION SEULEMENT (aucun
// mode de session ouvert), le menu (bouton Importer + les trois Démarrer) se
// replie tant qu'un choix occupe l'écran, pour lui laisser toute la place.
// En réception ou en sortie, le mode gère DÉJÀ son propre écran (il masque
// déjà l'import et les Démarrer à l'entrée, voir reception.js/sortie.js) :
// on sort tout de suite sans rien toucher, sinon ces boutons REVIENDRAIENT à
// la fin d'un choix EN SESSION, ce qui serait un bug.
function appliquerPliChoix(choixVisible) {
  const modeCourant = verrou.modeCourant();
  if (modeCourant !== null) return;
  const { masquerMenu } = calculerPliChoix(choixVisible, modeCourant);
  btnImport.hidden = masquerMenu;
  for (const bouton of Object.values(boutonsDemarrer)) {
    if (bouton) bouton.hidden = masquerMenu;
  }
}

// Reprise après relecture du Jarvis (23/08/2026) : `afficherChoix` est le
// SEUL point de rendu pour les trois contextes (déclaration directement,
// réception/sortie par injection) — c'est donc aussi le seul point où filtrer
// via `normaliserChoix` (reception.js/sortie.js relayaient `payload.choix`
// brut jusqu'ici, un candidat sans nom y aurait affiché un bouton
// « undefined »).
function afficherChoix(candidats, surChoix, surAucun) {
  zoneChoix.innerHTML = '';
  const liste = normaliserChoix(candidats);
  const choixVisible = liste.length > 0;
  appliquerPliChoix(choixVisible);
  if (!choixVisible) {
    zoneChoix.hidden = true;
    return;
  }
  for (const candidat of liste) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'btn-choix';
    const numero = document.createElement('span');
    numero.className = 'btn-choix__num';
    numero.textContent = String(candidat.numero);
    const nom = document.createElement('span');
    nom.className = 'btn-choix__nom';
    // Pas d'espace en tête (polish A10-6b) : l'écart visuel entre la pastille
    // et le nom vient du `gap` du flex (styles.css), pas d'un caractère.
    nom.textContent = candidat.nom;
    bouton.appendChild(numero);
    bouton.appendChild(nom);
    bouton.addEventListener('click', () => gererClicChoix(bouton, () => surChoix(candidat.numero), true));
    zoneChoix.appendChild(bouton);
  }
  // « Aucun de ceux-là » (lot A10-6b, §1.4) : dernier de la zone, se cache
  // avec elle. Pas de rouge, refuser n'est pas une erreur. Rendu seulement si
  // l'appelant fournit un vrai rappel (`surAucun`) : les trois contextes
  // (déclaration, réception, sortie) le fournissent toujours en usage réel,
  // mais un appelant de test ou de démonstration qui omettrait ce troisième
  // paramètre ne doit pas se retrouver avec un bouton dont le clic plante.
  if (typeof surAucun === 'function') {
    const boutonAucun = document.createElement('button');
    boutonAucun.type = 'button';
    boutonAucun.className = 'btn-choix-aucun';
    boutonAucun.textContent = 'Aucun de ceux-là';
    boutonAucun.addEventListener('click', () => gererClicChoix(boutonAucun, surAucun, false));
    zoneChoix.appendChild(boutonAucun);
  }
  zoneChoix.hidden = false;
}

// Réponse à un choix posé en DÉCLARATION (mono-coup, pas dans une session
// réception/sortie) : passe par le même transport que Oui/Non.
async function envoyerChoixDeclaration(numero) {
  await appelerPwaApi(corpsChoix(numero), []);
}

// « Aucun de ceux-là » en DÉCLARATION (lot A10-6b, §1.4) : envoie EXACTEMENT
// ce que taper « non » dans le champ enverrait dans ce contexte.
async function envoyerAucunDeclaration() {
  await appelerPwaApi(corpsDeclaration('non'), []);
}

// Affiche le message renvoyé par pwa-api, montre/cache les boutons Oui/Non
// selon `enAttente`, et rend/masque la zone de choix selon `choix`. Les deux
// zones sont mutuellement exclusives : interpreterReponsePwaApi garantit déjà
// qu'`enAttente` est faux si `choix` est non vide, ici on se contente de
// suivre les deux valeurs telles quelles (§2.2 de la consigne A10-6).
//
// Focus clavier (lot A10-6b, §1.5, corrigé après relecture du Jarvis) :
// SEULEMENT si `focusVenaitDuChoix` est vrai (le clic qui a mené à cette
// réponse avait le focus dans #parler-choix), on le redonne à l'action
// principale de l'écran qui suit : Oui si une confirmation est posée, sinon
// le premier candidat si un nouveau choix est posé, sinon rien. JAMAIS le
// champ texte : sur iPhone, lui donner le focus ouvrirait le clavier. Le
// booléen est consommé (remis à faux) dès qu'on entre dans ce cas, pour ne
// jamais rejouer ce déplacement sur une réponse ultérieure sans rapport.
function afficherReponse(texte, enAttente, choix) {
  zoneReponse.textContent = texte;
  zoneConfirmation.hidden = !enAttente;
  afficherChoix(choix, envoyerChoixDeclaration, envoyerAucunDeclaration);
  if (focusVenaitDuChoix) {
    focusVenaitDuChoix = false;
    if (enAttente) {
      btnOui.focus();
    } else if (!zoneChoix.hidden) {
      const premier = zoneChoix.querySelector('.btn-choix');
      if (premier) premier.focus();
    }
  }
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
      afficherReponse('Désolé, une erreur est survenue. Réessaie dans quelques instants.', false, []);
      return;
    }
    const { texte, enAttente, choix } = interpreterReponsePwaApi(data);
    afficherReponse(texte, enAttente, choix);
  } finally {
    controlesADesactiver.forEach((element) => { element.disabled = false; });
  }
}

// --- Saisie multiligne (lot du 23/08/2026) ---
// Le champ de Parler est un <textarea> (index.html) : il montre toute la
// phrase au lieu de la faire défiler hors du cadre. Mais Entrée doit ENVOYER
// comme avant (toucheEnvoie, parler_logique.js) : sur iPhone, la touche
// « retour » du clavier est le seul bouton d'envoi possible. On intercepte le
// keydown AVANT que le navigateur insère le saut de ligne, puis on relance la
// soumission par requestSubmit() (et non submit()) pour repasser par
// l'écouteur `submit` existant et sa validation (texte vide notamment).
champTexte.addEventListener('keydown', (evenement) => {
  if (!toucheEnvoie(evenement)) return;
  evenement.preventDefault();
  formParler.requestSubmit();
});

// Fait grandir le cadre avec le texte : 2 lignes au repos, 5 au maximum, le
// CSS (min-height/max-height) plafonne au-delà avec un défilement interne.
// Appelée à chaque frappe (événement `input`) et chaque fois que le champ est
// rempli ou vidé depuis l'extérieur (micro, Aide, bandeau de pilotage,
// soumission du formulaire), pour que le cadre suive toujours ce qu'il
// affiche réellement, y compris quand il retombe à 2 lignes après l'envoi.
//
// Correctif après relecture du Jarvis (23/08/2026) : styles.css pose
// `box-sizing: border-box` sur tout (règle `*`, l.61), donc la hauteur posée
// via `style.height` inclut la bordure. Mais `scrollHeight` ne mesure QUE le
// contenu + le padding, jamais la bordure. Sans correction, le cadre était
// posé 2 px trop bas (1 px de bordure haut + 1 px bas manquants) : le
// contenu débordait légèrement, avec un ascenseur interne parfois visible
// pour rien. `offsetHeight - clientHeight` donne exactement cet écart
// (bordure haut + bas ; lu juste après avoir remis `height: auto`, donc sur
// la hauteur naturelle du contenu, avant de reposer une valeur en pixels).
function ajusterHauteurChamp() {
  champTexte.style.height = 'auto';
  const bordures = champTexte.offsetHeight - champTexte.clientHeight;
  champTexte.style.height = (champTexte.scrollHeight + bordures) + 'px';
}
champTexte.addEventListener('input', ajusterHauteurChamp);

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
  // Lot A11-2 : la DÉCISION (quelle branche choisir) vit maintenant dans
  // choisirBranche (parler_logique.js, testée isolément). Elle lit le verrou
  // pour choisir la BRANCHE candidate, mais chaque mode garde son propre état
  // interne, qui reste la vérité de « suis-je dans le panneau ». Les deux ne
  // disent pas la même chose, et c'est normal : une bannière de reprise prend
  // le verrou alors que le mode n'est pas encore ouvert (on n'a pas cliqué
  // « Reprendre »). Dans ce cas la phrase doit partir en saisie normale, avec
  // son rempart Oui/Non. On ne libère PAS le verrou au passage : la bannière
  // est toujours à l'écran et le résidu existe toujours.
  const branche = choisirBranche(verrou.modeCourant(), {
    reception: modeReception.estEnReception(),
    inventaire: modeInventaire.estEnInventaire(),
    sortie: modeSortie.estEnSortie(),
  });

  switch (branche) {
    case 'reception':
      btnEnvoyer.textContent = 'Ajout…';
      await modeReception.ajouterLigne(texte);
      btnEnvoyer.textContent = 'Ajouter';
      // reception.js vide lui-même le champ (elements.champ.value = '') si
      // l'ajout a abouti : reception.js/sortie.js sont hors du périmètre de
      // ce lot, donc l'ajustement de hauteur se fait ici, après coup, plutôt
      // que dans ces fichiers. Idempotent : recalcule sur la valeur actuelle,
      // qu'elle ait été vidée ou non.
      ajusterHauteurChamp();
      return;

    // Lot CM-C (25/07/2026) : en inventaire guidé, la phrase est le CHIFFRE
    // compté du produit affiché à l'écran, pas une déclaration.
    case 'inventaire':
      btnEnvoyer.textContent = 'Compte…';
      await modeInventaire.compter(texte);
      btnEnvoyer.textContent = 'Compter';
      champTexte.value = '';
      ajusterHauteurChamp();
      return;

    case 'sortie':
      btnEnvoyer.textContent = 'Ajout…';
      await modeSortie.ajouterLigne(texte);
      btnEnvoyer.textContent = 'Ajouter';
      // Même remarque que la réception ci-dessus : sortie.js vide le champ
      // lui-même, l'ajustement se fait ici.
      ajusterHauteurChamp();
      return;

    default:
      break;
  }

  btnEnvoyer.textContent = 'Envoi…';
  await appelerPwaApi(corpsDeclaration(texte), [btnEnvoyer, champTexte]);
  btnEnvoyer.textContent = 'Envoyer';
  champTexte.value = '';
  ajusterHauteurChamp();
});

// --- Confirmation Oui / Non ---
btnOui.addEventListener('click', async () => {
  await appelerPwaApi(corpsConfirmation('oui'), [btnOui, btnNon]);
});

btnNon.addEventListener('click', async () => {
  await appelerPwaApi(corpsConfirmation('non'), [btnOui, btnNon]);
});

// --- Mode réception multi-produits (N1, lots FR-4 + FR-5) ---
// La logique vit dans reception.js (module isolé, testable au banc offline). Ici
// on lui injecte le vrai Supabase et le vrai DOM. Les kinds reception-* renvoient
// { reply, session } (et non { reply, enAttente }) : on lit `session` pour rendre
// la liste vivante.
//
// Lot A11-2 : lireCorpsReponse vit désormais dans parler_logique.js (importée
// en haut de ce fichier). pwa-api répond 400 sur un corps de kind reception-*
// malformé, MAIS renvoie quand même { reply, session } (choix §3.4/§3.5 du
// rapport API-3) : supabase-js expose alors la Response dans error.context,
// il faut la lire au lieu de traiter ça comme un échec sec.

// Appel API pour les kinds reception-* : renvoie { reply, session } ou null (null
// = vrai échec réseau/serveur sans corps exploitable). Aucun effet DOM ici : c'est
// reception.js qui décide quoi afficher.
async function appelerReceptionApi(corps) {
  try {
    const { data, error } = await supabase.functions.invoke('pwa-api', { body: corps });
    if (error) {
      const corpsErreur = await lireCorpsReponse(error);
      if (corpsErreurExploitable(corpsErreur)) return corpsErreur;
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
    // Lot P-3 : photo du bon de livraison (dans le panneau de réception).
    boutonPhoto: document.getElementById('btn-photo-bl'),
    champPhoto: document.getElementById('champ-photo-bl'),
    lecture: document.getElementById('reception-lecture'),
  },
  appeler: appelerReceptionApi,
  confirmer: (message) => globalThis.confirm(message),
  afficher: (texte) => { zoneReponse.textContent = texte; },
  doc: document,
  // Lot S-0 : exclusivité des modes (voir le bloc verrou en haut de ce fichier).
  prendreVerrou,
  rendreVerrou,
  // Lot A10-6 : même rendu de boutons de choix que la déclaration (voir plus
  // haut) — un seul endroit qui les construit, injecté ici comme le reste.
  afficherChoix,
  // Lot P-3 : réduction de la photo côté navigateur (~2000 px, JPEG, EXIF
  // respecté) avant l'envoi. Le module photo.js ne connaît ni Supabase ni le
  // reste de l'app : on lui laisse ses dépendances navigateur par défaut.
  reduirePhoto: creerReducteurPhoto(),
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

// --- Mode sortie de stock multi-produits (chantier S, lot S-5) ---
// Même montage que la réception et l'inventaire : la logique vit dans
// sortie.js (module isolé, testable au banc offline). Ici on lui injecte le
// vrai Supabase et le vrai DOM. Les kinds sortie-* utilisent le même
// transport que reception-*/inventaire-* (même lecture du corps sur un 400)
// et renvoient { reply, sortie } (et non { reply, session }).
const modeSortie = creerModeSortie({
  elements: {
    demarrer: document.getElementById('btn-sortie-demarrer'),
    panneau: document.getElementById('sortie-panneau'),
    titreTotal: document.getElementById('sortie-total'),
    liste: document.getElementById('sortie-liste'),
    inconnus: document.getElementById('sortie-inconnus'),
    actions: document.getElementById('sortie-actions'),
    valider: document.getElementById('btn-sortie-valider'),
    abandon: document.getElementById('btn-sortie-abandon'),
    reprise: document.getElementById('sortie-reprise'),
    repriseTexte: document.getElementById('sortie-reprise-texte'),
    reprendre: document.getElementById('btn-sortie-reprendre'),
    repriseAbandon: document.getElementById('btn-sortie-reprise-abandon'),
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
  // Lot A10-6 : même rendu de boutons de choix que la déclaration et la
  // réception (voir plus haut).
  afficherChoix,
});

// =========================================================================
// Lot "sortie de session propre" (25/08/2026)
// =========================================================================
// Appelée par ecran_session.js (afficherLogin) à la déconnexion, AVANT que
// #app-shell ne redevienne visible pour un éventuel prochain compte. Vide
// tout ce que parler.js affiche en propre (bulle de réponse, zone de choix
// numéroté partagée par la déclaration ET les 3 modes) puis délègue à chaque
// mode le nettoyage de ses propres résidus (liste vivante, bannière de
// reprise) via `reinitialiser()` — ce module ne connaît pas leurs éléments
// DOM internes, seul reception.js/sortie.js/inventaire.js les possède.
//
// Texte de #parler-reponse identique à l'état initial d'index.html (message
// d'accueil), jamais un texte vide : c'est l'écran "Parler" qu'un prochain
// compte verra en premier, il doit inviter à parler, pas rester muet.
const TEXTE_REPONSE_INITIAL = "Écris ce que tu as fait, par exemple : j'ai reçu 10 pâtes.";

export function viderParler() {
  zoneReponse.textContent = TEXTE_REPONSE_INITIAL;
  zoneConfirmation.hidden = true;
  // Appelés AVANT afficherChoix([], null, null) ci-dessous : chacun libère
  // son verrou s'il le détenait, pour que le calcul du pli du menu
  // (appliquerPliChoix) voie déjà `modeCourant() === null` et rétablisse le
  // bouton Importer + les 3 boutons Démarrer.
  modeReception.reinitialiser();
  modeInventaire.reinitialiser();
  modeSortie.reinitialiser();
  // Vide #parler-choix : couvre le cas d'un choix posé en simple déclaration
  // (aucun mode de session ouvert), que les 3 `reinitialiser()` ci-dessus ne
  // touchent pas.
  afficherChoix([], null);
}

// Reprise : si une réception a été laissée en cours (app fermée en plein milieu),
// on la fait remonter au chargement, une fois la session confirmée (l'appel
// reception-etat exige un JWT valide). Sans session, on ne tente rien.
// Même chose pour un inventaire interrompu (CM-C) et pour une sortie (lot S-5).
getSessionActuelle().then((session) => {
  if (session) {
    modeReception.verifierReprise();
    modeInventaire.verifierReprise();
    modeSortie.verifierReprise();
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
// Lot A11-2 : le découpage de la data URL vit dans extraireBase64DepuisDataUrl
// (parler_logique.js, testée isolément) ; FileReader lui-même reste ici, ce
// n'est pas une API séparable du navigateur.
function lireFichierEnBase64(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(extraireBase64DepuisDataUrl(lecteur.result));
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
    libelleImport.textContent = 'Import en cours…';
    await appelerPwaApi(corpsImport(fichier.name, contenuBase64), [btnImport]);
  } catch (erreur) {
    console.error('Erreur lecture fichier import Stovo :', erreur);
    afficherReponse("Je n'ai pas pu lire ce fichier. Réessaie.", false, []);
  } finally {
    libelleImport.textContent = 'Importer un catalogue (.xlsx)';
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
// Speech API pour la liste des valeurs possibles de event.error). Lot A11-2 :
// la table et le repli vivent dans texteErreurMicro (parler_logique.js).

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
    ajusterHauteurChamp();
  };

  reconnaissance.onerror = (evenement) => {
    console.error('Erreur reconnaissance vocale Stovo :', evenement.error);
    erreurEnCours = true;
    afficherEtatMicro(texteErreurMicro(evenement.error));
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

// --- Aide aux captures d'écran locales (lot A10-6, 23/08/2026) ---
// Expose le VRAI rendu de l'app sur window, pour que les captures du Codeur
// forcent un état à l'écran sans jamais appeler pwa-api (afficherReponse et
// afficherChoix ne font que du rendu DOM, l'écriture reste entièrement
// derrière l'appel réseau de appelerPwaApi, jamais déclenché ici). Actif
// UNIQUEMENT en local (localhost/127.0.0.1) : mort en production, où
// `location.hostname` vaut 'corentintrv.github.io'.
if (globalThis.location && (globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1')) {
  globalThis.__stovoDebug = { afficherReponse, afficherChoix };
}

// STOVO — logique pure de la démo en libre-service (lot L6a, 07/10/2026)
// ====================================================================
// Module PUR : aucun DOM, aucun Supabase, aucune horloge lue (la date est
// toujours passée en paramètre), même famille que premiers_pas_logique.js et
// hors_ligne_logique.js. Il décide, il n'affiche rien : le câblage DOM vit
// dans demo.js, l'enveloppe réseau (signInAnonymously) dans auth.js.
//
// Le contexte (plan du 05/10/2026, points 4 et 8) : la démo vit dans la même
// PWA, à stovo.fr/app/. Un visiteur arrive par un lien `?demo`, ouvre un
// compte anonyme d'un clic, voit une épicerie déjà remplie pendant 7 jours,
// puis tout est effacé. Ce module répond aux questions que se pose l'app :
// quel écran au démarrage, combien de jours restent, quel message pour tel
// refus, quel mail pour continuer.
//
// Ce que ce module ne sait pas : la durée réelle des démos. Elle vit dans la
// table verrouillée reglages_demo, que le navigateur ne peut pas lire ; la
// constante ci-dessous (7) en est la copie. Si Corentin change duree_jours en
// base, le serveur refuse la démo à la bonne date (message de fin) alors que
// le bandeau compterait encore sur 7 jours : à garder alignées.

import { DESTINATAIRE_CONTACT } from './contact.js';
import {
  AIDE_DEMO_LIMITES,
  AIDE_DEMO_LIMITES_TITRE,
  MSG_DEMO_COMPLETE,
  MSG_DEMO_FERMEE,
  MSG_DEMO_FONCTION_GRISEE,
  MSG_DEMO_LANCEMENT_ECHEC,
  MSG_DEMO_RESEAU_PARTAGE,
  TEXTE_BANDEAU,
  TEXTE_BANDEAU_DERNIER_JOUR,
  TEXTE_MAIL_CORPS,
  TEXTE_MAIL_SUJET,
} from './demo_textes.js';

export const DUREE_DEMO_JOURS = 7;
const JOUR_MS = 86_400_000;

// Liste fermée des étiquettes ?depuis=. Le trigger côté base refait le même
// filtre (le contenu de user_metadata est écrit par le navigateur, jamais
// digne de confiance) : celui-ci évite seulement d'envoyer n'importe quoi.
const ORIGINES = ['vitrine', 'salon', 'linkedin'];

// Alphabet du code DEMO-XXXX : celui de creer_demo (migration demo-1), sans I,
// O, 0 ni 1 que l'on confond à la lecture.
const FORME_CODE = /^DEMO-[A-HJ-NP-Z2-9]{4}$/;

// Lit les paramètres d'une adresse complète ("https://.../app/?demo#x") ou de
// la seule chaîne de recherche ("?demo"). `new URL` sépare proprement le
// fragment (#) ; une entrée qui n'est pas une chaîne, ou que même cette
// lecture refuse, rend `null` : la démo n'est alors jamais demandée.
function lireParametres(adresse) {
  if (typeof adresse !== 'string') return null;
  try {
    return new URL(adresse, 'https://stovo.invalid/').searchParams;
  } catch (_e) {
    return null;
  }
}

// Origine du visiteur, pour les statistiques : `vitrine`, `salon`,
// `linkedin`, sinon `autre`. Comparaison EXACTE avec la liste (ni casse ni
// espaces tolérés, un lien mal écrit finit en `autre` et Corentin le voit).
export function filtrerDepuis(valeur) {
  return ORIGINES.includes(valeur) ? valeur : 'autre';
}

// Lit l'étiquette dans l'adresse. Quand le paramètre est répété, seul le
// premier compte.
export function lireDepuis(adresse) {
  return filtrerDepuis(lireParametres(adresse)?.get('depuis'));
}

// La démo est-elle demandée par l'adresse ? Seule la PRÉSENCE du paramètre
// `demo` compte (`?demo`, `?demo=1`...). Un nom voisin (`?demonstration`) ou
// le mot dans le chemin ne la demande pas.
export function urlDemandeDemo(adresse) {
  const parametres = lireParametres(adresse);
  return parametres !== null && parametres.has('demo');
}

export function estCodeDemo(valeur) {
  return typeof valeur === 'string' && FORME_CODE.test(valeur);
}

// Cette session est-elle celle d'une démo ? Deux signes, au choix : le jeton
// porte `is_anonymous` (le vrai booléen true, une chaîne ne suffit pas), ou
// une ligne de la table demos est lisible (le cas d'une démo convertie en
// compte permanent, alerte A2 du plan : elle garde sa ligne et reste une
// démo). Sans session, jamais une démo.
// La branche « ligne présente » ne sert aujourd'hui qu'au serveur et à l'avenir :
// le glu (demo.js) ne lit la ligne que pour une session anonyme.
export function estDemo(session, ligneDemo) {
  if (!session) return false;
  if (session.user?.is_anonymous === true) return true;
  return estCodeDemo(ligneDemo?.code);
}

// `creeLe` et `maintenant` : texte ISO (PostgREST), Date ou millisecondes.
function enMillisecondes(valeur) {
  if (valeur instanceof Date) return valeur.getTime();
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null;
  if (typeof valeur === 'string' && valeur.trim() !== '') {
    const t = Date.parse(valeur);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

// Jours restants d'une démo, arrondis VERS LE HAUT : 6 j 1 h écoulés laissent
// encore "1 jour", on ne dit jamais "0" tant qu'il reste une minute. 0 veut
// dire expirée, avec la même frontière que le serveur (etat_demo : expirée
// dès `now() >= cree_le + durée`). Plafonné à la durée si l'horloge de
// l'appareil retarde (création "dans le futur"). `null` si une date est
// illisible : l'appelant ne devine jamais un nombre.
export function joursRestants(creeLe, maintenant, duree = DUREE_DEMO_JOURS) {
  const debut = enMillisecondes(creeLe);
  const maintenantMs = enMillisecondes(maintenant);
  if (debut === null || maintenantMs === null) return null;
  const jours = Number.isFinite(duree) && duree > 0 ? duree : DUREE_DEMO_JOURS;
  const restant = Math.ceil((debut + jours * JOUR_MS - maintenantMs) / JOUR_MS);
  return Math.min(jours, Math.max(0, restant));
}

// Quel écran au démarrage : 'app', 'connexion', 'lancement' ou 'fin'.
//
//   - Avec une session, on reste dans son compte : un testeur qui ouvre
//     ?demo ne voit jamais l'écran de lancement. Seule une démo EXPIRÉE
//     mène à la fin (le drapeau `expiree` ne vaut rien pour un testeur).
//   - Sans session, le marqueur local « démo vue » passe avant ?demo : une
//     démo purgée ne se rouvre pas d'un clic (décision 2 du 05/10), et sans
//     ce marqueur le visiteur retomberait sur l'écran de connexion, ce qui
//     serait faux. Vider les données du navigateur reste possible, ce n'est
//     pas une barricade.
//   - Une démo purgée la nuit laisse un jeton encore valide : si la lecture de
//     sa ligne a RÉUSSI et ne rend rien (`ligneAbsente`), c'est la fin, comme une
//     démo expirée. Une lecture en ÉCHEC (réseau) ne pose jamais `ligneAbsente` :
//     on ouvre l'app, le serveur garde la porte (choix le plus prudent, une panne
//     ne doit pas faire croire à un visiteur que sa démo est effacée).
export function deciderEcranDemarrage(etat) {
  const { session, estDemo: demo, expiree, ligneAbsente, urlDemandeDemo: demandee, marqueurDemoVue } = etat || {};
  if (session) {
    return demo === true && (expiree === true || ligneAbsente === true) ? 'fin' : 'app';
  }
  if (marqueurDemoVue === true) return 'fin';
  if (demandee === true) return 'lancement';
  return 'connexion';
}

// Traduit le refus de `signInAnonymously` en un emplacement de message.
// Rend { cle, texte } ; `cle` est l'identifiant stable ('complete',
// 'fermee', 'reseau_partage', 'generique'), `texte` la constante de
// demo_textes.js.
//
// Fait établi sur le bac (épreuve des portes, 06/10/2026) : pour un refus du
// hook, supabase-js lève une AuthApiError de statut 400 dont `code` vaut
// "unknown" ; c'est `message` qui porte DEMO_COMPLETE ou DEMO_FERMEE. La
// limite par adresse IP, elle, est un 429 (code over_request_rate_limit).
// On lit donc le message d'abord, le statut ensuite. Tout le reste (dont
// INSCRIPTION_FERMEE, que le hook ne peut renvoyer qu'à un non-anonyme, et
// une panne réseau) mène au message générique : jamais une erreur technique
// brute à l'écran, jamais d'exception.
export function traduireRefusLancement(erreur) {
  const message = typeof erreur?.message === 'string' ? erreur.message : '';
  if (message.includes('DEMO_COMPLETE')) return { cle: 'complete', texte: MSG_DEMO_COMPLETE };
  if (message.includes('DEMO_FERMEE')) return { cle: 'fermee', texte: MSG_DEMO_FERMEE };
  if (erreur?.status === 429) return { cle: 'reseau_partage', texte: MSG_DEMO_RESEAU_PARTAGE };
  return { cle: 'generique', texte: MSG_DEMO_LANCEMENT_ECHEC };
}

// 'android', 'ordinateur' ou 'autre' (décision 6 : un message pour chacun
// des deux premiers, rien pour les autres).
//   - Android avant tout : son user-agent contient aussi "Linux".
//   - iPhone et iPad : rien à dire.
//   - Un bureau (Windows, Mac, Linux) n'est un ordinateur que si le pointeur
//     principal est fin (`pointeurGrossier` = matchMedia('(pointer: coarse)')).
//     Un iPad récent se présente comme un "Macintosh" mais a un pointeur
//     tactile, il reste donc 'autre'. Pointeur inconnu (undefined) : on se
//     fie à l'user-agent seul.
//   - Rien de reconnu : 'autre', plutôt qu'un message faux.
export function typeAppareil(userAgent, pointeurGrossier) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'autre';
  if (/windows|macintosh|x11|linux|cros/i.test(ua) && pointeurGrossier !== true) return 'ordinateur';
  return 'autre';
}

// Quel moment de sortie proposer maintenant : 'essentiel' (fin de « L'essentiel
// », branchée par un lot suivant), 'jour3' (le 3e jour, soit au moins deux
// jours écoulés), ou `null`. Chaque moment ne se propose qu'une fois (le
// drapeau `dejaVus` est tenu par l'appelant, localement). Le troisième moment
// du plan, l'écran de fin, n'est pas ici : c'est l'écran lui-même, il porte
// toujours le bouton. Démo expirée (0 jour) : rien, l'écran de fin prend le
// relais. Jours inconnus : pas de « 3e jour » deviné.
export function momentSortieAProposer({ joursRestants: restants, essentielFait = false, dejaVus } = {}) {
  const vus = dejaVus || {};
  if (restants === 0) return null;
  if (essentielFait === true && vus.essentiel !== true) return 'essentiel';
  if (Number.isFinite(restants) && DUREE_DEMO_JOURS - restants >= 2 && vus.jour3 !== true) return 'jour3';
  return null;
}

// Le texte du bandeau. Un jour ou moins : le texte du dernier jour (le
// singulier se dit autrement, jamais « 1 jours »). Jours inconnus : `null`,
// l'appelant n'affiche pas de bandeau plutôt qu'un nombre inventé.
export function composerBandeau(jours) {
  if (!Number.isFinite(jours)) return null;
  if (jours <= 1) return TEXTE_BANDEAU_DERNIER_JOUR;
  return TEXTE_BANDEAU.replaceAll('{jours}', String(jours));
}

// Le lien mailto du bouton « Essayer sur mon vrai stock » : l'adresse de
// Corentin (celle de contact.js, une seule source), le sujet et le corps
// écrits dans demo_textes.js, et le code COMPLET de la démo (DEMO-XXXX) à la
// place de {code}, dans le sujet comme dans le corps.
// Un code qui n'a pas la forme DEMO-XXXX n'entre JAMAIS dans le lien (il
// vient d'une ligne de base ou d'un stockage local, rien n'est de confiance
// ici). Sans code valide, le mail reste sensé : le sujet perd ses parenthèses
// (« ... mon stock ») et le paragraphe du corps qui parle du code disparaît,
// plutôt que de dire « mon code est . ».
export function construireMailDemo(code) {
  const valide = estCodeDemo(code);
  const sujet = valide
    ? TEXTE_MAIL_SUJET.replaceAll('{code}', code)
    : TEXTE_MAIL_SUJET.replace(/\s*\(\{code\}\)/g, '').replaceAll('{code}', '');
  const corps = valide
    ? TEXTE_MAIL_CORPS.replaceAll('{code}', code)
    : TEXTE_MAIL_CORPS.split('\n\n').filter((paragraphe) => !paragraphe.includes('{code}')).join('\n\n');
  return `mailto:${DESTINATAIRE_CONTACT}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

// Coupe un texte autour d'un mot, pour rendre CE MOT touchable (un lien) sans
// changer une lettre du texte : avant + mot + apres redonne exactement le texte.
// `null` si le mot n'y est pas (le texte reste alors simple, sans lien) ou si
// l'entrée n'est pas une chaîne.
export function decouperAutour(texte, mot) {
  if (typeof texte !== 'string' || typeof mot !== 'string' || mot === '') return null;
  const i = texte.indexOf(mot);
  if (i === -1) return null;
  return { avant: texte.slice(0, i), mot, apres: texte.slice(i + mot.length) };
}

// L'adresse de la page sans les paramètres de la démo (?demo et ?depuis), pour
// history.replaceState : le lien « J'ai un compte Stovo » de l'écran de fin
// mène à la connexion, et sans ce nettoyage ?demo rouvrirait le lancement au
// prochain aiguillage. Rend chemin + recherche + fragment, ou `null` si
// l'entrée n'est pas lisible (le glu ne touche alors pas à l'adresse).
export function adresseSansDemo(adresse) {
  if (typeof adresse !== 'string') return null;
  try {
    const url = new URL(adresse, 'https://stovo.invalid/');
    url.searchParams.delete('demo');
    url.searchParams.delete('depuis');
    return url.pathname + url.search + url.hash;
  } catch (_e) {
    return null;
  }
}

// Clé de localStorage pour la démo. /app/ et /app-bac/ sont servis sur la
// MÊME origine (stovo.fr) et partagent donc localStorage : sans suffixe, une
// démo essayée sur /app-bac/ poserait le marqueur « démo vue » sur /app/, et
// le premier testeur déconnecté de cet appareil verrait l'écran de fin au
// lieu de la connexion. Même découpage que le nom de cache de sw.js.
export function cleStockageDemo(nom, cheminPage) {
  const bac = /(^|\/)app-bac(\/|$)/.test(typeof cheminPage === 'string' ? cheminPage : '');
  return `stovo_demo_${nom}${bac ? '_bac' : ''}`;
}

// --- Lot L6b (07/10/2026) : grisés, masqués, Aide ----------------------------
// « On est en démo » est décidé UNE fois, par aiguillerDemarrage (demo.js), avec
// etatDemoPourEcran ; les autres modules (aide.js, reglages.js) reçoivent le résultat par
// l'événement 'stovo:demo' et ne recalculent jamais rien.

// La démo est active seulement quand l'application est montrée ET que la session est celle
// d'une démo. Démo finie, lancement, connexion (dont le passage « J'ai un compte Stovo »),
// appel périmé : faux, donc tous les masquages se lèvent. Un état douteux (pas le vrai
// booléen true) vaut « pas en démo » : on ne grise jamais le geste d'un testeur par erreur.
export function etatDemoPourEcran(ecran, demo) {
  return ecran === 'app' && demo === true;
}

// Les quatre éléments dont le toucher est refusé en démo (photo de bon et import de tableur,
// chacun avec son bouton visible et son champ fichier caché), et le bouton visible sous
// lequel afficher le message. Liste fermée dans une Map : l'identifiant qui arrive du DOM est
// comparé tel quel, jamais interprété (« __proto__ » ou « constructor » n'y sont pas).
const FONCTIONS_GRISEES = new Map([
  ['btn-photo-bl', 'btn-photo-bl'],
  ['champ-photo-bl', 'btn-photo-bl'],
  ['btn-import', 'btn-import'],
  ['champ-import', 'btn-import'],
]);

export const SELECTEUR_FONCTIONS_GRISEES = [...FONCTIONS_GRISEES.keys()].map((id) => `#${id}`).join(', ');

// Ce toucher est-il refusé ? Rend { texte, boutonId } (le message validé, le bouton sous
// lequel le poser) ou `null` (hors démo, ou élément libre : le geste suit son cours).
export function fonctionGrisee(idElement, enDemo) {
  if (enDemo !== true || !FONCTIONS_GRISEES.has(idElement)) return null;
  return { texte: MSG_DEMO_FONCTION_GRISEE, boutonId: FONCTIONS_GRISEES.get(idElement) };
}

// Les lignes de Réglages qui parlent du compte (mot de passe, déconnexion) et celles qu'on
// masque en démo, où il n'y a pas de compte à protéger.
export const LIGNES_COMPTE_REGLAGES = ['reglages-changer-mdp', 'reglages-deconnexion'];

export function reglagesCachesEnDemo(enDemo) {
  return enDemo === true ? [...LIGNES_COMPTE_REGLAGES] : [];
}

// Une puce de l'Aide : le texte validé écrit son gras entre ** ** (comme la source), l'Aide
// attend du HTML. Le texte est échappé d'abord (aucune balise ne passe), puis les ** ** deviennent <b>.
export function puceAideEnHtml(texte) {
  if (typeof texte !== 'string') return '';
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// L'Aide telle que la démo la montre. Hors démo : le contenu d'origine, le même objet.
// En démo : la section « Ce que la démo ne fait pas » en tête (que des puces, aucun bloc
// geste, donc le corpus aide-exemples.json et la garde de banc-aide.ts ne bougent pas), et
// le tuto « Refaire mes premiers pas » retiré (son bouton Relancer ne mène à rien dans une
// épicerie de 40 produits). `contenu` n'est jamais modifié.
export function aideSelonDemo(contenu, enDemo) {
  if (enDemo !== true) return contenu;
  const sansRelance = contenu.map((section) => {
    const blocs = section.blocs.filter((bloc) => !(bloc.type === 'tuto' && bloc.id === 'premiers-pas'));
    return blocs.length === section.blocs.length ? section : { ...section, blocs };
  });
  const limites = {
    id: 'demo-limites',
    icone: 'moins-cercle',
    titre: AIDE_DEMO_LIMITES_TITRE,
    ouvertParDefaut: false,
    blocs: [{ type: 'liste', items: AIDE_DEMO_LIMITES.split('\n').map(puceAideEnHtml) }],
  };
  return [limites, ...sansRelance];
}

// --- Correctifs de revue du lot L6b (07/10/2026) -----------------------------

// Le message « fonction grisée » est un frère de son bouton. Quand le bouton quitte l'écran
// (reception.js et sortie.js masquent #btn-import, le panneau de réception se ferme), le message
// ne doit pas rester seul. `nbRectsAncre` est ancre.getClientRects().length (0 : plus à l'écran),
// ou null si le bouton n'existe plus. Une mesure douteuse vaut « plus à l'écran » : on masque.
export function messageGriseOrphelin(messageAffiche, nbRectsAncre) {
  if (messageAffiche !== true) return false;
  return !(Number.isInteger(nbRectsAncre) && nbRectsAncre > 0);
}

// Sortir de la démo depuis Réglages la perd pour toujours : seul un « oui » franc (true) la ferme.
// `confirmer` est la confirmation native ; absente ou illisible, la démo reste ouverte.
export function sortieDemoConfirmee(confirmer, texte) {
  return typeof confirmer === 'function' && confirmer(texte) === true;
}

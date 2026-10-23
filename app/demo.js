// STOVO — la démo en libre-service, côté écran (lot L6a, 07/10/2026)
// ====================================================================
// La glu DOM de la démo : l'écran de lancement, le bandeau, l'écran de fin, et (lot L6b) l'état
// « on est en démo » annoncé aux autres écrans, avec le refus de la photo de bon et de l'import.
// Toute décision vit dans demo_logique.js (pur, testé par demo_logique_test.js) ;
// ce fichier lit la page, appelle ces fonctions et pose le résultat à l'écran.
// L'ordre des événements (lancement, session, aiguillage) n'est pas visible
// des tests purs : il est prouvé par le banc Chromium
// .claude/outils/banc-demo-L6a.mjs (patron « logique pure + glu » de
// premiers_pas.js).
//
// Le seul point d'entrée vers le reste de l'app est `aiguillerDemarrage`,
// appelée par app.js à chaque fois qu'une session est connue (au démarrage et
// à chaque changement de session). Hors démo, elle ne fait RIEN de visible :
// pour un testeur elle rend 'app' sans aucune requête (la ligne de la table
// demos n'est lue que pour une session anonyme).
//
// Pourquoi seulement les sessions anonymes lisent la table demos : une démo
// convertie en compte permanent (alerte A2 du plan) ne serait pas reconnue
// ici, c'est un choix assumé pour ne pas ajouter une requête à chaque
// ouverture d'un testeur. Le serveur, lui, la traite toujours en démo
// (pwa-api reconnaît la démo à sa ligne, pas au drapeau du jeton).

import { supabase } from './supabase.js';
import { getSessionActuelle, ouvrirDemo, seDeconnecter } from './auth.js';
import { afficherApp, afficherLogin } from './ecran_session.js';
import { viderDashboard } from './dashboard.js';
import { viderParler } from './parler.js';
// Lot L7 (08/10/2026) : la carte des missions (écran Saisir), importée pour effet de bord ; elle
// écoute 'stovo:demo' et ne fait rien tant que la démo n'est pas active.
import './missions_demo.js';
import {
  SELECTEUR_FONCTIONS_GRISEES,
  adresseSansDemo,
  cleStockageDemo,
  composerBandeau,
  construireMailDemo,
  decouperAutour,
  deciderEcranDemarrage,
  estCodeDemo,
  estDemo,
  etatDemoPourEcran,
  fonctionGrisee,
  joursRestants,
  lireDepuis,
  messageGriseOrphelin,
  momentSortieAProposer,
  sortieDemoConfirmee,
  typeAppareil,
  urlDemandeDemo,
} from './demo_logique.js';
import {
  MSG_DEMO_ANDROID,
  MSG_DEMO_LANCEMENT_RGPD,
  MSG_DEMO_ORDINATEUR,
  TEXTE_BANDEAU_BOUTON,
  TEXTE_FIN_BOUTON,
  TEXTE_FIN_CORPS_EFFACEE,
  TEXTE_FIN_CORPS_EXPIREE,
  TEXTE_FIN_J_AI_UN_COMPTE,
  TEXTE_FIN_TITRE,
  TEXTE_LANCEMENT_BOUTON,
  TEXTE_LANCEMENT_CORPS,
  TEXTE_LANCEMENT_ENCOURS,
  TEXTE_LANCEMENT_PAS_INSCRIPTION,
  TEXTE_LANCEMENT_TITRE,
  TEXTE_REGLAGES_QUITTER_DEMO_CONFIRMATION,
  TEXTE_SORTIE_JOUR3,
} from './demo_textes.js';

const $ = (id) => document.getElementById(id);

const ecranLancement = $('ecran-demo-lancement');
const ecranFin = $('ecran-demo-fin');
const boutonLancer = $('btn-demo-lancer');
const zoneErreur = $('demo-lancement-erreur');
const bandeau = $('demo-bandeau');
const sortie = $('demo-sortie');

// --- Stockage local : sous try/catch (navigation privée, quota à zéro) -----
// Une clé par famille de chemin (/app/ et /app-bac/ partagent localStorage,
// voir cleStockageDemo).

function lireLocal(nom) {
  try {
    return localStorage.getItem(cleStockageDemo(nom, location.pathname));
  } catch (_e) {
    return null;
  }
}

function ecrireLocal(nom, valeur) {
  try {
    localStorage.setItem(cleStockageDemo(nom, location.pathname), valeur);
  } catch (_e) {
    // Sans stockage, la démo marche quand même : seul le rappel d'une démo
    // purgée (écran de fin au retour) et le « une seule fois » se perdent.
  }
}

function effacerLocal(nom) {
  try {
    localStorage.removeItem(cleStockageDemo(nom, location.pathname));
  } catch (_e) {
    // idem
  }
}

// --- Textes fixes de l'écran de lancement et de l'écran de fin --------------

$('demo-lancement-titre').textContent = TEXTE_LANCEMENT_TITRE;
$('demo-lancement-corps').textContent = TEXTE_LANCEMENT_CORPS;
// Le mot « Confidentialité » de la ligne RGPD est touchable (revue du 07/10, point 3) : le
// texte ne change pas d'une lettre, seul ce mot devient un lien vers la page légale. Si le
// mot disparaît d'un futur texte, la ligne reste un texte simple.
const URL_CONFIDENTIALITE = 'https://stovo.fr/confidentialite.html';
(function poserLigneRgpd() {
  const zone = $('demo-lancement-rgpd');
  const morceaux = decouperAutour(MSG_DEMO_LANCEMENT_RGPD, 'Confidentialité');
  if (morceaux === null) {
    zone.textContent = MSG_DEMO_LANCEMENT_RGPD;
    return;
  }
  const lien = document.createElement('a');
  lien.href = URL_CONFIDENTIALITE;
  lien.target = '_blank';
  lien.rel = 'noopener';
  lien.textContent = morceaux.mot;
  zone.replaceChildren(morceaux.avant, lien, morceaux.apres);
})();
$('demo-lancement-pas-inscription').textContent = TEXTE_LANCEMENT_PAS_INSCRIPTION;
boutonLancer.textContent = TEXTE_LANCEMENT_BOUTON;
$('demo-fin-titre').textContent = TEXTE_FIN_TITRE;
$('demo-fin-mail').textContent = TEXTE_FIN_BOUTON;
$('demo-fin-compte').textContent = TEXTE_FIN_J_AI_UN_COMPTE;
$('demo-lancement-compte').textContent = TEXTE_FIN_J_AI_UN_COMPTE;
$('demo-bandeau-mail').textContent = TEXTE_BANDEAU_BOUTON;

// Un message pour Android, un pour l'ordinateur (décision 6), rien pour le reste.
(function afficherMessageAppareil() {
  const pointeurGrossier = typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(pointer: coarse)').matches
    : undefined;
  const type = typeAppareil(navigator.userAgent, pointeurGrossier);
  const zone = $('demo-appareil');
  if (type === 'android') zone.textContent = MSG_DEMO_ANDROID;
  else if (type === 'ordinateur') zone.textContent = MSG_DEMO_ORDINATEUR;
  zone.hidden = type === 'autre';
})();

// --- La ligne de la table demos (code, date de création, traces des missions) --------------------
// RLS : un compte ne lit que SA ligne. Mise en cache par compte pour la vie de
// la page (l'aiguillage tourne à chaque changement de session, dont le
// renouvellement du jeton toutes les heures) ; une lecture en échec n'est pas
// gardée, la suivante réessaie.
//
// Rend { lue, ligne } : `lue` dit si la lecture a RÉUSSI. « Réussie et sans ligne » (la
// démo a été purgée, le jeton court encore) n'est PAS « en échec » (panne réseau) : la
// première mène à l'écran de fin, la seconde laisse l'app ouverte (voir aiguillerDemarrage).

let ligneEnCours = { id: null, promesse: null };

function lireLigneDemo(userId) {
  if (ligneEnCours.id === userId && ligneEnCours.promesse) return ligneEnCours.promesse;
  const echec = () => {
    ligneEnCours = { id: null, promesse: null };
    return { lue: false, ligne: null };
  };
  const promesse = supabase
    .from('demos')
    .select('code, cree_le, question_le, reappro_le')
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        console.error('Lecture de la démo Stovo impossible :', error.message);
        return echec();
      }
      return { lue: true, ligne: data || null };
    })
    .catch((erreur) => {
      console.error('Lecture de la démo Stovo impossible :', erreur);
      return echec();
    });
  ligneEnCours = { id: userId, promesse };
  return promesse;
}

// --- Montrer un écran de démo, cacher le reste -------------------------------

function masquerEcransDemo() {
  ecranLancement.hidden = true;
  ecranFin.hidden = true;
}

// L'écran de lancement et l'écran de fin remplacent TOUT le reste (connexion,
// application), jamais en plus.
//
// Quand c'est une application OUVERTE que l'on remplace (une démo qui passe à la fin
// pendant la session), on fait le même ménage que la déconnexion (viderDashboard,
// viderParler : plus de données de la démo dans le DOM caché), puis on recharge la page.
// Le rechargement est nécessaire : le tableau de bord relance une lecture toutes les 30 s
// (un setInterval que viderDashboard n'arrête pas) et repeindrait les données dans l'écran
// caché, requête après requête. Rechargée, la page ne démarre jamais l'application (la
// décision est « fin » dès le départ), donc aucune boucle. Pas de rechargement si
// l'application n'était pas ouverte.
function montrerSeul(ecran) {
  const appOuverte = !$('app-shell').hidden;
  if (appOuverte) {
    viderDashboard();
    viderParler();
  }
  $('ecran-login').hidden = true;
  $('app-shell').hidden = true;
  masquerEcransDemo();
  ecran.hidden = false;
  if (appOuverte) location.reload();
}

// `effacee` : la démo n'existe plus (purgée, ou ligne introuvable) ; sinon elle est expirée
// mais encore là jusqu'à la purge de la nuit.
function afficherFin(code, effacee) {
  $('demo-fin-corps').textContent = effacee ? TEXTE_FIN_CORPS_EFFACEE : TEXTE_FIN_CORPS_EXPIREE;
  $('demo-fin-mail').href = construireMailDemo(code);
  montrerSeul(ecranFin);
}

function afficherBandeau(code, jours) {
  const texte = composerBandeau(jours);
  if (texte === null) {
    // Jours inconnus (la ligne n'a pas pu être lue) : pas de bandeau plutôt
    // qu'un nombre inventé. L'app reste utilisable, le serveur garde la main.
    bandeau.hidden = true;
    return;
  }
  $('demo-bandeau-texte').textContent = texte;
  $('demo-bandeau-mail').href = construireMailDemo(code);
  bandeau.hidden = false;
  proposerSortie(jours, code);
}

// Le 3e jour, une phrase de plus vers l'essai sur le vrai stock, UNE fois
// (le drapeau est posé à l'affichage). « La fin de L'essentiel » (moment
// 'essentiel') est montrée par missions_demo.js (lot L7).
//
// Le drapeau est propre à CHAQUE démo (sa clé porte le code) : sur un même appareil, une
// démo suivante a droit à sa propre proposition (revue du 07/10, point 7). Sans code
// lisible, pas de proposition (on ne saurait pas retenir qu'elle a été faite).
function proposerSortie(jours, code) {
  if (!estCodeDemo(code)) return;
  const cle = `sortie_jour3_${code}`;
  const moment = momentSortieAProposer({
    joursRestants: jours,
    essentielFait: false,
    dejaVus: { jour3: lireLocal(cle) !== null },
  });
  if (moment !== 'jour3') return;
  $('demo-sortie-texte').textContent = TEXTE_SORTIE_JOUR3;
  sortie.hidden = false;
  ecrireLocal(cle, '1');
}

$('demo-sortie-fermer').addEventListener('click', () => {
  sortie.hidden = true;
});

// --- L'état « on est en démo » (lot L6b, 07/10/2026) --------------------------
// UNE seule source : aiguillerDemarrage (plus bas) la décide (etatDemoPourEcran) à chaque
// session connue et l'annonce par 'stovo:demo' ({ actif }). aide.js et reglages.js
// l'écoutent et ne recalculent rien ; l'interception des grisés ci-dessous la lit ici.
// Elle retombe à faux dès que l'application n'est plus en démo (fin, connexion normale
// par « J'ai un compte Stovo »), sans rechargement : tous les masquages se lèvent.
let demoActive = false;

// `ligne` (lot L7) : la ligne demos déjà lue, donnée telle quelle à missions_demo.js pour qu'elle ne la relise
// pas au démarrage (une seule lecture au lancement). Elle date de l'ouverture de la page : les traces des
// missions (question_le, reappro_le) se posent ensuite, missions_demo.js les relit lui-même après chaque réponse.
function annoncerEtatDemo(actif, ligne = null) {
  demoActive = actif;
  if (!actif) masquerMessageGrise();
  document.dispatchEvent(new CustomEvent('stovo:demo', { detail: { actif, ligne } }));
}

// --- Photo de bon et import de tableur : grisés en démo ------------------------
// Écoute en phase de CAPTURE sur le document, donc avant le bouton lui-même, SANS toucher
// parler.js ni reception.js : le toucher est arrêté ici, le sélecteur de fichier ne s'ouvre
// pas (preventDefault) et la requête vers pwa-api (kind reception-photo ou import, qui ne
// partent que d'un fichier choisi) ne peut pas partir. Sont couverts les deux boutons ET
// leurs champs fichier cachés, y compris un champ cliqué par un autre module
// (premiers_pas.js clique #champ-import). Le message vient de la source unique
// (MSG_DEMO_FONCTION_GRISEE, le même texte que le serveur) et s'écrit sous le bouton touché.
let messageGrise = null;

function afficherMessageGrise(texte, bouton) {
  if (!bouton) return;
  if (!messageGrise) {
    messageGrise = document.createElement('div');
    messageGrise.className = 'parler-reponse demo-grisee';
    messageGrise.setAttribute('role', 'status');
  }
  messageGrise.textContent = texte;
  messageGrise.hidden = false;
  bouton.after(messageGrise);
}

function masquerMessageGrise() {
  if (messageGrise) messageGrise.hidden = true;
}

// Le message suit son bouton (correctif de revue, 07/10/2026). reception.js et sortie.js masquent
// #btn-import au début d'une réception ou d'une sortie, et le panneau de réception qui porte
// #btn-photo-bl se ferme à Valider ou Abandonner : sans ceci le message restait seul au milieu
// de l'écran, puis revenait avec le bouton. Un changement d'attribut hidden n'importe où dans
// l'écran Saisir (le bouton, son panneau) fait vérifier l'ancre ; si elle n'est plus affichée,
// le message est MASQUÉ pour de bon (hidden posé), donc il ne revient pas tout seul. Sans toucher
// reception.js, sortie.js ni parler.js.
new MutationObserver(() => {
  if (!messageGrise) return;
  const ancre = messageGrise.previousElementSibling;
  if (messageGriseOrphelin(!messageGrise.hidden, ancre ? ancre.getClientRects().length : null)) masquerMessageGrise();
}).observe($('ecran-parler'), { attributes: true, subtree: true, attributeFilter: ['hidden'] });

document.addEventListener('click', (evenement) => {
  const cible = evenement.target instanceof Element ? evenement.target.closest(SELECTEUR_FONCTIONS_GRISEES) : null;
  if (!cible) return;
  const grise = fonctionGrisee(cible.id, demoActive);
  if (grise === null) return;
  evenement.preventDefault();
  evenement.stopPropagation();
  afficherMessageGrise(grise.texte, $(grise.boutonId));
}, true);

// --- L'aiguillage : quel écran pour cette session ? --------------------------
//
// Rend 'app' ou 'connexion' (à app.js de les afficher : afficherApp et
// afficherLogin gardent leur rôle d'avant), 'lancement' ou 'fin' (cet écran
// vient d'être montré ici), ou 'perimee' (un appel plus récent a pris le
// relais pendant la lecture de la ligne, rien n'a été touché).

let numeroAiguillage = 0;

export async function aiguillerDemarrage(session) {
  const numero = ++numeroAiguillage;
  const anonyme = session?.user?.is_anonymous === true;
  const lecture = anonyme ? await lireLigneDemo(session.user.id) : { lue: false, ligne: null };
  if (numero !== numeroAiguillage) return 'perimee';

  const ligne = lecture.ligne;
  const demo = estDemo(session, ligne);
  const jours = ligne ? joursRestants(ligne.cree_le, Date.now()) : null;
  // Lecture réussie qui ne rend rien : la démo a été purgée, le jeton court encore (point 2
  // de la revue). Lecture en échec : PAS la fin (voir lireLigneDemo et deciderEcranDemarrage).
  const ligneAbsente = anonyme && lecture.lue && ligne === null;
  const marqueur = lireLocal('vue');
  const ecran = deciderEcranDemarrage({
    session,
    estDemo: demo,
    expiree: jours === 0,
    ligneAbsente,
    urlDemandeDemo: urlDemandeDemo(location.search),
    marqueurDemoVue: marqueur !== null,
  });
  annoncerEtatDemo(etatDemoPourEcran(ecran, demo), ligne);

  if (ecran === 'fin') {
    const code = ligne?.code ?? (estCodeDemo(marqueur) ? marqueur : null);
    if (ligne) ecrireLocal('vue', ligne.code);
    afficherFin(code, ligneAbsente || !session);
    return 'fin';
  }
  if (ecran === 'lancement') {
    montrerSeul(ecranLancement);
    return 'lancement';
  }

  masquerEcransDemo();
  if (ecran === 'app' && demo) {
    // Une démo en cours : on retient qu'elle a existé, pour montrer l'écran de
    // fin (et non la connexion) si elle est purgée avant le retour du visiteur.
    if (ligne) ecrireLocal('vue', ligne.code);
    afficherBandeau(ligne?.code ?? null, jours);
  } else {
    bandeau.hidden = true;
    // Un vrai compte sur cet appareil : le marqueur d'une ancienne démo ne
    // doit jamais lui voler l'écran de connexion à sa prochaine déconnexion.
    if (session && marqueur !== null) effacerLocal('vue');
  }
  return ecran;
}

// --- Le lien « J'ai un compte Stovo » (écran de fin ET écran de lancement) ----------
// Pour qui n'est pas là pour la démo (un testeur, un client de l'essai) : sans ce
// lien, une démo effacée laissait le repère « démo vue » et l'écran de fin
// bloquait la connexion, et un testeur déconnecté qui touchait un lien ?demo restait
// coincé sur le lancement (revue du 07/10, point 5). Au toucher : le repère de CE chemin est retiré, ?demo et
// ?depuis quittent l'adresse (sinon ?demo rouvrirait le lancement), une session de
// démo encore présente est fermée (elle est finie, et un renouvellement de jeton
// la ramènerait à l'écran de fin), puis l'écran de connexion normal s'affiche,
// sans recharger la page.
async function ouvrirConnexionNormale(evenement) {
  evenement.preventDefault();
  effacerLocal('vue');
  const propre = adresseSansDemo(location.href);
  if (propre !== null) history.replaceState(null, '', propre);
  if (await getSessionActuelle()) await seDeconnecter();
  const ecran = await aiguillerDemarrage(null);
  if (ecran === 'connexion') afficherLogin();
}
$('demo-fin-compte').addEventListener('click', ouvrirConnexionNormale);
$('demo-lancement-compte').addEventListener('click', ouvrirConnexionNormale);

// --- La même sortie depuis Réglages, en démo (correctif de revue L6b, 07/10/2026) ----------
// Un testeur déconnecté qui lance une démo par erreur n'aurait plus d'issue pendant 7 jours.
// Ici la démo est ACTIVE : fermer sa session la perd pour toujours sur ce navigateur, d'où
// la confirmation native avant tout. Refus (ou confirm indisponible) : rien ne bouge. Accord :
// le chemin d'ouvrirConnexionNormale (repère retiré, adresse nettoyée, signOut, connexion).
$('reglages-quitter-demo-texte').textContent = TEXTE_FIN_J_AI_UN_COMPTE;
$('reglages-quitter-demo').addEventListener('click', async (evenement) => {
  if (!sortieDemoConfirmee(globalThis.confirm?.bind(globalThis), TEXTE_REGLAGES_QUITTER_DEMO_CONFIRMATION)) return;
  await ouvrirConnexionNormale(evenement);
});

// --- Le bouton « Lancer la démo » ---------------------------------------------

boutonLancer.addEventListener('click', async () => {
  zoneErreur.hidden = true;
  boutonLancer.disabled = true;
  boutonLancer.textContent = TEXTE_LANCEMENT_ENCOURS;

  const resultat = await ouvrirDemo(lireDepuis(location.search));

  if (!resultat.ok) {
    // Le bouton ne redevient actif que sur un REFUS. Après un succès il reste inactif, sur
    // « ouverture en cours », tant que l'écran de lancement est là : le compte anonyme
    // existe déjà, un second toucher en ouvrirait un second (revue du 07/10, point 1).
    boutonLancer.disabled = false;
    boutonLancer.textContent = TEXTE_LANCEMENT_BOUTON;
    zoneErreur.textContent = resultat.message;
    zoneErreur.hidden = false;
    return;
  }
  // Succès : onAuthChange (app.js) prend aussi le relais, mais on bascule tout
  // de suite pour ne pas attendre l'événement, comme le fait le formulaire de
  // connexion. Les deux passent par aiguillerDemarrage : le plus récent gagne.
  const ecran = await aiguillerDemarrage(resultat.session);
  if (ecran === 'app') afficherApp();
});

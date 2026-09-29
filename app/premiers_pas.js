// STOVO — chantier "Premiers pas", lot 2 : la bande a l'ecran, paliers 1 a 3
// (18/09/2026)
// =====================================================================
// Glu DOM du fil de premiere connexion. Importe pour effet de bord (meme
// patron que aide.js, stock.js) : branche ses ecouteurs sur la section
// #premiers-pas, deja presente dans index.html, hidden par defaut.
//
// Ce module ne DECIDE rien : toute la deduction d'etape, les textes, les
// escaliers micro/comprehension vivent dans premiers_pas_logique.js (module
// pur, banc Deno). Ici : DOM, localStorage (sous try/catch), l'anti-rebond
// du rafraichissement. Zero appel reseau, zero ecriture en base : le fil
// n'ecrit jamais a la place du client (checklist de codage, rempart "rien
// ne s'ecrit sans un oui").
//
// Perimetre au lot 2 (18/09/2026) : SEULS les paliers 1, 2 et 3 etaient
// rendus, 4 et 5 masquant la bande. Le lot 7 (meme date) les rend a leur
// tour (voir plus bas) ; partout ou calculerEtatDuFil rend `visible: false`,
// la section reste simplement masquee par `hidden`.
//
// References : consigne du lot (context/import/app-stock/
// PROMPT_codeur-premiers-pas-L2-bande-paliers-1-3_2026-09-18.md), plan de
// l'Architecte (2026-09-17_architecte_plan-premiers-pas.md, §6, §7.4).
//
// Lot 3 (18/09/2026, chantier "Tutoriels", rayon "Apprendre Stovo") : une
// ecoute de plus, stovo:tuto-lancer, qui referme la dette de la croix
// irreversible (le fil redevient relancable depuis l'Aide). Voir la
// consigne 2026-09-18_consigne-codeur_premiers-pas-L3-rayon-apprendre-stovo.md
// §5.3 et le rapport de passation du lot.
//
// Lot 4 (18/09/2026, meme chantier) : deux ajouts. 1) L'ouverture
// automatique sur l'onglet Saisir quand le catalogue est vide, une seule
// fois par vie de page (creerGardeBascule, delegation de clic sur les
// boutons .nav-item pour detecter une navigation manuelle : app.js ne
// publie aucun evenement sur ce clic, voir §2 de la consigne). 2) La
// correction de la limite assumee au lot 3 : une relance qui arrive avant
// le tout premier stovo:donnees arme une attente (creerAttenteRelance) au
// lieu de repondre a tort sur des donnees inconnues. Voir la consigne
// 2026-09-18_consigne-codeur_premiers-pas-L4-ouverture-sur-saisir.md et le
// rapport de passation du lot.
//
// Correctifs de relecture (18/09/2026, avant tout deploiement, consigne
// 2026-09-18_consigne-codeur_premiers-pas-L3-L4-correctifs-revue.md) :
// A/B/C) la garde `if (!appShell.hidden)` du lot 4 protegeait la bascule
// mais laissait `dernierDetailConnu` se polluer sur un `stovo:donnees` de
// deconnexion, ET ne nettoyait plus jamais la bande ni l'attente de
// relance a la deconnexion (voir la memoire d'agent
// "feedback-stovo-donnees-pendant-app-shell-masque"). L'ecouteur nettoie
// desormais explicitement (return anticipe) quand l'app n'est pas a
// l'ecran, au lieu de simplement sauter la partie utile. E) le drapeau de
// fermeture localStorage peut mentir si une ecriture a echoue (navigation
// privee Safari) : `calculerFermetureEffective` (premiers_pas_logique.js)
// fait gagner une reouverture de la session en cours sur cette valeur.
//
// Lot 6 (18/09/2026, meme chantier) : l'escalier de comprehension (marches
// 1 a 3, secours dans #pp-secours) et le bouton "Ecrire la phrase".
//
// Lot 7 (18/09/2026, chantier "Tutoriels", palier d'arrivee) : les paliers 4
// et 5 sont enfin rendus (boutons dans #pp-actions), le palier force en
// memoire vive (paliersForces, 4 -> 5 seulement), la marche 3 de l'escalier
// mene desormais au palier 5 (effetMarche3), et la dette D64 (minuteur de
// la relance). Correctif de relecture (18/09/2026, apres coup, §2.4 du plan
// du 17/09) : un second drapeau, `sortieParEscalier`, DISTINCT de
// paliersForces, tient le palier 5 quelles que soient les donnees (1, 2 ou
// 3) quand c'est la marche 3 qui l'a force -- sinon le tick de 30s de
// dashboard.js remettait le client devant l'etape qu'il venait de fuir.
// Voir la consigne 2026-09-18_consigne-codeur_premiers-pas-L7-palier-
// arrivee.md et le rapport de passation du lot.
//
// Lot 5 (20/09/2026, chantier "Premiers pas") : l'escalier micro (marches 1
// a 3, machine deja ecrite et testee au lot 1) est enfin branche sur
// stovo:micro (evenement ajoute par parler.js, journaliser()). Il partage
// #pp-secours avec l'escalier de comprehension du lot 6 -- l'Architecte
// avait prevu ce lot AVANT le lot 6, l'ordre a ete inverse en cours de
// route. La regle, tranchee par Corentin le 20/09 : le dernier qui a
// quelque chose a dire s'affiche ; quand l'un se tait, il n'efface que ce
// qu'il a ecrit lui-meme. Voir poserMessage() plus bas et la consigne
// 2026-09-20_consigne-codeur_premiers-pas-lot5-escalier-micro.md §4.
//
// Renvoi du 21/09/2026 (decisions 2, 3 et 4 du grilling, textes valides le
// 22/09) : la bande vit dans #ecran-parler et disparait des qu'on la
// quitte, donc "Voir mon Pilotage" FERME desormais le fil au lieu de
// preparer un palier 5 invisible. `paliersForces` disparait partout (le
// palier 4 rend toujours 4, la bascule 4 -> 5 forcee n'a plus lieu d'etre).
// Le palier 5 n'est plus une etape du fil : il devient le palier de SORTIE
// de l'escalier de comprehension, atteignable UNIQUEMENT par sa marche 3
// (effetMarche3() rend desormais 'palier-sortie'). "J'ai fini" disparait
// (le bouton "Importer mon catalogue" migre en secondaire au palier 4, la
// croix couvre deja la fermeture). Voir la consigne
// 2026-09-22_consigne-codeur_premiers-pas-fil-renvois.md.

import {
  CLE_STOCKAGE_FERMETURE,
  calculerEtatDuFil,
  calculerFermetureEffective,
  calculerLibelleJalons,
  creerAttenteRelance,
  creerEscalierComprehension,
  creerGardeBascule,
  creerLecteurMicroDuFil,
  doitOuvrirSurSaisir,
  effetMarche3,
  lireDrapeauFermeture,
  messageRelanceEchouee,
  messageRelanceImpossible,
  phrasePourLeChamp,
  resoudreRelance,
  texteMarcheComprehension,
  textesDuPalier,
} from './premiers_pas_logique.js';
// Import NOMME (pas seulement un effet de bord) : dashboard.js exporte
// `charger` sous cet alias exprès pour ce fil (§3.4 du plan), afin qu'un
// geste dicte n'attende pas jusqu'a 30 s (le tick de setInterval) avant que
// la bande n'avance.
import { rafraichirDonnees } from './dashboard.js';
// Correctif de relecture (18/09/2026, 3e passe de /code-review, tranche par
// Corentin) : la variante B du palier 4 ne suit plus la regle d'alerte de
// pilotage.js (stock_actuel <= pointCommande, qui se declenchait AVANT la
// rupture reelle, texte faux a l'ecran) mais une rupture litterale
// (stock_actuel <= 0). `pilotage.js` n'est donc plus importe ici : plus
// aucun calcul de ce fichier n'a besoin de calculerLignePilotage ni de
// calculerSortiesParProduit.

const section = document.getElementById('premiers-pas');
const elJalons = document.getElementById('pp-jalons');
const elFermer = document.getElementById('pp-fermer');
const elCorps = document.getElementById('pp-corps');
// Lot 6 (18/09/2026, chantier "Tutoriels") : le secours de l'escalier de
// comprehension se rend ici.
const elSecours = document.getElementById('pp-secours');
// Lot 7 (18/09/2026) : les boutons de fin de fil (paliers 4 et 5), deja
// poses en index.html depuis le lot 2.
const elActions = document.getElementById('pp-actions');

// Correctif post-livraison du lot 4 (18/09/2026) : lu ici, jamais ecrit
// (ecran_session.js reste hors du perimetre de ce lot). Sert uniquement a
// ignorer un stovo:donnees arrive pendant que l'app n'est pas a l'ecran
// (voir la garde plus bas, meme genre que `if (section.hidden) return;`
// dans demanderRafraichissement ci-dessous).
const appShell = document.getElementById('app-shell');

// --- Le drapeau de fermeture : lecture ET ecriture sous try/catch --------
//
// Precedent : reglages.js l.40-54. En navigation privee Safari, localStorage
// peut lever sur un quota a zero, et une bande de guidage ne fait jamais
// planter un ecran. `fermeCetteSession` masque quand meme la bande pour la
// session en cours si l'ecriture a echoue (§6 de la consigne).
let fermeCetteSession = false;

// Correctif de relecture (18/09/2026, defaut E) : symetrique de
// fermeCetteSession, leve par une relance reussie (stovo:tuto-lancer) meme
// quand l'ecriture localStorage qui devrait effacer le drapeau a echoue.
// `calculerFermetureEffective` (module pur, teste) lui donne le dernier
// mot sur la valeur lue en stockage : voir son commentaire de tete pour le
// contrat exact. Remis a false par une fermeture explicite (la croix),
// qui doit toujours pouvoir re-fermer la bande dans la meme session.
let reouverteCetteSession = false;

// Dernier detail recu de stovo:donnees ({ produits, mouvements }) PENDANT
// que l'app est a l'ecran, pour rejouer la deduction d'etape au moment
// d'un tap sur "Relancer" (rayon "Apprendre Stovo" de l'onglet Aide, lot 3,
// 18/09/2026). Reste `null` tant qu'aucun stovo:donnees REEL n'est encore
// arrive cette session : c'est ce cas precis que le lot 4 corrige (§3 de sa
// consigne) avec attenteRelance ci-dessous. Correctif de relecture
// (18/09/2026, defauts A et B) : un stovo:donnees publie pendant que
// `#app-shell` est masque (deconnexion, voir viderDashboard() dans
// ecran_session.js) ne touche plus JAMAIS cette variable, voir la garde en
// tete de l'ecouteur stovo:donnees plus bas.
let dernierDetailConnu = null;

// Lot 4 : le droit de basculer automatiquement sur Saisir (une seule fois
// par vie de page), et l'attente d'une relance demandee avant que la
// premiere donnee ne soit connue. Instancies UNE FOIS au chargement du
// module : ils vivent pour la vie de la page, pas pour la vie d'une
// session (une deconnexion/reconnexion sans recharger ne les reinitialise
// jamais, §2 de la consigne, "le cas de la deconnexion").
const gardeBascule = creerGardeBascule();
const attenteRelance = creerAttenteRelance();
// Lot 6 : l'escalier de comprehension vit pour la vie de la page, comme les
// deux ci-dessus (jamais recree a une reconnexion, jamais stocke).
const escalier = creerEscalierComprehension();
// Lot 5 (20/09/2026) : le lecteur du micro, meme genre de duree de vie que
// l'escalier ci-dessus, SAUF a la deconnexion (voir masquerBande plus bas) :
// un etat 'panne' du compte precedent ne doit pas survivre pour le compte
// suivant qui se connecte sans recharger la page. `let`, pas `const`,
// precisement pour cette raison -- meme remede que `escalier.changerPalier()`
// juste a cote dans masquerBande().
let lecteurMicro = creerLecteurMicroDuFil();

// --- L'arbitre de #pp-secours (§4 de la consigne du lot 5) ---------------
//
// Deux locataires ('micro', 'comprehension') partagent une seule zone
// d'affichage. Un message par locataire, plus le nom du dernier locataire
// qui a parle : c'est tout l'etat necessaire pour la regle tranchee par
// Corentin le 20/09 (voir le commentaire de tete du fichier).
const messageParLocataire = { micro: null, comprehension: null };
let dernierLocataireAffiche = null;

// `m` non nul : on memorise, ce locataire devient le dernier qui a parle,
// on rend son message. `m` nul : on oublie le message de CE locataire
// seulement. Si c'est lui qui etait a l'ecran, on rend le message de
// l'autre s'il en a un (l'autre devient le dernier qui a parle), sinon on
// vide la zone (rendreSecours(null) delegue a effacerSecours(), qui remet
// aussi les deux memoires a zero -- sans consequence ici puisque les deux
// sont deja vides a ce point). Si c'est l'autre qui etait a l'ecran, rien
// ne bouge a l'ecran : on ne fait que mettre a jour la memoire du
// locataire qui s'est tu.
function poserMessage(locataire, m) {
  if (m) {
    messageParLocataire[locataire] = m;
    dernierLocataireAffiche = locataire;
    rendreSecours(m);
    return;
  }
  messageParLocataire[locataire] = null;
  if (dernierLocataireAffiche !== locataire) return;
  const autre = locataire === 'micro' ? 'comprehension' : 'micro';
  if (messageParLocataire[autre]) {
    dernierLocataireAffiche = autre;
    rendreSecours(messageParLocataire[autre]);
  } else {
    rendreSecours(null);
  }
}

// Renvoi du 21/09/2026 (§3.1/§4 de la consigne) : `paliersForces` a
// disparu, avec ses deux remises a faux (deconnexion, relance) et le
// passage a calculerEtatDuFil. "Voir mon Pilotage" ferme desormais le fil
// (voir son gestionnaire plus bas), il n'y a plus de bascule 4 -> 5 a
// retenir en memoire.
//
// `sortieParEscalier` (lot 7, 18/09/2026, §2.4 du plan de l'Architecte du
// 17/09), pose par la marche 3 de l'escalier de comprehension ("Passer
// cette etape") : force 5 quelles que soient les donnees reelles, le client
// a choisi de sortir du fil par le seul endroit qui lui reste utile quand
// la voix ne passe pas, il ne doit jamais y etre remis de force par le tick
// de 30s de dashboard.js (la boucle que le lot 6 interdit nommement). Meme
// vie qu'un flag en memoire vive : jamais stocke, remis a faux a la
// deconnexion et a une relance (memes raisons qu'avant).
let sortieParEscalier = false;

function lireDrapeauStockage() {
  try {
    return lireDrapeauFermeture(localStorage.getItem(CLE_STOCKAGE_FERMETURE));
  } catch (_e) {
    return false;
  }
}

function ecrireDrapeauFermeture() {
  try {
    localStorage.setItem(CLE_STOCKAGE_FERMETURE, '1');
  } catch (_e) {
    // Stockage indisponible : la session en cours masque quand meme la
    // bande, voir fermeCetteSession ci-dessus.
  }
  fermeCetteSession = true;
  // Une fermeture explicite (la croix) gagne toujours sur une reouverture
  // precedente de la meme session : sans cette ligne, un client qui rouvre
  // puis referme dans la meme session verrait `reouverteCetteSession`
  // encore vraie et calculerFermetureEffective ne le laisserait jamais
  // refermer la bande.
  reouverteCetteSession = false;
}

// --- Rendu du corps de la bande -------------------------------------------
//
// Une SEULE zone aria-live dans la bande, #pp-corps, dont le contenu ne
// change QUE quand ce qui s'affiche change vraiment : au changement de
// palier (dernierEtapeRendue) OU au changement de la phrase modele rendue
// (dernierePhraseModeleRendue). Jamais a chaque stovo:donnees ni a chaque
// stovo:reponse (§7.4 du plan : trois annonces simultanees avec les deux
// zones deja live de l'ecran Saisir seraient illisibles au lecteur d'ecran).
//
// Correctif post-relecture (18/09/2026) : le seul palier de ce lot dont le
// texte peut changer SANS changer de palier est le palier 3 (le nombre
// souffle suit le stock reel, quantiteSortieProposee). Sans ce deuxieme
// critere, une casse ou une regularisation d'inventaire (qui NE comptent
// PAS comme la sortie du fil : le palier reste 3) faisait bouger le stock
// sans jamais rafraichir le nombre affiche a l'ecran, et le client pouvait
// dicter un nombre trop grand et passer en stock negatif — exactement ce
// que la decision du 17/09 (§3) voulait empecher.
let dernierEtapeRendue = null;
let dernierePhraseModeleRendue;
// Lot 7 (18/09/2026) : le piege jumeau du palier 3 (§5.3), applique cette
// fois au palier 4. Le palier ne change pas (reste 4) mais la variante
// (enRupture, correctif du 18/09 : c'est une rupture litterale, stock <= 0,
// plus une alerte au sens du Pilotage) peut changer SEULE si de nouvelles
// sorties font tomber le produit a zero sans quitter le palier 4 (au plus 6
// mouvements, la borne de debutant le permet). Sans ce deuxieme critere de
// re-rendu, le texte et le bouton resteraient figes sur la variante perimee.
let dernierEnRuptureRendu;
// Lot 6, §5.2 de la consigne : ce que afficherPalier() a rendu en dernier,
// pour que la marche 1 de l'escalier (et le bouton "Ecrire la phrase") puisse
// composer la meme phrase que le palier affiche. Mises a jour a CHAQUE appel
// de afficherPalier, EN DEHORS du if qui garde le re-rendu (ce if existe pour
// ne pas re-annoncer la bande au lecteur d'ecran, pas pour decider de ce dont
// l'escalier se souvient).
let dernierNomProduitRendu = null;
let dernieresOptionsRendues;

// La glu traduit un role deja calcule par le module pur en classe CSS,
// elle ne devine jamais lequel est le marqueur/le trou/la phrase modele
// (§3.3 de la consigne, et son correctif du 18/09 sur les segments).
function classeDuRole(role) {
  if (role === 'modele') return 'pp-modele';
  if (role === 'note') return 'pp-note';
  if (role === 'trou') return 'pp-trou';
  return 'pp-corps-ligne';
}

// Rend un paragraphe. Le cas courant (un seul segment : une ligne de corps,
// de note, ou une phrase modele entierement en gras aux paliers 2 et 3)
// reste un <p> simple avec la classe du role. Un paragraphe a PLUSIEURS
// segments (le palier 1 seulement : marqueur + trou) devient un <p> qui
// enveloppe un <span> par segment, chacun avec sa propre classe : la glu ne
// fait que traduire ce que le module pur a deja decoupe, elle ne recoupe
// jamais un texte.
function rendreLigne(segments) {
  const ligne = document.createElement('p');
  if (segments.length === 1) {
    ligne.className = classeDuRole(segments[0].role);
    ligne.textContent = segments[0].texte;
    return ligne;
  }
  ligne.className = 'pp-corps-ligne';
  segments.forEach((segment) => {
    const span = document.createElement('span');
    span.className = classeDuRole(segment.role);
    span.textContent = segment.texte;
    ligne.appendChild(span);
  });
  return ligne;
}

function rendreCorps(p) {
  elCorps.innerHTML = '';
  p.paragraphes.forEach((texte, i) => {
    const segments = (p.segmentsParagraphes && p.segmentsParagraphes[i])
      || [{ texte, role: (p.rolesParagraphes && p.rolesParagraphes[i]) || 'corps' }];
    elCorps.appendChild(rendreLigne(segments));
  });
}

// Correctif de relecture (18/09/2026, /code-review sur le diff des lots
// 6+7, defaut 3) : aux paliers 4 et 5 (ecrans d'arrivee), il n'y a plus
// d'etape a compter -- `calculerLibelleJalons` rend deja une chaine vide
// au-dela de 3, EXPRES. Avant ce correctif, les trois disques etaient
// quand meme dessines, aucun actif, avec un libelle lecteur d'ecran vide :
// une decoration sans aucun sens a cote d'un bouton de fin de fil. `#pp-
// jalons` est desormais VIDE a ces paliers, jamais rempli de disques
// inertes.
function rendreJalons(etape) {
  elJalons.innerHTML = '';
  if (etape !== 1 && etape !== 2 && etape !== 3) return;
  // Texte lecteur d'ecran, en plus des trois disques `aria-hidden` (§7.4 :
  // "doubles du texte lecteur d'ecran de calculerLibelleJalons").
  const libelleSr = document.createElement('span');
  libelleSr.className = 'sr-only';
  libelleSr.textContent = calculerLibelleJalons(etape);
  elJalons.appendChild(libelleSr);
  for (let i = 1; i <= 3; i += 1) {
    const disque = document.createElement('span');
    disque.className = i === etape ? 'pp-jalon pp-jalon-actif' : 'pp-jalon';
    disque.setAttribute('aria-hidden', 'true');
    elJalons.appendChild(disque);
  }
}

// --- Lot 6 : le secours de l'escalier de comprehension, dans #pp-secours --
//
// Masquage par `hidden`, jamais par `style.display` (garde-fou 7 du plan).
// Aucune zone aria-live ajoutee ici : #pp-corps est la seule de la bande.
function effacerSecours() {
  elSecours.innerHTML = '';
  elSecours.hidden = true;
  // Lot 5, §4 de la consigne : effacerSecours() garde son sens de nettoyage
  // COMPLET, y compris pour l'arbitre ci-dessus -- les deux memoires et le
  // dernier locataire affiche repartent a zero. C'est le piege documente au
  // lot 6, §5.8 : une garde qui protege un rendu ne doit jamais proteger un
  // nettoyage. Ses appelants (masquerBande, le changement de palier dans
  // afficherPalier, la relance explicite) ne changent pas.
  messageParLocataire.micro = null;
  messageParLocataire.comprehension = null;
  dernierLocataireAffiche = null;
}

function rendreSecours(m) {
  if (!m) {
    effacerSecours();
    return;
  }
  elSecours.innerHTML = '';
  m.paragraphes.forEach((texte) => {
    const p = document.createElement('p');
    p.className = 'pp-secours-texte';
    p.textContent = texte;
    elSecours.appendChild(p);
  });
  if (m.bouton) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'pp-secours-bouton';
    bouton.textContent = m.bouton.libelle;
    bouton.dataset.evenement = m.bouton.evenement;
    elSecours.appendChild(bouton);
  }
  elSecours.hidden = false;
}

// --- Lot 7 : les boutons de fin de fil, dans #pp-actions ------------------
//
// Meme patron que rendreSecours/effacerSecours ci-dessus : delegation de
// clic unique sur le conteneur (§5.3 de la consigne), jamais un ecouteur
// par bouton recree. Masquage par `hidden`, jamais par `style.display`
// (garde-fou du plan). Aucune zone aria-live ajoutee.
function effacerActions() {
  elActions.innerHTML = '';
  elActions.hidden = true;
}

function creerBoutonAction(bouton, classe) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = classe;
  b.textContent = bouton.libelle;
  b.dataset.evenement = bouton.evenement;
  return b;
}

// `bouton`/`boutonSecondaire` viennent tels quels de textesDuPalier (§5.3 :
// "construits depuis ce que le module pur a deja decide, jamais depuis un
// libelle ecrit ici"). Rien a afficher aux paliers 1 a 3 (bouton et
// boutonSecondaire valent null) : #pp-actions reste vide, donc masque.
function rendreActions(bouton, boutonSecondaire) {
  if (!bouton && !boutonSecondaire) {
    effacerActions();
    return;
  }
  elActions.innerHTML = '';
  if (bouton) elActions.appendChild(creerBoutonAction(bouton, 'pp-action-principale'));
  if (boutonSecondaire) elActions.appendChild(creerBoutonAction(boutonSecondaire, 'pp-action-secondaire'));
  elActions.hidden = false;
}

// Compose et rend le texte de la marche demandee, a partir de ce que
// afficherPalier() a retenu en dernier (dernierEtapeRendue, nom et options).
// `marche` a 0 (ou une etape hors du fil dicte) rend null : texteMarcheComprehension
// le sait deja, cette fonction ne fait que traduire son resultat en DOM.
function afficherMarche(marche) {
  const m = texteMarcheComprehension(marche, dernierEtapeRendue, dernierNomProduitRendu, dernieresOptionsRendues);
  // Lot 5 : passe par l'arbitre au lieu de rendre directement -- l'escalier
  // micro peut avoir la main sur #pp-secours au moment ou celui-ci parle.
  poserMessage('comprehension', m);
}

function masquerBande() {
  section.hidden = true;
  dernierEtapeRendue = null;
  dernierePhraseModeleRendue = undefined;
  // Lot 6, §5.8 de la consigne (la ligne la plus importante du lot) : une
  // garde qui protege un rendu ne doit jamais proteger un nettoyage. Sans
  // ces quatre lignes, le nom de produit et le secours d'un compte restent
  // visibles pour le compte suivant.
  escalier.changerPalier();
  // Lot 5 : meme raison que la ligne ci-dessus, appliquee au lecteur micro
  // -- un etat 'panne' du compte precedent ne doit pas survivre pour le
  // compte suivant.
  lecteurMicro = creerLecteurMicroDuFil();
  effacerSecours();
  dernierNomProduitRendu = null;
  dernieresOptionsRendues = undefined;
  // Lot 7 : meme raison que les quatre lignes ci-dessus, appliquee a
  // #pp-actions et a la variante du palier 4 : un bouton "J'ai fini" ou
  // "Voir mon Pilotage" du compte precedent ne doit jamais survivre pour le
  // compte suivant.
  effacerActions();
  dernierEnRuptureRendu = undefined;
}

function afficherPalier(etape, nomProduit, options) {
  const p = textesDuPalier(etape, nomProduit, options);
  if (!p) return;
  section.hidden = false;

  // Lot 6, §5.2 : se souvenir de ce qui est a l'ecran, EN DEHORS du if qui
  // garde le re-rendu ci-dessous (ce if existe pour ne pas re-annoncer la
  // bande au lecteur d'ecran, pas pour decider de ce dont l'escalier se
  // souvient).
  dernierNomProduitRendu = nomProduit;
  dernieresOptionsRendues = options;

  const changeDePalier = etape !== dernierEtapeRendue;
  if (changeDePalier) {
    // Lot 6, §5.3 : le changement de palier remet l'escalier a zero et
    // efface le secours affiche pour l'ancien palier.
    escalier.changerPalier();
    effacerSecours();
  }

  // Lot 7 : piege jumeau du palier 3 (§5.3), applique au palier 4 : la
  // variante (enRupture, correctif du 18/09) peut changer SANS que le
  // palier change (etape reste 4). `undefined` aux autres paliers, pour ne
  // jamais forcer un re-rendu qui n'a pas lieu d'etre.
  const enRuptureActuel = etape === 4 ? Boolean(options && options.enRupture) : undefined;
  const changeDeVariante = enRuptureActuel !== dernierEnRuptureRendu;

  if (changeDePalier || p.phraseModele !== dernierePhraseModeleRendue || changeDeVariante) {
    rendreCorps(p);
    rendreJalons(etape);
    rendreActions(p.bouton, p.boutonSecondaire);
    dernierEtapeRendue = etape;
    dernierePhraseModeleRendue = p.phraseModele;
    dernierEnRuptureRendu = enRuptureActuel;

    // Lot 6, piege jumeau du §5.3 : si la phrase modele change (le palier 3,
    // le stock a bouge) SANS que le palier change, et que la marche 1 de
    // l'escalier est affichee, elle souffle une phrase perimee, donc un
    // nombre perime -> on la re-rend avec la nouvelle phrase.
    if (!changeDePalier && escalier.marcheCourante() === 1) {
      afficherMarche(1);
    }
  }
}

// Retrouve le produit nomme par le fil dans le tableau publie par
// dashboard.js, pour lire son stock reel (palier 3, decision posterieure au
// plan : "le nombre proposé suit le stock réel du produit", voir
// 2026-09-17_premiers-pas_decisions-apres-plan.md §3). `calculerEtatDuFil`
// ne rend que le NOM du produit choisi (choisirProduitDuFil), pas l'objet
// entier : cette recherche reste cote glu, le module pur n'a pas a
// connaitre la forme d'un produit Supabase.
function trouverProduitParNom(produits, nom) {
  if (!Array.isArray(produits) || typeof nom !== 'string') return null;
  return produits.find((p) => p && p.nom === nom) || null;
}

// Correctif de relecture (18/09/2026, tranche par Corentin, 3e passe de
// /code-review) : la variante B du palier 4 est une RUPTURE litterale
// (stock_actuel <= 0), plus la regle d'alerte de pilotage.js
// (stock_actuel <= pointCommande, qui se declenchait AVANT que le stock
// soit vraiment a zero : voir palier4 dans premiers_pas_logique.js pour le
// cas concret qui a fait changer la regle). Plus besoin de
// calculerLignePilotage ni d'aucune donnee de mouvements pour ce calcul.
// `produit` absent (nom pas encore retrouve dans le tableau publie) -> pas
// de rupture plutot qu'une exception : la variante A est le repli le moins
// alarmant.
function calculerEnRuptureProduit(produit) {
  if (!produit) return false;
  return Number(produit.stock_actuel) <= 0;
}

// Construit les `options` attendues par textesDuPalier/afficherPalier pour
// un etape/nomProduit donnes, a partir des donnees REELLES publiees par
// dashboard.js. PARTAGEE entre l'ecouteur stovo:donnees et la relance
// (appliquerDecisionRelance) : les deux endroits calculent l'options de la
// MEME facon, jamais une regle recopiee a deux endroits (dette D30/D5/D22).
function construireOptionsPalier(etape, nomProduit, produits) {
  if (etape === 3) {
    return { stockActuel: (trouverProduitParNom(produits, nomProduit) || {}).stock_actuel };
  }
  if (etape === 4) {
    return { enRupture: calculerEnRuptureProduit(trouverProduitParNom(produits, nomProduit)) };
  }
  return undefined;
}

// Execute ce que resoudreRelance() a decide (module pur, ne touche jamais
// au DOM) : bascule sur Saisir avec le bon palier, ou ecrit le message dans
// le rayon "Apprendre Stovo" de l'Aide. Aucune branche 'attendre' ici : ce
// cas est filtre en amont par les deux appelants (lot 4, §3 de la consigne).
function appliquerDecisionRelance(decision, produits) {
  if (decision.action === 'basculer') {
    // Correctif de relecture (18/09/2026, /code-review sur le diff des
    // lots 6+7, defaut 4) : une relance EXPLICITE ("Refaire mes premiers
    // pas") remet toujours l'escalier a zero et efface le secours, MEME si
    // le palier resolu est celui deja affiche -- dans ce cas, afficherPalier
    // ne le ferait pas de lui-meme (changeDePalier serait faux). Sans ces
    // deux lignes, le secours d'une marche atteinte avant la relance (par
    // exemple "Passer cette etape", pas encore tape) survivait a un
    // "Refaire mes premiers pas", ce qui n'a aucun sens : la relance est un
    // vrai redemarrage.
    escalier.changerPalier();
    effacerSecours();
    const options = construireOptionsPalier(decision.etape, decision.nomProduit, produits);
    afficherPalier(decision.etape, decision.nomProduit, options);
    document.dispatchEvent(new CustomEvent('stovo:onglet', { detail: { onglet: 'parler' } }));
  } else if (decision.action === 'message') {
    // Rien a montrer : on NE bascule PAS d'onglet (§5.3 de la consigne du
    // lot 3, "Tout ce que Stovo sait dire est juste en dessous" designe la
    // section suivante du MEME ecran Aide, partir sur Saisir eloignerait le
    // client de la promesse).
    document.dispatchEvent(new CustomEvent('stovo:tuto-reponse', {
      detail: { id: 'premiers-pas', message: messageRelanceImpossible() },
    }));
  }
}

// --- La decision : a chaque stovo:donnees ---------------------------------
//
// Tant qu'aucun stovo:donnees n'est arrive, la section reste `hidden` telle
// qu'ecrite dans index.html : pas de clignotement du palier 1 pendant le
// chargement (§6 de la consigne). Seuls les paliers 1, 2 et 3 sont rendus
// dans ce lot ; 4 et 5 (et tout `visible: false`) masquent la bande.
document.addEventListener('stovo:donnees', (evenement) => {
  const detail = evenement.detail || {};

  // Correctif de relecture (18/09/2026, defauts A/B/C) : `afficherLogin()`
  // (ecran_session.js, HORS perimetre de ce lot) masque `#app-shell` PUIS
  // appelle `viderDashboard()`, qui publie ce meme `stovo:donnees` avec
  // `produits: []` -- AVANT de remettre l'onglet sur Pilotage. Un
  // `stovo:donnees` recu pendant que l'app n'est pas a l'ecran ne
  // represente rien de reel pour CE compte (ni pour le suivant, s'il se
  // connecte sans recharger la page) : on NETTOIE et on NE RETIENT rien,
  // au lieu de simplement sauter la partie utile comme le faisait la garde
  // precedente. `masquerBande()` empeche le nom du produit du compte
  // precedent de rester visible sous l'ecran de login puis, un instant,
  // sous le compte suivant (afficherApp() demasque #app-shell avant que
  // charger() ne reponde). `attenteRelance.consommer()` evite qu'une
  // relance armee juste avant une deconnexion se resolve sur ce
  // `produits: []` et se legue au compte suivant. `dernierDetailConnu`
  // n'est PAS mis a jour ici : il reste la derniere donnee REELLE connue,
  // voir son commentaire de declaration plus haut.
  if (appShell.hidden) {
    masquerBande();
    attenteRelance.consommer(); // une relance d'une autre session ne se legue pas
    annulerMinuteurRelance(); // D64 : rien a annoncer 8s apres une deconnexion
    // Correctif de relecture (18/09/2026) : sans cette ligne, un compte qui
    // s'est extrait du fil par "Passer cette etape" leguerait ce choix au
    // compte suivant.
    sortieParEscalier = false;
    return;
  }
  dernierDetailConnu = detail;

  const ferme = calculerFermetureEffective({
    fermeCetteSession,
    reouverteCetteSession,
    drapeauStockage: lireDrapeauStockage(),
  });
  const etat = calculerEtatDuFil({
    produits: detail.produits,
    mouvements: detail.mouvements,
    ferme,
    sortieParEscalier,
  });

  if (etat.visible && (etat.etape === 1 || etat.etape === 2 || etat.etape === 3 || etat.etape === 4)) {
    // Au palier 3 : le nombre soufflé suit le stock réel du produit
    // (quantiteSortieProposee, plancher 1, plafond 3), jamais un "3" en
    // dur. Au palier 4 : la variante suit la RUPTURE reelle du produit du
    // fil (stock_actuel <= 0, correctif du 18/09 tranche par Corentin),
    // jamais devinee. `construireOptionsPalier` (partagee avec
    // appliquerDecisionRelance ci-dessus) calcule les deux de la MEME
    // facon.
    const options = construireOptionsPalier(etat.etape, etat.nomProduit, detail.produits);
    afficherPalier(etat.etape, etat.nomProduit, options);
  } else if (etat.visible && etat.etape === 5) {
    afficherPalier(5, null, undefined);
  } else {
    masquerBande();
  }

  // Lot 4, §2 de la consigne : l'ouverture automatique sur Saisir. Le
  // predicat doitOuvrirSurSaisir (lot 1, deja teste) lit l'etat courant du
  // droit sans jamais l'ecrire ; seul un `oui` declenche
  // gardeBascule.consommer(), qui ferme le droit pour la vie de la page.
  // `etat.etape` vaut `null` quand la bande est fermee (croix ou drapeau
  // localStorage) : pas de bascule forcee vers un fil deja ferme.
  if (doitOuvrirSurSaisir({ etape: etat.etape, ...gardeBascule.etatCourant() })) {
    gardeBascule.consommer();
    document.dispatchEvent(new CustomEvent('stovo:onglet', { detail: { onglet: 'parler' } }));
  }

  // Lot 4, §3 de la consigne : une relance armee avant que la premiere
  // donnee ne soit connue se resout maintenant, sur des donnees REELLES,
  // et une seule fois (attenteRelance.consommer() ne rend true qu'un coup).
  if (attenteRelance.consommer()) {
    annulerMinuteurRelance(); // D64 : la relance a abouti, pas de message d'echec a 8s
    const decision = resoudreRelance({ connu: true, produits: detail.produits, mouvements: detail.mouvements });
    appliquerDecisionRelance(decision, detail.produits);
  }
});

// --- La croix : ferme definitivement (dans ce lot) -------------------------
elFermer.addEventListener('click', () => {
  ecrireDrapeauFermeture();
  masquerBande();
});

// --- Lot 6, §5.6 : le bouton "Ecrire la phrase" (marche 2) -----------------
//
// Patron exact de aide.js (l.170 et suivantes). Rien n'est envoye : c'est
// toujours le client qui appuie sur Envoyer. Le focus est donne DANS le
// gestionnaire du tap, jamais en differe (iOS n'ouvre le clavier que dans
// le geste de l'utilisateur).
function ecrireLaPhrase() {
  const champ = document.getElementById('champ-parler');
  if (!champ) return;
  champ.value = phrasePourLeChamp(dernierEtapeRendue, dernierNomProduitRendu, dernieresOptionsRendues);
  champ.dispatchEvent(new Event('input', { bubbles: true })); // declenche l'ajustement de hauteur du textarea
  champ.focus();
}

// --- Lot 7, §4.1 : le bouton "Passer cette etape" (marche 3) mene au
// palier de sortie, POUR DE BON -------------------------------------------
//
// effetMarche3() rend 'palier-sortie' (renvoi du 21/09/2026 : ce palier
// n'est plus une etape du fil, seulement son palier de sortie -- la valeur
// a change de 'palier-5' pour ne jamais se confondre avec un passage normal
// 4 -> 5, qui n'existe plus). `sortieParEscalier` le fait tenir EXPRES,
// meme si le prochain stovo:donnees (le tick de 30s de dashboard.js)
// rapporte des donnees encore a l'etape 1, 2 ou 3. Rendu immediat en plus
// (pas seulement le drapeau) : la bande doit deja montrer 5 sans attendre
// le prochain evenement.
function passerCetteEtape() {
  if (effetMarche3() === 'palier-sortie') {
    sortieParEscalier = true;
    afficherPalier(5, null, undefined);
  }
}

// Delegation de clic sur #pp-secours (les boutons de l'escalier sont recrees
// a chaque rendu, voir rendreSecours) : un seul ecouteur, jamais un par
// bouton. `evenement` de chaque bouton est un nom FIXE porte par
// TEXTE_COMPREHENSION_MARCHE (premiers_pas_logique.js), jamais invente ici.
elSecours.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('button[data-evenement]');
  if (!bouton) return;
  if (bouton.dataset.evenement === 'stovo:premiers-pas-ecrire') {
    ecrireLaPhrase();
  } else if (bouton.dataset.evenement === 'stovo:premiers-pas-passer') {
    passerCetteEtape();
  }
});

// --- Lot 7, §5.3/§5.4/§5.5/§5.6 : les boutons de fin de fil, dans
// #pp-actions -------------------------------------------------------------
//
// Meme delegation de clic unique que #pp-secours ci-dessus (les boutons
// sont recrees a chaque rendu, voir rendreActions). `evenement` de chaque
// bouton est un nom FIXE porte par textesDuPalier (premiers_pas_logique.js),
// jamais invente ici.
elActions.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('button[data-evenement]');
  if (!bouton) return;
  const nomEvenement = bouton.dataset.evenement;

  if (nomEvenement === 'stovo:premiers-pas-voir-pilotage') {
    // Renvoi du 21/09/2026 (§4 de la consigne) : la bande vit dans
    // #ecran-parler et disparait des qu'on la quitte, donc "Voir mon
    // Pilotage" FERME desormais le fil au lieu de preparer un palier 5 que
    // personne ne voit -- exactement ce que faisait "J'ai fini" (disparu,
    // voir plus bas). Memes fonctions reutilisees, aucune nouvelle ecrite :
    // ecrireDrapeauFermeture() pose aussi fermeCetteSession (meme chemin
    // que la croix), masquerBande() nettoie la bande, puis bascule sur
    // Pilotage.
    ecrireDrapeauFermeture();
    masquerBande();
    document.dispatchEvent(new CustomEvent('stovo:onglet', { detail: { onglet: 'dashboard' } }));
  } else if (nomEvenement === 'stovo:premiers-pas-importer') {
    // §5.5 : le clic sur le vrai #champ-import doit avoir lieu DANS ce
    // gestionnaire de tap, jamais en differe (iOS n'ouvre le selecteur que
    // dans le geste de l'utilisateur). Rien de la chaine d'import n'est
    // reecrit : parler.js (l.80) ecoute deja ce champ.
    //
    // Correctif de relecture (18/09/2026, /code-review, defaut B) :
    // #btn-import est le SEUL garde-fou FRONT contre un import lance au
    // milieu d'une session exclusive (reception/sortie/inventaire,
    // verrou.js dans parler.js) -- le serveur ne le rattrape pas pour ce
    // kind. reception.js et sortie.js le masquent (`hidden = true`) a
    // l'ouverture de leur mode ; la bande "Premiers pas" n'est PAS masquee
    // pendant une session (borne de debutant independante du verrou), donc
    // ce bouton peut rester visible en meme temps qu'une session est
    // ouverte. On LIT le meme etat que le vrai bouton, on ne le devine ni
    // ne le contourne : si l'import est indisponible, ce bouton reste sans
    // effet visible, comme #btn-import lui-meme le serait.
    const btnImport = document.getElementById('btn-import');
    if (btnImport && btnImport.hidden) return;
    const champImport = document.getElementById('champ-import');
    if (champImport) champImport.click();
  }
  // Renvoi du 21/09/2026 : la branche 'stovo:premiers-pas-fini' ("J'ai
  // fini") disparait, son role est repris par 'stovo:premiers-pas-voir-
  // pilotage' ci-dessus (la seule fermeture qui reste au palier 4).
});

// --- Lot 4, §2 de la consigne : detecter une navigation manuelle ---------
//
// app.js (l.166) cable `bouton.addEventListener('click', () => afficherOnglet(...))`
// directement sur chaque `.nav-item` SANS emettre le moindre evenement :
// ecouter `stovo:onglet` ne verrait donc jamais un tap sur la barre du bas.
// `app.js` est interdit dans ce lot (garde-fou 3 du plan) : seule voie
// propre, une DELEGATION de clic au niveau `document`, qui ne cree ni
// n'ecoute aucun evenement neuf. Tout `.nav-item`, y compris "Saisir"
// lui-meme, ferme le droit : des que le client a choisi son ecran, l'app
// ne decide plus a sa place (meme s'il retape sur l'onglet ou il est deja).
document.addEventListener('click', (evenement) => {
  const cible = evenement.target;
  if (cible && typeof cible.closest === 'function' && cible.closest('.nav-item')) {
    gardeBascule.noterNavigationManuelle();
  }
});

// --- La vivacite, sans requete inutile : anti-rebond A QUEUE (§6) --------
//
// Sans ce mecanisme, stovo:donnees n'arrive qu'au chargement, au tap sur
// "Rafraichir" et toutes les 30 s (dashboard.js) : un client qui vient de
// dicter attendrait jusqu'a 30 s avant que la bande n'avance. Throttle a
// la fin de fenetre (trailing) : le premier stovo:reponse d'une fenetre de
// 2 s declenche rafraichirDonnees() tout de suite ; les suivants, dans la
// meme fenetre, sont REPORTES a la fin de la fenetre (jamais jetes) ; au
// dela de 2 s sans appel, la fenetre suivante redemarre a zero.
const DELAI_ANTI_REBOND_MS = 2000;
let derniereFoisMs = 0;
let minuteurEnAttente = null;

function demanderRafraichissement() {
  // Seulement si la bande est visible a cet instant (§6) : un compte etabli
  // ne doit pas gagner une requete reseau a chaque phrase a cause d'un fil
  // qu'il ne verra jamais.
  if (section.hidden) return;
  const maintenant = Date.now();
  const ecoule = maintenant - derniereFoisMs;
  if (ecoule >= DELAI_ANTI_REBOND_MS) {
    derniereFoisMs = maintenant;
    rafraichirDonnees();
  } else if (minuteurEnAttente === null) {
    minuteurEnAttente = setTimeout(() => {
      minuteurEnAttente = null;
      derniereFoisMs = Date.now();
      rafraichirDonnees();
    }, DELAI_ANTI_REBOND_MS - ecoule);
  }
}

// Emis par parler.js en fin de afficherReponse (une ligne ajoutee a ce
// fichier par ce lot, voir le rapport de passation).
document.addEventListener('stovo:reponse', demanderRafraichissement);

// --- Lot 6, §5.4 de la consigne : l'escalier de comprehension avance sur
// CHAQUE reponse du serveur ---------------------------------------------
//
// Ecouteur DE PLUS, a cote de demanderRafraichissement ci-dessus (non
// modifie). Un compte etabli qui ne verra jamais le fil ne fait pas monter
// un compteur invisible : on sort sans rien compter si la bande n'est pas a
// l'ecran.
function gererReponsePourEscalier(evenement) {
  if (section.hidden) return;
  const detail = evenement.detail || {};
  const marche = escalier.recevoirReponse({ enAttente: detail.enAttente, choix: detail.choix });
  afficherMarche(marche);
}

document.addEventListener('stovo:reponse', gererReponsePourEscalier);

// --- Lot 5 (20/09/2026), §5 de la consigne : l'escalier micro avance sur
// CHAQUE evenement stovo:micro (parler.js, journaliser()) --------------
//
// Difference ASSUMEE avec gererReponsePourEscalier ci-dessus : la garde
// `section.hidden` est placee APRES lecteurMicro.gerer(), jamais avant.
// Avant, dans gererReponsePourEscalier, pour une raison qui ne vaut pas
// ici : un compte etabli ne doit pas faire monter un compteur d'echecs
// invisible. La machine du micro, elle, est un suivi d'ETAT, pas un
// compteur : si elle rate un `demande-start` pendant que la bande est
// masquee, elle reste en `repos`, et la garde qui tombe ensuite
// (marcheDepuisEvenement, premiers_pas_logique.js) ne rend plus la marche 1
// QUE depuis `attente` -- le fil se tairait au moment exact ou il doit
// parler. On nourrit donc TOUJOURS la machine, on n'affiche que si la
// bande est a l'ecran. Consequence acceptee, non corrigee (§5 de la
// consigne) : si la panne est atteinte pendant que la bande est masquee,
// le message n'apparait pas a l'ouverture de la bande, il attendra le
// prochain appui sur le micro -- coherent avec "rien ne rallume tout
// seul" (§7.2 du plan du 17/09).
function gererEvenementMicro(evenement) {
  const detail = evenement.detail || {};
  const etat = lecteurMicro.gerer(detail.evenement);
  if (section.hidden) return;
  poserMessage('micro', etat.message);
}

document.addEventListener('stovo:micro', gererEvenementMicro);

// --- Lot 7, §5.7 : la dette D64, le minuteur de la relance -----------------
//
// `charger()` (dashboard.js) sort SANS publier stovo:donnees si la lecture
// des produits echoue (hors ligne, jeton expire, erreur RLS) : l'attente
// armee par le rayon "Apprendre Stovo" (ci-dessous) n'est alors JAMAIS
// consommee, et "Relancer" parait casse. `armerMinuteurRelance` remplace un
// minuteur en cours au lieu d'en empiler un deuxieme (un second tap sur
// "Relancer" avant l'echeance des 8s) ; `annulerMinuteurRelance` est appelee
// aux DEUX endroits qui consomment attenteRelance (le cas normal et la
// branche de deconnexion, voir l'ecouteur stovo:donnees plus haut) : un
// message d'echec qui s'afficherait 8s apres une deconnexion ou une relance
// reussie serait une regression a lui tout seul.
const DELAI_RELANCE_ECHOUEE_MS = 8000;
let minuteurRelance = null;

function annulerMinuteurRelance() {
  if (minuteurRelance !== null) {
    clearTimeout(minuteurRelance);
    minuteurRelance = null;
  }
}

function armerMinuteurRelance() {
  annulerMinuteurRelance(); // remplace, n'empile jamais un deuxieme minuteur
  minuteurRelance = setTimeout(() => {
    minuteurRelance = null;
    // consommer() ne rend true que si l'attente n'a pas deja ete resolue
    // par un vrai stovo:donnees arrive avant l'echeance (voir plus haut).
    if (attenteRelance.consommer()) {
      document.dispatchEvent(new CustomEvent('stovo:tuto-reponse', {
        detail: { id: 'premiers-pas', message: messageRelanceEchouee() },
      }));
    }
  }, DELAI_RELANCE_ECHOUEE_MS);
}

// --- Le rayon "Apprendre Stovo" : la relance (lot 3, 18/09/2026) ---------
//
// aide.js emet stovo:tuto-lancer pour CHAQUE bouton du rayon, avec juste un
// id recopie de data-tuto (aucun nom d'evenement construit sur une donnee,
// §3.2 du plan) : c'est a CE module de filtrer et de ne reagir qu'a l'id
// qu'il connait, jamais a aide.js de savoir que 'premiers-pas' existe.
document.addEventListener('stovo:tuto-lancer', (evenement) => {
  const detail = evenement.detail || {};
  if (detail.id !== 'premiers-pas') return;

  // La croix redevient reversible : meme garde try/catch que
  // ecrireDrapeauFermeture (localStorage peut lever en navigation privee
  // Safari, une relance ne fait jamais planter l'ecran pour autant).
  try {
    localStorage.removeItem(CLE_STOCKAGE_FERMETURE);
  } catch (_e) {
    // Correctif de relecture (18/09/2026, defaut E) : ce commentaire
    // affirmait auparavant que `fermeCetteSession = false` (ligne
    // suivante) suffisait a rouvrir la bande meme si cette ecriture
    // echoue. C'etait faux : `lireDrapeauStockage()` relit encore '1'
    // (la valeur n'a pas pu etre effacee), et `ferme` etait recalcule a
    // CHAQUE stovo:donnees en repartant de cette lecture. `reouverteCetteSession`
    // (ligne suivante) est le vrai correctif : il fait gagner cette
    // relance sur la lecture localStorage, voir calculerFermetureEffective.
  }
  fermeCetteSession = false;
  reouverteCetteSession = true;
  // Correctif de relecture (18/09/2026, /code-review sur le diff des lots
  // 6+7, defaut 2) : une relance ("Refaire mes premiers pas") doit repartir
  // du VRAI etat des donnees, pas d'un choix fige d'une session precedente.
  // Sans cette ligne, un client qui avait tape "Passer cette etape"
  // (sortieParEscalier) voyait la relance afficher le bon palier un
  // instant, puis le tick de 30s de dashboard.js le ramenait sur l'ecran
  // d'import sans aucune explication (le drapeau, jamais remis a faux,
  // reprenait la main). Meme raison que la remise a faux a la deconnexion
  // (branche appShell.hidden, plus haut). Renvoi du 21/09/2026 : la remise
  // a faux de `paliersForces` a disparu avec le champ lui-meme.
  sortieParEscalier = false;

  // Lot 4, §3 de la consigne : correctif de la limite assumee au lot 3.
  // `resoudreRelance` (module pur) decide, la glu execute seulement.
  // Si AUCUN stovo:donnees n'est encore arrive cette session
  // (dernierDetailConnu === null), on ne repond pas tout de suite : la
  // decision serait prise sur des donnees inconnues, et le message "tes
  // premiers pas sont deja faits" pouvait etre affiche a tort (limite
  // ecrite dans le rapport de passation du lot 3). On arme une attente,
  // consommee au prochain stovo:donnees (voir plus haut), et on demande un
  // rafraichissement immediat pour ne pas laisser le client sans reponse.
  if (dernierDetailConnu === null) {
    attenteRelance.armer();
    armerMinuteurRelance(); // D64 : un second tap remplace le minuteur precedent
    rafraichirDonnees();
    return;
  }

  const decision = resoudreRelance({
    connu: true,
    produits: dernierDetailConnu.produits,
    mouvements: dernierDetailConnu.mouvements,
  });
  appliquerDecisionRelance(decision, dernierDetailConnu.produits);
});

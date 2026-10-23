// STOVO — les missions de la démo, côté écran (lot L7, 08/10/2026)
// ====================================================================
// Glu DOM de la carte « L'essentiel, en 5 phrases », en haut de l'écran Saisir, EN DÉMO
// SEULEMENT. Importé pour effet de bord par demo.js (une ligne), même patron que
// premiers_pas.js : abonnement à `stovo:donnees` et `stovo:reponse`, rafraîchissement des
// données au plus une fois toutes les 2 secondes, aucun drapeau d'étape stocké.
//
// Toute décision vit dans missions_demo_logique.js (pur, testé) : quelle mission est faite,
// quelle carte composer. Ici : lire la ligne `demos` du visiteur, dessiner, remplir le champ
// de saisie quand on touche une phrase, proposer la sortie une fois quand les cinq sont faites.
// L'ordre des événements est prouvé par le banc Chromium .claude/outils/banc-demo-L7.mjs.
//
// Un testeur (compte normal) ne voit RIEN et n'a aucune requête de plus : la carte n'est même
// pas créée dans la page, elle naît à `stovo:demo` ({ actif: true }) et disparaît quand la
// démo n'est plus active (fin, ou « J'ai un compte Stovo »). Son écran Saisir garde donc
// exactement le HTML d'avant ce lot.
//
// La ligne `demos` du visiteur : au démarrage, demo.js l'a déjà lue (une seule lecture au lancement)
// et la donne dans l'événement stovo:demo. Mais `question_le` et `reappro_le` se posent PENDANT la
// session, sur le serveur, à la première question du visiteur, et celle de demo.js est mise en cache
// pour la vie de la page : ce module la relit donc lui-même, une fois après chaque réponse du
// serveur, tant que les deux traces ne sont pas posées. Elles ne bougent plus ensuite.

import { supabase } from './supabase.js';
import { rafraichirDonnees } from './dashboard.js';
import {
  cleStockageDemo,
  estCodeDemo,
  joursRestants,
  momentSortieAProposer,
} from './demo_logique.js';
import { composerCarte, etatDesMissions, fusionnerCoches } from './missions_demo_logique.js';
import * as textes from './demo_textes.js';

const $ = (id) => document.getElementById(id);
const appShell = $('app-shell');

let enDemo = false;
let dernierDetail = null; // dernier stovo:donnees REEL ({ produits, mouvements, ... }) pendant que l'app est à l'écran
let ligne = null; // { code, cree_le, question_le, reappro_le } ; null tant qu'elle n'est pas lue
let numeroLecture = 0; // une lecture périmée (une plus récente a été lancée) jette son résultat
let toutFait = false; // les cinq sont faites : plus rien à demander à la base
let faitesVues = []; // identifiants des missions DÉJÀ prouvées pendant cette page (mémoire vive, jamais stockée) : une publication en retard ne les décoche pas
let aRelire = false; // une réponse du serveur est arrivée : la ligne demos peut avoir une trace de plus
let sortieMontreePour = null; // code de la démo dont la sortie a déjà été montrée pendant cette page (le stockage local peut manquer)

// --- Stockage local : sous try/catch (navigation privée, quota à zéro) -----

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
    // Sans stockage, la démo marche quand même : seul le « une seule fois » de la sortie se perd.
  }
}

// --- La carte : créée à la demande, retirée quand la démo n'est plus active --------------

let carte = null; // { racine, jalons, liste, fini, lignes: Map(id -> { li, case }) }

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function construireCarte() {
  const racine = el('details', 'missions-demo');
  racine.id = 'missions-demo';
  racine.open = true;
  const resume = el('summary', 'missions-sommaire');
  const titre = el('span', 'missions-titre');
  const jalons = el('span', 'missions-jalons');
  jalons.setAttribute('aria-hidden', 'true');
  resume.append(titre, jalons);
  const corps = el('div', 'missions-corps');
  const consigne = el('p', 'missions-consigne');
  const liste = el('ol', 'missions-liste');
  const fini = el('p', 'missions-fini');
  fini.hidden = true;
  corps.append(consigne, liste, fini);
  racine.append(resume, corps);
  // En tête de l'écran Saisir, juste sous son titre masqué (h1.sr-only).
  const centre = document.querySelector('#ecran-parler .parler-centre');
  centre.querySelector('h1').after(racine);
  return { racine, titre, jalons, consigne, liste, fini, lignes: new Map() };
}

function retirerCarte() {
  if (carte) carte.racine.remove();
  carte = null;
}

// Pose (ou met à jour) la carte composée par le module pur. Les lignes ne sont créées qu'une
// fois : une mise à jour ne change que l'état coché, jamais les boutons (sinon une phrase en
// train d'être touchée perdrait son élément).
function poserCarte(c) {
  if (!carte) carte = construireCarte();
  carte.titre.textContent = c.titre;
  carte.consigne.textContent = c.consigne;
  c.lignes.forEach((l) => {
    let ref = carte.lignes.get(l.id);
    if (!ref) {
      const idTitre = `mission-titre-${l.id}`;
      const li = el('li', 'missions-ligne');
      // Case native, inactive : son état coché est lu par les lecteurs d'écran sans texte de plus.
      const caseCochee = el('input', 'missions-case');
      caseCochee.type = 'checkbox';
      caseCochee.disabled = true;
      caseCochee.setAttribute('aria-labelledby', idTitre);
      const texte = el('div', 'missions-texte');
      const titre = el('span', 'missions-ligne-titre', l.titre);
      titre.id = idTitre;
      // .aide-exemple : la même phrase-bouton que dans l'Aide (toucher = remplir le champ).
      const phrase = el('button', 'aide-exemple missions-phrase', l.phrase);
      phrase.type = 'button';
      texte.append(titre, phrase);
      if (l.apres) texte.append(el('p', 'missions-apres', l.apres));
      li.append(caseCochee, texte);
      carte.liste.append(li);
      const jalon = el('span', 'missions-jalon');
      carte.jalons.append(jalon);
      ref = { li, case: caseCochee, jalon };
      carte.lignes.set(l.id, ref);
    }
    ref.case.checked = l.fait;
    ref.li.classList.toggle('missions-faite', l.fait);
    ref.jalon.classList.toggle('missions-jalon-fait', l.fait);
  });
  carte.fini.hidden = c.fini === null;
  if (c.fini !== null) carte.fini.textContent = c.fini;
}

// Toucher une phrase la recopie dans le champ de saisie, SANS rien envoyer : c'est le visiteur
// qui la dit ou l'envoie. Même geste que le bouton « Écrire la phrase » de premiers_pas.js
// (focus donné dans le geste du toucher, jamais en différé : iOS n'ouvre le clavier qu'ainsi).
document.addEventListener('click', (evenement) => {
  const bouton = evenement.target instanceof Element ? evenement.target.closest('.missions-phrase') : null;
  if (!bouton) return;
  const champ = $('champ-parler');
  if (!champ) return;
  champ.value = bouton.textContent;
  champ.dispatchEvent(new Event('input', { bubbles: true })); // l'ajustement de hauteur du textarea
  champ.focus();
});

// --- La sortie, une fois, quand les cinq sont faites -------------------------------------
// C'est le moment 'essentiel' de momentSortieAProposer (demo_logique.js), propre à CHAQUE démo
// (la clé du drapeau porte le code). Il se montre dans la zone #demo-sortie du bandeau (demo.js
// la ferme au toucher de ✕). Son texte est TEXTE_SORTIE_ESSENTIEL (texte d, version A) ; la carte des
// missions garde sa propre phrase, TEXTE_MISSIONS_FINI.
//
// Elle ne se montre que si elle se VOIT, et sans rien écraser (correctifs de revue) :
//   - la zone vit dans #demo-bandeau, que demo.js laisse caché quand sa lecture de démarrage a échoué :
//     on n'ouvre rien et on ne pose PAS le drapeau, la prochaine tentative (stovo:donnees) réessaie ;
//   - si la zone porte déjà un autre message (le 3e jour, dont le drapeau est déjà posé), on ne
//     l'écrase pas et on attend, sans drapeau, qu'elle soit libre (fermeture de ✕, ou le tick suivant).
function proposerSortie() {
  if (!ligne || !estCodeDemo(ligne.code) || ligne.code === sortieMontreePour) return;
  if ($('demo-bandeau').hidden) return;
  if (!$('demo-sortie').hidden && $('demo-sortie-texte').textContent !== textes.TEXTE_SORTIE_ESSENTIEL) return;
  const nom = `sortie_essentiel_${ligne.code}`;
  const moment = momentSortieAProposer({
    joursRestants: joursRestants(ligne.cree_le, Date.now()),
    essentielFait: true,
    dejaVus: { essentiel: lireLocal(nom) !== null },
  });
  if (moment !== 'essentiel') return;
  $('demo-sortie-texte').textContent = textes.TEXTE_SORTIE_ESSENTIEL;
  $('demo-sortie').hidden = false;
  sortieMontreePour = ligne.code;
  ecrireLocal(nom, '1');
}

// Quand le visiteur ferme la zone (✕, géré par demo.js), une sortie « essentiel » mise en attente peut
// enfin se montrer. Reporté d'un tour : le gestionnaire de demo.js, enregistré après celui-ci, doit
// avoir caché la zone avant qu'on la regarde.
$('demo-sortie-fermer').addEventListener('click', () => setTimeout(() => dessiner(), 0));

// --- Dessiner ---------------------------------------------------------------------------

function dessiner() {
  if (!enDemo || !dernierDetail || !ligne) return;
  let composee;
  try {
    const { etats, faites } = fusionnerCoches(etatDesMissions({
      produits: dernierDetail.produits,
      mouvements: dernierDetail.mouvements,
      ligne,
    }), faitesVues);
    faitesVues = faites;
    composee = composerCarte(etats, textes);
  } catch (erreur) {
    // Un texte manquant ne casse jamais l'application : pas de carte, et un message exploitable.
    console.error('Missions de la démo impossibles à afficher :', erreur.message);
    retirerCarte();
    return;
  }
  poserCarte(composee);
  toutFait = composee.fini !== null;
  if (toutFait) proposerSortie();
}

// --- La ligne demos du visiteur ----------------------------------------------------------
// RLS : un compte ne lit que SA ligne. Un échec garde l'ancienne ligne (la suivante réessaie).
// Un échec est un simple avertissement (console.warn) : la carte attend la lecture suivante.

async function lireLigne() {
  const numero = ++numeroLecture;
  try {
    const { data, error } = await supabase
      .from('demos')
      .select('code, cree_le, question_le, reappro_le')
      .maybeSingle();
    if (numero !== numeroLecture || !enDemo) return;
    if (error) {
      console.warn('Lecture des missions de la démo impossible :', error.message);
      aRelire = true; // le prochain stovo:donnees réessaie
      return;
    }
    ligne = data || null;
    if (ligne === null) retirerCarte();
    else dessiner();
  } catch (erreur) {
    console.warn('Lecture des missions de la démo impossible :', erreur);
    aRelire = true;
  }
}

// Les deux traces posées : elles ne bougent plus, la relecture est inutile.
const traceComplete = () => Boolean(ligne && ligne.question_le && ligne.reappro_le);

// --- Les événements ---------------------------------------------------------------------

// stovo:demo ({ actif }) est annoncé par demo.js à chaque session connue (dont le renouvellement
// du jeton, toutes les heures). Seul le PASSAGE à actif crée la carte ; actif qui se répète ne
// change rien. Quand la démo n'est plus active, la carte disparaît de la page.
document.addEventListener('stovo:demo', (evenement) => {
  const actif = evenement.detail?.actif === true;
  if (actif === enDemo) return;
  enDemo = actif;
  numeroLecture++; // jette toute lecture en cours de l'état précédent
  toutFait = false;
  faitesVues = [];
  aRelire = false;
  annulerMinuteur();
  if (!actif) {
    ligne = null;
    dernierDetail = null;
    retirerCarte();
    return;
  }
  // La ligne lue par demo.js au démarrage (null si sa lecture a échoué : la carte attend alors la
  // première lecture d'ici, voir stovo:donnees).
  const donnee = evenement.detail?.ligne;
  ligne = donnee !== null && typeof donnee === 'object' ? donnee : null;
  dessiner(); // rien tant que les données du tableau de bord ne sont pas là (stovo:donnees)
});

// Garde du patron de premiers_pas.js : un stovo:donnees publié pendant que l'application n'est
// pas à l'écran (déconnexion : viderDashboard) ne représente rien de réel pour ce compte.
document.addEventListener('stovo:donnees', (evenement) => {
  if (appShell.hidden) {
    dernierDetail = null;
    retirerCarte();
    return;
  }
  dernierDetail = evenement.detail || {};
  if (!enDemo) return;
  // Relire la ligne demos seulement quand elle peut avoir changé (une réponse est arrivée) ou qu'on ne
  // l'a pas : jamais à chaque tick de 30 s, jamais une fois les deux traces posées.
  if (ligne === null || (aRelire && !traceComplete())) {
    aRelire = false;
    lireLigne(); // dessine à son arrivée
  }
  dessiner(); // tout de suite, avec ce que l'on sait déjà (les missions des mouvements et du produit)
});

// Anti-rebond À QUEUE (patron de premiers_pas.js) : le premier stovo:reponse d'une fenêtre de
// 2 s rafraîchit tout de suite ; les suivants sont REPORTÉS à la fin de la fenêtre, jamais jetés.
// Le rafraîchissement ramène un stovo:donnees, qui relit la ligne demos si une trace manque encore (aRelire).
// Une fois les cinq faites, plus rien à rafraîchir pour cette carte.
const DELAI_ANTI_REBOND_MS = 2000;
let derniereFoisMs = 0;
let minuteur = null;

function annulerMinuteur() {
  if (minuteur !== null) clearTimeout(minuteur);
  minuteur = null;
}

function demanderRafraichissement() {
  if (!enDemo || toutFait) return;
  aRelire = true;
  const maintenant = Date.now();
  const ecoule = maintenant - derniereFoisMs;
  if (ecoule >= DELAI_ANTI_REBOND_MS) {
    derniereFoisMs = maintenant;
    rafraichirDonnees();
  } else if (minuteur === null) {
    minuteur = setTimeout(() => {
      minuteur = null;
      derniereFoisMs = Date.now();
      if (enDemo && !toutFait) rafraichirDonnees();
    }, DELAI_ANTI_REBOND_MS - ecoule);
  }
}

document.addEventListener('stovo:reponse', demanderRafraichissement);

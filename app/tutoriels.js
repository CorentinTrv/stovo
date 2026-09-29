// STOVO — chantier "Tutoriels", lot T2 (22/09/2026)
// ====================================================================
// Glu DOM du bandeau pas-à-pas : câble #tuto-bandeau (index.html, juste
// après #maj-bandeau) sur le registre pur de tutoriels_logique.js. Import
// pour effet de bord uniquement, comme aide.js/stock.js/premiers_pas.js
// (voir app.js). Touche document.getElementById dès le chargement du
// module : comme aide.js, ce fichier ne peut donc PAS être importé par
// Deno (ReferenceError: document is not defined) et n'est pas testé au
// banc offline -- voir tutoriels_test.js (module pur) et le rapport de
// passation pour les bancs Chromium qui devront couvrir ce fichier.
//
// Ecrit d'apres la consigne du lot (§6) :
//   context/import/app-stock/2026-09-22_consigne-codeur_tutoriels-T2.md
// et les decisions du grilling du 21/09/2026 (§"Ce que le lot T2 peut
// desormais ecrire") :
//   context/import/app-stock/2026-09-21_renvois_decisions-grilling.md
//
// Regles gravees de ce chantier (§8 du plan de l'Architecte du 18/09) :
// AUCUN appel reseau, AUCUNE ecriture en base, AUCUNE ecriture dans
// localStorage. Un parcours ne remplit JAMAIS #champ-parler, ne dicte
// jamais a la place du client, n'envoie jamais une phrase : il montre,
// c'est tout. L'etat vit en memoire vive et nulle part ailleurs.

import {
  trouverTutoriel,
  etapeDuTutoriel,
  indexSuivant,
  indexPrecedent,
  libelleProgression,
  libelleProgressionCourt,
  libelleBoutonSuivant,
  destinationScroll,
} from './tutoriels_logique.js';

const appShell = document.getElementById('app-shell');
const bandeau = document.getElementById('tuto-bandeau');
const elTitre = document.getElementById('tuto-titre');
const elProgression = document.getElementById('tuto-progression');
const elProgressionSr = document.getElementById('tuto-progression-sr');
const btnFermer = document.getElementById('tuto-fermer');
const elCorps = document.getElementById('tuto-corps');
const elActions = document.getElementById('tuto-actions');

// État en mémoire vive uniquement : { id, index } ou null si aucun parcours
// n'est en cours. Rien dans localStorage (§3.5 du plan) : fermer l'app au
// milieu d'un parcours fait repartir de l'étape 1 la fois suivante, et
// c'est voulu.
let etat = null;

function emettreOnglet(onglet) {
  document.dispatchEvent(new CustomEvent('stovo:onglet', { detail: { onglet } }));
}

// Le focus (titre d'étape ou bouton du bandeau) fait l'annonce lecteur
// d'écran (§3.4 du plan : zéro aria-live) : le laisser tomber sur `body` à
// la fermeture ferait repartir un lecteur d'écran du haut de la page.
// AVANT de masquer le bandeau (sinon l'élément ciblé n'est déjà plus
// focusable), on le range sur le bouton de la nav du bas qui porte l'écran
// actif (même marquage que app.js l.161-165 : `.nav-item[aria-current]`,
// jamais un champ de saisie, `{ preventScroll: true }`). Si `#app-shell`
// est masqué (déconnexion, voir observateurDeconnexion), aucun bouton de
// nav n'est visible : le navigateur a déjà rendu le focus au `body` de
// lui-même quand l'ancêtre est devenu hidden, `bandeau.contains(...)` est
// alors déjà faux et ce bloc ne fait rien -- `body` reste le repli.
function fermerSurPlace() {
  if (bandeau.contains(document.activeElement)) {
    const boutonActif = document.querySelector('.nav-item[aria-current="page"]');
    if (boutonActif) boutonActif.focus({ preventScroll: true });
  }
  bandeau.hidden = true;
  elCorps.innerHTML = '';
  elActions.innerHTML = '';
  etat = null;
}

// Après chaque rendu d'étape : bascule sur l'onglet de l'étape (§4.2 du
// plan -- c'est la garde de app.js sur stovo:onglet qui valide le nom
// d'écran, aucune navigation neuve ici), puis, dans le PROPRE
// requestAnimationFrame de ce module (décision 8 du 21/09 : aide.js n'est
// pas rouvert), scrolle vers l'ancre de l'étape ou remonte en haut.
function scrollerVersEtape(etape) {
  const ancre = etape.ancre;
  const element = ancre !== null ? document.getElementById(ancre) : null;
  const trouvee = Boolean(element);
  // offsetParent === null voit à la fois [hidden] et le style="display:none"
  // que portent #matin et #reorder-bloc quand ils n'ont rien à montrer.
  const visible = trouvee ? element.offsetParent !== null : false;
  const destination = destinationScroll(ancre, trouvee, visible);
  if (destination === 'ancre') {
    element.scrollIntoView({ block: 'start' });
  } else {
    window.scrollTo({ top: 0 });
  }
}

function rendreEtape() {
  if (!etat) return;
  const tutoriel = trouverTutoriel(etat.id);
  const infos = etapeDuTutoriel(etat.id, etat.index);
  if (!tutoriel || !infos) return; // garde défensive, ne devrait pas arriver
  const { numero, total, estPremiere, estDerniere, etape } = infos;

  elTitre.textContent = tutoriel.titre;
  elProgression.textContent = libelleProgressionCourt(numero, total);
  elProgressionSr.textContent = libelleProgression(numero, total);

  elCorps.innerHTML = '';

  const titreEtape = document.createElement('h3');
  titreEtape.className = 'tuto-etape-titre';
  titreEtape.tabIndex = -1;
  titreEtape.textContent = etape.titre;
  elCorps.appendChild(titreEtape);

  etape.paragraphes.forEach((texte, i) => {
    const p = document.createElement('p');
    if (etape.roles[i] === 'note') p.classList.add('tuto-note');
    p.textContent = texte;
    elCorps.appendChild(p);
  });

  if (etape.lien) {
    const btnLien = document.createElement('button');
    btnLien.type = 'button';
    btnLien.className = 'tuto-secondaire';
    btnLien.textContent = etape.lien.libelle;
    btnLien.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('stovo:aide-bloc', { detail: { bloc: etape.lien.bloc } }));
    });
    elCorps.appendChild(btnLien);
  }

  elActions.innerHTML = '';

  if (!estPremiere) {
    const btnPrecedent = document.createElement('button');
    btnPrecedent.type = 'button';
    btnPrecedent.className = 'tuto-secondaire';
    btnPrecedent.textContent = 'Précédent';
    btnPrecedent.addEventListener('click', () => {
      etat.index = indexPrecedent(etat.id, etat.index);
      rendreEtape();
    });
    elActions.appendChild(btnPrecedent);
  }

  const btnSuivant = document.createElement('button');
  btnSuivant.type = 'button';
  btnSuivant.className = 'btn-reception-primaire';
  btnSuivant.textContent = libelleBoutonSuivant(estDerniere);
  btnSuivant.addEventListener('click', () => {
    if (estDerniere) {
      // "J'ai terminé" : rebascule sur l'écran de la dernière étape, PUIS
      // ferme (décision 6 du 21/09). La croix, elle, ne rebascule jamais.
      emettreOnglet(etape.onglet);
      fermerSurPlace();
    } else {
      etat.index = indexSuivant(etat.id, etat.index);
      rendreEtape();
    }
  });
  elActions.appendChild(btnSuivant);

  // Le bandeau lui-même peut avoir défilé (max-height + overflow-y:auto) si
  // l'étape précédente était longue et que le client a scrollé jusqu'à
  // "Suivant" : sans ce reset, la nouvelle étape s'ouvre avec son titre hors
  // champ, et le focus ci-dessous (preventScroll: true) ne le ramène pas.
  bandeau.scrollTop = 0;

  emettreOnglet(etape.onglet);

  // Le lecteur d'écran annonce le titre ; le focus ne doit pas déplacer la
  // page (le vrai scroll, ci-dessous, décide seul de la position finale).
  titreEtape.focus({ preventScroll: true });

  requestAnimationFrame(() => scrollerVersEtape(etape));
}

function ouvrirParcours(id) {
  const tutoriel = trouverTutoriel(id);
  if (!tutoriel) return; // filtrage par le récepteur, §3.2 du plan : un id
  // inconnu (ou destiné à un autre module, ex. 'premiers-pas') ne déclenche
  // rien ici.
  etat = { id, index: 0 };
  bandeau.hidden = false;
  rendreEtape();
}

// --- Ouverture, depuis le rayon « Apprendre Stovo » de l'Aide ---
document.addEventListener('stovo:tuto-lancer', (evenement) => {
  const id = evenement.detail && evenement.detail.id;
  ouvrirParcours(id);
});

// --- La croix : ferme sur place, sans émettre stovo:onglet (décision 6) ---
btnFermer.addEventListener('click', () => {
  fermerSurPlace();
});

// --- La déconnexion ferme un parcours en cours, sans bascule ---
// afficherLogin() (ecran_session.js, hors liste) masque #app-shell et ne
// publie aucun événement dédié. Un MutationObserver sur son attribut
// `hidden` est le mécanisme retenu par la consigne du lot (§6) : un
// parcours ouvert ne doit ni survivre à une déconnexion (le compte suivant
// arriverait sur une étape qui n'est pas la sienne) ni se fermer sur un
// simple rafraîchissement des données. Volontairement PAS branché sur
// stovo:donnees : un catalogue réellement vide republie ce même événement
// au tick de 30 s de dashboard.js, ce qui fermerait un parcours en cours
// chez un client dont le compte est simplement vide.
const observateurDeconnexion = new MutationObserver(() => {
  if (appShell.hidden && etat) {
    fermerSurPlace();
  }
});
observateurDeconnexion.observe(appShell, { attributes: true, attributeFilter: ['hidden'] });

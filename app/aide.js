// STOVO — onglet « Aide » (25/07/2026, scinde le 22/08/2026 au lot C2-5)
// ====================================================================
// Le mode d'emploi de Stovo, DANS Stovo. Cinq parties (voir aide-contenu.js) :
//   0. Apprendre Stovo : le rayon de parcours guides (lot 3, 18/09/2026).
//   1. Comprendre    : a quoi sert chaque ecran, comment lire les chiffres.
//   2. Les phrases   : les gestes vocaux, avec des exemples exacts.
//   3. Astuces       : les pieges reels, tires du comportement du code.
//   4. Sortir mes donnees : le bloc d'export CSV du Pilotage (lot C2-5).
//
// Ce fichier-ci s'occupe du RENDU (HTML) et du BRANCHEMENT DOM. Le CONTENU
// (les textes) vit dans aide-contenu.js, un module PUR (zero DOM, zero
// import), sur le modele exact de pertes.js / export.js. Raison du
// decoupage : CE fichier fait `document.getElementById` des son chargement
// (glu DOM executee a l'import), ce qui empeche Deno de l'importer tel quel
// pour un banc `deno test`. aide-contenu.js, lui, s'importe sans probleme et
// porte son propre banc (aide_test.js).
//
// 100 % LECTURE SEULE et ZERO appel reseau : ce module ne parle jamais a
// Supabase, ne lit pas la base, n'ecrit rien.
//
// DEUX interactions. Un exemple est un bouton : le taper bascule sur
// l'ecran « Parler » avec la phrase DEJA ECRITE dans le champ, sans jamais
// l'envoyer (meme esprit que l'option A du micro : on relit, puis on decide).
// Ce module remplit donc #champ-parler directement et emet l'evenement
// 'stovo:onglet' qu'ecoute app.js pour la bascule. parler.js n'est PAS
// modifie : il lira simplement le champ au moment ou tu appuies sur Envoyer.
// Depuis le lot 3 (18/09/2026) : un bouton du rayon "Apprendre Stovo" est le
// second bouton possible, il emet 'stovo:tuto-lancer' (id seulement, jamais
// de logique metier ici -- c'est premiers_pas.js qui decide et repond par
// 'stovo:tuto-reponse', ecoute plus bas). Toujours zero ecriture, zero appel
// reseau, zero phrase dictee a la place du client.
//
// Correctif de relecture (18/09/2026, defaut D, consigne
// 2026-09-18_consigne-codeur_premiers-pas-L3-L4-correctifs-revue.md) : un
// tap sur un bouton du rayon vide et remasque D'ABORD le message de reponse
// precedent (le cas echeant), avant meme d'emettre 'stovo:tuto-lancer' :
// une relance ne garde jamais affichee la reponse de la relance d'avant.
//
// Lot T1 (19/09/2026, chantier Tutoriels) : TROISIEME interaction, en
// reception cette fois. Un bloc d'aide-contenu.js qui porte un `id` stable
// est rendu avec un attribut `data-bloc`. Ce module ecoute desormais
// 'stovo:aide-bloc' (detail: { bloc }) pour ouvrir l'Aide au bon endroit,
// deplie, scrolle et focus -- voir l'ecouteur tout en bas de ce fichier
// pour le detail des cinq etapes. Rien n'est envoye ni ecrit : ouvrir un
// bloc d'aide ne modifie jamais le stock.

import { CONTENU } from './aide-contenu.js';
import { ICONES } from './icones.js';

const $ = (id) => document.getElementById(id);

// Rend l'icône d'une clé du registre, ou rien du tout si la clé est absente
// (une entrée sans icône ne doit jamais planter le rendu, voir §checklist
// "fail fast et contextualisé" : ici l'absence d'icône n'est pas une erreur
// bloquante, juste une carte un peu plus nue).
function rendreIcone(cle) {
  return ICONES[cle] || '';
}

// Echappement HTML : le contenu est ecrit par nous (pas de donnee utilisateur
// ici), mais on echappe quand meme, par principe et parce que les exemples
// contiennent des apostrophes qui partent dans un attribut.
function echapper(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ====================================================================
// LE RENDU (fonctions pures, testables au banc offline)
// ====================================================================

function rendreExemples(exemples) {
  if (!exemples || exemples.length === 0) return '';
  const boutons = exemples.map((phrase) =>
    `<button type="button" class="aide-exemple" data-phrase="${echapper(phrase)}">${echapper(phrase)}</button>`
  ).join('');
  return `<div class="aide-exemples">${boutons}</div>`;
}

// Lot T1 (19/09/2026, chantier Tutoriels) : quand un bloc porte un `id`
// stable (aide-contenu.js, §4.3 du plan de l'Architecte), il se retrouve en
// `data-bloc="..."` sur son element racine. C'est CE que cherche l'ecouteur
// de stovo:aide-bloc plus bas. `bloc.id` est une donnee ECRITE PAR NOUS dans
// aide-contenu.js (pas une entree externe) : `echapper` suffit, pas de
// validation de forme ici (contrairement a l'id RECU par evenement, valide
// plus bas avant d'entrer dans un selecteur).
function attributBloc(bloc) {
  return bloc.id ? ` data-bloc="${echapper(bloc.id)}"` : '';
}

export function rendreBloc(bloc) {
  switch (bloc.type) {
    case 'texte':
      return `<p class="aide-texte"${attributBloc(bloc)}>${bloc.texte}</p>`;

    case 'liste':
      // Classe distincte du conteneur #aide-liste : sans ça, la mise en forme
      // des puces (retrait à gauche) s'appliquerait à tout l'écran.
      return `<ul class="aide-puces">${bloc.items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

    case 'defs':
      // Seules les 4 defs de "Comprendre Stovo" portent une icone (icone
      // 'pilotage'/'stock'/'parler'/'aide') : les autres blocs defs (les
      // pastilles de couleur, "Il te reste...") n'en ont pas, `d.icone` y
      // est alors undefined et rendreIcone renvoie une chaine vide.
      return `<dl class="aide-defs"${attributBloc(bloc)}>${bloc.items.map((d) =>
        `<dt>${d.icone ? `<span class="aide-geste-icone" aria-hidden="true">${rendreIcone(d.icone)}</span>` : ''}${d.terme}</dt><dd>${d.texte}</dd>`
      ).join('')}</dl>`;

    case 'geste':
      return `
        <div class="aide-geste">
          <h3 class="aide-geste-titre"><span class="aide-geste-icone" aria-hidden="true">${rendreIcone(bloc.icone)}</span>${bloc.titre}</h3>
          <p class="aide-geste-quoi">${bloc.quoi}</p>
          ${rendreExemples(bloc.exemples)}
          ${bloc.note ? `<p class="aide-note">${bloc.note}</p>` : ''}
        </div>`;

    case 'astuce':
      // Icône 'ampoule' pour TOUS les blocs astuce, en dur (pas de clé par
      // bloc dans aide-contenu.js, voir son commentaire de tête).
      return `
        <div class="aide-astuce"${attributBloc(bloc)}>
          <h3 class="aide-astuce-titre"><span class="aide-geste-icone" aria-hidden="true">${rendreIcone('ampoule')}</span>${bloc.titre}</h3>
          <p class="aide-texte">${bloc.texte}</p>
        </div>`;

    case 'tuto':
      // Rayon "Apprendre Stovo" (lot 3, chantier Tutoriels, 18/09/2026). Le
      // bouton porte data-tuto="<id>" : c'est l'ecouteur de clic plus bas
      // qui emet stovo:tuto-lancer, un seul nom d'evenement FIXE, jamais
      // construit a partir d'une donnee (§3.2 du plan). Le <p> de reponse
      // est vide et masque tant qu'aucun stovo:tuto-reponse n'est arrive
      // pour cet id. Tout ce qui vient de `bloc` passe par echapper ici
      // (§5.2 de la consigne du lot, contrairement a 'geste'/'astuce' dont
      // les textes sont deja du HTML de confiance avec des balises <b>).
      return `
        <div class="aide-tuto">
          <h3 class="aide-tuto-titre">${echapper(bloc.titre)}</h3>
          <p class="aide-tuto-quoi">${echapper(bloc.quoi)}</p>
          <button type="button" class="aide-tuto-bouton" data-tuto="${echapper(bloc.id)}">${echapper(bloc.libelle)}</button>
          <p class="aide-tuto-message" hidden></p>
        </div>`;

    default:
      return '';
  }
}

export function rendreSection(section) {
  const blocs = section.blocs.map(rendreBloc).join('');
  return `
    <details class="aide-section" data-id="${echapper(section.id)}"${section.ouvertParDefaut ? ' open' : ''}>
      <summary class="aide-sommaire">
        <span class="aide-icone" aria-hidden="true">${rendreIcone(section.icone)}</span>
        <span class="aide-titre">${echapper(section.titre)}</span>
      </summary>
      <div class="aide-contenu">${blocs}</div>
    </details>`;
}

export function rendreTout(contenu) {
  return contenu.map(rendreSection).join('');
}

// ====================================================================
// GLUE DOM
// ====================================================================
// Comme stock.js et parler.js : les elements existent des le chargement de
// la page, on branche a l'import et rien ne se passe tant qu'on n'y touche pas.

const zone = $('aide-liste');
if (zone) {
  zone.innerHTML = rendreTout(CONTENU);
}

// Un exemple tape : on recopie la phrase dans le champ de l'ecran Parler,
// on bascule sur cet ecran, et on s'arrete la. AUCUN envoi : c'est toujours
// toi qui appuies sur Envoyer, apres relecture (meme regle que le micro).
//
// Lot 3 (18/09/2026, rayon "Apprendre Stovo") : meme delegation de clic,
// un second cas pour [data-tuto]. Un seul nom d'evenement FIXE emis,
// stovo:tuto-lancer, avec juste l'id recopie de l'attribut : c'est le
// recepteur (premiers_pas.js) qui filtre selon l'id qu'il reconnait,
// jamais une liste blanche tenue ici (§3.2 du plan).
if (zone) {
  zone.addEventListener('click', (evenement) => {
    const boutonExemple = evenement.target.closest('.aide-exemple');
    if (boutonExemple) {
      const phrase = boutonExemple.dataset.phrase || '';
      const champ = $('champ-parler');
      if (champ) {
        champ.value = phrase;
        // Lot saisie multiligne (23/08/2026) : le champ est un textarea a
        // hauteur automatique gere par parler.js. On ne connait pas sa
        // fonction d'ajustement ici, mais l'evenement 'input' (avec bubbles,
        // comme une vraie frappe) la declenche a notre place.
        champ.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // app.js ecoute cet evenement et fait la bascule d'onglet (on evite
      // ainsi de dupliquer ici la logique de navigation).
      document.dispatchEvent(new CustomEvent('stovo:onglet', {
        detail: { onglet: 'parler' },
      }));

      // Le focus met le curseur en fin de champ, pret a corriger un mot.
      if (champ && typeof champ.focus === 'function') champ.focus();
      return;
    }

    const boutonTuto = evenement.target.closest('[data-tuto]');
    if (boutonTuto) {
      const id = boutonTuto.dataset.tuto || '';

      // Correctif de relecture (18/09/2026, defaut D) : l'etat de depart
      // redevient propre a CHAQUE tap, avant que le recepteur ne reponde
      // (execution JS synchrone : ce bloc s'execute avant le
      // dispatchEvent plus bas). Sans ca, un client qui lit "Tes premiers
      // pas sont deja faits", vide ensuite son catalogue puis retape
      // "Relancer" voyait la bande repartir au palier 1 avec l'ancienne
      // phrase encore affichee juste en dessous du bouton.
      const conteneur = boutonTuto.closest('.aide-tuto');
      const message = conteneur ? conteneur.querySelector('.aide-tuto-message') : null;
      if (message) {
        message.textContent = '';
        message.hidden = true;
      }

      document.dispatchEvent(new CustomEvent('stovo:tuto-lancer', { detail: { id } }));
    }
  });
}

// La reponse d'un tuto qui n'a rien pu relancer (aujourd'hui, seul
// premiers_pas.js emet cet evenement, pour l'id 'premiers-pas' -- voir son
// rapport de passation pour le detail de la relance). Retrouve le BON bloc
// par comparaison directe de dataset.tuto (jamais un selecteur CSS construit
// par concatenation d'une valeur venue d'un autre module), ecrit le message,
// demasque par `hidden = false` (jamais style.display) et donne le focus.
// Aucune zone aria-live : le message suit un tap volontaire (§3.4 du plan).
document.addEventListener('stovo:tuto-reponse', (evenement) => {
  const detail = evenement.detail || {};
  if (!zone) return;

  const boutons = Array.from(zone.querySelectorAll('[data-tuto]'));
  const bouton = boutons.find((b) => b.dataset.tuto === detail.id);
  if (!bouton) return;

  const conteneur = bouton.closest('.aide-tuto');
  const message = conteneur ? conteneur.querySelector('.aide-tuto-message') : null;
  if (!message) return;

  message.textContent = typeof detail.message === 'string' ? detail.message : '';
  message.hidden = false;
  message.setAttribute('tabindex', '-1');
  if (typeof message.focus === 'function') message.focus();
});

// Ouverture ciblee d'un bloc d'aide, demandee par un autre module (lot T1,
// chantier Tutoriels, 19/09/2026 -- prepare le futur tutoriel "Comprendre mon
// Pilotage", lot T2, pas encore ecrit). Un seul nom d'evenement FIXE recu,
// stovo:aide-bloc, avec detail: { bloc }. Les cinq etapes exactes du §4.3 du
// plan de l'Architecte (2026-09-18) :
//
//   1. Valider l'id RECU (entree externe, donc suspecte) contre
//      /^[a-z0-9-]+$/ AVANT de le mettre dans un selecteur -- jamais de
//      selecteur construit par concatenation directe d'une entree qui ne
//      vient pas de nous.
//   2. Chercher le bloc par data-bloc. Introuvable : on bascule quand meme
//      sur l'Aide (etape 4) mais on NE deplie rien et on NE scrolle rien --
//      une action a moitie faite est pire qu'une action nette qui ne fait
//      qu'une chose.
//   3. Deplier la section (`<details>`) qui porte le bloc trouve.
//   4. Emettre stovo:onglet vers 'aide' (afficherOnglet, dans app.js, est
//      synchrone).
//   5. Dans un requestAnimationFrame, scroller vers le bloc puis lui donner
//      le focus -- le rAF laisse le navigateur appliquer la classe
//      ecran-actif et l'ouverture du <details> avant de mesurer. C'est le
//      seul point du plan que la lecture ne prouve pas : le Jarvis le
//      verifie au bac a sable sur les cinq blocs (dont un dans une section
//      repliee et un en bas de page).
document.addEventListener('stovo:aide-bloc', (evenement) => {
  const detail = evenement.detail || {};
  const idBloc = typeof detail.bloc === 'string' ? detail.bloc : '';

  if (!/^[a-z0-9-]+$/.test(idBloc)) return;
  if (!zone) return;

  const cible = zone.querySelector(`[data-bloc="${idBloc}"]`);

  if (cible) {
    const section = cible.closest('details.aide-section');
    if (section) section.open = true;
  }

  document.dispatchEvent(new CustomEvent('stovo:onglet', {
    detail: { onglet: 'aide' },
  }));

  if (!cible) return;

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (typeof cible.scrollIntoView === 'function') {
        cible.scrollIntoView({ block: 'start' });
      }
      cible.setAttribute('tabindex', '-1');
      if (typeof cible.focus === 'function') cible.focus();
    });
  }
});

// STOVO — onglet « Aide » (25/07/2026, scinde le 22/08/2026 au lot C2-5)
// ====================================================================
// Le mode d'emploi de Stovo, DANS Stovo. Quatre parties (voir aide-contenu.js) :
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
// SEULE interaction : un exemple est un bouton. Le taper bascule sur
// l'ecran « Parler » avec la phrase DEJA ECRITE dans le champ, sans jamais
// l'envoyer (meme esprit que l'option A du micro : on relit, puis on decide).
// Ce module remplit donc #champ-parler directement et emet l'evenement
// 'stovo:onglet' qu'ecoute app.js pour la bascule. parler.js n'est PAS
// modifie : il lira simplement le champ au moment ou tu appuies sur Envoyer.

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

export function rendreBloc(bloc) {
  switch (bloc.type) {
    case 'texte':
      return `<p class="aide-texte">${bloc.texte}</p>`;

    case 'liste':
      // Classe distincte du conteneur #aide-liste : sans ça, la mise en forme
      // des puces (retrait à gauche) s'appliquerait à tout l'écran.
      return `<ul class="aide-puces">${bloc.items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

    case 'defs':
      // Seules les 4 defs de "Comprendre Stovo" portent une icone (icone
      // 'pilotage'/'stock'/'parler'/'aide') : les autres blocs defs (les
      // pastilles de couleur, "Il te reste...") n'en ont pas, `d.icone` y
      // est alors undefined et rendreIcone renvoie une chaine vide.
      return `<dl class="aide-defs">${bloc.items.map((d) =>
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
        <div class="aide-astuce">
          <h3 class="aide-astuce-titre"><span class="aide-geste-icone" aria-hidden="true">${rendreIcone('ampoule')}</span>${bloc.titre}</h3>
          <p class="aide-texte">${bloc.texte}</p>
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
if (zone) {
  zone.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('.aide-exemple');
    if (!bouton) return;

    const phrase = bouton.dataset.phrase || '';
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
  });
}

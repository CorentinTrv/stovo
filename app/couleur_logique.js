// STOVO — la couleur d'action au choix (lot A15, R-2, 25/08/2026)
// ====================================================================
// Module PUR : aucun DOM, aucun localStorage lu directement (l'appelant
// passe la valeur lue, ce module decide quoi en faire). Meme famille que
// contact.js / pertes.js : une brique testable hors navigateur, consommee
// par la glu DOM (reglages.js) ET par le script en tete d'index.html.
//
// Le cadre : DESIGN.md, regle 10, et context/import/app-stock/
// 2026-08-23_analyse_mdp-couleurs-contact.md §2. Cinq teintes possibles
// pour --action (styles.css), teal et vert exclus (un utilisateur qui les
// prendrait confondrait "je peux agir" et "c'est ecrit"). Choix memorise
// SUR L'APPAREIL (localStorage), jamais par compte, applique immediatement,
// sans bouton Enregistrer.
//
// DUPLICATION ASSUMEE ET DOCUMENTEE (le brief le demande explicitement,
// point 9) : la liste des cinq teintes existe UNE SECONDE FOIS, minuscule,
// dans le <script> en tete d'index.html — il doit rester autonome (aucun
// import) et s'executer avant que ce module ne soit charge, sinon l'app
// clignote en flamme une fraction de seconde a l'ouverture. Un changement
// de teinte se fait aux DEUX endroits ; ce commentaire renvoie a l'autre,
// et reciproquement.

export const CLE_STOCKAGE = 'stovo_couleur';

// Ordre du nuancier de la planche ReglagesPrune.dc.html.
export const TEINTES = ['flamme', 'bleu', 'prune', 'framboise', 'encre'];

export const TEINTE_PAR_DEFAUT = 'flamme';

export const LIBELLE_TEINTE = {
  flamme: 'Flamme',
  bleu: 'Bleu',
  prune: 'Prune',
  framboise: 'Framboise',
  encre: 'Encre',
};

// Valeur de CHAQUE teinte, telle qu'affichee par le disque de son propre
// bouton dans le nuancier (les cinq couleurs sont montrees SIMULTANEMENT,
// contrairement a --action qui n'en active qu'une a la fois sur <html>).
// Memes valeurs que les cinq blocs html[data-couleur] de styles.css :
// dupliquees la aussi, meme raison, meme regle (les DEUX endroits suivent
// ensemble). Le survol ("-sombre") n'est pas necessaire ici : le nuancier
// n'a pas d'etat de survol distinct de l'etat choisi.
export const VALEUR_TEINTE = {
  flamme: '#FA5D00',
  bleu: '#1D4ED8',
  prune: '#7E22CE',
  framboise: '#BE185D',
  encre: '#1D1E1C',
};

// Normalise une valeur lue (localStorage, ou toute source externe
// suspecte, cf. la checklist de codage : "toute entree externe est
// suspecte") : une teinte connue est renvoyee telle quelle, tout le reste
// (absent, vide, ancienne valeur perimee d'un lot futur qui en retirerait
// une, faute de frappe) retombe sur la teinte par defaut. Jamais
// d'exception.
export function normaliserTeinte(valeur) {
  return TEINTES.includes(valeur) ? valeur : TEINTE_PAR_DEFAUT;
}

// Attribut a poser sur <html> : la teinte par defaut ne pose AUCUN
// attribut (les regles de :root suffisent deja a afficher la flamme, brief
// point 7 : "valeur absente ou inconnue -> flamme, aucun attribut pose"),
// les quatre autres posent data-couleur="<teinte>". `null` = "retirer
// l'attribut", a l'appelant (reglages.js, le script de tete) de choisir
// comment.
export function calculerAttribut(valeur) {
  const teinte = normaliserTeinte(valeur);
  return teinte === TEINTE_PAR_DEFAUT ? null : teinte;
}

// Meme trace SVG que la coche du bouton "Oui" (index.html, #btn-oui) :
// une seule coche dans toute l'app, reprise ici pour la pastille choisie
// du nuancier.
const CHEMIN_COCHE = 'M4 10.5l4 4 8-9';

// Rend le nuancier (les 5 boutons) en HTML. Fonction PURE (aucun DOM
// touche), sur le modele de rendreDemarque (pertes.js) : prend une donnee,
// retourne une chaine, testable par assertion de motifs. reglages.js n'a
// plus qu'a poser innerHTML et cabler un ecouteur de clic par pastille.
export function rendreNuancier(teinteActive) {
  const active = normaliserTeinte(teinteActive);
  return TEINTES.map((teinte) => {
    const choisi = teinte === active;
    const coche = choisi
      ? `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="reglages-pastille-coche"><path d="${CHEMIN_COCHE}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : '';
    return `<button type="button" class="reglages-pastille${choisi ? ' est-choisi' : ''}" data-teinte="${teinte}" aria-pressed="${choisi}">
        <span class="reglages-pastille-disque">${coche}</span>
        <span class="reglages-pastille-libelle">${LIBELLE_TEINTE[teinte]}</span>
      </button>`;
  }).join('');
}

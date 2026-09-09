// STOVO — l'unite enfin accordee (lot D24, 06/09/2026)
// =======================================================================
// LE DEFAUT CORRIGE : les textes de l'app ecrivaient l'unite brute juste
// apres un nombre, sans jamais l'accorder ("Stock : 11 rouleau", "Il te
// reste 11 rouleau de Papier toilette."). Invisible avec les unites des
// tests (kg, L), visible chez tous les testeurs des qu'un produit porte une
// unite du quotidien (rouleau, bouteille, pot, piece, carton...).
//
// Une fonction `accorderUnite` vivait deja dans ce fichier (correctif du
// 01/08/2026), mais elle ne reglait que la moitie du probleme : elle
// supposait les unites stockees au PLURIEL en base et se contentait de
// retirer un "s" sous 2. Les donnees reelles dementent cette convention : les
// testeurs dictent l'unite au SINGULIER ("rouleau", pas "rouleaux"). Cette
// version accorde donc dans LES DEUX SENS, sans jamais supposer la forme
// stockee. Module PUR (aucun DOM), extrait de dashboard.js pour etre
// importe aussi par stock.js et inventaire.js (meme patron que
// couleur_logique.js/pilotage.js).
//
// JUMEAU VOLONTAIREMENT DUPLIQUE de _shared/unite.ts (backend) : le front est
// du JS vanilla sans build, le backend du TypeScript Deno, ils ne partagent
// aucun module -- meme nom, meme comportement, et MEME BANC DE TESTS des deux
// cotes (voir unite_test.js, qui rejoue le jeu d'essai commun
// _shared/unite_cas.ts, meme patron que pilotage_test.js/pilotage_cas.ts).
//
// REGLE ASSUMEE, PAS UNE GRAMMAIRE COMPLETE (choix documente dans le rapport
// de passation du lot, context/import/app-stock/) :
// - quantite < 2 (0, 1, les decimales sous 2) : forme singuliere -> on retire
//   un "s" ou un "x" final s'il y en a. Fonctionne aussi bien sur une unite
//   deja au singulier (rien a retirer) que sur une unite stockee au pluriel
//   par l'ancienne convention ("rouleaux" -> "rouleau").
// - quantite >= 2 : forme plurielle, calculee a partir de CETTE BASE
//   singuliere (jamais de l'entree brute, pour rester idempotent que l'entree
//   soit deja au singulier ou au pluriel) : mots en -eau/-eu -> +x (rouleau ->
//   rouleaux, seau -> seaux), mots en -al -> -aux (bocal -> bocaux), sinon +s.
// - jamais touches, dans aucun des deux sens, casse d'origine conservee ("L"
//   ne devient jamais "l") : les symboles de mesure, et une petite liste
//   fermee de mots invariables (singulier = pluriel) qu'aucune regle
//   generique ne peut deviner sans dictionnaire.
// - unite vide ou nulle -> chaine vide (jamais un espace en trop dans la phrase).

const JAMAIS_TOUCHES = new Set([
  // Symboles de mesure : jamais de "s" ajoute ("2 kg", jamais "2 kgs").
  'kg', 'g', 'mg', 't', 'l', 'cl', 'ml', 'm', 'cm', 'mm', 'm2', 'm3',
  // Mots invariables (singulier = pluriel). Liste fermee et volontairement
  // courte : sans dictionnaire, impossible de deviner si un mot deja termine
  // par s/x/z est un vrai pluriel a retirer ("bouteilles") ou une invariable
  // a laisser telle quelle ("colis"). A completer si un testeur en signale un
  // nouveau.
  'colis', 'choux', 'prix', 'poids', 'temps',
]);

export function accorderUnite(unite, quantite) {
  if (!unite) return '';
  if (JAMAIS_TOUCHES.has(unite.toLowerCase())) return unite;

  const base = /[sx]$/i.test(unite) ? unite.slice(0, -1) : unite;
  // quantite non numerique (NaN) : Number(NaN) >= 2 est faux -> repli
  // singulier, la forme la plus sure par defaut.
  if (!(Number(quantite) >= 2)) return base;

  if (/eau$/i.test(base) || /eu$/i.test(base)) return base + 'x';
  if (/al$/i.test(base)) return base.slice(0, -2) + 'aux';
  return base + 's';
}

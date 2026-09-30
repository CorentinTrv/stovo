// STOVO — chantier "Tutoriels", lot T2 (22/09/2026)
// ====================================================================
// Module PUR : aucun DOM, aucun import, exactement le meme principe que
// premiers_pas_logique.js / aide-contenu.js / icones.js. Il porte le
// registre des parcours (TUTORIELS, textes compris) et toute la logique de
// navigation dans un parcours : c'est ce qui le rend testable au banc Deno
// sans navigateur, et bon marche a corriger apres un test terrain.
//
// Ecrit d'apres :
//   - context/import/app-stock/2026-09-18_architecte_plan-tutoriels.md
//     (§3.6, §4.1, §6 : le contenu du parcours "Comprendre mon Pilotage")
//   - context/import/app-stock/2026-09-21_renvois_decisions-grilling.md
//     (decision 7 : SIX champs par etape, pas cinq -- le champ `ancre` et
//     ses deux comportements de repli)
//   - context/import/app-stock/2026-09-22_consigne-codeur_tutoriels-T2.md
//     (la consigne de ce lot, qui gagne en cas de doute)
//
// Le mot "tuto"/"tutoriel"/"didacticiel" n'apparait dans AUCUN texte ici :
// le mot du client est "parcours" (voir aide_test.js et tutoriels_test.js,
// balayage de forme). Les noms de fichier, de type de bloc ('tuto') et
// d'evenement (stovo:tuto-lancer) gardent "tuto", ce sont du code jamais
// affiche.
//
// La glu DOM (tutoriels.js) importe ce module pour le rendu du bandeau et
// n'invente aucun texte, aucune regle de navigation : tout vit ici.

// ====================================================================
// LE REGISTRE
// ====================================================================
// TUTORIELS : { id, titre, quoi, etapes: [ { onglet, ancre, titre,
//   paragraphes, roles, phrasesCitees, lien } ] }
//
// Six champs par etape (decision 7 du 21/09/2026, le plan initial en
// prevoyait cinq) :
//   onglet         : la cle d'ECRANS (app.js) sur laquelle l'etape bascule
//   ancre          : l'id DOM du bloc que l'etape nomme, ou null si
//                    l'etape nomme l'ecran entier (jamais "la ou le client
//                    etait")
//   titre          : le titre de l'etape (h3 du bandeau)
//   paragraphes    : un texte par paragraphe, au mot exact du §6 du plan
//   roles          : tableau parallele a `paragraphes`, 'corps' ou 'note'
//   phrasesCitees  : les phrases entre guillemets montrees au client,
//                    jamais cliquables (un parcours ne fait jamais ecrire)
//   lien           : { libelle, bloc } vers un bloc d'aide identifie
export const TUTORIELS = [
  {
    id: 'pilotage',
    titre: 'Comprendre mon Pilotage',
    quoi: 'Ce que cet écran te dit, d\'où viennent ses chiffres, et ce que tes phrases y changent.',
    etapes: [
      {
        onglet: 'dashboard',
        ancre: 'matin',
        titre: '« Ce matin », ta journée en une ligne',
        paragraphes: [
          'En haut de cet écran, « Ce matin » te donne ce qu\'il y a à faire aujourd\'hui, et rien d\'autre : ce qui est à commander, ce qui va bientôt manquer. Juste en dessous, une phrase résume la situation en langage simple.',
          'Si tout va bien, il n\'y a rien à lire. C\'est voulu : un écran qui ne te demande rien est une bonne nouvelle.',
          'Tant que ton catalogue est vide, ce bandeau ne s\'affiche pas et les chiffres restent à zéro. Ils se remplissent dès tes premières déclarations.',
        ],
        roles: ['corps', 'corps', 'note'],
        phrasesCitees: [],
        lien: { libelle: 'En savoir plus : à quoi sert chaque écran', bloc: 'comprendre-ecrans' },
      },
      {
        onglet: 'dashboard',
        ancre: 'kpis',
        titre: 'Quatre compteurs, trois couleurs',
        paragraphes: [
          'Les quatre cases te disent, dans l\'ordre : ce qui est à commander, ce qui va manquer sous trois jours, combien de produits tu suis, et combien de mouvements tu as déclarés cette semaine.',
          'Les couleurs sont les mêmes partout dans Stovo. Vert, rien à faire. Rouge, tu es passé sous ton point de commande, c\'est le moment de commander.',
          // LOT D30-L3 (27/09/2026, plan §3 Q2) : un produit jamais compte ne
          // s'affiche plus rouge (l'alerte se tait, module jumeau
          // pilotage.ts/pilotage.js), il se range dans le panier neutre
          // "Pas encore compte". Texte remplace a l'identique de la consigne.
          'Un produit que tu viens de créer, et dont tu n\'as pas encore dit le stock, se range à part dans « Pas encore compté ». Dis-lui ce que tu as, il rejoint les autres.',
        ],
        roles: ['corps', 'corps', 'note'],
        phrasesCitees: [],
        lien: { libelle: 'En savoir plus : lire les pastilles de couleur', bloc: 'comprendre-pastilles' },
      },
      {
        onglet: 'dashboard',
        ancre: 'stock-value',
        titre: 'Ce que tu as immobilisé',
        paragraphes: [
          '« Valeur du stock » est l\'argent qui dort dans tes rayons, compté au prix d\'achat que tu as dicté.',
          'Les produits sans prix n\'y sont pas comptés, et Stovo te le dit franchement plutôt que d\'annoncer un total qui aurait l\'air juste. Un prix se donne une seule fois par produit, et il sert ensuite à tout.',
        ],
        roles: ['corps', 'corps'],
        phrasesCitees: [],
        lien: { libelle: 'En savoir plus : renseigne les prix', bloc: 'astuces-prix' },
      },
      {
        onglet: 'dashboard',
        ancre: 'reorder-bloc',
        titre: 'Combien de temps tu tiens, et quand commander',
        paragraphes: [
          'Plus bas, « À réapprovisionner en priorité » classe ce qu\'il faut commander, du plus urgent au moins urgent. Si ce bloc n\'apparaît pas, c\'est que tu n\'as rien à commander aujourd\'hui.',
          'Sur chaque produit, deux chiffres font tout le travail. « Il te reste ≈ X jours », c\'est ton stock divisé par ce que tu sors en moyenne. Le « point de commande », c\'est le niveau où il faut recommander pour ne pas tomber en rupture le temps d\'être livré.',
          'Marqué « auto », ce niveau suit ton rythme réel et bouge tout seul. Marqué « fixe », c\'est le seuil que tu as dicté toi-même, faute d\'assez de sorties pour le calculer.',
        ],
        roles: ['corps', 'corps', 'corps'],
        phrasesCitees: [],
        lien: { libelle: 'En savoir plus : lire les chiffres du Pilotage', bloc: 'comprendre-chiffres' },
      },
      {
        onglet: 'dashboard',
        ancre: null,
        titre: 'Ce que tes mots changent ici',
        paragraphes: [
          'Ces chiffres ne sortent pas de nulle part : ils sont faits de tes phrases.',
          '« j\'ai vendu 3 pâtes » sort 3 pâtes de ton stock et les compte dans ta consommation. Ta moyenne monte, ton point de commande suit.',
          '« j\'ai cassé 2 bières » sort aussi les 2 bières, mais ne les compte pas dans ta consommation. Une casse n\'est pas une vente : elle ne doit pas te faire commander davantage.',
          'C\'est toute la différence. Une casse déclarée comme une vente gonfle ta moyenne, donc ton point de commande, donc tu commandes trop. Dis les choses comme elles sont, et le Pilotage devient juste tout seul.',
        ],
        roles: ['corps', 'corps', 'corps', 'corps'],
        phrasesCitees: ["j'ai vendu 3 pâtes", "j'ai cassé 2 bières"],
        lien: { libelle: 'En savoir plus : déclare tes pertes', bloc: 'astuces-pertes' },
      },
    ],
  },
];

// ====================================================================
// LA LOGIQUE
// ====================================================================

export function listerTutoriels() {
  return TUTORIELS;
}

export function trouverTutoriel(id) {
  return TUTORIELS.find((t) => t.id === id) ?? null;
}

export function nombreEtapes(id) {
  const tutoriel = trouverTutoriel(id);
  return tutoriel ? tutoriel.etapes.length : 0;
}

// Rend { numero, total, estPremiere, estDerniere, etape } pour un id/index
// valides, ou null pour un id inconnu ou un index hors bornes -- jamais une
// exception (meme contrat que trouverProduit et consorts cote backend).
export function etapeDuTutoriel(id, index) {
  const tutoriel = trouverTutoriel(id);
  if (!tutoriel) return null;
  const total = tutoriel.etapes.length;
  if (!Number.isInteger(index) || index < 0 || index >= total) return null;
  return {
    numero: index + 1,
    total,
    estPremiere: index === 0,
    estDerniere: index === total - 1,
    etape: tutoriel.etapes[index],
  };
}

// Bornes aux deux extremites : depuis la derniere etape, "suivant" reste
// sur la derniere ; depuis la premiere, "precedent" reste sur la premiere.
// Un id inconnu rend l'index inchange (garde defensive, la glu n'appelle
// jamais ces fonctions sur un id qu'elle n'a pas deja valide par
// trouverTutoriel).
export function indexSuivant(id, index) {
  const total = nombreEtapes(id);
  if (total === 0) return index;
  return Math.min(index + 1, total - 1);
}

export function indexPrecedent(id, index) {
  const total = nombreEtapes(id);
  if (total === 0) return index;
  return Math.max(index - 1, 0);
}

// Texte lecteur d'ecran (long, annonce complete) et texte affiche (court).
export function libelleProgression(numero, total) {
  return `Étape ${numero} sur ${total}`;
}

export function libelleProgressionCourt(numero, total) {
  return `${numero} / ${total}`;
}

export function libelleBoutonSuivant(estDerniere) {
  return estDerniere ? 'J\'ai terminé' : 'Suivant';
}

// Les quatre cas de la decision 7 du 21/09/2026 : "haut" signifie le haut
// de l'ecran, jamais "la ou le client etait".
//   - ancre === null (l'etape nomme l'ecran entier) -> 'haut'
//   - ancre non trouvee dans le DOM -> 'haut'
//   - ancre trouvee mais son bloc est masque -> 'haut'
//   - ancre trouvee et visible -> 'ancre'
export function destinationScroll(ancre, trouvee, visible) {
  if (ancre === null) return 'haut';
  if (!trouvee) return 'haut';
  if (!visible) return 'haut';
  return 'ancre';
}

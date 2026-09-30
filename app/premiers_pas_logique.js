// STOVO — chantier "Premiers pas", lot 1 : le socle deductif (17/09/2026)
// ====================================================================
// Module PUR : aucun DOM, aucun reseau, aucun import d'un autre fichier de
// l'app, aucun acces direct a localStorage (la lecture/ecriture du drapeau
// de fermeture se fait cote glu, ce module ne fait que NORMALISER la
// valeur deja lue, comme normaliserTeinte dans couleur_logique.js). Meme
// famille que pilotage.js, pertes.js, export.js, couleur_logique.js,
// reglages_logique.js : tout ce qui decide est teste au banc Deno, sans
// navigateur.
//
// References :
// - Plan de l'Architecte : context/import/app-stock/
//   2026-09-17_architecte_plan-premiers-pas.md (paragraphes 4.2, 4.3, 7.1,
//   7.2, 7.3, 8 lot 1, 3.5).
// - Decisions posterieures au plan : context/import/app-stock/
//   2026-09-17_premiers-pas_decisions-apres-plan.md.
// - Consigne du lot : context/import/app-stock/
//   PROMPT_codeur-premiers-pas-L1-socle-deductif_2026-09-17.md.
//
// Trois ecarts assumes par rapport au plan (dictes par la consigne) :
// 1. Borne de debutant confirmee aux valeurs du plan (3 produits, 6
//    mouvements) : BORNE_PRODUITS_ACTIFS et BORNE_MOUVEMENTS ci-dessous.
// 2. Le palier 3 ne dicte plus "3" en dur : quantiteSortieProposee() suit
//    le stock reel du produit, plafonnee a 3, plancher a 1.
// 3. creerLecteurMicroDuFil() traite garde-8s-sans-start exactement comme
//    garde-2s-sans-start (le second nom vient du lot D28-suite, deploye le
//    17/09 au soir en sw v44, et c'est celui du tout premier appui micro
//    d'un appareil qui n'a jamais autorise le micro : le cas central de ce
//    fil).
//
// Les textes ci-dessous (paliers, escalier micro, escalier de
// comprehension) sont recopies MOT POUR MOT du paragraphe 7.1/7.2/7.3 du
// plan, valides par Corentin le 17/09 au soir. Rien n'est reformule, meme
// les deux passages sur lesquels le Jarvis avait une reserve ("tu ranges
// une quantite", "l'autre moitie") : Corentin les jugera sur le terrain.
//
// Correctifs du 19/09/2026, apres la validation iPhone de Corentin (deux
// textes tranches, tout le reste du fil est valide) :
// 1. Le dernier paragraphe du palier 1 disait "Garde les deux mots
//    « nouveau produit »", ce qui est faux : le mot "nouveau" n'est pas
//    obligatoire (cerveau_deterministe.ts accepte le produit cartesien
//    VERBES_CREATION_ELARGIS x GROUPES_CONTEXTE_CREATION_ELARGIS, "créer
//    produit sucre" fonctionne aussi), seul le mot de contexte ("produit")
//    l'est. Corrige, verifie contre le vrai fichier du cerveau.
// 2. Le nombre souffle au palier 2 passe de 10 a 12 : "dix" est homophone
//    de "dis", et la mesure du 16/09 sur l'iPhone de Corentin (dictee
//    ecrivant "DE" puis "DIS") dit de toujours tester avec un nombre a
//    deux chiffres.

// --- Constantes ------------------------------------------------------------

export const TITRE = 'Premiers pas';

// Borne de debutant (paragraphe 4.2, regles 4 et 5 ; confirmee par la
// consigne §3.1). Au-dela, ce n'est plus quelqu'un qui decouvre : le fil
// disparait pour toujours, sans rien memoriser.
export const BORNE_PRODUITS_ACTIFS = 3;
export const BORNE_MOUVEMENTS = 6;

// Clef localStorage du drapeau de fermeture (paragraphe 3.5 du plan).
// Ecrite ici pour reference : ce module ne touche jamais localStorage,
// c'est la glu (premiers_pas.js, lot 2) qui lit/ecrit sous try/catch et
// passe la valeur brute a lireDrapeauFermeture().
export const CLE_STOCKAGE_FERMETURE = 'stovo_premiers_pas_ferme';

// Phrase exemple fixe du palier 1 : il n'y a pas encore de produit reel a
// nommer, donc le fil illustre avec un nom deja eprouve du corpus de
// l'Aide (outils/aide-exemples.json l.47, cite au paragraphe 7.5 du plan).
const PRODUIT_EXEMPLE = 'sucre';

// --- Comptage des mouvements -------------------------------------------

// Compte les mouvements qui font avancer le fil. Une entree ou une sortie
// ne compte que si son motif est absent (motif === null ou undefined) :
// une perte (motif: 'peremption') n'est pas la sortie du fil, une
// regularisation d'inventaire (motif: 'inventaire') n'est pas son entree
// (paragraphe 4.2, precision 1). `total` compte TOUT mouvement, quel que
// soit son type ou son motif : c'est la borne de debutant brute
// (paragraphe 2.2 du plan), independante de la deduction d'etape.
export function compterMouvementsDuFil(mouvements) {
  const liste = Array.isArray(mouvements) ? mouvements : [];
  let nbEntrees = 0;
  let nbSorties = 0;
  for (const m of liste) {
    if (!m) continue;
    const sansMotif = m.motif === null || m.motif === undefined;
    if (!sansMotif) continue;
    if (m.type === 'entree') nbEntrees += 1;
    else if (m.type === 'sortie') nbSorties += 1;
  }
  return { total: liste.length, nbEntrees, nbSorties };
}

// --- Choix du produit nomme par le fil ----------------------------------

// Le fil nomme le produit le plus RECEMMENT CREE (cree_le decroissant),
// departage par nom (ordre alphabetique) pour rester deterministe.
// dashboard.js trie ses produits par nom (`.order('nom')`) : produits[0]
// est donc le premier par ordre alphabetique, jamais le plus recent.
// Piege documente au paragraphe 4.2 du plan.
export function choisirProduitDuFil(produits) {
  const liste = Array.isArray(produits) ? produits : [];
  if (liste.length === 0) return null;
  const tries = [...liste].sort((a, b) => {
    const dateA = a && a.cree_le ? new Date(a.cree_le).getTime() : 0;
    const dateB = b && b.cree_le ? new Date(b.cree_le).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA; // decroissant : le plus recent d'abord
    const nomA = (a && typeof a.nom === 'string') ? a.nom : '';
    const nomB = (b && typeof b.nom === 'string') ? b.nom : '';
    return nomA.localeCompare(nomB);
  });
  const choisi = tries[0];
  return choisi && typeof choisi.nom === 'string' ? choisi.nom : null;
}

// --- La regle de deduction d'etape (paragraphe 4.2) ---------------------

// Rend { visible, etape, nomProduit }. Dans l'ordre, PREMIERE regle qui
// repond gagne (l'ordre est celui du plan, ne pas le reordonner) :
//   1. ferme === true                       -> invisible
//   2. produits n'est pas un tableau         -> invisible
//   3. produits.length > BORNE               -> invisible (borne debutant)
//   4. total des mouvements > BORNE          -> invisible (borne debutant)
//   5. sortieParEscalier === true            -> etape 5 (force, voir plus bas)
//   6. produits.length === 0                 -> etape 1
//   7. nbEntrees === 0                       -> etape 2
//   8. nbSorties === 0                       -> etape 3
//   9. sinon                                 -> etape 4
//
// `sortieParEscalier` (lot 7, 18/09/2026, §2.4 du plan de l'Architecte du
// 17/09) : drapeau pose par la marche 3 de l'escalier de comprehension
// ("Passer cette etape"). Le client a choisi de sortir du fil dicte par le
// SEUL endroit qui lui reste utile quand la voix ne passe pas : le palier
// d'import. Ce choix doit tenir MEME si les donnees reelles disent encore
// 1, 2 ou 3 : sans cette regle, le tick de 30 s de dashboard.js
// republierait un stovo:donnees qui remettrait le client devant l'etape
// qu'il vient de fuir, une boucle que l'objectif du lot 6 interdit
// nommement ("jamais de boucle, jamais la faute du client"). Il reste
// soumis aux regles 1 a 4 (fermeture et bornes de visibilite) : un client
// qui ferme la bande ou dont le catalogue depasse la borne de debutant ne
// voit toujours rien, drapeau ou pas. Jamais stocke, meurt avec la page.
//
// Renvoi du 21/09/2026 (decisions 2, 3 et 4 du grilling du meme jour) :
// `paliersForces` a disparu. La bande vit dans #ecran-parler et disparait
// des qu'on la quitte, donc "Voir mon Pilotage" ferme desormais le fil
// (comme la croix) au lieu de preparer un palier 5 que personne ne voit :
// la regle 9 rend toujours 4, sans condition. Un appelant qui passerait
// encore un champ `paliersForces` (retardataire) est ignore sans erreur,
// c'est un champ d'un objet parmi d'autres, jamais lu ci-dessous.
export function calculerEtatDuFil({ produits, mouvements, ferme, sortieParEscalier } = {}) {
  const invisible = { visible: false, etape: null, nomProduit: null };

  if (ferme === true) return invisible;
  if (!Array.isArray(produits)) return invisible;
  if (produits.length > BORNE_PRODUITS_ACTIFS) return invisible;

  const { total, nbEntrees, nbSorties } = compterMouvementsDuFil(mouvements);
  if (total > BORNE_MOUVEMENTS) return invisible;

  const nomProduit = choisirProduitDuFil(produits);
  if (sortieParEscalier === true) return { visible: true, etape: 5, nomProduit };

  if (produits.length === 0) return { visible: true, etape: 1, nomProduit: null };
  if (nbEntrees === 0) return { visible: true, etape: 2, nomProduit };
  if (nbSorties === 0) return { visible: true, etape: 3, nomProduit };

  return { visible: true, etape: 4, nomProduit };
}

// --- Le nombre du palier 3, ecart §3.2 de la consigne -------------------

// Le plan (v2) faisait souffler "j'ai vendu 3 N" quel que soit le stock.
// Un client qui recoit 2 paquets arrive au palier 3 avec un stock de 2,
// dicte les 3 qu'on lui souffle, et passe a -1 sans qu'aucune confirmation
// ne l'avertisse (_shared/coeur.ts:860, verifie par l'Architecte). Cette
// fonction propose donc un nombre qui ne depasse jamais le stock reel :
//   >= 3 -> 3 ; 2 -> 2 ; 1 -> 1 ; 0, negatif, null, undefined, NaN -> 1.
// Le plancher a 1 couvre une donnee qui ment (le palier 3 exige au moins
// une entree, donc un stock a 0 est impossible par construction) : le
// module ne doit jamais rendre 0 ni NaN, qui produiraient une phrase
// absurde ("j'ai vendu 0 sucre").
export function quantiteSortieProposee(stockActuel) {
  const n = Number(stockActuel);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

// --- Les textes des cinq paliers (paragraphe 7.1, mot pour mot) ---------

function nomOuVide(nomProduit) {
  return typeof nomProduit === 'string' && nomProduit.length > 0 ? nomProduit : '';
}

// Correctif post-relecture (18/09/2026, lot 2) : un paragraphe de role
// `modele` peut porter PLUSIEURS segments de roles differents (le marqueur
// "nouveau produit" en gras/encre, le trou "ton article" en --muted, au
// palier 1 seulement). Contrat : la concatenation des `texte` des segments
// reproduit EXACTEMENT le paragraphe d'origine, jamais un caractere de
// plus ou de moins. `segmentEntier` fabrique le cas courant (un paragraphe
// = un seul segment, meme role que rolesParagraphes) : c'est la glu qui
// choisit comment rendre chaque segment (span par role), le module pur ne
// laisse jamais deviner le decoupage.
function segmentEntier(texte, role) {
  return [{ texte, role }];
}

function palier1() {
  const phraseExemple = `nouveau produit ${PRODUIT_EXEMPLE}`;
  const paragraphes = [
    'Prends un article que tu as sous la main.',
    'Dis-le, ou écris-le :',
    'nouveau produit ton article',
    `Par exemple : ${phraseExemple}`,
    'Garde le mot « produit », avec « nouveau » ou « crée » devant, sinon Stovo croit que tu ranges une quantité.',
  ];
  // Roles d'affichage (ecart §3.3 de la consigne du lot 2) : le marqueur/la
  // phrase modele (index 2) en `modele`, la ligne d'exemple (index 3) et la
  // derniere ligne d'avertissement (index 4) en `note`, le reste en `corps`.
  // Parallele a `paragraphes`, meme longueur, meme ordre.
  const rolesParagraphes = ['corps', 'corps', 'modele', 'note', 'note'];
  // Correctif post-relecture (18/09/2026) : le paragraphe modele de ce
  // palier porte un TROU ("ton article"), a distinguer du marqueur
  // ("nouveau produit") — §7.1 du plan : "Le marqueur ... est en encre et
  // en gras, le trou ... en --muted." Seul palier ou un paragraphe se
  // decoupe en plusieurs segments : les paliers 2 et 3 n'ont pas de trou,
  // leur phrase modele est un segment unique. La concatenation
  // 'nouveau produit' + ' ton article' reproduit exactement paragraphes[2].
  const segmentsParagraphes = [
    segmentEntier(paragraphes[0], 'corps'),
    segmentEntier(paragraphes[1], 'corps'),
    [
      { texte: 'nouveau produit', role: 'modele' },
      { texte: ' ton article', role: 'trou' },
    ],
    segmentEntier(paragraphes[3], 'note'),
    segmentEntier(paragraphes[4], 'note'),
  ];
  return {
    titre: TITRE,
    etape: 1,
    paragraphes,
    rolesParagraphes,
    segmentsParagraphes,
    phraseModele: 'nouveau produit ',
    phraseExemple,
    bouton: null,
    boutonSecondaire: null,
    texte: paragraphes.join('\n\n'),
  };
}

function palier2(nomProduit) {
  const nom = nomOuVide(nomProduit);
  const phraseModele = `j'ai reçu 12 ${nom}`;
  // LOT D30-L3 (27/09/2026) : la ligne de desamorcage ("Si ton Pilotage
  // affiche deja « a commander »...") disparait SANS remplacante (plan §3
  // Q2) -- ce palier dit deja "Combien en as-tu ?", et un produit jamais
  // compte ne s'affiche plus "a commander" nulle part (module jumeau
  // pilotage.ts/pilotage.js, lot L1). Le mensonge assume qu'annoncait le
  // commentaire du test 14bis disparu n'a donc plus lieu d'etre.
  const paragraphes = [
    `C'est créé. « ${nom} » est dans ton stock, à zéro pour l'instant.`,
    'Combien en as-tu ? Dis-le :',
    phraseModele,
    'Mets le vrai nombre, celui que tu as devant toi.',
  ];
  // Roles : le marqueur/la phrase modele (index 2) en `modele`, le reste en
  // `corps` (plus de derniere ligne en `note` depuis le retrait ci-dessus).
  const rolesParagraphes = ['corps', 'corps', 'modele', 'corps'];
  // Pas de trou a ce palier (le nom est deja connu) : la phrase modele est
  // un segment unique, entierement en gras (§7.1 : rien n'y est en muted).
  const segmentsParagraphes = [
    segmentEntier(paragraphes[0], 'corps'),
    segmentEntier(paragraphes[1], 'corps'),
    segmentEntier(phraseModele, 'modele'),
    segmentEntier(paragraphes[3], 'corps'),
  ];
  return {
    titre: TITRE,
    etape: 2,
    paragraphes,
    rolesParagraphes,
    segmentsParagraphes,
    phraseModele,
    phraseExemple: phraseModele,
    bouton: null,
    boutonSecondaire: null,
    texte: paragraphes.join('\n\n'),
  };
}

function palier3(nomProduit, options) {
  const nom = nomOuVide(nomProduit);
  const quantite = quantiteSortieProposee(options && options.stockActuel);
  const phraseModele = `j'ai vendu ${quantite} ${nom}`;
  const paragraphes = [
    "Ton stock est juste. Il manque l'autre moitié : ce qui part.",
    'Dis-le :',
    phraseModele,
    'Sans les sorties, Stovo ne peut pas te dire combien de temps tu tiens.',
  ];
  // Roles : le marqueur/la phrase modele (index 2) en `modele`, le reste en
  // `corps` (pas de ligne d'exemple ni d'avertissement final a ce palier).
  const rolesParagraphes = ['corps', 'corps', 'modele', 'corps'];
  // Pas de trou a ce palier non plus : la phrase modele est un segment
  // unique, entierement en gras.
  const segmentsParagraphes = [
    segmentEntier(paragraphes[0], 'corps'),
    segmentEntier(paragraphes[1], 'corps'),
    segmentEntier(phraseModele, 'modele'),
    segmentEntier(paragraphes[3], 'corps'),
  ];
  return {
    titre: TITRE,
    etape: 3,
    paragraphes,
    rolesParagraphes,
    segmentsParagraphes,
    phraseModele,
    phraseExemple: phraseModele,
    bouton: null,
    boutonSecondaire: null,
    texte: paragraphes.join('\n\n'),
  };
}

// Correctif de relecture (18/09/2026, tranche par Corentin, 3e passe de
// /code-review) : la variante B disait "tu n'en as plus" pour un
// declencheur `stock_actuel <= pointCommande`, donc AVANT la rupture reelle
// (un produit cree le jour meme, "j'ai recu 5" puis "j'ai vendu 3", stock 2
// et pointCommande 2, annoncait a tort "tu n'en as plus" avec deux unites
// encore en stock -- texte faux a l'ecran, famille D5/D22). La regle
// retenue par Corentin : la variante B ne se declenche QUE si le stock est
// a zero ou negatif. Entre les deux, la variante A reste vraie mot pour
// mot ("ton Pilotage sait deja combien il te reste"), donc AUCUN texte
// neuf dans ce lot. Le champ `options` s'appelle desormais `enRupture`,
// jamais `enAlerte` : ce n'est plus une alerte au sens du Pilotage
// (stock <= pointCommande), c'est une rupture au sens litteral (stock <= 0).
//
// Renvoi du 21/09/2026 (decisions 2, 3 et 4 du grilling du meme jour, textes
// valides mot pour mot par Corentin le 22/09) : ce palier rend desormais
// TROIS paragraphes, tous `corps` (le troisieme porte l'offre d'import,
// c'est un bouton, pas une simple note en --muted). Il devient le DERNIER
// palier du fil (le grilling a tranche que le fil se termine plutot que de
// preparer un palier 5 devenu invisible des que la bande quitte
// #ecran-parler) : `boutonSecondaire` reprend le bouton "Importer mon
// catalogue" qui vivait avant au palier 5, en SECONDAIRE -- il pose une
// question dont la reponse est souvent non ; un bouton PRINCIPAL qui
// ouvrirait le selecteur de fichiers iOS a quelqu'un qui n'a pas de fichier
// serait un cul-de-sac.
function palier4(nomProduit, options) {
  const nom = nomOuVide(nomProduit);
  const enRupture = Boolean(options && options.enRupture === true);
  const introCommune = "C'est fait. Tu viens de faire les trois gestes de Stovo : créer, faire entrer, faire sortir.";
  const troisiemeParagraphe = 'Tu as ta liste de produits dans un fichier ? Stovo la lit en une fois.';
  const paragraphes = enRupture
    ? [
        introCommune,
        `En haut de ton Pilotage, « ${nom} » est déjà passé au rouge : tu n'en as plus. C'est exactement son travail, te le dire avant que tu t'en aperçoives.`,
        troisiemeParagraphe,
      ]
    : [
        introCommune,
        "En haut de ton Pilotage, une ligne verte te dit qu'il n'y a rien à commander aujourd'hui. C'est ça, ton matin : quand tout va bien, Stovo te le dit en une phrase au lieu de te faire chercher.",
        troisiemeParagraphe,
      ];
  // Roles : aucune phrase modele a ce palier (c'est un ecran d'arrivee, pas
  // de dictee proposee), les trois paragraphes sont du `corps`.
  const rolesParagraphes = ['corps', 'corps', 'corps'];
  const segmentsParagraphes = paragraphes.map((p) => segmentEntier(p, 'corps'));
  return {
    titre: TITRE,
    etape: 4,
    enRupture,
    paragraphes,
    rolesParagraphes,
    segmentsParagraphes,
    phraseModele: null,
    phraseExemple: null,
    bouton: { libelle: 'Voir mon Pilotage', evenement: 'stovo:premiers-pas-voir-pilotage' },
    boutonSecondaire: { libelle: 'Importer mon catalogue', evenement: 'stovo:premiers-pas-importer' },
    texte: paragraphes.join('\n\n'),
  };
}

// Renvoi du 21/09/2026 : ce palier N'EST PLUS une etape du fil (il n'est
// jamais atteint depuis le palier 4, "Voir mon Pilotage" ferme le fil pour
// de bon desormais). Il garde son numero 5 parce que tout le code et les
// bancs le designent ainsi (calculerLibelleJalons rend deja une chaine
// vide pour lui) et devient le palier de SORTIE de l'escalier de
// comprehension, atteignable UNIQUEMENT par sa marche 3 ("Passer cette
// etape") quand la voix ne passe pas -- c'est le seul chemin qui lui
// reste utile. Ses deux paragraphes ne bougent pas (valides sur iPhone le
// 19/09). `boutonSecondaire` devient `null` : "J'ai fini" disparait, la
// croix fait deja la meme chose (une seule clef, une seule valeur) et le
// rayon "Apprendre Stovo" rend la fermeture rattrapable.
function palier5() {
  const paragraphes = [
    'Tu as une liste de tes produits quelque part, dans un tableur ou un fichier du fournisseur ?',
    "Passe-la à Stovo en une fois, il la lit.",
  ];
  // Roles : idem palier 4, aucune phrase modele, deux paragraphes de `corps`.
  const rolesParagraphes = ['corps', 'corps'];
  const segmentsParagraphes = [segmentEntier(paragraphes[0], 'corps'), segmentEntier(paragraphes[1], 'corps')];
  return {
    titre: TITRE,
    etape: 5,
    paragraphes,
    rolesParagraphes,
    segmentsParagraphes,
    phraseModele: null,
    phraseExemple: null,
    bouton: { libelle: 'Importer mon catalogue', evenement: 'stovo:premiers-pas-importer' },
    boutonSecondaire: null,
    texte: paragraphes.join('\n\n'),
  };
}

// Rend le texte du palier demande. `options` : { stockActuel } au palier
// 3, { enRupture } au palier 4 (calcule par l'appelant : stock_actuel <= 0,
// correctif du 18/09/2026 tranche par Corentin -- ni `enAlerte` ni la
// formule du Pilotage, voir le commentaire de palier4 ci-dessus). Une
// etape inconnue rend null : rien a afficher plutot qu'un texte invente.
export function textesDuPalier(etape, nomProduit, options = {}) {
  switch (etape) {
    case 1: return palier1();
    case 2: return palier2(nomProduit);
    case 3: return palier3(nomProduit, options);
    case 4: return palier4(nomProduit, options);
    case 5: return palier5();
    default: return null;
  }
}

// --- L'escalier de comprehension (paragraphe 7.3) -----------------------

// Compteur d'echecs de dictee, tenu en memoire vive (jamais stocke,
// paragraphe 4.3), remis a zero des que le palier change. Entree :
// l'evenement `stovo:reponse`, detail { texte, enAttente, choix }. Ce
// module ne lit QUE la forme de la reponse (enAttente, choix), jamais le
// texte : le front n'a aucun code d'erreur a lire, et deviner sur le texte
// mentirait le jour ou le serveur reformule ses phrases (D40, D48).
//
// Correctif de relecture (18/09/2026, trouve par /code-review sur le diff
// des lots 6+7, defaut 1 : trou dans la spec de l'Architecte, §7.3 du plan
// du 17/09, pas une faute de code) : `parler.js:333` emet `stovo:reponse`
// pour TOUTE reponse du serveur, y compris celle qui CONCLUT une
// confirmation ("Oui"/"Non" apres une proposition enAttente:true). Cette
// reponse de conclusion a EXACTEMENT la forme d'un echec (enAttente:false,
// choix:[]), donc sans ce correctif elle etait comptee comme une
// incomprehension du geste qui vient d'etre confirme -- deux confirmations
// de plus menaient a tort a "Passer cette etape". `ignorerProchaine`
// retient si la DERNIERE reponse recue etait une proposition
// (enAttente:true) : si oui, la reponse SUIVANTE est sautee (ni comptee, ni
// remise a zero, le compteur est deja a zero a ce moment-la) parce qu'elle
// conclut la confirmation au lieu de juger la phrase du palier. Couvre le
// "Oui" comme le "Non" : refuser une proposition n'est pas une
// incomprehension non plus.
export function creerEscalierComprehension() {
  let compteur = 0;
  let ignorerProchaine = false;

  function marcheCourante() {
    if (compteur <= 0) return 0;
    if (compteur >= 3) return 3;
    return compteur;
  }

  function recevoirReponse({ enAttente, choix } = {}) {
    // Correctif de relecture (18/09/2026, /code-review, defaut A) : la
    // reponse SAUTEE peut elle-meme etre une proposition (deux
    // confirmations qui s'enchainent). Cette branche doit donc REEVALUER
    // ignorerProchaine sur la reponse qu'elle saute, au lieu de le remettre
    // a faux en dur -- sinon le saut ne se rearme jamais, et la reponse qui
    // CONCLUT cette seconde proposition (le "Oui") est comptee a tort
    // comme une incomprehension : exactement le defaut qu'on croyait
    // ferme, une sequence plus longue.
    if (ignorerProchaine) {
      ignorerProchaine = enAttente === true;
      return marcheCourante();
    }
    const aChoix = Array.isArray(choix) && choix.length > 0;
    if (enAttente === true || aChoix) {
      compteur = 0;
    } else {
      compteur += 1;
    }
    ignorerProchaine = enAttente === true;
    return marcheCourante();
  }

  function changerPalier() {
    compteur = 0;
    ignorerProchaine = false;
    return marcheCourante();
  }

  return { recevoirReponse, changerPalier, marcheCourante };
}

// Textes fixes des marches 2 et 3 de l'escalier de comprehension
// (paragraphe 7.3). La marche 1 n'a pas de texte fixe : elle reaffiche la
// phrase exacte du palier en cours (le modele a trou au palier 1, la
// phrase avec le vrai nom aux paliers 2 et 3), construite via
// texteMarcheComprehension ci-dessous.
const TEXTE_COMPREHENSION_MARCHE = {
  2: {
    paragraphes: ["Toujours pas. Écris-le, c'est plus sûr quand il y a du bruit."],
    bouton: { libelle: 'Écrire la phrase', evenement: 'stovo:premiers-pas-ecrire' },
  },
  3: {
    paragraphes: ['On laisse cette étape de côté, tu y reviendras.'],
    bouton: { libelle: 'Passer cette étape', evenement: 'stovo:premiers-pas-passer' },
  },
};

// Compose le texte affiche pour une marche de l'escalier de
// comprehension (1, 2 ou 3), au palier et au nom de produit courants.
// Rend null si la marche est 0 (rien a afficher) ou si l'etape ne fait pas
// partie du fil dicte (4 et 5 sont des ecrans d'arrivee, sans dictee a
// recommencer).
export function texteMarcheComprehension(marche, etape, nomProduit, options = {}) {
  if (marche !== 1 && marche !== 2 && marche !== 3) return null;
  if (etape !== 1 && etape !== 2 && etape !== 3) return null;

  if (marche === 1) {
    const palier = textesDuPalier(etape, nomProduit, options);
    const phrase = palier ? (etape === 1 ? palier.phraseExemple : palier.phraseModele) : '';
    const paragraphes = ['Je n\'ai pas compris. Redis-le plus court, juste ça :', phrase];
    return { marche: 1, paragraphes, bouton: null, texte: paragraphes.join('\n\n') };
  }

  const fixe = TEXTE_COMPREHENSION_MARCHE[marche];
  return { marche, paragraphes: fixe.paragraphes, bouton: fixe.bouton, texte: fixe.paragraphes.join('\n\n') };
}

// --- L'escalier micro (paragraphe 7.2) -----------------------------------

// Textes fixes des trois marches de l'escalier micro. Traducteur, pas
// commandeur (paragraphe 3.3 du plan) : ce module ne demarre, n'arrete et
// n'annule jamais rien, il traduit ce que le micro vient de faire.
const TEXTE_MICRO_MARCHE = {
  1: {
    paragraphes: [
      "Si ton téléphone vient de te demander l'autorisation du micro, réponds oui, puis appuie une seconde fois sur le micro.",
      'Sinon, écris ta phrase, ça marche pareil.',
    ],
    bouton: { libelle: 'Écrire la phrase', evenement: 'stovo:premiers-pas-ecrire' },
  },
  2: {
    paragraphes: [
      "Le micro est refusé pour Stovo. Tu peux l'autoriser dans les réglages de ton téléphone, ou écrire ta phrase, ça marche pareil.",
    ],
    bouton: { libelle: 'Écrire la phrase', evenement: 'stovo:premiers-pas-ecrire' },
  },
  3: {
    paragraphes: ['Le micro ne répond pas. Écris ta phrase, ça marche pareil.'],
    bouton: { libelle: 'Écrire la phrase', evenement: 'stovo:premiers-pas-ecrire' },
  },
};

// Determine la marche a atteindre depuis l'evenement `stovo:micro` recu,
// selon l'etat courant. `garde-2s-sans-start` ET `garde-8s-sans-start`
// (ecart §3.3 de la consigne, lot D28-suite deploye le 17/09) menent tous
// les deux a la marche 1, uniquement depuis `attente`. Les erreurs de
// permission (marche 2) et toute autre erreur (marche 3) valent depuis
// `attente` OU `repos`.
function marcheDepuisEvenement(etatActuel, evenement) {
  const gardeSansStart = evenement === 'garde-2s-sans-start' || evenement === 'garde-8s-sans-start';
  if (etatActuel === 'attente' && gardeSansStart) return 1;
  if (evenement === 'error:not-allowed' || evenement === 'error:service-not-allowed') return 2;
  if (typeof evenement === 'string' && evenement.startsWith('error:')) return 3;
  return null;
}

// Machine a trois etats (repos, attente, panne) qui traduit les evenements
// `stovo:micro` du journal de diagnostic (D28) en un message a afficher.
// Aucun delai propre : elle se repose entierement sur les deux gardes deja
// en place cote parler.js (paragraphe 7.2 du plan, decision 8).
export function creerLecteurMicroDuFil() {
  let etat = 'repos';
  let message = null;

  function etatCourant() {
    return { etat, message };
  }

  function gerer(evenement) {
    if (etat === 'panne') {
      if (evenement === 'demande-start') {
        etat = 'attente';
        message = null;
      } else if (evenement === 'start') {
        etat = 'repos';
        message = null;
      }
      // Tout autre evenement en panne (end, garde-2s-sans-end, audiostart,
      // speechstart, result-1er, ou une nouvelle garde/erreur) : rien ne
      // rallume tout seul, l'etat et le message restent inchanges.
      return etatCourant();
    }

    if (evenement === 'demande-start') {
      etat = 'attente';
      message = null;
      return etatCourant();
    }

    if (etat === 'attente' && evenement === 'start') {
      etat = 'repos';
      message = null;
      return etatCourant();
    }

    const marche = marcheDepuisEvenement(etat, evenement);
    if (marche) {
      etat = 'panne';
      const fixe = TEXTE_MICRO_MARCHE[marche];
      message = { marche, paragraphes: fixe.paragraphes, bouton: fixe.bouton, texte: fixe.paragraphes.join('\n\n') };
    }
    return etatCourant();
  }

  return { gerer, etatCourant };
}

// --- La bascule automatique sur Saisir (paragraphe 5.2) ------------------

// Vrai seulement au palier 1 (catalogue vide), une seule fois par vie de
// page, et seulement si le client n'a touche a rien depuis le chargement.
export function doitOuvrirSurSaisir({ etape, dejaBascule, navigationTouchee } = {}) {
  return etape === 1 && dejaBascule === false && navigationTouchee === false;
}

// --- Le drapeau de fermeture (paragraphe 3.5) -----------------------------

// Normalise la valeur BRUTE deja lue dans localStorage (clef
// CLE_STOCKAGE_FERMETURE) par la glu, sous try/catch la-bas. Toute entree
// externe est suspecte (checklist de codage) : seule la valeur exacte '1'
// vaut fermeture, tout le reste (absente, '0', une faute de frappe, une
// valeur non-chaine) vaut "pas ferme", jamais d'exception.
export function lireDrapeauFermeture(valeur) {
  return valeur === '1';
}

// Correctif de relecture (18/09/2026, defaut E de la consigne
// 2026-09-18_consigne-codeur_premiers-pas-L3-L4-correctifs-revue.md) :
// avant ce correctif, la glu calculait `ferme` par
// `fermeCetteSession || lireDrapeauStockage()`. Si une relance
// (stovo:tuto-lancer) essayait d'effacer le drapeau localStorage et que
// cette ecriture levait (quota a zero, navigation privee Safari qui
// autorise la LECTURE mais pas l'ECRITURE), `lireDrapeauStockage()`
// continuait de rendre `true` a chaque `stovo:donnees` suivant : la bande
// que le client venait de rouvrir disparaissait au premier rafraichissement
// (jusqu'a 30 s plus tard), sans aucune explication. `reouverteCetteSession`
// est un second drapeau, symetrique de `fermeCetteSession`, qui GAGNE sur
// la valeur lue en stockage : une reouverture reussie EN MEMOIRE VIVE tient
// pour toute la session, meme si le stockage ne peut pas suivre. Une
// fermeture explicite (la croix) remet ce drapeau a false cote glu, pour
// pouvoir refermer la bande dans la meme session.
export function calculerFermetureEffective({ fermeCetteSession, reouverteCetteSession, drapeauStockage } = {}) {
  if (reouverteCetteSession === true) return false;
  return fermeCetteSession === true || drapeauStockage === true;
}

// --- Lot 2 (18/09/2026) : les deux fonctions pures qui manquaient --------

// Le texte lecteur d'ecran qui double les trois disques de jalons (§7.4 du
// plan : "un texte lecteur d'ecran « Étape 1 sur 3 »"). Rien pour les
// paliers 4 et 5 (ecrans d'arrivee, plus de jalons a compter) ni pour une
// valeur inconnue : une chaine vide plutot qu'un texte invente.
export function calculerLibelleJalons(palier) {
  if (palier === 1) return 'Étape 1 sur 3';
  if (palier === 2) return 'Étape 2 sur 3';
  if (palier === 3) return 'Étape 3 sur 3';
  return '';
}

// Ce que le bouton "Écrire la phrase" (escaliers micro et comprehension,
// lots 5 et 6, pas cable dans ce lot) devra ecrire dans #champ-parler :
// exactement `phraseModele` du palier demande (le modele a trou au palier
// 1, la phrase avec le vrai nom aux paliers 2 et 3, en suivant
// quantiteSortieProposee via `options.stockActuel` au palier 3, comme
// textesDuPalier). Une etape sans phrase modele (4, 5, inconnue) rend une
// chaine vide : rien a ecrire plutot qu'une valeur inventee.
export function phrasePourLeChamp(palier, nomProduit, options = {}) {
  const p = textesDuPalier(palier, nomProduit, options);
  return p && typeof p.phraseModele === 'string' ? p.phraseModele : '';
}

// --- Lot 3 (18/09/2026, chantier "Tutoriels") : la relance du rayon -----
//
// Rendu par premiers_pas.js quand un tap sur "Relancer" (rayon "Apprendre
// Stovo" de l'onglet Aide) rejoue la deduction d'etape et ne trouve aucun
// palier 1, 2 ou 3 a montrer (catalogue deja avance au-dela du fil, ou
// aucune donnee stovo:donnees encore connue au moment du tap -- voir le
// rapport de passation du lot 3 pour ce second cas). Texte exact du §5.3 de
// la consigne du lot, ecrit par le Jarvis. PAS encore relu par Corentin au
// moment ou ce lot est code : sa relecture est un point de validation du
// deploiement, pas un acquis.
export function messageRelanceImpossible() {
  return 'Tes premiers pas sont déjà faits, ton catalogue est en route. Tout ce que Stovo sait dire est juste en dessous.';
}

// --- Lot 7 (18/09/2026, chantier "Tutoriels") : la dette D64, le minuteur de
// la relance -----------------------------------------------------------
//
// Rendu par premiers_pas.js quand un tap sur "Relancer" arme une attente
// (aucun stovo:donnees encore connu cette session) et que rafraichirDonnees()
// ne publie jamais rien dans les 8 secondes qui suivent : charger()
// (dashboard.js) sort SANS publier stovo:donnees si la lecture des produits
// echoue (hors ligne, jeton expire, erreur RLS), et l'attente restait alors
// consommee pour rien, le bouton "Relancer" paraissant casse. Meme patron que
// messageRelanceImpossible() ci-dessus : une fonction pure qui rend la
// chaine, testee au banc. Texte exact du §5.7 de la consigne du lot, valide
// par Corentin le 18/09/2026.
export function messageRelanceEchouee() {
  return "Stovo n'a pas réussi à lire ton stock. Vérifie ta connexion, puis retape sur Relancer.";
}

// --- Lot 4 (18/09/2026, chantier "Tutoriels") : l'ouverture sur Saisir ----
//
// `doitOuvrirSurSaisir` (ci-dessus, lot 1) est un pur PREDICAT : il repond
// a "faut-il basculer maintenant ?" sans jamais changer d'etat. Il faut donc
// un second morceau, tenant l'etat lui-meme (le droit a ete consomme ou
// non, une navigation manuelle a eu lieu ou non), pour que la glu (§2 de la
// consigne du lot) puisse le lire ET le faire evoluer au bon moment.
//
// Contrat des deux methodes (§2 de la consigne, mot pour mot) :
// - consommer() rend `true` une SEULE fois : la premiere fois qu'elle est
//   appelee alors qu'aucune navigation manuelle n'a encore ferme le droit
//   et qu'aucune bascule n'a encore eu lieu. Tout appel suivant, ou tout
//   appel apres une fermeture par navigation, rend `false`.
// - noterNavigationManuelle() ferme le droit POUR DE BON : meme appelee
//   avant le tout premier consommer() (la course reelle du §2, ou le
//   client tape "Stock" pendant que charger() est encore en vol), plus
//   aucun appel a consommer() ne rendra jamais `true` ensuite.
//
// Les deux drapeaux sont portes en fermeture (closure), jamais exposes en
// ECRITURE directe : seules consommer() et noterNavigationManuelle() les
// font evoluer. Deux accesseurs en LECTURE seule (etatCourant) permettent a
// la glu de nourrir doitOuvrirSurSaisir (predicat existant du lot 1) sans
// dupliquer la logique de garde a deux endroits.
export function creerGardeBascule() {
  let dejaBascule = false;
  let navigationTouchee = false;

  function consommer() {
    if (navigationTouchee || dejaBascule) return false;
    dejaBascule = true;
    return true;
  }

  function noterNavigationManuelle() {
    navigationTouchee = true;
  }

  function etatCourant() {
    return { dejaBascule, navigationTouchee };
  }

  return { consommer, noterNavigationManuelle, etatCourant };
}

// --- Lot 4 : la correction de la limite assumee au lot 3 (§3) ------------
//
// Au lot 3, si AUCUN stovo:donnees n'etait encore arrive au moment du tap
// sur "Relancer", la reponse (bascule ou message) se decidait quand meme,
// sur des donnees inconnues (`produits` valait `undefined`) : le message
// "tes premiers pas sont deja faits" pouvait s'afficher a tort, avant
// d'etre dementi des l'arrivee des vraies donnees. Ce lot separe la
// DECISION (resoudreRelance, pure, ci-dessous) de l'ATTENTE d'une donnee
// pas encore arrivee (creerAttenteRelance, ci-dessous) : la glu n'a plus
// qu'a executer ce que ces deux fonctions lui disent, elle ne decide rien.

// Porte un simple drapeau "une relance est en attente d'une premiere
// donnee". `armer()` le leve, `consommer()` le baisse et rend `true` la
// PREMIERE fois seulement (comme creerGardeBascule ci-dessus) : un
// stovo:donnees qui suit une relance deja consommee ne rejoue rien.
export function creerAttenteRelance() {
  let enAttente = false;

  function armer() {
    enAttente = true;
  }

  function consommer() {
    if (!enAttente) return false;
    enAttente = false;
    return true;
  }

  return { armer, consommer };
}

// Decide QUOI faire lors d'une demande de relance (tap sur "Relancer") ou
// de sa consommation au prochain stovo:donnees, sans jamais toucher au DOM.
// `connu` distingue "aucun stovo:donnees n'est encore arrive cette session"
// (produits/mouvements n'ont pas de sens, on ne peut rien affirmer) d'un
// etat reel, meme vide (`connu: true, produits: []`, qui est le palier 1).
//   - { action: 'attendre' }   si connu est faux : rien a decider, la glu
//     doit armer une attente (creerAttenteRelance) et demander un
//     rafraichissement, pas repondre tout de suite.
//   - { action: 'basculer', etape, nomProduit } si un palier 1, 2 ou 3 est
//     a montrer sur les donnees reelles.
//   - { action: 'message' }   si les donnees sont connues mais qu'aucun
//     palier n'est a montrer (catalogue deja avance au-dela du fil -- palier
//     4 ou 5, decision du lot 3, gravee ci-dessous -- ou hors des bornes de
//     debutant).
//
// Aller-retour de relecture (18/09/2026, meme nuit) : une consigne du Jarvis
// avait fait etendre cette borne a l'etape 4 (le client verrait la bande
// plutot que le message), puis le Jarvis a corrige sa propre consigne et
// demande le retour a l'etat d'origine. La borne reste a 1/2/3, DELIBEREMENT,
// decision du lot 3 en ligne depuis le 18/09 au matin : au palier 4, le
// client a fait ses trois gestes, "Tes premiers pas sont deja faits, ton
// catalogue est en route" (messageRelanceImpossible) est EXACTEMENT vrai.
// Le texte du palier 4 lui-meme dit "Tu VIENS de faire les trois gestes" :
// sur une relance qui arrive des heures ou des jours plus tard, ce serait un
// texte faux a l'ecran -- la meme famille que D5/D22, deja payee deux fois.
export function resoudreRelance({ connu, produits, mouvements } = {}) {
  if (!connu) return { action: 'attendre' };
  const etat = calculerEtatDuFil({ produits, mouvements, ferme: false });
  if (etat.visible && (etat.etape === 1 || etat.etape === 2 || etat.etape === 3)) {
    return { action: 'basculer', etape: etat.etape, nomProduit: etat.nomProduit };
  }
  return { action: 'message' };
}

// --- Lot 7 (18/09/2026, chantier "Tutoriels") : la marche 3 de l'escalier
// mene desormais au palier d'import --------------------------------------
//
// Remplace le comportement PROVISOIRE du lot 6 (qui fermait la bande pour la
// session en cours faute de palier 5). Le palier 5 existe maintenant : la
// marche 3 ("Passer cette etape") y mene, plutot que de fermer la bande.
//
// Renvoi du 21/09/2026 : le palier 5 n'est plus une etape du fil (voir
// palier5() plus haut), seulement son palier de SORTIE. La valeur rendue
// devient `'palier-sortie'` (plus `'palier-5'`) pour que la glu ne la
// confonde jamais avec un passage normal 4 -> 5, qui n'existe plus. La glu
// (premiers_pas.js) traduit cette valeur en rendant directement le palier 5
// et en posant `sortieParEscalier` a vrai, pour que ce choix tienne meme si
// le prochain stovo:donnees rapporte encore un palier 1, 2 ou 3.
export function effetMarche3() {
  return 'palier-sortie';
}

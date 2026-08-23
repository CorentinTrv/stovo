// STOVO — onglet « Aide » : le contenu (22/08/2026, extrait de aide.js au lot C2-5)
// ====================================================================
// Module PUR : aucun DOM, aucun Supabase, aucun import. Exactement le meme
// principe que pertes.js / export.js : en isolant ici les textes et le
// rendu, ce module devient importable tel quel par Deno, contrairement a
// aide.js qui fait `document.getElementById` des son chargement (glu DOM
// executee au moment de l'import) et ne peut donc pas etre teste par un
// simple `import` sans navigateur. aide.js importe `CONTENU` d'ici et reste
// seul responsable du rendu HTML et du branchement DOM.
//
// EXACTITUDE DU CONTENU : les phrases listees ici ont ete relevees dans le
// cerveau deterministe REELLEMENT DEPLOYE (_shared/cerveau_deterministe.ts,
// version v14 / v28 du 25/07/2026) : verbes reconnus, marqueurs de creation,
// signaux d'alias, ordre de la cascade. Si le cerveau evolue, cette page doit
// evoluer avec lui, sinon elle ment.
//
// LOT P-4 (26/07/2026, chantier PILOTAGE) : les phrases sur l'autonomie, les
// trois etats (mesure/dormant/insuffisant) et le bandeau de pause sont
// relevees dans le module partage app/pilotage.js (constantes FENETRE_JOURS,
// PLANCHER_OBSERVATION_JOURS, GESTE_VIVANT_JOURS, SEUIL_DORMANT_JOURS) et
// dans les textes reels de app/dashboard.js (carteProduit, majBandeauPilotage)
// et _shared/reappro.ts (construireMessageReappro). Meme regle : si l'un de
// ces fichiers change, cette page doit suivre, sinon elle ment.
//
// LOT C2-5 (22/08/2026, chantier C2 "les exports") : section "Sortir mes
// données" ajoutée en fin de liste. Elle decrit le bloc replie "Exporter mes
// données" de dashboard.js/index.html (lot C2-3, bouton "État de mon stock
// (.csv)" et bouton "Journal de mes mouvements (.csv)") : si ces libelles
// changent la-bas, cette section doit suivre a l'identique, sinon elle ment.
//
// LOT "app court" (23/08/2026) : deux gestes deja en prod depuis fin juillet
// mais jamais decrits ici. Le mode sortie (bouton "Démarrer une sortie",
// sortie.js, backend _shared/sortie.ts, lot S-5 du 27/07) et la photo du bon
// de livraison (bouton "Photographier le bon de livraison", reception.js,
// backend _shared/photo_bl.ts, lot P-3 du 25/07). Ajoute au passage : la note
// du geste de reception qui disait "seul mode ou les nombres en lettres sont
// compris" est fausse depuis le lot S-5 (sortie.ts appelle aussi
// convertirNombresEnLettres), corrigee ici. La ligne "🎙️ Parler" de la
// section "comprendre" mentionne desormais ces deux gestes.
//
// COMPLEMENT (23/08/2026, relecture Jarvis) : l'astuce "Dis les nombres en
// chiffres, sauf en reception" mentait plus largement qu'un seul mot "seul
// mode" corrige : les nombres en toutes lettres sont compris dans TOUS les
// modes (reception, sortie, inventaire directement ; saisie normale via un
// REPLI, cf coeur.ts:2957-2977, traiterDeclaration ne retente
// convertirNombresEnLettres que si classerDeterministe a deja echoue sur la
// phrase brute ; inventaire guide via lireComptage, coeur.ts:2655, qui recoit
// le convertisseur directement). Astuce reecrite pour dire vrai. Un test
// balaie desormais tout CONTENU pour interdire "seul mode" / "Seul le mode"
// n'importe ou (gestes, astuces, defs), pas seulement sur la reception.
//
// LOT "app rejoint le monde clair, suite" (23/08/2026) : les 28 emoji de ce
// fichier sont remplaces par des CLES du registre app/icones.js (icones SVG
// en trait, meme esprit que les icones de la nav). `icone` passe d'un emoji
// litteral a une cle ('boussole', 'entree'...) ; chaque `titre`/`terme` perd
// son emoji de tete (le texte ne change pas au-dela de ce retrait). Les
// blocs `astuce` n'ont PAS de cle par bloc : aide.js pose l'icone 'ampoule'
// pour tous, en dur (voir aide.js). Aucun texte de fond ne change.

// ====================================================================
// LE CONTENU
// ====================================================================
// Structure volontairement simple pour rester facile a enrichir :
//   section : { id, icone, titre, blocs: [...] }
//   bloc    : { type: 'texte'  , texte }
//             { type: 'liste'  , items: [ '...' ] }
//             { type: 'defs'   , items: [ { terme, texte } ] }
//             { type: 'geste'  , titre, quoi, exemples: [...], note? }
//             { type: 'astuce' , titre, texte }
// Les `exemples` sont les seuls elements cliquables (rendus par aide.js).

export const CONTENU = [

  // ---------------- 1. COMPRENDRE ----------------
  {
    id: 'comprendre',
    icone: 'boussole',
    titre: 'Comprendre Stovo',
    ouvertParDefaut: true,
    blocs: [
      {
        type: 'texte',
        texte: 'Stovo tient ton stock à jour <b>à la voix</b>. Tu dis ce que tu viens de faire (« j\'ai reçu 10 pâtes »), Stovo te le répète pour vérification, tu confirmes, et c\'est écrit. Pas de tableur, pas de saisie au clavier obligatoire.',
      },
      {
        type: 'texte',
        texte: '<b>La règle d\'or : rien ne s\'écrit sans ton « Oui ».</b> Chaque déclaration qui touche au stock te revient sous forme de question. Tant que tu n\'as pas confirmé, la base ne bouge pas. C\'est ton filet de sécurité contre une mauvaise transcription.',
      },
      {
        type: 'defs',
        items: [
          { icone: 'pilotage', terme: 'Pilotage', texte: 'Ce qu\'il faut faire aujourd\'hui : le bandeau « Ce matin », les indicateurs, ce qui est à commander, l\'inventaire complet et les derniers mouvements.' },
          { icone: 'stock', terme: 'Stock', texte: 'Trouver un produit. La liste complète avec une recherche à la frappe. Tape sur une ligne pour voir le détail (prix, valeur, autonomie).' },
          { icone: 'parler', terme: 'Parler', texte: 'Agir. Le micro, le clavier, le mode réception, le mode sortie, la photo du bon de livraison, le parcours d\'inventaire et l\'import de catalogue. C\'est le seul écran qui écrit en base.' },
          { icone: 'aide', terme: 'Aide', texte: 'Cette page.' },
        ],
      },
      {
        type: 'texte',
        texte: '<b>Lire les pastilles de couleur</b>, les mêmes partout dans l\'app :',
      },
      {
        type: 'defs',
        items: [
          { terme: '● Vert', texte: 'En stock, rien à faire.' },
          { terme: '▲ Orange', texte: 'Rupture imminente : à ce rythme de vente, il reste moins de 3 jours.' },
          { terme: '■ Rouge', texte: 'Sous le point de commande : à commander maintenant.' },
        ],
      },
      {
        type: 'defs',
        items: [
          { terme: 'Il te reste ≈ X jours', texte: 'Ton autonomie. Stovo divise le stock qui reste par ta consommation moyenne, mesurée sur tes 30 derniers jours de ventes (7 jours minimum pour un produit tout jeune, le temps qu\'il ait du recul). Selon ce qu\'il sait, la carte affiche : « Il te reste ≈ X jours » quand c\'est mesuré, « Pas assez de sorties pour estimer » quand il manque encore des sorties déclarées, ou « Rien n\'est sorti depuis 30 jours » quand le produit ne bouge plus du tout.' },
          { terme: 'Point de commande', texte: 'Le niveau auquel il faut recommander pour ne pas tomber en rupture pendant le délai de livraison. Marqué <b>auto</b>, il suit ton rythme réel de ventes et bouge tout seul. Marqué <b>fixe</b>, c\'est le seuil que tu as dicté, faute de ventes assez nombreuses pour calculer.' },
          { terme: 'Valeur du stock', texte: 'Ce que tu as immobilisé en euros, au prix d\'achat que tu as dicté. Les produits sans prix ne sont pas comptés : le total est alors annoncé comme partiel.' },
          { terme: 'Pourquoi Stovo dit parfois qu\'il ne sait pas', texte: 'Une carte qui affiche « Pas assez de sorties pour estimer » n\'est pas en panne : il manque encore des sorties déclarées pour que Stovo apprenne ton rythme. Dis-lui tes ventes au fil de l\'eau (« j\'ai vendu 3 pâtes ») et le calcul s\'allume tout seul. Si tout ton catalogue reste sans sortie pendant 7 jours, un bandeau « Ton pilotage est en pause » apparaît en haut de l\'écran avec un bouton « Déclarer une sortie » qui te prépare la phrase ; il disparaît tout seul dès ta première sortie déclarée.' },
          { terme: 'Stock dormant', texte: '« Rien n\'est sorti depuis 30 jours » signale un produit assez ancien qui n\'a eu aucune sortie sur tout ce temps, alors que tu continues d\'en déclarer ailleurs dans ton catalogue. C\'est de l\'argent immobilisé dans un stock qui ne tourne pas : si le prix est connu, Stovo t\'indique ce que ça représente en euros.' },
        ],
      },
      {
        type: 'texte',
        texte: 'Les chiffres se rafraîchissent <b>toutes les 30 secondes</b>, et le bouton ↻ force la mise à jour. Stovo a besoin d\'une connexion : hors réseau, l\'app s\'ouvre mais ne peut ni lire ni écrire.',
      },
    ],
  },

  // ---------------- 2. LES PHRASES ----------------
  {
    id: 'phrases',
    icone: 'bulle',
    titre: 'Tout ce que tu peux dire',
    blocs: [
      {
        type: 'texte',
        texte: 'Tape sur un exemple : il se recopie dans l\'écran Parler, prêt à envoyer. <b>Rien n\'est envoyé automatiquement</b>, tu relis d\'abord.',
      },
      {
        type: 'geste',
        icone: 'entree',
        titre: 'Faire entrer du stock',
        quoi: 'Une livraison, un achat, un réassort.',
        exemples: ["j'ai reçu 10 pâtes", "j'ai acheté 6 bières", "on a rentré 24 lait"],
        note: 'Verbes compris : reçu, acheté, livré, ajouté, rentré.',
      },
      {
        type: 'geste',
        icone: 'sortie',
        titre: 'Faire sortir du stock',
        quoi: 'Une vente, une consommation, une sortie vers la production.',
        exemples: ["j'ai vendu 3 pâtes", "on a consommé 5 lait", "j'ai sorti 2 riz"],
        note: 'Verbes compris : vendu, sorti, consommé, utilisé.',
      },
      {
        type: 'geste',
        icone: 'question',
        titre: 'Demander où tu en es',
        quoi: 'Interroger le stock d\'un produit sans rien modifier.',
        exemples: ['combien il me reste de pâtes ?', 'quel est mon stock de riz ?', 'combien de bières ?'],
        note: 'Une question ne demande jamais de confirmation : elle n\'écrit rien.',
      },
      {
        type: 'geste',
        icone: 'panier',
        titre: 'Demander ce qu\'il faut commander',
        quoi: 'Ta liste de courses à la voix : Stovo te dit tout ce qui est passé sous son point de commande, sans que tu ailles regarder le tableau de bord.',
        exemples: ['qu\'est-ce que je dois commander ?', 'ma liste de courses', 'qu\'est-ce qui me manque ?'],
        note: 'Ne mets <b>aucun chiffre</b> dans cette phrase : un nombre fait comprendre à Stovo que tu veux modifier quelque chose, pas poser une question. Si aucun produit n\'a encore de consommation mesurable, Stovo ne répond plus « rien à commander » par confort : il te dit qu\'il n\'a pas assez de sorties déclarées et t\'invite à les dicter au fil de l\'eau.',
      },
      {
        type: 'geste',
        icone: 'corbeille',
        titre: 'Déclarer une perte',
        quoi: 'De la casse, un produit périmé, un vol. C\'est une sortie, mais tracée avec sa raison, pour ne pas fausser ta consommation moyenne.',
        exemples: ["j'ai jeté 3 yaourts périmés", "j'ai cassé 2 bières", "on m'a volé 4 bières"],
        note: 'Dis toujours <b>la raison</b> (cassé, tombé, abîmé / périmé, DLC / volé, disparu). Sans raison identifiable, Stovo préfère demander plutôt que de deviner.',
      },
      {
        type: 'geste',
        icone: 'recaler',
        titre: 'Recaler après comptage',
        quoi: 'Tu comptes en rayon et tu annonces le vrai chiffre. Stovo calcule tout seul l\'écart avec ce qu\'il croyait, et écrit la correction.',
        exemples: ['en rayon il y a 8 lait', 'inventaire pâtes 12', 'il reste 5 riz'],
        note: 'Tu annonces ce que tu <b>as compté</b>, jamais l\'écart. Si le compte tombe juste, Stovo te le dit et n\'écrit rien.',
      },
      {
        type: 'geste',
        icone: 'annuler',
        titre: 'Annuler ta dernière déclaration',
        quoi: 'Tu t\'es trompé de produit ou de quantité juste avant.',
        exemples: ['annule le dernier', 'je me suis trompé', 'oups'],
        note: 'Stovo n\'efface jamais rien : il écrit un mouvement <b>inverse</b> qui remet le stock à sa valeur d\'avant. L\'historique reste complet et honnête.',
      },
      {
        type: 'geste',
        icone: 'plus',
        titre: 'Créer un produit',
        quoi: 'Ajouter une référence qui n\'existe pas encore au catalogue.',
        exemples: ['ajoute le produit beurre', 'crée le produit farine', 'nouveau produit sucre'],
        note: 'Le produit naît avec un stock à 0 et sans prix : tu poses ensuite la quantité et le prix à la voix. Il faut un marqueur explicite (« le produit », « nouveau produit », « référence le »), c\'est ce qui évite de confondre avec une entrée de stock.',
      },
      {
        type: 'geste',
        icone: 'crayon',
        titre: 'Modifier un produit',
        quoi: 'Changer le prix d\'achat, le seuil d\'alerte, le délai de réappro, ou l\'unité.',
        exemples: ['le prix des pâtes c\'est 1,20', 'le seuil des bières c\'est 6', 'le délai de livraison du riz c\'est 3 jours', 'l\'unité des pâtes c\'est paquet'],
        note: 'La virgule française marche (1,20 = 1,20 €). Pour l\'unité, Stovo connaît les unités du commerce : kilo, kg, gramme, litre, centilitre, millilitre, pièce, unité, paquet, boîte, bouteille, carton, sachet, pack. Une unité fantaisiste, il préfère demander.',
      },
      {
        type: 'geste',
        icone: 'renommer',
        titre: 'Renommer un produit',
        quoi: 'Corriger un nom mal orthographié, ou lui donner son vrai nom commercial.',
        exemples: ['renomme les pâtes en macaroni', 'renomme le jus en jus d\'orange'],
        note: 'La structure est imposée : <b>renomme X en Y</b>. Le mot « en » est le séparateur, sans lui Stovo ne devine pas. À ne pas confondre avec le surnom : renommer change le vrai nom, un surnom en ajoute un deuxième.',
      },
      {
        type: 'geste',
        icone: 'interrupteur',
        titre: 'Retirer ou remettre un produit',
        quoi: 'Sortir une référence que tu ne vends plus, sans perdre son historique.',
        exemples: ['désactive le produit sucre', 'supprime le beurre du catalogue', 'réactive le sucre'],
        note: 'Rien n\'est jamais effacé : le produit devient invisible dans le tableau de bord et la recherche, mais ses mouvements restent en base et il revient d\'un mot.',
      },
      {
        type: 'geste',
        icone: 'etiquette',
        titre: 'Donner un surnom à un produit',
        quoi: 'Quand la reconnaissance vocale écorche toujours le même mot, apprends-lui le mot que TU dis.',
        exemples: ['appelle les céréales serial', 'surnomme le café jus', 'oublie serial'],
        note: 'Un surnom = <b>un seul mot</b>, 3 lettres minimum, et il ne peut désigner qu\'un seul produit. Une fois posé, il est reconnu comme le vrai nom. « oublie X » le retire.',
      },
      {
        type: 'geste',
        icone: 'inventaire',
        titre: 'Faire l\'inventaire de tout le magasin',
        quoi: 'Le bouton « Faire mon inventaire » sur l\'écran Parler. Stovo te présente tes produits un par un : tu comptes, tu dictes juste le chiffre, il passe au suivant. À la fin, il te montre le récapitulatif des écarts et UNE seule validation recale tout.',
        exemples: [],
        note: 'Tu dis <b>le chiffre seul</b>, rien d\'autre. Tu peux passer un produit, t\'arrêter en cours de route, et cocher le <b>comptage à l\'aveugle</b> pour ne pas voir le stock théorique avant de compter (c\'est la bonne pratique : on compte ce qu\'on voit, pas ce qu\'on s\'attend à voir).',
      },
      {
        type: 'geste',
        icone: 'carton',
        titre: 'Ranger toute une livraison d\'un coup',
        quoi: 'Le bouton « Démarrer une réception » sur l\'écran Parler. Tu dictes les produits un par un, tu vois la liste se remplir à l\'écran, et UNE seule validation écrit tout le lot.',
        exemples: ['12 pâtes', 'huit bières', 'vingt-cinq lait'],
        note: 'En réception, tu dis juste <b>la quantité et le produit</b>, sans verbe. Les nombres <b>en lettres</b> sont compris. Il n\'accepte que des entrées : pour une sortie, quitte la réception.',
      },
      {
        type: 'geste',
        icone: 'moins-cercle',
        titre: 'Faire sortir toute une vente d\'un coup',
        quoi: 'Le bouton « Démarrer une sortie » sur l\'écran Parler. Tu dictes les produits vendus un par un, tu vois la liste se remplir à l\'écran avec le signe moins devant chaque quantité, et UNE seule validation écrit tout le lot.',
        exemples: ['3 pâtes', "j'ai vendu 8 bières", 'huit lait'],
        note: 'En sortie, une phrase complète marche (« j\'ai vendu 3 pâtes ») tout comme la phrase nue (« 3 pâtes »). Les nombres <b>en lettres</b> sont compris. Rien n\'est écrit avant la validation finale, et tu peux reprendre une sortie laissée en cours. Pas de raison à donner dans ce mode : pour une casse ou une perte, utilise « j\'ai jeté », « j\'ai cassé »… en dehors de ce mode.',
      },
      {
        type: 'geste',
        icone: 'appareil-photo',
        titre: 'Photographier le bon de livraison',
        quoi: 'Dans une réception, le bouton « Photographier le bon de livraison » ouvre l\'appareil photo. Stovo lit les lignes du bon (quantité et libellé), reconnaît celles qui correspondent à ton catalogue, et les ajoute à la liste de la réception en cours.',
        exemples: [],
        note: 'Une photo n\'écrit <b>jamais</b> rien toute seule : les lignes lues rejoignent la liste, tout passe par la validation groupée de la réception, comme si tu les avais dictées. Vérifie ce que Stovo a lu dans le journal de lecture avant de valider. Prends la photo bien à plat, bien éclairée et nette, une page à la fois : une ligne mal lue ou un article que Stovo ne reconnaît pas dans ton catalogue est simplement signalé, jamais deviné.',
      },
      {
        type: 'geste',
        icone: 'document-fleche',
        titre: 'Importer un catalogue',
        quoi: 'Le bouton « Importer un catalogue (.xlsx) » sur l\'écran Parler. Stovo lit ton fichier Excel, reconnaît tout seul tes colonnes (nom, stock, prix…) et te dit ce qu\'il a compris avant d\'écrire.',
        exemples: [],
        note: 'Réimporter le même fichier ne crée pas de doublon : les produits déjà connus sont ignorés. C\'est le moyen le plus rapide de démarrer avec beaucoup de références.',
      },
    ],
  },

  // ---------------- 3. ASTUCES ----------------
  {
    id: 'astuces',
    icone: 'ampoule',
    titre: 'Astuces et pièges à connaître',
    blocs: [
      {
        type: 'astuce',
        titre: '« Huit » ou « 8 » : Stovo comprend les deux, partout',
        texte: 'En réception, en sortie et dans le parcours d\'inventaire, un nombre écrit en toutes lettres par la reconnaissance vocale (« dix », « vingt-cinq ») est compris directement. En saisie normale, c\'est un <b>repli</b> : Stovo essaie d\'abord de comprendre la phrase telle quelle, et ne retente la conversion que si ça n\'a pas suffi. Cette nuance protège un produit dont le nom contient un mot-nombre (« quatre quarts », « cent pur jus ») : le nom déjà connu l\'emporte toujours avant qu\'une conversion soit tentée. Dans le doute, relis toujours le champ avant d\'envoyer.',
      },
      {
        type: 'astuce',
        titre: 'Relis toujours avant d\'envoyer',
        texte: 'Le micro remplit le champ, il n\'envoie rien. C\'est volontaire : la reconnaissance vocale du téléphone se trompe, et ce coup d\'œil est ton premier rempart. Le « Oui » est le second.',
      },
      {
        type: 'astuce',
        titre: '« Supprime le dernier » n\'est pas « supprime le produit »',
        texte: 'Deux gestes très différents avec le même verbe. <b>« supprime le dernier »</b> annule ta dernière déclaration. <b>« supprime le produit X »</b> ou <b>« supprime X du catalogue »</b> retire la référence. C\'est le mot « produit » ou « catalogue » qui fait la différence : sans lui, Stovo comprend une annulation.',
      },
      {
        type: 'astuce',
        titre: 'Le piège du mot « ajoute »',
        texte: '« <b>j\'ai ajouté 10 pâtes</b> » fait entrer 10 pâtes en stock. « <b>ajoute le produit pâtes</b> » crée une nouvelle référence. Même verbe, deux sens : ce sont les mots « le produit » qui basculent vers la création. Si tu veux juste du stock, ne dis jamais « le produit ».',
      },
      {
        type: 'astuce',
        titre: 'Un mot mal entendu ? Donne-lui un surnom',
        texte: 'Si ton téléphone écrit systématiquement « serial » quand tu dis « céréales », ne te bats pas : dis une fois « <b>appelle les céréales serial</b> ». Le mot est appris, et il sera reconnu instantanément et gratuitement les fois suivantes. Stovo peut aussi te le proposer tout seul quand il ne reconnaît pas un mot : accepter sa proposition enregistre le surnom au passage.',
      },
      {
        type: 'astuce',
        titre: 'Deux produits qui se ressemblent ? Précise',
        texte: 'Si tu as « Lait » et « Lait entier » et que tu dis juste « lait », Stovo <b>ne choisit pas au hasard</b> : il te demande lequel. C\'est voulu, et ça devient précieux quand ton catalogue grossit. Réponds avec le nom complet.',
      },
      {
        type: 'astuce',
        titre: 'Un seul chantier à la fois',
        texte: 'Tu ne peux pas avoir une réception <b>et</b> un inventaire ouverts en même temps : Stovo refuse et te dit lequel terminer d\'abord. Ce n\'est pas une limite, c\'est une protection : sans elle, un chiffre dicté pour l\'inventaire pourrait partir dans la réception et ajouter du stock au lieu de le recaler.',
      },
      {
        type: 'astuce',
        titre: 'Compte à l\'aveugle, tu compteras juste',
        texte: 'Dans le parcours d\'inventaire, coche « comptage à l\'aveugle ». Voir le stock théorique avant de compter influence toujours : on trouve ce qu\'on s\'attend à trouver, et les petits écarts passent à la trappe. C\'est la règle de base d\'un inventaire sérieux, et c\'est là que tu retrouves ta démarque inconnue.',
      },
      {
        type: 'astuce',
        titre: 'Le rangement d\'une livraison va deux fois plus vite en mode réception',
        texte: 'Pour trois articles ou plus, passe par « Démarrer une réception » plutôt que trois phrases complètes : tu dictes « 12 pâtes », « 6 bières », « 24 lait » sans verbe, tu vérifies la liste d\'un coup d\'œil, et tu valides une seule fois. Si tu dictes deux fois le même produit, les quantités s\'additionnent au lieu de créer un doublon.',
      },
      {
        type: 'astuce',
        titre: 'Une erreur ne se répare pas en effaçant',
        texte: 'Stovo ne supprime jamais une ligne d\'historique. Une annulation écrit un mouvement inverse, un produit retiré est simplement désactivé. C\'est ce qui garantit que ton historique dit toujours la vérité, et que tu peux revenir en arrière sans rien perdre.',
      },
      {
        type: 'astuce',
        titre: 'Déclare tes pertes, elles faussent moins tes prévisions',
        texte: 'Une casse déclarée comme une vente gonfle ta consommation moyenne, donc ton point de commande, donc tu commandes trop. Dire « j\'ai cassé 2 bières » plutôt que « j\'ai vendu 2 bières » garde tes prévisions justes.',
      },
      {
        type: 'astuce',
        titre: 'Renseigne les prix, tu débloques la trésorerie',
        texte: 'Sans prix d\'achat, la valeur de ton stock est incomplète et annoncée comme partielle. Dire « le prix des pâtes c\'est 1,20 » une seule fois par produit suffit à voir combien tu as immobilisé dans tes rayons.',
      },
      {
        type: 'astuce',
        titre: 'L\'app se met à jour au démarrage à froid',
        texte: 'Quand une nouvelle version est publiée, elle n\'arrive pas en pleine session (jamais de coupure au milieu d\'une saisie). Ferme complètement Stovo et rouvre-le pour l\'avoir.',
      },
    ],
  },

  // ---------------- 4. SORTIR MES DONNEES ----------------
  {
    id: 'export',
    icone: 'recu',
    titre: 'Sortir mes données',
    blocs: [
      {
        type: 'texte',
        texte: 'Le bouton est dans l\'onglet <b>Pilotage</b>, tout en bas, dans le bloc replié <b>« Exporter mes données »</b>.',
      },
      {
        type: 'texte',
        texte: '<b>État de mon stock (.csv)</b> te donne la photo de ton stock à l\'instant présent avec sa valeur, et <b>Journal de mes mouvements (.csv)</b> te donne l\'historique complet de toutes tes entrées et sorties.',
      },
      {
        type: 'texte',
        texte: 'La valeur affichée est indicative, calculée au dernier prix d\'achat connu : donne ces deux fichiers à ton comptable, c\'est à lui de les retraiter selon ses règles.',
      },
    ],
  },
];

// STOVO — onglet « Aide » (25/07/2026)
// ====================================================================
// Le mode d'emploi de Stovo, DANS Stovo. Trois parties :
//   1. Comprendre  : a quoi sert chaque ecran, comment lire les chiffres.
//   2. Les phrases : les 12 gestes, avec des exemples exacts.
//   3. Astuces     : les pieges reels, tires du comportement du code.
//
// 100 % LECTURE SEULE et ZERO appel reseau : ce module ne parle jamais a
// Supabase, ne lit pas la base, n'ecrit rien. Le contenu est ecrit en dur
// ci-dessous (constante CONTENU) et rendu tel quel.
//
// SEULE interaction : un exemple est un bouton. Le taper bascule sur
// l'ecran « Parler » avec la phrase DEJA ECRITE dans le champ, sans jamais
// l'envoyer (meme esprit que l'option A du micro : on relit, puis on decide).
// Ce module remplit donc #champ-parler directement et emet l'evenement
// 'stovo:onglet' qu'ecoute app.js pour la bascule. parler.js n'est PAS
// modifie : il lira simplement le champ au moment ou tu appuies sur Envoyer.
//
// EXACTITUDE DU CONTENU : les phrases listees ici ont ete relevees dans le
// cerveau deterministe REELLEMENT DEPLOYE (_shared/cerveau_deterministe.ts,
// version v14 / v28 du 25/07/2026) : verbes reconnus, marqueurs de creation,
// signaux d'alias, ordre de la cascade. Si le cerveau evolue, cette page doit
// evoluer avec lui, sinon elle ment.

const $ = (id) => document.getElementById(id);

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
// LE CONTENU
// ====================================================================
// Structure volontairement simple pour rester facile a enrichir :
//   section : { id, icone, titre, blocs: [...] }
//   bloc    : { type: 'texte'  , texte }
//             { type: 'liste'  , items: [ '...' ] }
//             { type: 'defs'   , items: [ { terme, texte } ] }
//             { type: 'geste'  , titre, quoi, exemples: [...], note? }
//             { type: 'astuce' , titre, texte }
// Les `exemples` sont les seuls elements cliquables.

export const CONTENU = [

  // ---------------- 1. COMPRENDRE ----------------
  {
    id: 'comprendre',
    icone: '🧭',
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
          { terme: '📊 Pilotage', texte: 'Ce qu\'il faut faire aujourd\'hui : le bandeau « Ce matin », les indicateurs, ce qui est à commander, l\'inventaire complet et les derniers mouvements.' },
          { terme: '📦 Stock', texte: 'Trouver un produit. La liste complète avec une recherche à la frappe. Tape sur une ligne pour voir le détail (prix, valeur, autonomie).' },
          { terme: '🎙️ Parler', texte: 'Agir. Le micro, le clavier, le mode réception et l\'import de catalogue. C\'est le seul écran qui écrit en base.' },
          { terme: '💡 Aide', texte: 'Cette page.' },
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
          { terme: 'Il te reste ≈ X jours', texte: 'Ton autonomie. Stovo divise le stock qui reste par ta consommation moyenne mesurée. Tant qu\'il n\'a pas assez de sorties enregistrées, il affiche « pas encore de ventes mesurées » plutôt que d\'inventer un chiffre.' },
          { terme: 'Point de commande', texte: 'Le niveau auquel il faut recommander pour ne pas tomber en rupture pendant le délai de livraison. Marqué <b>auto</b>, il suit ton rythme réel de ventes et bouge tout seul. Marqué <b>fixe</b>, c\'est le seuil que tu as dicté, faute de ventes assez nombreuses pour calculer.' },
          { terme: 'Valeur du stock', texte: 'Ce que tu as immobilisé en euros, au prix d\'achat que tu as dicté. Les produits sans prix ne sont pas comptés : le total est alors annoncé comme partiel.' },
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
    icone: '🗣️',
    titre: 'Tout ce que tu peux dire',
    blocs: [
      {
        type: 'texte',
        texte: 'Tape sur un exemple : il se recopie dans l\'écran Parler, prêt à envoyer. <b>Rien n\'est envoyé automatiquement</b>, tu relis d\'abord.',
      },
      {
        type: 'geste',
        titre: '📥 Faire entrer du stock',
        quoi: 'Une livraison, un achat, un réassort.',
        exemples: ["j'ai reçu 10 pâtes", "j'ai acheté 6 bières", "on a rentré 24 lait"],
        note: 'Verbes compris : reçu, acheté, livré, ajouté, rentré.',
      },
      {
        type: 'geste',
        titre: '📤 Faire sortir du stock',
        quoi: 'Une vente, une consommation, une sortie vers la production.',
        exemples: ["j'ai vendu 3 pâtes", "on a consommé 5 lait", "j'ai sorti 2 riz"],
        note: 'Verbes compris : vendu, sorti, consommé, utilisé.',
      },
      {
        type: 'geste',
        titre: '❓ Demander où tu en es',
        quoi: 'Interroger le stock d\'un produit sans rien modifier.',
        exemples: ['combien il me reste de pâtes ?', 'quel est mon stock de riz ?', 'combien de bières ?'],
        note: 'Une question ne demande jamais de confirmation : elle n\'écrit rien.',
      },
      {
        type: 'geste',
        titre: '🗑️ Déclarer une perte',
        quoi: 'De la casse, un produit périmé, un vol. C\'est une sortie, mais tracée avec sa raison, pour ne pas fausser ta consommation moyenne.',
        exemples: ["j'ai jeté 3 yaourts périmés", "j'ai cassé 2 bières", "on m'a volé 4 bières"],
        note: 'Dis toujours <b>la raison</b> (cassé, tombé, abîmé / périmé, DLC / volé, disparu). Sans raison identifiable, Stovo préfère demander plutôt que de deviner.',
      },
      {
        type: 'geste',
        titre: '🔢 Recaler après comptage',
        quoi: 'Tu comptes en rayon et tu annonces le vrai chiffre. Stovo calcule tout seul l\'écart avec ce qu\'il croyait, et écrit la correction.',
        exemples: ['en rayon il y a 8 lait', 'inventaire pâtes 12', 'il reste 5 riz'],
        note: 'Tu annonces ce que tu <b>as compté</b>, jamais l\'écart. Si le compte tombe juste, Stovo te le dit et n\'écrit rien.',
      },
      {
        type: 'geste',
        titre: '↩️ Annuler ta dernière déclaration',
        quoi: 'Tu t\'es trompé de produit ou de quantité juste avant.',
        exemples: ['annule le dernier', 'je me suis trompé', 'oups'],
        note: 'Stovo n\'efface jamais rien : il écrit un mouvement <b>inverse</b> qui remet le stock à sa valeur d\'avant. L\'historique reste complet et honnête.',
      },
      {
        type: 'geste',
        titre: '➕ Créer un produit',
        quoi: 'Ajouter une référence qui n\'existe pas encore au catalogue.',
        exemples: ['ajoute le produit beurre', 'crée le produit farine', 'nouveau produit sucre'],
        note: 'Le produit naît avec un stock à 0 et sans prix : tu poses ensuite la quantité et le prix à la voix. Il faut un marqueur explicite (« le produit », « nouveau produit », « référence le »), c\'est ce qui évite de confondre avec une entrée de stock.',
      },
      {
        type: 'geste',
        titre: '✏️ Modifier un produit',
        quoi: 'Changer le prix d\'achat, le seuil d\'alerte, ou le délai de réappro.',
        exemples: ['le prix des pâtes c\'est 1,20', 'le seuil des bières c\'est 6', 'le délai de livraison du riz c\'est 3 jours'],
        note: 'La virgule française marche (1,20 = 1,20 €). Pour changer l\'unité, dis-le simplement : Stovo n\'a pas de règle figée pour ça et demandera confirmation.',
      },
      {
        type: 'geste',
        titre: '🚫 Retirer ou remettre un produit',
        quoi: 'Sortir une référence que tu ne vends plus, sans perdre son historique.',
        exemples: ['désactive le produit sucre', 'supprime le beurre du catalogue', 'réactive le sucre'],
        note: 'Rien n\'est jamais effacé : le produit devient invisible dans le tableau de bord et la recherche, mais ses mouvements restent en base et il revient d\'un mot.',
      },
      {
        type: 'geste',
        titre: '🏷️ Donner un surnom à un produit',
        quoi: 'Quand la reconnaissance vocale écorche toujours le même mot, apprends-lui le mot que TU dis.',
        exemples: ['appelle les céréales serial', 'surnomme le café jus', 'oublie serial'],
        note: 'Un surnom = <b>un seul mot</b>, 3 lettres minimum, et il ne peut désigner qu\'un seul produit. Une fois posé, il est reconnu comme le vrai nom. « oublie X » le retire.',
      },
      {
        type: 'geste',
        titre: '📦 Ranger toute une livraison d\'un coup',
        quoi: 'Le bouton « Démarrer une réception » sur l\'écran Parler. Tu dictes les produits un par un, tu vois la liste se remplir à l\'écran, et UNE seule validation écrit tout le lot.',
        exemples: ['12 pâtes', 'huit bières', 'vingt-cinq lait'],
        note: 'En réception, tu dis juste <b>la quantité et le produit</b>, sans verbe. C\'est le seul mode où les nombres <b>en lettres</b> sont compris. Il n\'accepte que des entrées : pour une sortie, quitte la réception.',
      },
      {
        type: 'geste',
        titre: '📄 Importer un catalogue',
        quoi: 'Le bouton « Importer un catalogue (.xlsx) » sur l\'écran Parler. Stovo lit ton fichier Excel, reconnaît tout seul tes colonnes (nom, stock, prix…) et te dit ce qu\'il a compris avant d\'écrire.',
        exemples: [],
        note: 'Réimporter le même fichier ne crée pas de doublon : les produits déjà connus sont ignorés. C\'est le moyen le plus rapide de démarrer avec beaucoup de références.',
      },
    ],
  },

  // ---------------- 3. ASTUCES ----------------
  {
    id: 'astuces',
    icone: '💡',
    titre: 'Astuces et pièges à connaître',
    blocs: [
      {
        type: 'astuce',
        titre: 'Dis les nombres en chiffres, sauf en réception',
        texte: 'En saisie normale, dis « <b>10</b> pâtes » : si la reconnaissance vocale écrit « dix » en toutes lettres, Stovo ne reconnaît pas la quantité. Seul le <b>mode réception</b> sait lire « huit » ou « vingt-cinq ». C\'est une limite connue, pas un bug : dans le doute, relis le champ avant d\'envoyer et corrige le mot en chiffre.',
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
];

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
      return `<dl class="aide-defs">${bloc.items.map((d) =>
        `<dt>${d.terme}</dt><dd>${d.texte}</dd>`
      ).join('')}</dl>`;

    case 'geste':
      return `
        <div class="aide-geste">
          <h3 class="aide-geste-titre">${bloc.titre}</h3>
          <p class="aide-geste-quoi">${bloc.quoi}</p>
          ${rendreExemples(bloc.exemples)}
          ${bloc.note ? `<p class="aide-note">${bloc.note}</p>` : ''}
        </div>`;

    case 'astuce':
      return `
        <div class="aide-astuce">
          <h3 class="aide-astuce-titre">${bloc.titre}</h3>
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
        <span class="aide-icone" aria-hidden="true">${section.icone}</span>
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

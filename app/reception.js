// STOVO — mode réception multi-produits (chantier N1, lots FR-4 + FR-5)
// =====================================================================
// « La voix SAISIT, l'écran CONTRÔLE » (cadrage Stratège du 19/07). Ce module
// gère l'écran de contrôle d'une réception : une liste vivante de lignes qu'on
// dicte une par une, puis UNE validation groupée qui écrit tout le lot en base.
// Le rempart de confirmation Oui/Non par ligne est DÉPLACÉ vers cette
// validation finale (jamais supprimé).
//
// Isolation volontaire (testabilité + sobriété) : ce module ne connaît NI
// Supabase NI le vrai DOM. Il reçoit par injection :
//   - `elements`  : les nœuds DOM déjà résolus (parler.js les passe) ;
//   - `appeler`   : async (corps) -> { reply, session } | null  (null = échec) ;
//   - `confirmer` : (message) -> bool (confirmation avant abandon) ;
//   - `afficher`  : (texte) -> affiche un message dans la zone réponse ;
//   - `doc`       : le document (globalThis.document en vrai, un mock au banc).
// Grâce à ça, le banc d'essai offline (DOM simulé, aucun réseau) exerce toute
// la mécanique, comme stock.js / le lot 11a. parler.js branche le vrai Supabase.
//
// Contrat de l'API (kinds reception-* de pwa-api, voir RAPPORT_passation_lotAPI3) :
//   reception-ligne { texte }      -> { reply, session }  (additif, PAS idempotent)
//   reception-retirer { produitId } -> { reply, session } (idempotent)
//   reception-etat {}              -> { reply, session }   (reprise)
//   reception-valider {}           -> { reply, session }   (idempotent : rejeu = rien)
//   reception-abandon {}           -> { reply, session }
// Forme `session` : { active, lignes:[{produitId, nom, quantite, fusionnee?}],
//                     inconnus:[], total }.

const MSG_ERREUR = 'Désolé, une erreur est survenue. Réessaie dans quelques instants.';
const MSG_ENTREE = 'Réception en cours. Dicte tes produits un par un, puis valide le tout.';
const MSG_VIDE = 'Dicte un produit pour commencer, par exemple : 10 pâtes.';
const PLACEHOLDER_RECEPTION = 'Ex : 10 pâtes';
const PLACEHOLDER_NORMAL = "Ex : j'ai reçu 10 pâtes";

// « 0 ligne », « 1 ligne », « 3 lignes » (accord du pluriel).
function libelleLignes(n) {
  return `${n} ${n <= 1 ? 'ligne' : 'lignes'}`;
}

// Message de la zone « inconnus » (produits dictés absents du catalogue, signalés
// mais exclus du lot). Transitoire : disparaît au prochain état sans inconnu.
function texteInconnus(inconnus) {
  if (inconnus.length === 1) {
    return `« ${inconnus[0] } » n'est pas dans ton catalogue, crée-le d'abord.`;
  }
  return `Pas dans ton catalogue : ${inconnus.join(', ')}. Crée-les d'abord.`;
}

// Lot P-3 (25/07/2026) : messages du chemin photo. Le travail de lecture est
// serveur (Gemini) ; ici on ne fait que préparer l'image et afficher la réponse.
const MSG_PHOTO_ENVOI = 'Je lis ta photo, un instant…';
const MSG_PHOTO_ILLISIBLE = "Je n'ai pas réussi à préparer cette photo. Reprends-la, ou dicte les lignes.";

export function creerModeReception({ elements, appeler, confirmer, afficher, doc, prendreVerrou, rendreVerrou, reduirePhoto, afficherChoix }) {
  const document = doc || globalThis.document;

  // Lot S-0 (25/07/2026) : verrou de mode, injecté par parler.js (voir son bloc
  // « Verrou de mode unique »). Défauts permissifs OBLIGATOIRES : sans eux, tous
  // les scénarios du banc d'essai offline écrits avant ce lot tomberaient d'un
  // coup, et on ne saurait plus distinguer une vraie régression d'un harnais de
  // test incomplet. Ce module ne connaît toujours pas les autres modes.
  const verrouPrendre = prendreVerrou || (() => true);
  const verrouRendre = rendreVerrou || (() => {});
  // Lot A10-6 (23/08/2026) : rendu des boutons de choix numéroté, injecté par
  // parler.js (même fonction que la déclaration et la sortie). Défaut
  // permissif OBLIGATOIRE, même raison que ci-dessus.
  const afficherChoixMode = afficherChoix || (() => {});

  let enReception = false;      // état purement front (la session « naît » à la 1re ligne serveur)
  let sessionReprise = null;    // état renvoyé par reception-etat, en attente d'un clic « Reprendre »

  // --- Rendu de la liste vivante à partir de `session` ---
  function rendre(session) {
    const lignes = (session && session.lignes) || [];
    const inconnus = (session && session.inconnus) || [];
    const total = (session && typeof session.total === 'number') ? session.total : lignes.length;

    elements.titreTotal.textContent = libelleLignes(total);

    elements.liste.innerHTML = '';
    if (lignes.length === 0) {
      const vide = document.createElement('p');
      vide.className = 'reception-vide';
      vide.textContent = MSG_VIDE;
      elements.liste.appendChild(vide);
    } else {
      for (const ligne of lignes) {
        const item = document.createElement('div');
        // La classe `fusionnee` n'est présente que sur le rendu où la ligne vient
        // d'être fusionnée : l'animation CSS ne joue donc qu'une fois (flash bref).
        item.className = ligne.fusionnee ? 'reception-item fusionnee' : 'reception-item';

        const nom = document.createElement('span');
        nom.className = 'ri-nom';
        nom.textContent = ligne.nom;

        const qte = document.createElement('span');
        qte.className = 'ri-qte';
        qte.textContent = `+${ligne.quantite}`;

        const croix = document.createElement('button');
        croix.type = 'button';
        croix.className = 'ri-retirer';
        croix.setAttribute('aria-label', `Retirer ${ligne.nom}`);
        croix.textContent = '✕'; // ✕
        const produitId = ligne.produitId;
        croix.addEventListener('click', () => retirer(produitId));

        item.appendChild(nom);
        item.appendChild(qte);
        item.appendChild(croix);
        elements.liste.appendChild(item);
      }
    }

    if (inconnus.length > 0) {
      elements.inconnus.hidden = false;
      elements.inconnus.textContent = texteInconnus(inconnus);
    } else {
      elements.inconnus.hidden = true;
      elements.inconnus.textContent = '';
    }

    // On ne valide pas un lot vide (rempart : le bouton reste inactif tant qu'il
    // n'y a rien à enregistrer).
    elements.valider.disabled = lignes.length === 0;
  }

  // --- Bascule d'affichage : entrer / sortir du mode réception ---
  function entrer(session) {
    // Lot S-0 : on ne touche à RIEN si un autre mode est ouvert. Le message de
    // refus est affiché par l'arbitre (il est le seul à savoir qui bloque).
    if (!verrouPrendre('reception')) return;
    enReception = true;
    elements.reprise.hidden = true;
    elements.demarrer.hidden = true;
    elements.panneau.hidden = false;
    elements.actions.hidden = false;
    if (elements.boutonImport) elements.boutonImport.hidden = true;
    if (elements.confirmation) elements.confirmation.hidden = true; // R3 : pas de Oui/Non normal en session
    afficherChoixMode([], null); // R3 (lot A10-6) : même règle pour un choix orphelin d'avant la session
    elements.boutonEnvoyer.textContent = 'Ajouter';
    elements.champ.placeholder = PLACEHOLDER_RECEPTION;
    elements.champ.value = '';
    afficher(MSG_ENTREE);
    rendreLecture([]); // pas de journal de lecture tant qu'aucune photo n'est prise
    rendre(session || { active: true, lignes: [], inconnus: [], total: 0 });
  }

  function sortir() {
    enReception = false;
    verrouRendre('reception'); // Lot S-0 : libère les autres modes.
    // Lot A10-6b (23/08/2026, corrigé après relecture du Jarvis) : un choix
    // pouvait rester affiché à l'écran après Valider/Abandonner (rappels qui
    // visent un mode désormais fermé). Appelé APRÈS verrouRendre pour que le
    // pli d'écran (parler.js) se calcule avec modeCourant déjà à null.
    afficherChoixMode([], null);
    elements.panneau.hidden = true;
    elements.actions.hidden = true;
    elements.demarrer.hidden = false;
    if (elements.boutonImport) elements.boutonImport.hidden = false;
    elements.boutonEnvoyer.textContent = 'Envoyer';
    elements.champ.placeholder = PLACEHOLDER_NORMAL;
    elements.champ.value = '';
    rendreLecture([]); // le journal de lecture ne survit pas a la session
    // La zone réponse n'est PAS touchée : elle garde le message de succès
    // (« Réception enregistrée : N ligne(s). ») après une validation.
  }

  // Appel API générique en désactivant des contrôles le temps de la requête
  // (anti double-tap ; l'idempotence backend protège déjà l'écriture, ceci
  // n'est qu'un garde-fou d'UX). Renvoie le payload { reply, session } ou null.
  async function executer(corps, controles) {
    controles.forEach((c) => { if (c) c.disabled = true; });
    try {
      return await appeler(corps);
    } finally {
      controles.forEach((c) => { if (c) c.disabled = false; });
    }
  }

  // --- Ajouter une ligne (appelé par le submit du formulaire de parler.js) ---
  async function ajouterLigne(texte) {
    const payload = await executer({ kind: 'reception-ligne', texte }, [elements.boutonEnvoyer, elements.champ]);
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    if (payload.session) {
      rendre(payload.session);
      elements.champ.value = ''; // champ vidé seulement si l'ajout a abouti
    }
    // Toute autre action que la photo périme son journal de lecture : le laisser
    // affiché donnerait à relire un état qui n'est plus celui de la liste.
    rendreLecture(payload.lecture);
    afficherChoixDepuisPayload(payload);
  }

  // --- Lot A10-6 (23/08/2026) : ambiguïté sur une ligne dictée en réception ---
  // pwa-api pose un choix numéroté ("10 pâtes" -> "Pâtes 500 g" ou "Pâtes
  // complètes ?") exactement comme en déclaration, mais SANS Oui/Non : ici
  // c'est déjà une session de contrôle, la ligne rejoint juste la liste
  // vivante une fois le candidat choisi (§4 du plan A10, contexte B).
  //
  // Affiche (ou efface) la zone de choix selon `payload.choix`. Facteur commun
  // à ajouterLigne et envoyerChoix (une réponse à un choix peut elle-même
  // reposer un nouveau choix, cas hors bornes repose côté serveur).
  //
  // Lot A10-6b (23/08/2026) : troisième rappel « Aucun de ceux-là », qui
  // envoie EXACTEMENT ce que taper « non » dans le champ enverrait ici, le
  // chemin de ligne normale (`traiterReceptionLigne('non')` avec un choix en
  // attente rend « D'accord, j'oublie. Redis ta phrase quand tu veux. »,
  // _shared/coeur.ts ligne 1366).
  function afficherChoixDepuisPayload(payload) {
    if (Array.isArray(payload.choix) && payload.choix.length > 0) {
      afficherChoixMode(payload.choix, envoyerChoix, () => ajouterLigne('non'));
    } else {
      afficherChoixMode([], null);
    }
  }

  // Rappel du bouton de choix (ou de la réponse dictée/tapée équivalente,
  // gérée directement par pwa-api) : envoie { kind: 'choix', numero }, puis
  // traite la réponse EXACTEMENT comme une ligne normale (même rendu de
  // liste, mêmes messages, même gestion du null réseau).
  async function envoyerChoix(numero) {
    const payload = await executer({ kind: 'choix', numero }, [elements.boutonEnvoyer, elements.champ]);
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    if (payload.session) rendre(payload.session);
    rendreLecture(payload.lecture); // jamais fourni par kind="choix" : périme le journal, comme une ligne normale
    afficherChoixDepuisPayload(payload);
  }

  // --- Ajouter des lignes depuis une PHOTO de bon de livraison (lot P-3) ---
  //
  // Le geste change (photographier au lieu de dicter), le circuit de sécurité
  // NE change pas : les lignes lues atterrissent dans la même liste vivante,
  // se relisent à l'écran, se retirent à la croix, et ne partent en base qu'à
  // la validation groupée. La photo raccourcit la SAISIE, jamais le rempart.
  async function envoyerPhoto(fichier) {
    if (!fichier) return;
    if (typeof reduirePhoto !== 'function') { afficher(MSG_PHOTO_ILLISIBLE); return; }

    // La réduction se fait AVANT toute désactivation de contrôle : sur un gros
    // fichier elle prend un instant, autant que l'écran le dise tout de suite.
    afficher(MSG_PHOTO_ENVOI);

    let reduite = null;
    try {
      reduite = await reduirePhoto(fichier);
    } catch (_e) {
      reduite = null;
    }
    if (!reduite || !reduite.base64) { afficher(MSG_PHOTO_ILLISIBLE); return; }

    const payload = await executer(
      { kind: 'reception-photo', contenuBase64: reduite.base64, mimeType: reduite.mimeType },
      [elements.boutonPhoto, elements.boutonEnvoyer, elements.champ, elements.valider, elements.abandon],
    );
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    if (payload.session) rendre(payload.session);
    rendreLecture(payload.lecture);
  }

  // Journal de lecture : ce que la photo DISAIT, en face de ce que Stovo en a
  // fait. C'est le rempart contre la seule erreur vraiment dangereuse du
  // chantier photo, celle qu'on ne voit pas dans la liste.
  //
  // Exemple concret : le BL dit « PATE FEUILLETEE 230G », Stovo l'a rapproché de
  // « Pâtes ». Dans la liste, la ligne « Pâtes +6 » a l'air parfaitement normale
  // et se valide sans réfléchir. Affiché en face de son libellé d'origine,
  // l'écart saute aux yeux, et le papier est sous les yeux de Corentin.
  function rendreLecture(lecture) {
    if (!elements.lecture) return;
    const lignes = Array.isArray(lecture) ? lecture : [];
    if (lignes.length === 0) {
      elements.lecture.hidden = true;
      elements.lecture.innerHTML = '';
      return;
    }
    elements.lecture.innerHTML = '';

    const titre = document.createElement('p');
    titre.className = 'lecture-titre';
    titre.textContent = 'Ce que j’ai lu sur la photo (vérifie les rapprochements) :';
    elements.lecture.appendChild(titre);

    for (const l of lignes) {
      const item = document.createElement('p');
      item.className = 'lecture-item';
      const source = document.createElement('span');
      source.className = 'lecture-source';
      source.textContent = l.libelle;
      const fleche = document.createElement('span');
      fleche.className = 'lecture-fleche';
      fleche.textContent = ' → ';
      const cible = document.createElement('span');
      cible.className = 'lecture-cible';
      cible.textContent = `${l.nom} +${l.quantite}`;
      item.appendChild(source);
      item.appendChild(fleche);
      item.appendChild(cible);
      elements.lecture.appendChild(item);
    }
    elements.lecture.hidden = false;
  }

  // --- Retirer une ligne (croix) ---
  async function retirer(produitId) {
    const payload = await executer(
      { kind: 'reception-retirer', produitId },
      [elements.valider, elements.abandon, elements.boutonEnvoyer],
    );
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    if (payload.session) rendre(payload.session);
    rendreLecture(payload.lecture); // le journal de la photo est périmé (voir ajouterLigne)
    // On reste en réception même si la liste devient vide : l'utilisateur peut
    // redicter ou abandonner.
  }

  // --- Valider tout le lot (frontière idempotente : rejeu = 0 écriture) ---
  async function valider() {
    const payload = await executer(
      { kind: 'reception-valider' },
      [elements.valider, elements.abandon, elements.boutonEnvoyer, elements.champ],
    );
    if (!payload) { afficher(MSG_ERREUR); return; } // échec réseau : on RESTE en réception pour réessayer
    if (payload.reply) afficher(payload.reply);
    sortir();
  }

  // --- Abandonner (bouton en session OU bouton de la bannière de reprise) ---
  async function abandonner() {
    if (!confirmer('Abandonner cette réception ? Rien ne sera enregistré.')) return;
    const payload = await executer(
      { kind: 'reception-abandon' },
      [elements.valider, elements.abandon, elements.boutonEnvoyer, elements.champ, elements.reprendre, elements.repriseAbandon],
    );
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    sortir();
    elements.reprise.hidden = true; // au cas où l'abandon vient de la bannière
    sessionReprise = null;
  }

  // --- Reprise : au chargement, s'il reste une réception côté serveur ---
  // Isolation R4 : une session oubliée dort dans sa table dédiée sans polluer
  // la boucle normale ; la bannière la fait remonter au prochain démarrage.
  async function verifierReprise() {
    if (enReception) return;
    const payload = await appeler({ kind: 'reception-etat' });
    // Silencieux si pas de session / souci réseau (payload null) : on ne bloque rien.
    if (!payload || !payload.session) return;
    const session = payload.session;
    if (session.active && (session.total || 0) > 0) {
      // Lot S-0 : une session résiduelle prend le verrou dès sa bannière, pour
      // qu'on ne puisse pas démarrer un autre mode que le serveur refuserait
      // ensuite. En silencieux : un refus ici est normal (deux résidus peuvent
      // coexister) et le second réapparaîtra au prochain chargement.
      if (!verrouPrendre('reception', true)) return;
      sessionReprise = session;
      elements.repriseTexte.textContent =
        `Tu as une réception en cours (${libelleLignes(session.total)}). Reprends-la ou abandonne-la.`;
      elements.reprise.hidden = false;
    }
  }

  // --- Câblage des boutons propres au mode réception ---
  elements.demarrer.addEventListener('click', () => entrer(null));
  elements.valider.addEventListener('click', valider);
  elements.abandon.addEventListener('click', abandonner);
  elements.reprendre.addEventListener('click', () => { if (sessionReprise) entrer(sessionReprise); });
  elements.repriseAbandon.addEventListener('click', abandonner);

  // Lot P-3 : le bouton ouvre le sélecteur natif (appareil photo sur mobile),
  // c'est le champ fichier qui porte l'événement utile. Les deux sont optionnels
  // pour que les bancs d'essai écrits avant ce lot continuent de tourner tels quels.
  if (elements.boutonPhoto && elements.champPhoto) {
    elements.boutonPhoto.addEventListener('click', () => elements.champPhoto.click());
    elements.champPhoto.addEventListener('change', async () => {
      const fichier = elements.champPhoto.files && elements.champPhoto.files[0];
      // On vide le champ AVANT de traiter : sans ça, reprendre deux fois la même
      // photo ne déclencherait pas de second 'change' (valeur identique).
      elements.champPhoto.value = '';
      if (fichier) await envoyerPhoto(fichier);
    });
  }

  // parler.js pilote le formulaire (partagé avec la saisie normale) et déclenche
  // la reprise au chargement.
  return {
    estEnReception: () => enReception,
    ajouterLigne,
    envoyerPhoto,
    verifierReprise,
  };
}

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

export function creerModeReception({ elements, appeler, confirmer, afficher, doc }) {
  const document = doc || globalThis.document;

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
    enReception = true;
    elements.reprise.hidden = true;
    elements.demarrer.hidden = true;
    elements.panneau.hidden = false;
    elements.actions.hidden = false;
    if (elements.boutonImport) elements.boutonImport.hidden = true;
    if (elements.confirmation) elements.confirmation.hidden = true; // R3 : pas de Oui/Non normal en session
    elements.boutonEnvoyer.textContent = 'Ajouter';
    elements.champ.placeholder = PLACEHOLDER_RECEPTION;
    elements.champ.value = '';
    afficher(MSG_ENTREE);
    rendre(session || { active: true, lignes: [], inconnus: [], total: 0 });
  }

  function sortir() {
    enReception = false;
    elements.panneau.hidden = true;
    elements.actions.hidden = true;
    elements.demarrer.hidden = false;
    if (elements.boutonImport) elements.boutonImport.hidden = false;
    elements.boutonEnvoyer.textContent = 'Envoyer';
    elements.champ.placeholder = PLACEHOLDER_NORMAL;
    elements.champ.value = '';
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

  // parler.js pilote le formulaire (partagé avec la saisie normale) et déclenche
  // la reprise au chargement.
  return {
    estEnReception: () => enReception,
    ajouterLigne,
    verifierReprise,
  };
}

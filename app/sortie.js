// STOVO — mode sortie de stock multi-produits (chantier S, lot S-5)
// ====================================================================
// JUMEAU de app/reception.js (§Q4 du plan technique, duplication assumée :
// les trois modes de session divergent réellement, une abstraction commune
// serait fausse dès le premier cas limite). Même architecture, adaptée au
// sens inverse.
//
// « La voix SAISIT, l'écran CONTRÔLE » (cadrage Stratège du 19/07, repris pour
// la sortie). Ce module gère l'écran de contrôle d'une sortie de stock : une
// liste vivante de lignes qu'on dicte une par une (« j'ai vendu 3 pâtes » ou
// juste « 3 pâtes », les deux fonctionnent, cf. _shared/sortie.ts §Q0), puis
// UNE validation groupée qui écrit tout le lot en base (type=sortie,
// motif=null). Le rempart de confirmation Oui/Non par ligne est DÉPLACÉ vers
// cette validation finale (jamais supprimé).
//
// Isolation volontaire (testabilité + sobriété), identique à reception.js :
// ce module ne connaît NI Supabase NI le vrai DOM. Il reçoit par injection :
//   - `elements`  : les nœuds DOM déjà résolus (parler.js les passe) ;
//   - `appeler`   : async (corps) -> { reply, sortie } | null  (null = échec) ;
//   - `confirmer` : (message) -> bool (confirmation avant abandon) ;
//   - `afficher`  : (texte) -> affiche un message dans la zone réponse ;
//   - `doc`       : le document (globalThis.document en vrai, un mock au banc) ;
//   - `prendreVerrou`/`rendreVerrou` : verrou de mode unique (lot S-0).
// Grâce à ça, le banc d'essai offline (app/sortie_test.js) exerce toute la
// mécanique sans DOM réel ni réseau. parler.js branche le vrai Supabase.
//
// Contrat de l'API (kinds sortie-* de pwa-api, voir RAPPORT_passation_lotS4) :
//   sortie-ligne { texte }        -> { reply, sortie }  (additif, PAS idempotent)
//   sortie-retirer { produitId }  -> { reply, sortie }  (idempotent)
//   sortie-etat {}                -> { reply, sortie }   (reprise)
//   sortie-valider {}             -> { reply, sortie }   (idempotent : rejeu = rien)
//   sortie-abandon {}             -> { reply, sortie }
// Forme `sortie` : { active, lignes:[{produitId, nom, quantite, fusionnee?,
//                    stockConnu, stockApres, insuffisant}], inconnus:[], total }.
//
// Différences précises avec reception.js :
//   - PAS de fonctionnalité photo (la sortie n'a pas de bon de livraison à
//     lire) : ni `envoyerPhoto`, ni journal de lecture (`rendreLecture`).
//   - la quantité s'affiche avec un signe MOINS devant (« -3 » au lieu de
//     « +3 ») : repère visuel voulu par l'Architecte pour distinguer une
//     sortie d'une réception au premier coup d'œil.
//   - une ligne dont le stock passe en négatif (`insuffisant: true`, calculé
//     côté serveur par calculerAlertesStock) porte en plus la classe CSS
//     `alerte` : avertissement NON BLOQUANT, la ligne reste valide et
//     validable (§Q1 du plan : le réel a toujours raison contre la base).

const MSG_ERREUR = 'Désolé, une erreur est survenue. Réessaie dans quelques instants.';
const MSG_ENTREE = 'Sortie en cours. Dicte tes produits un par un, puis valide le tout.';
const MSG_VIDE = 'Dicte un produit pour commencer, par exemple : 3 pâtes.';
const PLACEHOLDER_SORTIE = 'Ex : 3 pâtes';
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

export function creerModeSortie({ elements, appeler, confirmer, afficher, doc, prendreVerrou, rendreVerrou }) {
  const document = doc || globalThis.document;

  // Lot S-0 (25/07/2026) : verrou de mode, injecté par parler.js (voir son bloc
  // « Verrou de mode unique »). Défauts permissifs OBLIGATOIRES : sans eux, tous
  // les scénarios du banc d'essai offline tomberaient d'un coup, et on ne
  // saurait plus distinguer une vraie régression d'un harnais de test
  // incomplet. Ce module ne connaît toujours pas les autres modes.
  const verrouPrendre = prendreVerrou || (() => true);
  const verrouRendre = rendreVerrou || (() => {});

  let enSortie = false;      // état purement front (la session « naît » à la 1re ligne serveur)
  let sortieReprise = null;  // état renvoyé par sortie-etat, en attente d'un clic « Reprendre »

  // --- Rendu de la liste vivante à partir de `sortie` ---
  function rendre(sortie) {
    const lignes = (sortie && sortie.lignes) || [];
    const inconnus = (sortie && sortie.inconnus) || [];
    const total = (sortie && typeof sortie.total === 'number') ? sortie.total : lignes.length;

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
        // La classe `fusionnee` ne joue qu'au rendu qui suit une fusion (flash
        // bref). La classe `alerte` signale une sortie qui passe le stock
        // connu en négatif (§Q1 du plan) : avertissement NON BLOQUANT, la
        // ligne reste valide et validable.
        let classe = 'reception-item';
        if (ligne.fusionnee) classe += ' fusionnee';
        if (ligne.insuffisant) classe += ' alerte';
        item.className = classe;

        const nom = document.createElement('span');
        nom.className = 'ri-nom';
        nom.textContent = ligne.nom;

        const qte = document.createElement('span');
        qte.className = 'ri-qte';
        // Signe MOINS devant la quantité : repère visuel qui distingue une
        // sortie d'une réception au premier coup d'œil (plan §S-5).
        qte.textContent = `-${ligne.quantite}`;

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

  // --- Bascule d'affichage : entrer / sortir du mode sortie ---
  function entrer(sortie) {
    // Lot S-0 : on ne touche à RIEN si un autre mode est ouvert. Le message de
    // refus est affiché par l'arbitre (il est le seul à savoir qui bloque).
    if (!verrouPrendre('sortie')) return;
    enSortie = true;
    elements.reprise.hidden = true;
    elements.demarrer.hidden = true;
    elements.panneau.hidden = false;
    elements.actions.hidden = false;
    if (elements.boutonImport) elements.boutonImport.hidden = true;
    if (elements.confirmation) elements.confirmation.hidden = true; // R3 : pas de Oui/Non normal en session
    elements.boutonEnvoyer.textContent = 'Ajouter';
    elements.champ.placeholder = PLACEHOLDER_SORTIE;
    elements.champ.value = '';
    afficher(MSG_ENTREE);
    rendre(sortie || { active: true, lignes: [], inconnus: [], total: 0 });
  }

  function sortir() {
    enSortie = false;
    verrouRendre('sortie'); // Lot S-0 : libère les autres modes.
    elements.panneau.hidden = true;
    elements.actions.hidden = true;
    elements.demarrer.hidden = false;
    if (elements.boutonImport) elements.boutonImport.hidden = false;
    elements.boutonEnvoyer.textContent = 'Envoyer';
    elements.champ.placeholder = PLACEHOLDER_NORMAL;
    elements.champ.value = '';
    // La zone réponse n'est PAS touchée : elle garde le message de succès
    // (« Sortie enregistrée : N ligne(s). ») après une validation.
  }

  // Appel API générique en désactivant des contrôles le temps de la requête
  // (anti double-tap ; l'idempotence backend protège déjà l'écriture, ceci
  // n'est qu'un garde-fou d'UX). Renvoie le payload { reply, sortie } ou null.
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
    const payload = await executer({ kind: 'sortie-ligne', texte }, [elements.boutonEnvoyer, elements.champ]);
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    if (payload.sortie) {
      rendre(payload.sortie);
      elements.champ.value = ''; // champ vidé seulement si l'ajout a abouti
    }
  }

  // --- Retirer une ligne (croix) ---
  async function retirer(produitId) {
    const payload = await executer(
      { kind: 'sortie-retirer', produitId },
      [elements.valider, elements.abandon, elements.boutonEnvoyer],
    );
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    if (payload.sortie) rendre(payload.sortie);
    // On reste en sortie même si la liste devient vide : l'utilisateur peut
    // redicter ou abandonner.
  }

  // --- Valider tout le lot (frontière idempotente : rejeu = 0 écriture) ---
  async function valider() {
    const payload = await executer(
      { kind: 'sortie-valider' },
      [elements.valider, elements.abandon, elements.boutonEnvoyer, elements.champ],
    );
    if (!payload) { afficher(MSG_ERREUR); return; } // échec réseau : on RESTE en sortie pour réessayer
    if (payload.reply) afficher(payload.reply);
    sortir();
  }

  // --- Abandonner (bouton en session OU bouton de la bannière de reprise) ---
  async function abandonner() {
    if (!confirmer('Abandonner cette sortie ? Rien ne sera enregistré.')) return;
    const payload = await executer(
      { kind: 'sortie-abandon' },
      [elements.valider, elements.abandon, elements.boutonEnvoyer, elements.champ, elements.reprendre, elements.repriseAbandon],
    );
    if (!payload) { afficher(MSG_ERREUR); return; }
    if (payload.reply) afficher(payload.reply);
    sortir();
    elements.reprise.hidden = true; // au cas où l'abandon vient de la bannière
    sortieReprise = null;
  }

  // --- Reprise : au chargement, s'il reste une sortie côté serveur ---
  // Isolation R4 : une session oubliée dort dans sa table dédiée sans polluer
  // la boucle normale ; la bannière la fait remonter au prochain démarrage.
  async function verifierReprise() {
    if (enSortie) return;
    const payload = await appeler({ kind: 'sortie-etat' });
    // Silencieux si pas de session / souci réseau (payload null) : on ne bloque rien.
    if (!payload || !payload.sortie) return;
    const sortie = payload.sortie;
    if (sortie.active && (sortie.total || 0) > 0) {
      // Lot S-0 : une session résiduelle prend le verrou dès sa bannière, pour
      // qu'on ne puisse pas démarrer un autre mode que le serveur refuserait
      // ensuite. En silencieux : un refus ici est normal (deux résidus peuvent
      // coexister) et le second réapparaîtra au prochain chargement.
      if (!verrouPrendre('sortie', true)) return;
      sortieReprise = sortie;
      elements.repriseTexte.textContent =
        `Tu as une sortie en cours (${libelleLignes(sortie.total)}). Reprends-la ou abandonne-la.`;
      elements.reprise.hidden = false;
    }
  }

  // --- Câblage des boutons propres au mode sortie ---
  elements.demarrer.addEventListener('click', () => entrer(null));
  elements.valider.addEventListener('click', valider);
  elements.abandon.addEventListener('click', abandonner);
  elements.reprendre.addEventListener('click', () => { if (sortieReprise) entrer(sortieReprise); });
  elements.repriseAbandon.addEventListener('click', abandonner);

  // parler.js pilote le formulaire (partagé avec la saisie normale) et déclenche
  // la reprise au chargement.
  return {
    estEnSortie: () => enSortie,
    ajouterLigne,
    verifierReprise,
  };
}

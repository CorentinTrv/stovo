// inventaire.js - Lot CM-C (25/07/2026) : parcours d'inventaire complet guidé
//
// Même architecture que reception.js (lot N1, FR-4) : ce module ne connaît NI
// Supabase NI le DOM réel. Tout lui est injecté (éléments, fonction d'appel API,
// confirm, document). Il est donc testable hors navigateur, au banc offline.
//
// LE PRINCIPE DU MODE GUIDÉ :
// l'écran présente les produits UN PAR UN. Le nom est porté par l'écran, donc
// on annonce le CHIFFRE SEUL à la voix ("35"), sans répéter "j'ai compté 35
// pâtes". L'app calcule l'écart et enchaîne au produit suivant.
//
// LE REMPART N'EST PAS SUPPRIMÉ, IL EST DÉPLACÉ : au lieu d'un oui/non par
// ligne, il y a UNE validation groupée à la clôture, précédée du récap des
// écarts. Même principe que la validation groupée de la réception.
//
// COMPTAGE À L'AVEUGLE (option) : masque le stock théorique pendant le comptage.
// C'est une règle d'inventaire classique : voir le stock attendu biaise le
// comptage ("j'ai dû mal compter, ça doit être 38"). Case décochée par défaut.

// Libellé pluriel, même style que reception.js.
function libelleProduits(n) {
  return n > 1 ? `${n} produits` : `${n} produit`;
}

// Pas de paramètre `doc` ici (contrairement à reception.js) : ce module ne crée
// aucun nœud, il ne fait que remplir des éléments qu'on lui passe. Ne pas
// accepter une dépendance dont on ne se sert pas.
export function creerModeInventaire({ elements, appeler, chargerProduits, confirmer, afficher, prendreVerrou, rendreVerrou }) {
  // Lot S-0 (25/07/2026) : verrou de mode, injecté par parler.js (voir son bloc
  // « Verrou de mode unique »). Défauts permissifs OBLIGATOIRES : sans eux, les
  // scénarios du banc d'essai offline écrits avant ce lot tomberaient tous, et on
  // ne saurait plus distinguer une vraie régression d'un harnais incomplet.
  const verrouPrendre = prendreVerrou || (() => true);
  const verrouRendre = rendreVerrou || (() => {});
  // --- État local du parcours ---
  let produits = [];      // liste alphabétique des produits actifs
  let index = 0;          // position dans le parcours
  let actif = false;      // un parcours est-il en cours à l'écran ?
  let comptes = new Map(); // produitId -> valeur comptée (pour l'affichage)

  const el = elements;

  const montrer = (noeud, visible) => {
    if (noeud) noeud.hidden = !visible;
  };

  const produitCourant = () => produits[index] ?? null;

  // Le champ de saisie est PARTAGÉ avec la saisie normale et la réception :
  // en inventaire, « Envoyer » devient « Compter ».
  function basculerFormulaire(enInventaire) {
    if (el.boutonEnvoyer) {
      el.boutonEnvoyer.textContent = enInventaire ? 'Compter' : 'Envoyer';
    }
    if (el.champ) {
      el.champ.placeholder = enInventaire
        ? 'Dis ou tape le nombre compté'
        : 'Parle ou écris ici';
    }
    // Pendant l'inventaire, l'import et la confirmation oui/non n'ont pas de sens.
    montrer(el.boutonImport, !enInventaire);
    if (enInventaire) montrer(el.confirmation, false);
  }

  function rendreProduitCourant() {
    const p = produitCourant();
    if (!p) return;

    if (el.progression) {
      el.progression.textContent = `Produit ${index + 1} sur ${produits.length}`;
    }
    if (el.nomProduit) {
      el.nomProduit.textContent = p.nom;
    }
    if (el.stockTheorique) {
      const aveugle = el.aveugle && el.aveugle.checked;
      el.stockTheorique.textContent = aveugle
        ? 'Stock masqué (comptage à l\'aveugle)'
        : `Stock attendu : ${p.stock_actuel} ${p.unite}`;
    }
    // Rappel de ce qui a déjà été compté pour ce produit (si on revient dessus).
    if (el.dejaCompte) {
      const valeur = comptes.get(p.id);
      el.dejaCompte.textContent = valeur === undefined ? '' : `Déjà compté : ${valeur}`;
    }
  }

  function rendreProgressionGlobale() {
    if (!el.total) return;
    el.total.textContent = comptes.size === 0
      ? 'Aucun produit compté pour le moment.'
      : `${libelleProduits(comptes.size)} compté${comptes.size > 1 ? 's' : ''} sur ${produits.length}.`;
  }

  // Passe au produit suivant. En fin de liste, on ouvre la clôture.
  function avancer() {
    if (index < produits.length - 1) {
      index += 1;
      rendreProduitCourant();
      return;
    }
    ouvrirCloture();
  }

  async function ouvrirCloture() {
    montrer(el.parcours, false);
    montrer(el.cloture, true);
    // On demande l'état au serveur : c'est LUI qui recalcule les écarts sur le
    // stock réel, jamais le front (une seule source de vérité).
    const reponse = await appeler({ kind: 'inventaire-etat' });
    if (reponse && reponse.inventaire) {
      if (el.recap) el.recap.textContent = reponse.inventaire.recap || '';
    } else if (el.recap) {
      el.recap.textContent = 'Je n\'ai pas pu relire ton inventaire. Tu peux quand même valider ou abandonner.';
    }
  }

  function terminerParcours() {
    actif = false;
    verrouRendre('inventaire'); // Lot S-0 : libère les autres modes.
    index = 0;
    comptes = new Map();
    montrer(el.panneau, false);
    montrer(el.parcours, false);
    montrer(el.cloture, false);
    montrer(el.demarrer, true);
    basculerFormulaire(false);
  }

  // --- Sortie de session propre (lot du 25/08/2026) ---
  // Appelée par parler.js (viderParler) à la déconnexion, quel que soit
  // l'état du parcours à cet instant. `terminerParcours()` couvre déjà le
  // cas d'un parcours actif (masque panneau/parcours/clôture, remet
  // "Démarrer" visible, libère le verrou — sans risque même si `actif` était
  // déjà faux, voir creerVerrouDeMode) ; cette fonction couvre en plus les
  // résidus qu'il ne touche pas — bannière de reprise, catalogue mémorisé,
  // et le texte de chaque champ du parcours (nom de produit, stock, récap)
  // qui reste dans le DOM même une fois `hidden` posé.
  function reinitialiser() {
    terminerParcours();
    montrer(el.reprise, false);
    if (el.repriseTexte) el.repriseTexte.textContent = '';
    produits = [];
    if (el.progression) el.progression.textContent = '';
    if (el.nomProduit) el.nomProduit.textContent = '';
    if (el.stockTheorique) el.stockTheorique.textContent = '';
    if (el.dejaCompte) el.dejaCompte.textContent = '';
    if (el.total) el.total.textContent = '';
    if (el.recap) el.recap.textContent = '';
  }

  // --- Actions publiques ---

  async function demarrer() {
    // Lot S-0 : verrou pris AVANT le chargement du catalogue, pour qu'un autre
    // mode ne puisse pas se glisser pendant l'appel réseau. Le message de refus
    // est affiché par l'arbitre (seul à savoir qui bloque).
    if (!verrouPrendre('inventaire')) return;

    const liste = await chargerProduits();
    if (!liste || liste.length === 0) {
      // On renonce : il faut rendre le verrou qu'on venait de prendre, sinon les
      // autres modes resteraient bloqués par un inventaire qui n'a jamais démarré.
      verrouRendre('inventaire');
      afficher('Ton catalogue est vide, il n\'y a rien à inventorier.');
      return;
    }
    produits = [...liste].sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
    index = 0;
    comptes = new Map();
    actif = true;

    montrer(el.demarrer, false);
    montrer(el.panneau, true);
    montrer(el.parcours, true);
    montrer(el.cloture, false);
    basculerFormulaire(true);
    rendreProduitCourant();
    rendreProgressionGlobale();
    afficher('Inventaire démarré. Annonce le nombre compté pour chaque produit.');
  }

  // Enregistre le comptage du produit courant (le texte vient du champ partagé,
  // rempli au clavier ou par le micro).
  async function compter(texte) {
    const p = produitCourant();
    if (!p) return;

    const reponse = await appeler({ kind: 'inventaire-compter', produitId: p.id, texte });
    if (!reponse) {
      afficher('Je n\'ai pas réussi à enregistrer ce comptage. Réessaie.');
      return;
    }
    afficher(reponse.reply || '');

    // On n'avance QUE si le serveur a bien pris le comptage : sinon on reste sur
    // le produit pour laisser corriger (ex : « j'ai entendu plusieurs nombres »).
    const prisEnCompte = reponse.inventaire &&
      reponse.inventaire.comptages &&
      reponse.inventaire.comptages.some((c) => c.produitId === p.id);

    if (!prisEnCompte) return;

    const ligne = reponse.inventaire.comptages.find((c) => c.produitId === p.id);
    comptes.set(p.id, ligne.compte);
    rendreProgressionGlobale();
    avancer();
  }

  // « Passer » : on ne compte pas ce produit. S'il avait été compté, on retire
  // son comptage pour que son stock ne soit pas modifié.
  async function passer() {
    const p = produitCourant();
    if (!p) return;
    if (comptes.has(p.id)) {
      await appeler({ kind: 'inventaire-passer', produitId: p.id });
      comptes.delete(p.id);
      rendreProgressionGlobale();
    }
    avancer();
  }

  // Arrêter le parcours avant la fin de la liste et aller au récap.
  async function terminerMaintenant() {
    await ouvrirCloture();
  }

  async function valider() {
    const reponse = await appeler({ kind: 'inventaire-valider' });
    afficher(reponse && reponse.reply ? reponse.reply : 'Je n\'ai pas pu valider ton inventaire.');
    terminerParcours();
  }

  async function abandonner() {
    const ok = confirmer('Abandonner cet inventaire ? Aucun stock ne sera modifié.');
    if (!ok) return;
    const reponse = await appeler({ kind: 'inventaire-abandon' });
    afficher(reponse && reponse.reply ? reponse.reply : 'Inventaire abandonné.');
    terminerParcours();
  }

  // Reprise : un inventaire laissé en cours (app fermée en plein milieu) est
  // signalé au chargement, comme pour la réception.
  async function verifierReprise() {
    const reponse = await appeler({ kind: 'inventaire-etat' });
    // On masque EXPLICITEMENT avant de décider : ne pas dépendre de l'état
    // initial du HTML rend la fonction rejouable (un second appel sans
    // inventaire en cours doit retirer une bannière précédemment affichée).
    // Défaut attrapé par le banc d'essai offline, comme au lot N1.
    if (!reponse || !reponse.inventaire || !reponse.inventaire.actif) {
      montrer(el.reprise, false);
      return;
    }
    // Lot S-0 : un inventaire résiduel prend le verrou dès sa bannière, pour qu'on
    // ne puisse pas démarrer un autre mode que le serveur refuserait ensuite. En
    // silencieux : un refus est normal si la réception a déjà pris la main, et sa
    // bannière réapparaîtra au prochain chargement.
    if (!verrouPrendre('inventaire', true)) {
      montrer(el.reprise, false);
      return;
    }
    montrer(el.reprise, true);
    if (el.repriseTexte) {
      el.repriseTexte.textContent =
        `Tu as un inventaire en cours (${libelleProduits(reponse.inventaire.total)} compté${reponse.inventaire.total > 1 ? 's' : ''}).`;
    }
  }

  // Reprendre = repartir du parcours en gardant les comptages déjà enregistrés.
  async function reprendre() {
    montrer(el.reprise, false);
    await demarrer();
    const reponse = await appeler({ kind: 'inventaire-etat' });
    if (reponse && reponse.inventaire) {
      for (const c of reponse.inventaire.comptages || []) comptes.set(c.produitId, c.compte);
      rendreProgressionGlobale();
      rendreProduitCourant();
    }
  }

  async function abandonnerReprise() {
    const reponse = await appeler({ kind: 'inventaire-abandon' });
    afficher(reponse && reponse.reply ? reponse.reply : 'Inventaire abandonné.');
    montrer(el.reprise, false);
    // Lot S-0 : ce chemin ne passe PAS par terminerParcours (aucun parcours n'était
    // ouvert, juste la bannière), donc c'est ici qu'il faut rendre le verrou pris
    // par verifierReprise. Sans ça, abandonner depuis la bannière laisserait les
    // autres modes bloqués jusqu'au rechargement.
    verrouRendre('inventaire');
  }

  // --- Câblage des boutons (le doc injecté rend ceci testable hors navigateur) ---
  if (el.demarrer) el.demarrer.addEventListener('click', demarrer);
  if (el.passer) el.passer.addEventListener('click', passer);
  if (el.terminer) el.terminer.addEventListener('click', terminerMaintenant);
  if (el.valider) el.valider.addEventListener('click', valider);
  if (el.abandon) el.abandon.addEventListener('click', abandonner);
  if (el.reprendre) el.reprendre.addEventListener('click', reprendre);
  if (el.repriseAbandon) el.repriseAbandon.addEventListener('click', abandonnerReprise);
  if (el.aveugle) el.aveugle.addEventListener('change', rendreProduitCourant);

  return {
    estEnInventaire: () => actif,
    compter,
    demarrer,
    passer,
    valider,
    abandonner,
    verifierReprise,
    reinitialiser,
    // Exposés pour le banc d'essai offline.
    _etat: () => ({ index, actif, comptes: new Map(comptes), produits: [...produits] }),
  };
}

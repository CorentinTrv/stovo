// STOVO — logique du dashboard (lot 9a, client centralisé au lot 9b)
// =======================================================================
// Ce fichier reprend SANS AUCUN CHANGEMENT DE CALCUL OU DE RENDU le
// <script type="module"> du dashboard actuel
// (livrables/sites-web/stovo/index.html). Memes calculs, meme rendu.
//
// Idee metier centrale : on n'affiche pas que le stock brut, on calcule la
// COUVERTURE EN JOURS (combien de temps il reste au rythme reel des sorties).
// C'est l'info qui declenche vraiment l'action chez un gerant.
//
// Lot 9b, deux changements PUREMENT techniques (rien ci-dessous ne change
// de comportement) :
//   1. Le client Supabase n'est plus cree ici : il est importe depuis
//      ./supabase.js, pour qu'il n'y ait qu'UN SEUL client (et donc une
//      seule session) partage avec auth.js. Toujours la cle publishable
//      (lecture seule via RLS), rien ne change cote droits d'acces.
//   2. Le demarrage (chargement + rafraichissement toutes les 30 s) n'est
//      plus automatique a l'import : il faut appeler demarrerDashboard(),
//      declenche par app.js une fois la session confirmee. Objectif : ne
//      pas charger le stock derriere l'ecran de login.

import { supabase } from './supabase.js';
// Lot P-1 (26/07/2026) : la formule de consommation/réappro vit désormais
// dans pilotage.js, jumeau de _shared/pilotage.ts côté backend (voix N4) et
// de la page racine du site. Toute modification passe par le jeu d'essai
// commun _shared/pilotage_cas.ts (voir le plan pilotage du 25/07/2026).
// Lot P-3 (26/07/2026) : les fonctions d'état (mesure/dormant/insuffisant) et
// de résumé global (geste vivant, dernière sortie, compteurs), voir charger()
// et carteProduit() plus bas.
// Lot P-5 (26/07/2026) : chiffre de synthèse du stock dormant, voir
// resumeDormant() plus bas (aucun import neuf, il réutilise ce qui précède).
import {
  calculerAncienneteJours,
  calculerDerniereSortieLe,
  calculerEtatProduit,
  calculerGesteVivant,
  calculerLignePilotage,
  calculerSortiesParProduit,
  compterEtats,
  COUVERTURE_CIBLE_JOURS,
  SECURITE_JOURS,
  SEUIL_DORMANT_JOURS,
} from './pilotage.js';
// Chantier C1 (26/07/2026) : la démarque valorisée ("Ce que tu as jeté"),
// voir majPertes() plus bas. Module PUR et isolé (aucun DOM, aucun Supabase,
// formateurs injectés), sur le même modèle que pilotage.js : aucune donnée
// nouvelle à lire, il calcule sur les mvts déjà chargés par charger().
import { calculerDemarque, rendreDemarque } from './pertes.js';
// Chantier C2 « les exports » (lot C2-3, 22/08/2026) : les deux fichiers
// CSV téléchargeables (état de stock + journal des mouvements), voir
// majExport() plus bas. Module PUR et déjà testé (81/81, lots C2-1/C2-2) :
// aucune donnée nouvelle à lire au chargement de l'écran, la lecture réelle
// (lireToutesLesPages) n'est déclenchée QU'AU CLIC sur un des deux boutons.
// retenirProduitsExport/retenirMouvementsExport (extraites d'export.js le
// 22/08/2026, revue du lot C2-3) : memes filtres de perimetre que ceux
// utilises en interne par construireCsvStock/construireCsvMouvements, une
// seule definition partagee des deux cotes (voir majExport plus bas).
import { construireCsvStock, construireCsvMouvements, nomFichierExport, lireToutesLesPages, retenirProduitsExport, retenirMouvementsExport, MENTION_LEGALE } from './export.js';
// Icones SVG en trait de la colonne "Source" (lot "monde clair, suite",
// 23/08/2026) : remplace les emoji 🎙️/⌨️ du tableau des mouvements.
import { ICONES } from './icones.js';

// KPI "Activité (7 jours)" (libellé écrit en dur dans index.html, l.138) :
// constante LOCALE, INDÉPENDANTE de FENETRE_JOURS (module partagé pilotage.js).
// Elle ne compte pas la consommation, mais TOUS les mouvements (tous types,
// avec ou sans motif) : ce n'est pas la même mesure, donc pas la même
// constante — même si les deux valent 7 aujourd'hui.
const ACTIVITE_JOURS = 7;

const $ = (id) => document.getElementById(id);
const fmtNombre = (v) => { const n = Number(v); return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, ''); };
const fmtEuro = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v));
const fmtDate = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
// Echappement HTML minimal (correctif du 01/08/2026) : le nom et l'unite
// d'un produit viennent de la base, alimentee par la dictee vocale et par
// l'import .xlsx (source tierce) — un "<" ou un "&" dedans ne doit jamais
// casser l'affichage ni injecter du HTML. Utilisee pour l'instant UNIQUEMENT
// par majEcranDuMatin (ecran du matin) : le meme motif d'injection existe a
// une quinzaine d'autres endroits de ce fichier (carteProduit, tableau des
// mouvements...), traites separement (voir le rapport de passation du
// 01/08/2026).
const echapperHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Texte lisible de la couverture en jours
const txtCouverture = (c) => {
  if (c === null) return '—';
  if (c < 1) return "moins d'1 jour";
  const j = Math.round(c);
  return '≈ ' + j + ' jour' + (j > 1 ? 's' : '');
};
// Niveau d'urgence selon la couverture : critique (<1.5j), attention (<3j), ok
const urgence = (c) => (c === null ? 'ok' : c < 1.5 ? 'crit' : c < 3 ? 'warn' : 'ok');

// Titre du bandeau "ecran du matin" selon l'heure : l'app est consultee a
// toute heure, pas qu'au reveil, donc "Ce matin" affiche a 17h serait faux.
const titreDuMoment = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Ce matin';
  if (h < 18) return 'Cet après-midi';
  return 'Ce soir';
};

// Texte "liste de courses" prepare au dernier rendu du bandeau (voir
// majEcranDuMatin) et copie par le bouton "Copier la liste" (voir
// demarrerDashboard). Vide s'il n'y a rien a commander.
let texteListeCourses = '';

// Etat ouvert/ferme des sections d'inventaire (brique 2). Garde en memoire pour
// survivre au rafraichissement toutes les 30 s ; "En stock" ferme par defaut
// (c'est la longue liste "tout va bien"). "pertes" (chantier C1, 26/07/2026)
// ajoutee pour rester coherente avec les 3 autres cles, meme si elle n'est
// PAS strictement necessaire aujourd'hui : le <details> de la demarque est
// statique dans index.html et n'est jamais recree par charger() (seul son
// contenu #pertes-contenu est remplace), donc son etat survit tout seul au
// rafraichissement. Voir majPertes()/demarrerDashboard() plus bas.
const invGroupesOuverts = { commander: true, surveiller: true, stock: false, pertes: false };

// Change la couleur d'etat du bandeau du matin SANS ecraser ses autres classes
// (surtout "replie", pose par l'utilisateur et sinon perdu a chaque rendu).
const etatMatin = (sec, cls) => {
  sec.classList.remove('matin-ok', 'matin-warn', 'matin-crit');
  sec.classList.add(cls);
};

// Carte d'un produit (inventaire)
const carteProduit = (p) => {
  const stock = Number(p.stock_actuel);
  const pdc = Number(p._pointCommande) || 0;   // point de commande effectif (dynamique ou repli figé)
  const dynamique = p._pdcDynamique !== null;  // a-t-on pu le calculer sur les ventes récentes ?
  const alerte = stock <= pdc;
  // jauge : le point de commande est placé à 50%, le stock se remplit jusqu'à (stock / 2*pdc)
  const largeur = pdc > 0 ? Math.min(100, (stock / (pdc * 2)) * 100) : (stock > 0 ? 100 : 0);
  const cov = p._couverture;
  const consoJ = p._consoJour || 0;
  const delai = Number(p.delai_repro_jours) || 0;
  // Prix dicté ? "non renseigné" tant que le prix n'a pas été dicté : jamais
  // 0 € trompeur, et pas de valeur affichée dans ce cas. Calculé AVANT
  // consoTxt : la ligne de détail de l'état "dormant" en a besoin (LOT P-3).
  const aPrix = (p.prix_achat !== null && p.prix_achat !== undefined);
  const prixTxt = aPrix ? `<b>${fmtEuro(p.prix_achat)}</b> / ${p.unite}` : 'non renseigné';
  const valeurTxt = aPrix ? ` · Valeur : <b>${fmtEuro(p._valeur)}</b>` : '';
  // Ligne de détail (LOT P-3, plan §3 Q2 niveau 2) : "mesure" inchangée,
  // "insuffisant" montre le geste qui répare, "dormant" chiffre l'argent
  // immobilisé (ou dit simplement que ça ne tourne pas si le prix manque).
  const consoTxt = p._etat === 'mesure'
    ? `Tu en sors ≈ ${consoJ.toFixed(1).replace('.', ',')} /jour (≈ ${fmtNombre(Math.round(consoJ * 7))} /sem)`
    : p._etat === 'dormant'
      ? (aPrix ? `≈ ${fmtEuro(p._valeur)} dorment dans ce stock.` : `Ce stock ne tourne pas.`)
      : `Dis-le à Stovo quand tu en sors : « j'ai vendu 3 pâtes ». Il calculera ton autonomie tout seul.`;
  // Tag du seuil : "auto" s'il suit les ventes, "fixe" si on retombe sur le seuil figé. Détail au survol.
  const tagPdc = dynamique
    ? `<span class="tag-auto" title="Calculé sur tes ventes : ${consoJ.toFixed(1).replace('.', ',')} /j × (${fmtNombre(delai)} j livraison + ${SECURITE_JOURS} j sécurité)">auto</span>`
    : `<span class="tag-fixe" title="Seuil figé : pas encore de ventes récentes pour le calculer sur le rythme réel">fixe</span>`;
  // Badge état, doublé d'un symbole pour rester lisible même sans la couleur (daltonien)
  const badge = alerte
    ? `<span class="badge danger">■ À commander</span>`
    : (urgence(cov) === 'warn' ? `<span class="badge warn">▲ À surveiller</span>` : `<span class="badge ok">● En stock</span>`);
  // Héros de la carte : l'autonomie, l'info qui fait agir. La couleur ne fait
  // qu'habiller une donnée déjà calculée (LOT P-3 : heroClass inchangée,
  // "dormant" et "insuffisant" restent 'h-muted' comme l'ancien "pas de cov").
  const heroClass = cov !== null ? (urgence(cov) === 'crit' ? 'h-crit' : (urgence(cov) === 'warn' ? 'h-warn' : 'h-ok')) : 'h-muted';
  const heroTxt = p._etat === 'mesure'
    ? `Il te reste ${txtCouverture(cov)}`
    : p._etat === 'dormant'
      ? `Rien n'est sorti depuis ${SEUIL_DORMANT_JOURS} jours`
      : `Pas assez de sorties pour estimer`;
  const commanderTxt = pdc > 0 ? `Commande quand il en reste <b>${fmtNombre(pdc)} ${p.unite}</b> ${tagPdc}` : '';
  return `
    <div class="card">
      <div class="c-top"><div class="c-name">${p.nom}</div>${badge}</div>
      <div class="c-hero ${heroClass}">${heroTxt}</div>
      <div class="c-stockline"><b>${fmtNombre(stock)} ${p.unite}</b> en stock</div>
      <div class="jauge">
        <div class="jauge-fill ${alerte ? 'is-low' : ''}" style="width:${largeur}%"></div>
        ${pdc > 0 ? '<div class="jauge-seuil" style="left:50%"></div>' : ''}
      </div>
      <div class="c-detail">
        Prix : ${prixTxt}${valeurTxt}<br>
        ${consoTxt}${commanderTxt ? '<br>' + commanderTxt : ''}
      </div>
    </div>`;
};

// Ligne de la section "à réapprovisionner"
const ligneReappro = (p) => {
  const delai = Number(p.delai_repro_jours) || 0;
  const autonomie = p._couverture;
  const ruptureAvantLivraison = (autonomie !== null && autonomie < delai);
  const detail = `Stock : ${fmtNombre(p.stock_actuel)} ${p.unite}&nbsp;&nbsp;·&nbsp;&nbsp;Autonomie : ${txtCouverture(autonomie)}&nbsp;&nbsp;·&nbsp;&nbsp;Livraison : ${fmtNombre(delai)} j`;
  const alerteLivr = ruptureAvantLivraison
    ? `<div class="ri-warning">▲ Rupture probable avant la livraison</div>` : '';
  // Détail du calcul, visible au survol du chiffre
  const calcul = (p._qteCommander && p._consoJour > 0)
    ? `${p._consoJour.toFixed(1)} ${p.unite}/jour × (${fmtNombre(delai)} j livraison + ${COUVERTURE_CIBLE_JOURS} j d'avance) − ${fmtNombre(p.stock_actuel)} en stock`
    : '';
  const droite = (p._qteCommander !== null && p._qteCommander > 0)
    ? `<div class="ri-coverlabel">à commander</div><div class="ri-qty" title="${calcul}">${fmtNombre(p._qteCommander)} ${p.unite}</div>`
    : `<div class="ri-coverlabel">autonomie</div><div class="ri-qty">${txtCouverture(autonomie)}</div>`;
  return `
    <div class="reorder-item">
      <div class="ri-main">
        <div class="ri-name">${p.nom}</div>
        <div class="ri-detail">${detail}</div>
        ${alerteLivr}
      </div>
      <div class="ri-right">${droite}</div>
    </div>`;
};

// Date "15 juillet" (jour + mois, sans annee ni heure), utilisee par le
// bandeau de pilotage (LOT P-3) pour dire depuis quand aucune sortie n'a ete
// declaree.
const fmtDateJour = (iso) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(iso));

// Decide QUOI afficher dans le bandeau de pilotage, SANS toucher au DOM (LOT
// P-3) : fonction pure, testable directement au banc offline (aucun mock de
// navigateur necessaire, meme esprit que reception.js/aide.js). Ne fait AUCUN
// nouveau calcul, met seulement en mots gesteVivant/derniereSortieLe deja
// calcules par charger() (module partage pilotage.js).
export function etatBandeauPilotage(produits, gesteVivant, derniereSortieLe) {
  if (produits.length === 0 || gesteVivant) return { visible: false };
  const depuisTxt = derniereSortieLe ? `depuis le ${fmtDateJour(derniereSortieLe)}` : 'depuis toujours';
  const texte = `Stovo n'a aucune sortie déclarée ${depuisTxt}. Il sait ce qui entre, pas ce qui part : sans sorties, il ne peut ni calculer combien de temps tu tiens, ni te dire quoi commander.`;
  return { visible: true, texte };
}

// Bandeau "pilotage en pause" (Niveau 1, LOT P-3, plan §3 Q2). Rendu
// entierement en JS, meme patron que majEcranDuMatin : masque si le
// catalogue est vide (rien a declarer sans produit) ou si le geste de sortie
// est vivant (etatBandeauPilotage ci-dessus), sinon affiche et se reconstruit
// a chaque rafraichissement (30 s), donc SANS listener qui s'accumule (le
// bouton est un NOUVEL element a chaque appel).
//
// Bouton "Declarer une sortie" : recopie EXACTE du patron deja valide dans
// aide.js (l.372-395) — remplit #champ-parler, bascule sur l'onglet Parler
// via l'evenement 'stovo:onglet', et N'ENVOIE RIEN. Zero concept neuf.
function majBandeauPilotage(produits, gesteVivant, derniereSortieLe) {
  const sec = $('bandeau-pilotage');
  if (!sec) return;
  const etat = etatBandeauPilotage(produits, gesteVivant, derniereSortieLe);
  if (!etat.visible) {
    sec.style.display = 'none';
    sec.innerHTML = '';
    return;
  }
  sec.style.display = 'block';
  sec.innerHTML = `
    <div class="bp-titre">Ton pilotage est en pause</div>
    <div class="bp-texte">${etat.texte}</div>
    <div class="bp-texte">Dis-lui tes ventes au fil de l'eau, et l'écran du matin se rallume tout seul en quelques jours.</div>
    <button class="bp-bouton" id="bandeau-pilotage-bouton" type="button">Déclarer une sortie</button>`;
  const btn = $('bandeau-pilotage-bouton');
  const premierProduit = produits[0];
  if (btn && premierProduit) {
    btn.addEventListener('click', () => {
      const champ = $('champ-parler');
      if (champ) champ.value = `j'ai vendu 3 ${premierProduit.nom}`;
      document.dispatchEvent(new CustomEvent('stovo:onglet', { detail: { onglet: 'parler' } }));
      if (champ && typeof champ.focus === 'function') champ.focus();
    });
  }
}

// Chiffre de synthese du stock dormant (LOT P-5, plan §5, "coupable sans
// regret") : assemble UNIQUEMENT des chiffres deja calcules par charger()
// (compteursEtat.dormant, publie par P-3, et p._valeur, publie par la
// valorisation du stock du 21/06) — zero requete, zero nouveau calcul de
// fond. Fonction pure, testable sans DOM (meme esprit que
// etatBandeauPilotage ci-dessus).
//
// Visible seulement s'il y a au moins un produit dormant ET si le geste de
// sortie est vivant : sinon le bandeau "pilotage en pause" (Niveau 1)
// explique deja la situation, pas la peine de superposer un 2e message
// (plan §5 LOT P-5 (c)).
//
// Le total en euros ne compte que les produits dormants dont le prix est
// connu. Si AU MOINS UN dormant n'a pas de prix, le total est annonce
// "au moins X €" plutot que "environ X €" (meme convention que la demarque
// valorisee, pertes.js l.169-171, et la valorisation du stock du 21/06 :
// jamais de 0 € trompeur). Si AUCUN dormant n'a de prix connu, la phrase se
// limite au compte, sans chiffre en euros.
export function resumeDormant(produits, compteursEtat, gesteVivant) {
  const nbDormant = compteursEtat ? compteursEtat.dormant : 0;
  if (!nbDormant || !gesteVivant) return { visible: false };

  let total = 0, nbAvecPrix = 0;
  (produits || []).forEach((p) => {
    if (p._etat !== 'dormant') return;
    if (p._valeur !== null && p._valeur !== undefined) { total += p._valeur; nbAvecPrix++; }
  });

  const sujet = nbDormant > 1
    ? `${nbDormant} produits n'ont pas bougé depuis ${SEUIL_DORMANT_JOURS} jours`
    : `1 produit n'a pas bougé depuis ${SEUIL_DORMANT_JOURS} jours`;

  if (nbAvecPrix === 0) return { visible: true, texte: `${sujet}.` };
  const partiel = nbAvecPrix < nbDormant;
  const montant = partiel ? `au moins ${fmtEuro(total)}` : `environ ${fmtEuro(total)}`;
  return { visible: true, texte: `${sujet}, ${montant} dorment.` };
}

// Rendu DOM du chiffre du dormant : reconstruit a chaque charger() comme le
// reste de l'ecran (aucun listener, aucun etat a nettoyer). L'element est
// une simple ancre posee dans index.html, SANS regle CSS propre (consigne du
// lot P-3 reconduite : ne pas toucher styles.css, laisser Corentin/le Jarvis
// styler apres relecture — voir le rapport de passation).
function majResumeDormant(produits, compteursEtat, gesteVivant) {
  const el = $('dormant-resume');
  if (!el) return;
  const r = resumeDormant(produits, compteursEtat, gesteVivant);
  if (!r.visible) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.textContent = r.texte;
}

// Ecran du matin (brique 1) : le brief du jour, en tete du tableau de bord.
// Ne fait AUCUN nouveau calcul : il met en scene des chiffres deja produits
// par charger() (produits a commander + ruptures imminentes). C'est ce qui le
// rend sur en lecture seule. Trois etats : catalogue vide (masque), rien a
// commander (message vert), des produits a commander (resume + liste de courses).
function majEcranDuMatin(produits, aCommander, ruptureImminente) {
  const sec = $('matin');
  $('matin-titre').textContent = titreDuMoment();
  const resume = $('matin-resume');
  const liste = $('matin-liste');
  const btnCopier = $('matin-copier');

  // Catalogue vide : rien a briefer, on masque (comme le verdict).
  if (produits.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  // Rien sous le point de commande : message positif, pas de liste ni de copier.
  if (aCommander.length === 0) {
    etatMatin(sec, 'matin-ok');
    $('matin-chevron').style.display = 'none';  // rien a replier
    resume.textContent = "● Rien à commander aujourd'hui, ton stock est au vert.";
    liste.innerHTML = '';
    btnCopier.hidden = true;
    texteListeCourses = '';
    return;
  }

  // Des produits a commander : couleur rouge s'il y a une rupture imminente, sinon orange.
  etatMatin(sec, ruptureImminente.length ? 'matin-crit' : 'matin-warn');
  $('matin-chevron').style.display = '';  // la liste est repliable
  const parts = [`${aCommander.length} produit${aCommander.length > 1 ? 's' : ''} à commander`];
  if (ruptureImminente.length) parts.push(`${ruptureImminente.length} en rupture imminente`);
  resume.textContent = parts.join(', ') + '.';

  // Liste triee du plus urgent au moins urgent (couverture croissante), meme
  // ordre que le bloc reappro plus bas.
  const tries = [...aCommander].sort((a, b) => {
    const ca = a._couverture === null ? Infinity : a._couverture;
    const cb = b._couverture === null ? Infinity : b._couverture;
    return ca - cb;
  });
  // Accord simple de l'unite (correctif du 01/08/2026) : les unites sont
  // stockees au pluriel en base ("pieces", "cartons"...). Sous 2, on retire
  // le "s" final s'il y en a un ; les unites qui n'en portent pas (kg, L...)
  // ne sont jamais touchees. Pas une vraie grammaire, juste la regle
  // deterministe qui couvre le cas reel (principe n2 : IA reduite a
  // l'indispensable, une regle suffit ici).
  const accorderUnite = (unite, quantite) => (quantite < 2 && unite.endsWith('s'))
    ? unite.slice(0, -1) : unite;
  // Quantite a commander = _qteCommander (deja calcule). Null si aucune vente
  // recente pour l'estimer : on affiche alors "a commander" sans quantite.
  // Version texte brut, pour le copier-coller (jamais inseree en HTML) : pas
  // d'echappement, un "&" dans un nom doit rester un "&" une fois colle.
  const qteTxt = (p) => (p._qteCommander !== null && p._qteCommander > 0)
    ? `${fmtNombre(p._qteCommander)} ${accorderUnite(p.unite, p._qteCommander)}` : 'à commander';
  // Meme quantite, version HTML : seule l'unite est echappee (le nombre ne
  // contient jamais de caractere a risque). Utilisee uniquement dans le
  // rendu liste.innerHTML ci-dessous.
  const qteTxtHtml = (p) => (p._qteCommander !== null && p._qteCommander > 0)
    ? `${fmtNombre(p._qteCommander)} ${echapperHtml(accorderUnite(p.unite, p._qteCommander))}` : 'à commander';
  // A l'ecran, la quantite porte son libelle "a commander :" (friction du
  // 16/07 : sans lui, on peut la confondre avec le stock restant). Le texte
  // copie garde la forme courte, son titre "Liste de courses" suffit. Le
  // libelle est un <span> statique (aucune donnee produit dedans), il ne
  // passe pas par echapperHtml : seule qteTxtHtml(p) (qui contient l'unite)
  // en a besoin.
  const qteAffichee = (p) => (p._qteCommander !== null && p._qteCommander > 0)
    ? `<span class="mi-qte-label">à commander :</span> ${qteTxtHtml(p)}`
    : 'à commander';
  liste.innerHTML = tries.map(p => {
    const cov = p._couverture;
    const urgent = cov !== null && cov < 1.5;
    const covTxt = cov !== null ? `reste ${txtCouverture(cov)}` : 'stock bas';
    return `<li class="matin-item">
        <span class="mi-nom">${echapperHtml(p.nom)}</span>
        <span class="mi-qte">${qteAffichee(p)}</span>
        <span class="mi-cov${urgent ? ' urgent' : ''}">${covTxt}${urgent ? ' ▲' : ''}</span>
      </li>`;
  }).join('');
  btnCopier.hidden = false;

  // Texte "liste de courses" a copier : simple, collable dans un SMS/WhatsApp au
  // fournisseur. Pas de HTML, une ligne par produit : qteTxt(p) (version
  // texte brut) et le nom sans echappement, comme avant ce correctif.
  const dateJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date());
  texteListeCourses = `Liste de courses Stovo — ${dateJour}\n`
    + tries.map(p => `- ${p.nom} : ${qteTxt(p)}`).join('\n');
}

// Section "Ce que tu as jete" (chantier C1, 26/07/2026) : demarque valorisee
// sur les 30 jours de mouvements DEJA charges par charger() (voir plus bas),
// zero requete supplementaire. Tout le calcul et le rendu HTML vivent dans
// le module pur pertes.js (calculerDemarque + rendreDemarque) ; cette
// fonction ne fait que les appeler et poser le resultat dans le DOM, meme
// patron que majResumeDormant() ci-dessus. maintenantMs est INJECTE (pas de
// Date.now() ici) pour reutiliser le meme instant que le reste de charger().
function majPertes(mvts, produits, maintenantMs) {
  const el = $('pertes-contenu');
  if (!el) return;
  const resultat = calculerDemarque({ mouvements: mvts, produits, fenetreJours: 30, maintenant: maintenantMs });
  el.innerHTML = rendreDemarque(resultat, { fmtEuro, fmtNombre });
}

// =========================================================================
// Chantier C2 « les exports » (lot C2-3, 22/08/2026)
// =========================================================================
// Deux fichiers CSV téléchargeables, câblés UNE SEULE FOIS par
// demarrerDashboard() (comme le bouton "Copier la liste" de l'écran du
// matin) : PAS par charger(), la lecture réelle ne doit jamais se déclencher
// au chargement de l'écran, seulement au clic (plan §4 lot C2-3). Zéro
// écriture : ce chantier ne fait que des SELECT (plan §5).

// Affiche/efface le message d'état sous les deux boutons, même patron que
// zoneEtat dans parler.js (hidden + textContent, pas d'affichage vide).
function afficherEtatExport(texte, estErreur) {
  const el = $('export-etat');
  if (!el) return;
  el.classList.toggle('est-erreur', !!estErreur);
  if (!texte) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = texte;
}

// Déclenche le téléchargement d'un CSV déjà construit. Le BOM UTF-8 est posé
// ICI, jamais dans les chaînes rendues par export.js (lot C2-1, plan §4) :
// sans lui Excel massacre les accents. Blob/URL.createObjectURL/<a download>
// sont natifs, aucune dépendance ajoutée (plan §3.4).
function telechargerCsv(nomFichier, contenu) {
  const blob = new Blob(['\uFEFF' + contenu], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révocation DIFFÉRÉE (relecture du 22/08/2026) : sur Safari/iOS (la cible
  // PWA de Stovo), un revokeObjectURL() synchrone juste après le clic peut
  // couper le flux avant que le navigateur ait fini d'ouvrir le
  // téléchargement, qui échoue alors en silence pendant que l'écran affiche
  // déjà "exporté". Un délai laisse le temps au navigateur de démarrer la
  // lecture du blob avant qu'on ne le libère.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Accord singulier/pluriel simple (même convention que pluriel() de
// pertes.js/export.js : 0 et 1 sont singuliers, 2+ sont pluriels).
const accordExport = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''} exporté${n > 1 ? 's' : ''}`;

// Lit une table Supabase en entier, sans troncature silencieuse (le plafond
// PostgREST de 1000 lignes par requête, plan §3.4), via la fonction pure
// lireToutesLesPages (lot C2-2, déjà testée). `construireRequete(de, a)`
// exécute la vraie requête sur la tranche et lève une erreur explicite si
// Supabase en renvoie une, pour que rien ne soit jamais avalé en silence.
function lireTable(construireRequete) {
  return lireToutesLesPages(async (de, a) => {
    const { data, error } = await construireRequete(de, a);
    if (error) throw new Error(error.message);
    return data;
  });
}

// Orchestre un export de bout en bout : désactive les deux boutons (un
// export en cours et un second déclenché en parallèle liraient une table en
// double, sans bénéfice), lit toutes les lignes, construit le CSV (module
// pur export.js), déclenche le téléchargement, puis annonce le nombre de
// lignes réellement écrites. Aucun fichier partiel : le téléchargement n'a
// lieu qu'une fois le CSV entièrement construit, jamais avant.
async function lancerExport(type, boutons) {
  boutons.forEach((b) => { if (b) b.disabled = true; });
  afficherEtatExport('Préparation du fichier…', false);
  try {
    const maintenant = Date.now();
    let contenu, compte;
    if (type === 'stock') {
      const produits = await lireTable((de, a) => supabase
        .from('produits')
        .select('nom, unite, stock_actuel, seuil_alerte, delai_repro_jours, prix_achat, cree_le, actif')
        // Départage de pagination (relecture du 22/08/2026) : `nom` seul
        // n'est pas une clé stable (deux produits peuvent porter le même
        // nom, ou être ex æquo selon le tri de la base), donc à la frontière
        // entre deux pages `.range()` des lignes pourraient être dupliquées
        // ou sautées. `id` (colonne réellement lue par charger() plus bas,
        // voir son `.select('id, nom, ...')`) est unique et sert de
        // départage déterministe.
        .order('nom')
        .order('id', { ascending: true })
        .range(de, a));
      contenu = construireCsvStock({ produits, maintenant });
      compte = accordExport(retenirProduitsExport(produits).length, 'produit');
    } else {
      const mouvements = await lireTable((de, a) => supabase
        .from('mouvements')
        .select('cree_le, type, quantite, source, motif, produit_id, produits ( nom, unite, prix_achat )')
        // Départage de pagination (relecture du 22/08/2026) : plusieurs
        // mouvements d'une même réception validée sont insérés dans la même
        // transaction, donc avec le même `cree_le` (au `now()` près). Sans
        // clé de départage, des lignes ex æquo pourraient être dupliquées ou
        // sautées à la frontière entre deux `.range()`, et l'export annoncé
        // complet ne le serait pas. `id` (colonne réellement lue par
        // charger() plus bas, voir son `.select('id, produit_id, ...')`)
        // est unique et sert de départage déterministe.
        .order('cree_le', { ascending: true })
        .order('id', { ascending: true })
        .range(de, a));
      contenu = construireCsvMouvements({ mouvements, maintenant });
      compte = accordExport(retenirMouvementsExport(mouvements).length, 'mouvement');
    }
    telechargerCsv(nomFichierExport(type, maintenant), contenu);
    afficherEtatExport(compte + '.', false);
  } catch (e) {
    afficherEtatExport(`Échec de l'export : ${e.message}`, true);
  } finally {
    boutons.forEach((b) => { if (b) b.disabled = false; });
  }
}

// Câblage des deux boutons + pose de la mention légale (constante importée
// de export.js, jamais recopiée à la main : elle ne peut donc jamais dériver
// entre le fichier téléchargé et ce qui s'affiche à l'écran, C1 §3.2).
// Appelée UNE SEULE FOIS par demarrerDashboard(), jamais par charger().
function majExport() {
  const mention = $('export-mention');
  if (mention) mention.textContent = MENTION_LEGALE + '.';
  const btnStock = $('export-stock-btn');
  const btnMouvements = $('export-mouvements-btn');
  const boutons = [btnStock, btnMouvements];
  if (btnStock) btnStock.addEventListener('click', () => lancerExport('stock', boutons));
  if (btnMouvements) btnMouvements.addEventListener('click', () => lancerExport('mouvements', boutons));
}

async function charger() {
  // 1. Produits
  const { data: produits, error: errP } = await supabase
    .from('produits').select('id, nom, unite, stock_actuel, seuil_alerte, delai_repro_jours, cree_le, prix_achat')
    .eq('actif', true).order('nom');
  if (errP) { $('inv-grid').innerHTML = `<div class="state error">Erreur produits : ${errP.message}</div>`; return; }

  // 2. Mouvements récents (30 j) : sert aux calculs ET à l'historique
  // Chantier C1 (26/07/2026) : `prix_achat` ajouté à la jointure. Sans ce
  // champ, la perte d'un produit DÉSACTIVÉ depuis (absent du tableau
  // `produits` filtré `actif = true` juste au-dessus) resterait invalorisable
  // en silence — seule cette jointure porte encore son prix. L'historique des
  // 15 derniers mouvements plus bas n'utilise que `nom`/`unite`, il continue
  // de fonctionner à l'identique avec ce champ en plus.
  const depuis = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: mvts, error: errM } = await supabase
    .from('mouvements')
    .select('id, produit_id, type, quantite, source, motif, cree_le, produits ( nom, unite, prix_achat )')
    .gte('cree_le', depuis).order('cree_le', { ascending: false });

  // --- Consommation par produit : formule PARTAGÉE avec la voix (N4) et la
  // page racine du site (pilotage.js). LOT P-2b : la fenêtre de mesure passe
  // à 30 jours, bornée par l'ancienneté du produit (cree_le) — les chiffres
  // affichés changent, c'est le but du lot. maintenantMs capturé UNE fois et
  // réutilisé pour les deux appels, pour que sorties et joursObserves soient
  // calculés à l'identique dans le même passage. ---
  const maintenantMs = Date.now();
  // Chantier C1 (26/07/2026) : la démarque valorisée, calculée juste après le
  // chargement des mouvements, avec le MÊME maintenantMs que le reste de ce
  // passage (aucune donnée partagée avec le pilotage qui suit, mais même
  // discipline d'un seul "maintenant" par appel de charger()).
  majPertes(mvts, produits, maintenantMs);
  const sorties = calculerSortiesParProduit(mvts, maintenantMs);
  // --- LOT P-3 (26/07/2026) : resume global, calcule UNE FOIS (pas par
  // produit), avant la boucle car chaque etat de produit en a besoin (le
  // garde-fou gesteVivant, plan §3 Q3). ---
  const gesteVivant = calculerGesteVivant(mvts, maintenantMs);
  const derniereSortieLe = calculerDerniereSortieLe(mvts);
  produits.forEach(p => {
    const { consoJour, couverture, pdcDynamique, pointCommande, qteCommander } = calculerLignePilotage(p, sorties[p.id], maintenantMs);
    p._consoJour = consoJour;
    p._couverture = couverture;
    p._pdcDynamique = pdcDynamique;
    p._pointCommande = pointCommande;
    p._qteCommander = qteCommander;
    // Etat "mesure" / "dormant" / "insuffisant" (LOT P-3) : calcule ici, dans
    // le module partage, pour que l'ecran (cartes, Stock) et la voix (N4)
    // qualifient un produit de la meme facon (plan §3 Q3).
    const ancienneteJours = calculerAncienneteJours(p.cree_le, maintenantMs);
    p._etat = calculerEtatProduit(consoJour, ancienneteJours, gesteVivant);
  });
  // Compteurs (LOT P-3) : pur agregat des etats deja calcules ci-dessus, pas
  // affiches dans ce lot (utile au lot P-6 et a un futur chiffre de synthese,
  // P-5), publie avec 'stovo:donnees' plus bas pour eviter tout recalcul.
  const compteursEtat = compterEtats(produits.map(p => p._etat));

  // --- KPI "Activité (ACTIVITE_JOURS jours)" : compte TOUS les mouvements
  // (tous types, avec ou sans motif) sur SA PROPRE fenêtre, indépendante de
  // celle de la consommation ci-dessus (voir ACTIVITE_JOURS en tête de fichier). ---
  const limiteActivite = Date.now() - ACTIVITE_JOURS * 864e5;
  let nbMvt7j = 0;
  (mvts || []).forEach(m => {
    if (new Date(m.cree_le).getTime() >= limiteActivite) nbMvt7j++;
  });

  // --- Valorisation du stock en euros (au dernier prix d'achat dicté) ---
  // Valeur d'un produit = prix_achat × stock. Un produit SANS prix (NULL) n'est PAS compté :
  // sa valeur est inconnue, pas nulle. On l'affiche "prix non renseigné" et on signale le total partiel.
  let valeurTotale = 0, nbValorises = 0;
  produits.forEach(p => {
    if (p.prix_achat !== null && p.prix_achat !== undefined) {
      p._valeur = Number(p.prix_achat) * Number(p.stock_actuel);
      valeurTotale += p._valeur;
      nbValorises++;
    } else {
      p._valeur = null;
    }
  });

  // --- KPI ---
  // "À commander" piloté par le point de commande dynamique (repli sur le seuil figé si pas de ventes récentes)
  const aCommander = produits.filter(p => Number(p.stock_actuel) <= Number(p._pointCommande));
  const ruptureImminente = produits.filter(p => p._couverture !== null && p._couverture < 3);
  $('kpi-commander').textContent = aCommander.length;
  $('kpi-rupture').textContent = ruptureImminente.length;
  $('kpi-produits').textContent = produits.length;
  $('kpi-mouvements').textContent = nbMvt7j;
  // --- Phrase de verdict : la réponse en un coup d'œil, assemblée à partir des compteurs déjà calculés (aucun nouveau calcul) ---
  const vEl = $('verdict');
  if (produits.length === 0) {
    vEl.style.display = 'none';
  } else {
    const parts = [];
    if (aCommander.length) parts.push(`${aCommander.length} produit${aCommander.length > 1 ? 's' : ''} à commander`);
    if (ruptureImminente.length) parts.push(`${ruptureImminente.length} en rupture imminente`);
    vEl.style.display = 'block';
    if (parts.length === 0) {
      vEl.className = 'verdict v-ok';
      vEl.textContent = '● Tout ton stock est au vert.';
    } else {
      vEl.className = 'verdict ' + (ruptureImminente.length ? 'v-crit' : 'v-warn');
      vEl.textContent = (ruptureImminente.length ? '■ ' : '▲ ') + parts.join(', ') + ', le reste est bon.';
    }
  }
  // Bandeau "pilotage en pause" (Niveau 1, LOT P-3) : juste sous le verdict.
  // Aucun calcul ici, juste de la mise en scene de gesteVivant/derniereSortieLe
  // deja calcules plus haut. Masque tout seul si le catalogue est vide (rien
  // a declarer sans produit) ou si le geste de sortie est vivant.
  majBandeauPilotage(produits, gesteVivant, derniereSortieLe);
  // Ecran du matin (brique 1) : le brief en tete, a partir des memes compteurs
  // (aCommander + ruptureImminente), aucun nouveau calcul.
  majEcranDuMatin(produits, aCommander, ruptureImminente);
  // Valeur du stock : total des produits valorisés, et part du catalogue déjà valorisée (incite à dicter les prix manquants)
  $('kpi-valeur').textContent = nbValorises ? fmtEuro(valeurTotale) : '—';
  $('kpi-valeur-sub').textContent = produits.length === 0
    ? 'aucun produit'
    : (nbValorises === produits.length
        ? 'tout le catalogue valorisé'
        : `${nbValorises}/${produits.length} produits valorisés`);
  // Chiffre de synthese du stock dormant (LOT P-5) : juste a cote de la
  // valorisation, aucun nouveau calcul, voir resumeDormant ci-dessus.
  majResumeDormant(produits, compteursEtat, gesteVivant);
  $('updated').textContent = 'Mis à jour à ' + new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date());

  // --- Bloc réappro : produits sous seuil, triés par couverture croissante (plus urgent en haut) ---
  if (aCommander.length) {
    const tries = [...aCommander].sort((a, b) => {
      const ca = a._couverture === null ? Infinity : a._couverture;
      const cb = b._couverture === null ? Infinity : b._couverture;
      return ca - cb;
    });
    $('reorder-bloc').style.display = 'block';
    $('reorder-count').textContent = aCommander.length;
    $('reorder-list').innerHTML = tries.map(ligneReappro).join('');
  } else {
    $('reorder-bloc').style.display = 'none';
  }

  // --- Inventaire complet, regroupe par etat en sections depliables (brique 2) ---
  $('inv-count').textContent = produits.length;
  if (!produits.length) {
    $('inv-grid').innerHTML = `<div class="state">Pour démarrer, importe ton catalogue ou dis au bot : « ajoute le produit X ».</div>`;
  } else {
    // Trois paniers mutuellement exclusifs, memes regles que les badges des cartes :
    // sous le point de commande -> a commander ; sinon autonomie courte -> a surveiller ; sinon en stock.
    const gCommander = [], gSurveiller = [], gStock = [];
    produits.forEach(p => {
      if (Number(p.stock_actuel) <= (Number(p._pointCommande) || 0)) gCommander.push(p);
      else if (urgence(p._couverture) === 'warn') gSurveiller.push(p);
      else gStock.push(p);
    });
    // Un groupe = un <details> (pli natif), ouvert selon invGroupesOuverts. Groupe vide = pas affiche.
    const groupe = (cle, sym, titre, arr) => arr.length ? `
      <details class="inv-groupe" data-groupe="${cle}"${invGroupesOuverts[cle] ? ' open' : ''}>
        <summary class="inv-sommaire"><span class="inv-sym inv-sym-${cle}">${sym}</span> ${titre} <span class="count">${arr.length}</span></summary>
        <div class="grid">${arr.map(carteProduit).join('')}</div>
      </details>` : '';
    $('inv-grid').innerHTML =
      groupe('commander', '■', 'À commander', gCommander)
      + groupe('surveiller', '▲', 'À surveiller', gSurveiller)
      + groupe('stock', '●', 'En stock', gStock);
  }

  // Onglet « Stock » (QW-C) : on publie les produits AVEC leurs chiffres
  // calcules ci-dessus (_couverture, _pointCommande, _valeur, _etat...) pour
  // que stock.js les affiche sans refaire ni lecture ni calcul. Un seul
  // chargement nourrit les deux ecrans : memes chiffres partout. gesteVivant,
  // derniereSortieLe et compteursEtat (LOT P-3) publies aussi, pour qu'un
  // futur lot (P-4, P-5) puisse les reutiliser sans recalculer.
  document.dispatchEvent(new CustomEvent('stovo:donnees', {
    detail: { produits, gesteVivant, derniereSortieLe, compteursEtat },
  }));

  // --- Historique : 15 derniers mouvements ---
  if (errM) {
    $('mvt-body').innerHTML = `<tr><td colspan="4" class="state error">Erreur : ${errM.message}</td></tr>`;
  } else if (!mvts.length) {
    $('mvt-body').innerHTML = `<tr><td colspan="4" class="state">Aucun mouvement.</td></tr>`;
  } else {
    const motifLabel = { inventaire: 'régul. inventaire', casse: 'casse', peremption: 'péremption', vol: 'vol', erreur: 'correction' };
    $('mvt-body').innerHTML = mvts.slice(0, 15).map(m => {
      const entree = m.type === 'entree';
      const nom = m.produits ? m.produits.nom : '(supprimé)';
      const unite = m.produits ? m.produits.unite : '';
      // étiquette si c'est une régularisation/perte (motif renseigné), pour la distinguer d'une vente
      const motifTag = m.motif ? ` <span class="tag-motif">${motifLabel[m.motif] || m.motif}</span>` : '';
      return `<tr>
        <td>${fmtDate(m.cree_le)}</td>
        <td>${nom}</td>
        <td class="pill ${entree ? 'entree' : 'sortie'}">${entree ? '+' : '−'}${fmtNombre(m.quantite)} ${unite}${motifTag}</td>
        <td class="src"><span class="src-ligne">${m.source === 'vocal' ? ICONES.parler : ICONES.clavier}${m.source === 'vocal' ? 'vocal' : 'manuel'}</span></td>
      </tr>`;
    }).join('');
  }
}

// Demarrage encapsule (lot 9b) : app.js l'appelle une fois la session
// confirmee, plus jamais a l'import. Garde anti-double-demarrage : si
// app.js appelait ceci deux fois (ex. session deja active + evenement
// onAuthStateChange qui suit), on ne veut ni deux setInterval empiles ni
// deux ecouteurs sur le bouton "Rafraichir".
let demarre = false;

export function demarrerDashboard() {
  if (demarre) return;
  demarre = true;
  // Restaurer le repli du bandeau du matin AVANT le premier rendu (evite un
  // clignotement de la liste qui s'afficherait puis se replierait).
  try { if (localStorage.getItem('stovo_matin_replie') === '1') $('matin').classList.add('replie'); } catch (_e) { /* stockage indispo */ }
  charger();
  $('refresh').addEventListener('click', charger);
  // Bouton "Copier la liste" de l'ecran du matin : copie le texte prepare au
  // dernier rendu (texteListeCourses). Attache une seule fois, comme refresh ;
  // le contenu, lui, est remis a jour a chaque charger().
  $('matin-copier').addEventListener('click', async () => {
    if (!texteListeCourses) return;
    const btn = $('matin-copier');
    try {
      await navigator.clipboard.writeText(texteListeCourses);
      const orig = btn.textContent;
      btn.textContent = '✓ Copié';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    } catch (_e) {
      // Presse-papier indisponible (vieux navigateur, contexte non securise) :
      // repli par une invite ou l'utilisateur fait Ctrl+C.
      globalThis.prompt('Copie ta liste (Ctrl+C) :', texteListeCourses);
    }
  });
  // Repli/depli du bandeau du matin ; l'etat est memorise (localStorage).
  const majAriaMatin = () => $('matin-toggle').setAttribute('aria-expanded', String(!$('matin').classList.contains('replie')));
  majAriaMatin();
  $('matin-toggle').addEventListener('click', () => {
    const replie = $('matin').classList.toggle('replie');
    majAriaMatin();
    try { localStorage.setItem('stovo_matin_replie', replie ? '1' : '0'); } catch (_e) { /* stockage indispo */ }
  });
  // Memoriser l'etat ouvert/ferme des groupes d'inventaire, sinon le
  // rafraichissement toutes les 30 s les refermerait. L'evenement "toggle" ne
  // bouillonne pas -> ecoute en phase de capture.
  $('inv-grid').addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.tagName === 'DETAILS' && d.dataset.groupe) invGroupesOuverts[d.dataset.groupe] = d.open;
  }, true);
  // Chantier C1 : le <details> de la demarque vit hors de #inv-grid (voir
  // index.html), donc il lui faut son propre listener. Purement documentaire
  // (voir la note sur invGroupesOuverts.pertes plus haut) : ce <details>
  // n'etant jamais recree par charger(), son etat visuel survit deja tout
  // seul, ce listener ne fait que garder invGroupesOuverts a jour par
  // coherence avec les 3 groupes d'inventaire.
  const pertesDetails = $('pertes-groupe');
  if (pertesDetails) {
    pertesDetails.addEventListener('toggle', () => { invGroupesOuverts.pertes = pertesDetails.open; });
  }
  // Chantier C2 (lot C2-3) : câblage des deux boutons d'export. Comme
  // #pertes-groupe ci-dessus, #export-groupe vit hors de #inv-grid, n'est
  // jamais recréé par charger() et n'a donc pas besoin d'être suivi dans
  // invGroupesOuverts : son état ouvert/fermé survit tout seul au
  // rafraîchissement toutes les 30 s.
  majExport();
  setInterval(charger, 30000);
}

// Formateurs partages avec l'onglet « Stock » (QW-C) : exportes tels quels
// pour que stock.js affiche EXACTEMENT les memes textes et les memes regles
// d'urgence que le dashboard, sans dupliquer la logique.
export { fmtEuro, fmtNombre, txtCouverture, urgence };
// carteProduit exportee pour le banc offline (LOT P-3) : fonction pure (ne
// depend que de son parametre p), testable sans DOM ni Supabase.
export { carteProduit };
// resumeDormant deja exportee ci-dessus (declaration `export function`, LOT
// P-5) : listee ici en commentaire pour garder une trace unique de toutes
// les exports "banc offline" du fichier.

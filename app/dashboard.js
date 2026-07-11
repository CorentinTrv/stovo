// STOVO — logique du dashboard (lot 9a)
// =========================================
// Ce fichier est une copie SANS AUCUN CHANGEMENT DE COMPORTEMENT du
// <script type="module"> du dashboard actuel
// (livrables/sites-web/stovo/index.html). Meme connexion Supabase (cle
// publishable, lecture seule via RLS), memes calculs, meme rendu. Il est
// simplement sorti du HTML vers son propre fichier ES module pour que la
// coquille (app.js) puisse l'importer comme un ecran parmi d'autres.
//
// Idee metier centrale : on n'affiche pas que le stock brut, on calcule la
// COUVERTURE EN JOURS (combien de temps il reste au rythme reel des sorties).
// C'est l'info qui declenche vraiment l'action chez un gerant.
//
// La cle Supabase ci-dessous est PUBLIQUE par nature : lecture seule,
// la base est verrouillee en ecriture (Row Level Security).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Connexion Supabase (clé publique = lecture seule) ---
const SUPABASE_URL = 'https://hivaawwjrimacfkguauc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h-tBhpJfbAP4YUS6OmYsaA_GNAfWkjh';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FENETRE_JOURS = 7;          // période sur laquelle on mesure le rythme de consommation
const COUVERTURE_CIBLE_JOURS = 10; // combien de jours on veut tenir après réception (curseur trésorerie)
const SECURITE_JOURS = 3;          // marge de sécurité du point de commande (jours de conso ajoutés au délai)

const $ = (id) => document.getElementById(id);
const fmtNombre = (v) => { const n = Number(v); return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, ''); };
const fmtEuro = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v));
const fmtDate = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// Texte lisible de la couverture en jours
const txtCouverture = (c) => {
  if (c === null) return '—';
  if (c < 1) return "moins d'1 jour";
  const j = Math.round(c);
  return '≈ ' + j + ' jour' + (j > 1 ? 's' : '');
};
// Niveau d'urgence selon la couverture : critique (<1.5j), attention (<3j), ok
const urgence = (c) => (c === null ? 'ok' : c < 1.5 ? 'crit' : c < 3 ? 'warn' : 'ok');

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
  const consoTxt = consoJ > 0
    ? `Tu en sors ≈ ${consoJ.toFixed(1).replace('.', ',')} /jour (≈ ${fmtNombre(Math.round(consoJ * 7))} /sem)`
    : 'Pas encore de sorties mesurées';
  // Tag du seuil : "auto" s'il suit les ventes, "fixe" si on retombe sur le seuil figé. Détail au survol.
  const tagPdc = dynamique
    ? `<span class="tag-auto" title="Calculé sur tes ventes : ${consoJ.toFixed(1).replace('.', ',')} /j × (${fmtNombre(delai)} j livraison + ${SECURITE_JOURS} j sécurité)">auto</span>`
    : `<span class="tag-fixe" title="Seuil figé : pas encore de ventes récentes pour le calculer sur le rythme réel">fixe</span>`;
  // Badge état, doublé d'un symbole pour rester lisible même sans la couleur (daltonien)
  const badge = alerte
    ? `<span class="badge danger">■ À commander</span>`
    : (urgence(cov) === 'warn' ? `<span class="badge warn">▲ À surveiller</span>` : `<span class="badge ok">● En stock</span>`);
  // Héros de la carte : l'autonomie, l'info qui fait agir. La couleur ne fait qu'habiller une donnée déjà calculée.
  const heroClass = cov !== null ? (urgence(cov) === 'crit' ? 'h-crit' : (urgence(cov) === 'warn' ? 'h-warn' : 'h-ok')) : 'h-muted';
  const heroTxt = cov !== null ? `Il te reste ${txtCouverture(cov)}` : 'Pas encore de ventes';
  // Détail (petit, gris, en pied de carte) : prix dicté, valeur immobilisée (prix × stock), conso, point de commande.
  // "non renseigné" tant que le prix n'a pas été dicté : jamais 0 € trompeur, et pas de valeur affichée dans ce cas.
  const aPrix = (p.prix_achat !== null && p.prix_achat !== undefined);
  const prixTxt = aPrix ? `<b>${fmtEuro(p.prix_achat)}</b> / ${p.unite}` : 'non renseigné';
  const valeurTxt = aPrix ? ` · Valeur : <b>${fmtEuro(p._valeur)}</b>` : '';
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
    ? `<div class="ri-warning">⚠ Rupture probable avant la livraison</div>` : '';
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

async function charger() {
  // 1. Produits
  const { data: produits, error: errP } = await supabase
    .from('produits').select('id, nom, unite, stock_actuel, seuil_alerte, delai_repro_jours, prix_achat').order('nom');
  if (errP) { $('inv-grid').innerHTML = `<div class="state error">Erreur produits : ${errP.message}</div>`; return; }

  // 2. Mouvements récents (30 j) : sert aux calculs ET à l'historique
  const depuis = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: mvts, error: errM } = await supabase
    .from('mouvements')
    .select('id, produit_id, type, quantite, source, motif, cree_le, produits ( nom, unite )')
    .gte('cree_le', depuis).order('cree_le', { ascending: false });

  // --- Calcul de la consommation par produit sur les 7 derniers jours ---
  const limite7j = Date.now() - FENETRE_JOURS * 864e5;
  const sorties = {};           // produit_id -> total des sorties sur 7 j
  let nbMvt7j = 0;
  (mvts || []).forEach(m => {
    const t = new Date(m.cree_le).getTime();
    if (t >= limite7j) {
      nbMvt7j++;
      // Consommation = vraies sorties seulement. On EXCLUT les régularisations et pertes (m.motif renseigné),
      // sinon un recalage d'inventaire à la baisse serait pris pour une vente et gonflerait la suggestion de réappro.
      if (m.type === 'sortie' && !m.motif) sorties[m.produit_id] = (sorties[m.produit_id] || 0) + Number(m.quantite);
    }
  });
  // couverture = stock / consommation moyenne par jour (null si aucune sortie récente)
  produits.forEach(p => {
    const conso = (sorties[p.id] || 0) / FENETRE_JOURS; // consommation moyenne par jour
    p._consoJour = conso;
    p._couverture = conso > 0 ? Number(p.stock_actuel) / conso : null;
    const delai = Number(p.delai_repro_jours) || 0;
    // Point de commande DYNAMIQUE = de quoi tenir le délai de livraison + une marge de sécurité,
    // au rythme réel des ventes. C'est le niveau de stock à partir duquel il faut recommander.
    // Repli sur le seuil figé (seuil_alerte) tant qu'aucune vente récente ne permet de le calculer.
    p._pdcDynamique = conso > 0 ? Math.max(1, Math.ceil(conso * (delai + SECURITE_JOURS))) : null;
    p._pointCommande = p._pdcDynamique !== null ? p._pdcDynamique : Number(p.seuil_alerte);
    // Quantité à commander = de quoi couvrir (délai + couverture cible), moins le stock déjà présent
    if (conso > 0) {
      const besoin = conso * (delai + COUVERTURE_CIBLE_JOURS) - Number(p.stock_actuel);
      p._qteCommander = Math.max(0, Math.ceil(besoin));
    } else {
      p._qteCommander = null; // pas de sortie récente : aucune suggestion fiable
    }
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
  // Valeur du stock : total des produits valorisés, et part du catalogue déjà valorisée (incite à dicter les prix manquants)
  $('kpi-valeur').textContent = nbValorises ? fmtEuro(valeurTotale) : '—';
  $('kpi-valeur-sub').textContent = produits.length === 0
    ? 'aucun produit'
    : (nbValorises === produits.length
        ? 'tout le catalogue valorisé'
        : `${nbValorises}/${produits.length} produits valorisés`);
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

  // --- Inventaire complet ---
  $('inv-count').textContent = produits.length;
  $('inv-grid').innerHTML = produits.length ? produits.map(carteProduit).join('') : `<div class="state">Pour démarrer, importe ton catalogue ou dis au bot : « ajoute le produit X ».</div>`;

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
        <td class="src">${m.source === 'vocal' ? '🎙️ vocal' : '⌨️ manuel'}</td>
      </tr>`;
    }).join('');
  }
}

charger();
$('refresh').addEventListener('click', charger);
setInterval(charger, 30000);

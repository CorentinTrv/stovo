// STOVO — onglet « Stock » (QW-C, 18/07/2026)
// ====================================================================
// Reponse « trouvabilite » a la cible 250/300 references : une liste
// compacte de tous les produits actifs + une recherche qui filtre a la
// frappe. Division des ecrans : Tableau de bord = piloter,
// Stock = TROUVER, Parler = agir.
//
// 100 % LECTURE SEULE et ZERO appel reseau en propre : ce module ne
// parle jamais a Supabase. Il ecoute l'evenement 'stovo:donnees' que
// dashboard.js emet a chaque chargement (initial + rafraichissement
// 30 s + bouton Rafraichir) avec les produits DEJA calcules
// (_couverture, _pointCommande, _valeur). Memes chiffres partout,
// aucun recalcul, aucune requete en plus meme a 300 references.

import { fmtEuro, fmtNombre, txtCouverture, urgence } from './dashboard.js';

const $ = (id) => document.getElementById(id);

// Normalisation pour la recherche : minuscules + accents retires, pour
// que « cafe » trouve « Café » (meme esprit que le normaliser() du
// matching backend, version minimale cote affichage).
const normaliser = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Dernier lot de produits recu de dashboard.js (deja tries par nom).
let produitsCourants = null; // null = pas encore charge (etat "Chargement...")

// Lignes depliees (par id produit) : memorisees pour survivre au
// rafraichissement toutes les 30 s, comme les groupes de l'inventaire.
const lignesOuvertes = new Set();

// Badge d'etat : MEMES regles que les cartes et les groupes du
// dashboard (sous le point de commande -> a commander ; sinon autonomie
// courte -> a surveiller ; sinon en stock).
function badgeDe(p) {
  if (Number(p.stock_actuel) <= (Number(p._pointCommande) || 0)) {
    return '<span class="badge danger">■</span>';
  }
  if (urgence(p._couverture) === 'warn') {
    return '<span class="badge warn">▲</span>';
  }
  return '<span class="badge ok">●</span>';
}

// Une ligne = un <details> natif : le sommaire est la ligne compacte
// (nom, stock, badge), le contenu est le detail replie (prix, valeur,
// autonomie, point de commande — chiffres deja calcules).
function ligneStock(p) {
  const cov = p._couverture;
  const autonomieTxt = cov !== null ? `Il te reste ${txtCouverture(cov)}` : 'Pas encore de ventes mesurées';
  const aPrix = (p.prix_achat !== null && p.prix_achat !== undefined);
  const prixTxt = aPrix ? `<b>${fmtEuro(p.prix_achat)}</b> / ${p.unite}` : 'non renseigné';
  const valeurTxt = (aPrix && p._valeur !== null) ? ` · Valeur : <b>${fmtEuro(p._valeur)}</b>` : '';
  const pdc = Number(p._pointCommande) || 0;
  const commanderTxt = pdc > 0 ? `<br>Commande quand il en reste <b>${fmtNombre(pdc)} ${p.unite}</b>` : '';
  return `
    <details class="stock-ligne" data-id="${p.id}"${lignesOuvertes.has(p.id) ? ' open' : ''}>
      <summary class="stock-sommaire">
        <span class="sl-nom">${p.nom}</span>
        <span class="sl-stock"><b>${fmtNombre(p.stock_actuel)}</b> ${p.unite}</span>
        ${badgeDe(p)}
      </summary>
      <div class="stock-detail">
        ${autonomieTxt}<br>
        Prix : ${prixTxt}${valeurTxt}${commanderTxt}
      </div>
    </details>`;
}

function rendre() {
  const zone = $('stock-liste');
  const compteur = $('stock-count');
  if (produitsCourants === null) return; // rien recu encore, on garde "Chargement..."

  if (produitsCourants.length === 0) {
    compteur.textContent = '0';
    zone.innerHTML = `<div class="state">Ton catalogue est vide. Importe un fichier ou dis : « ajoute le produit X ».</div>`;
    return;
  }

  const requete = normaliser($('stock-recherche').value || '');
  // Filtre a la frappe : les noms qui COMMENCENT par la requete d'abord,
  // puis ceux qui la CONTIENNENT. La liste source est deja triee par nom,
  // l'ordre alphabetique est donc conserve dans chaque groupe.
  let visibles;
  if (!requete) {
    visibles = produitsCourants;
  } else {
    const commence = [], contient = [];
    produitsCourants.forEach((p) => {
      const nom = normaliser(p.nom);
      if (nom.startsWith(requete)) commence.push(p);
      else if (nom.includes(requete)) contient.push(p);
    });
    visibles = commence.concat(contient);
  }

  compteur.textContent = requete ? `${visibles.length}/${produitsCourants.length}` : String(produitsCourants.length);
  zone.innerHTML = visibles.length
    ? visibles.map(ligneStock).join('')
    : `<div class="state">Aucun produit ne correspond à « ${$('stock-recherche').value.trim()} ».</div>`;
}

// --- Branchements (a l'import, comme parler.js : les elements existent
// des le chargement de la page, et ne font rien tant qu'on n'y touche pas) ---

// Nouvelles donnees du dashboard -> re-rendu (en respectant la recherche
// en cours et les lignes depliees).
document.addEventListener('stovo:donnees', (e) => {
  produitsCourants = e.detail.produits;
  rendre();
});

// Recherche a la frappe.
$('stock-recherche').addEventListener('input', rendre);

// Memoriser les lignes depliees (l'evenement "toggle" ne bouillonne pas
// -> ecoute en phase de capture, comme l'inventaire du dashboard).
$('stock-liste').addEventListener('toggle', (e) => {
  const d = e.target;
  if (d.tagName !== 'DETAILS' || !d.dataset.id) return;
  const id = Number(d.dataset.id);
  if (d.open) lignesOuvertes.add(id);
  else lignesOuvertes.delete(id);
}, true);

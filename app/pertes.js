// STOVO — C1 « Ce que tu as jeté » : la démarque valorisée (25/07/2026)
// =======================================================================
// Brique PURE et ISOLEE, sur le modele de reception.js et inventaire.js :
// aucun acces au DOM, aucun acces a Supabase, aucun import. Tout ce dont
// elle a besoin lui est PASSE en parametre (mouvements, produits, et meme
// les formateurs). C'est ce qui la rend testable hors navigateur.
//
// Ce qu'elle fait : sur une fenetre de N jours, additionner ce qui a ete
// PERDU (casse, peremption, vol) et le valoriser au prix d'achat connu.
//
// Ce qu'elle ne fait PAS, et c'est volontaire :
//   - elle ne lit rien (dashboard.js charge deja 30 j de mouvements) ;
//   - elle n'ecrit rien, jamais ;
//   - elle ne connait ni le CA ni aucun encaissement (ligne rouge NF525),
//     donc elle ne peut pas produire un "taux de demarque" en % du CA.
//
// Regle de justesse n°1 : le filtre des motifs est POSITIF (liste blanche).
// On ne retire pas 'inventaire' et 'erreur', on ne garde QUE casse,
// peremption et vol. Si un motif est ajoute un jour au CHECK de la base,
// un filtre par exclusion le compterait comme une perte EN SILENCE ; la
// liste blanche, elle, l'ignore jusqu'a decision explicite.
//
// Regle de justesse n°2 : un produit sans prix n'a pas une valeur nulle,
// il a une valeur INCONNUE. Jamais "0 €", jamais "NaN". Sa quantite est
// comptee, son montant ne l'est pas, et le total s'annonce partiel.
// Meme regle que la valorisation du stock (dashboard.js, lot du 21/06).

// Les seuls motifs qui sont une PERTE. 'inventaire' est un recalage de
// comptage, 'erreur' un mouvement compensateur : ni l'un ni l'autre n'est
// de l'argent jete.
export const MOTIFS_PERTE = ['peremption', 'casse', 'vol'];

// Libelles d'affichage. Volontairement alignes sur motifLabel de
// dashboard.js pour que le meme motif ne s'appelle pas deux noms selon
// l'ecran.
export const LIBELLE_MOTIF = {
  peremption: 'péremption',
  casse: 'casse',
  vol: 'vol',
};

// Un prix est "connu" s'il est renseigne, y compris s'il vaut 0.
// Un produit offert a un prix d'achat de 0, ce n'est pas la meme chose
// qu'un produit dont on ignore le prix.
const prixConnu = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/**
 * Calcule la demarque sur une fenetre glissante.
 *
 * @param {object} args
 * @param {Array}  args.mouvements  Lignes de `mouvements`, telles que chargees par
 *                                  dashboard.js (avec `motif`, `type`, `quantite`,
 *                                  `cree_le`, `produit_id` et la jointure `produits`).
 *                                  Tolere null/undefined (cas d'une erreur de lecture).
 * @param {Array}  args.produits    Catalogue ACTIF deja charge, pour retrouver un prix
 *                                  quand la jointure ne le porte pas. Tolere null.
 * @param {number} args.fenetreJours
 * @param {number} args.maintenant  Horodatage de reference (injecte pour que le banc
 *                                  d'essai soit deterministe).
 * @returns {object} resultat agrege, jamais null.
 */
export function calculerDemarque({ mouvements, produits, fenetreJours = 30, maintenant = Date.now() } = {}) {
  const vide = {
    total: 0, partiel: false, nbSansPrix: 0, quantiteSansPrix: 0,
    parMotif: [], parProduit: [], nbLignes: 0, fenetreJours,
  };
  if (!Array.isArray(mouvements) || mouvements.length === 0) return vide;

  // Index des prix du catalogue actif, en repli de la jointure.
  const prixParId = new Map();
  (Array.isArray(produits) ? produits : []).forEach((p) => {
    if (p && p.id !== undefined) prixParId.set(p.id, p.prix_achat);
  });

  const limite = maintenant - fenetreJours * 864e5;
  const parProduit = new Map();
  const parMotif = new Map();
  let total = 0, nbSansPrix = 0, quantiteSansPrix = 0, nbLignes = 0;

  for (const m of mouvements) {
    if (!m) continue;
    // Fenetre. Une date illisible est ignoree plutot que comptee a tort.
    const t = new Date(m.cree_le).getTime();
    if (!Number.isFinite(t) || t < limite) continue;
    // Liste blanche (regle de justesse n°1).
    if (m.type !== 'sortie') continue;
    if (!MOTIFS_PERTE.includes(m.motif)) continue;

    const quantite = Number(m.quantite);
    if (!Number.isFinite(quantite) || quantite <= 0) continue;
    nbLignes++;

    const joint = m.produits || {};
    // Le prix vient d'abord de la jointure (elle seule couvre un produit
    // DESACTIVE depuis, absent du catalogue actif), puis du catalogue.
    const brut = prixConnu(joint.prix_achat) ? joint.prix_achat : prixParId.get(m.produit_id);
    const aPrix = prixConnu(brut);
    const montant = aPrix ? Number(brut) * quantite : null;

    const cle = m.produit_id ?? joint.nom ?? '(inconnu)';
    if (!parProduit.has(cle)) {
      parProduit.set(cle, {
        nom: joint.nom || '(produit supprimé)',
        unite: joint.unite || '',
        quantite: 0, montant: 0, aPrix, motifs: {},
      });
    }
    const p = parProduit.get(cle);
    p.quantite += quantite;
    p.motifs[m.motif] = (p.motifs[m.motif] || 0) + quantite;
    if (aPrix) p.montant += montant; else p.aPrix = false;

    if (!parMotif.has(m.motif)) parMotif.set(m.motif, { motif: m.motif, libelle: LIBELLE_MOTIF[m.motif] || m.motif, quantite: 0, montant: 0 });
    const g = parMotif.get(m.motif);
    g.quantite += quantite;
    if (aPrix) g.montant += montant;

    if (aPrix) total += montant;
    else { nbSansPrix++; quantiteSansPrix += quantite; }
  }

  if (nbLignes === 0) return vide;

  // Tri par montant decroissant ; les lignes non valorisees passent en fin,
  // pour ne jamais laisser croire qu'elles valent zero.
  const produitsTries = [...parProduit.values()]
    .map((p) => ({ ...p, montant: p.aPrix ? p.montant : null }))
    .sort((a, b) => {
      if (a.montant === null && b.montant === null) return b.quantite - a.quantite;
      if (a.montant === null) return 1;
      if (b.montant === null) return -1;
      return b.montant - a.montant;
    });

  const motifsTries = [...parMotif.values()]
    .map((g) => ({ ...g, part: total > 0 ? g.montant / total : 0 }))
    .sort((a, b) => b.montant - a.montant);

  return {
    total,
    partiel: nbSansPrix > 0,
    nbSansPrix,
    quantiteSansPrix,
    parMotif: motifsTries,
    parProduit: produitsTries,
    nbLignes,
    fenetreJours,
  };
}

/**
 * Rend le bloc en HTML. Les formateurs sont INJECTES (fmtEuro, fmtNombre
 * exportes par dashboard.js) pour que les euros et les nombres s'ecrivent
 * exactement comme partout ailleurs dans l'app.
 *
 * Note de coherence : comme le reste du front (carteProduit, ligneReappro,
 * majEcranDuMatin), les noms de produits sont inseres sans echappement.
 * Convention du depot, mono-utilisateur, donnees saisies par l'utilisateur
 * lui-meme. Ne pas diverger ici tout seul.
 */
export function rendreDemarque(r, { fmtEuro, fmtNombre } = {}) {
  const euro = fmtEuro || ((v) => `${v} €`);
  const nb = fmtNombre || ((v) => String(v));

  if (!r || r.nbLignes === 0) {
    return `<div class="pertes-vide">● Rien jeté sur les ${r ? r.fenetreJours : 30} derniers jours. Bonne nouvelle.</div>`;
  }

  const totalTxt = r.partiel
    ? `${euro(r.total)} <span class="pertes-partiel">au moins</span>`
    : euro(r.total);

  const motifs = r.parMotif.map((g) => {
    const part = r.total > 0 && g.montant > 0 ? ` · ${Math.round(g.part * 100)} %` : '';
    return `<div class="pertes-motif">
        <span class="pm-nom">${g.libelle}</span>
        <span class="pm-montant">${g.montant > 0 ? euro(g.montant) : '—'}${part}</span>
      </div>`;
  }).join('');

  const lignes = r.parProduit.map((p) => {
    const detail = Object.entries(p.motifs)
      .map(([m, q]) => `${nb(q)} ${LIBELLE_MOTIF[m] || m}`).join(' · ');
    const droite = p.montant === null
      ? `<span class="pp-sansprix">prix non renseigné</span>`
      : `<b>${euro(p.montant)}</b>`;
    return `<div class="pertes-ligne">
        <div class="pp-main"><div class="pp-nom">${p.nom}</div><div class="pp-detail">${detail}</div></div>
        <div class="pp-right">${droite}</div>
      </div>`;
  }).join('');

  const mentionPartiel = r.partiel
    ? `<div class="pertes-note">${r.nbSansPrix} ligne${r.nbSansPrix > 1 ? 's' : ''} sans prix renseigné, non comptée${r.nbSansPrix > 1 ? 's' : ''} dans le total.</div>`
    : '';

  return `
    <div class="pertes-total">${totalTxt}</div>
    <div class="pertes-motifs">${motifs}</div>
    <div class="pertes-liste">${lignes}</div>
    ${mentionPartiel}
    <div class="pertes-methode">Valorisé au dernier prix d'achat connu. Chiffre indicatif, ce n'est pas un état comptable.</div>`;
}

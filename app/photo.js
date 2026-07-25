// STOVO — préparation d'une photo de bon de livraison (chantier P, lot P-3)
// =========================================================================
// Ce module réduit une photo prise au téléphone AVANT de l'envoyer au serveur.
// Il ne parle ni à Supabase ni au reste de l'app : il transforme un File en
// { base64, mimeType }, c'est tout.
//
// POURQUOI RÉDUIRE (ce n'est pas de l'optimisation de confort) : une photo de
// téléphone fait 3 à 8 Mo, et l'encodage base64 ajoute encore un tiers. Envoyée
// telle quelle, elle sature le transport JSON, allonge l'appel Gemini, et rend
// la brique inutilisable en 4G dans une réserve. Réduite, elle pèse quelques
// centaines de Ko et reste parfaitement lisible.
//
// POURQUOI 2000 px ET PAS MOINS : un BL est un document DENSE (petits caractères,
// colonnes serrées). Descendre trop bas économise des octets mais détruit
// justement ce qu'on cherche à lire. 2000 px sur le grand côté est le compromis
// retenu (recommandation de la veille du 25/07, qui corrigeait une première
// proposition à 1500 px jugée trop agressive pour le petit texte).
//
// LE PIÈGE EXIF : une photo prise à la verticale porte son orientation dans ses
// métadonnées EXIF, et le pixel brut, lui, est couché. Un redimensionnement naïf
// par canvas perd cette métadonnée : le BL arrive tourné à 90°, et le modèle lit
// beaucoup moins bien. D'où `imageOrientation: 'from-image'` ci-dessous, et un
// repli via <img> (les navigateurs appliquent l'orientation EXIF nativement au
// rendu d'une balise img depuis 2020).

// Grand côté maximal de l'image envoyée, en pixels.
export const MAX_COTE = 2000;

// Qualité JPEG de sortie. 0.82 est le point où l'on ne voit plus la différence
// sur du texte imprimé, tout en divisant le poids par un large facteur.
export const QUALITE_JPEG = 0.82;

// Le serveur n'accepte que ces formats (voir _shared/photo_bl.ts). Le HEIC
// d'iPhone n'y figure pas et n'a pas à y figurer : la sortie de ce module est
// TOUJOURS du JPEG, quel que soit le format d'entrée. C'est le canvas qui fait
// la conversion, gratuitement.
export const MIME_SORTIE = 'image/jpeg';

// calculerDimensions : ramène (largeur, hauteur) sous `maxCote` en gardant les
// proportions. Fonction PURE, testable sans navigateur.
//
// Une image déjà plus petite que la limite n'est JAMAIS agrandie : agrandir
// n'ajoute aucune information et ne ferait que gonfler le poids.
export function calculerDimensions(largeur, hauteur, maxCote = MAX_COTE) {
  const l = Number(largeur);
  const h = Number(hauteur);
  // Dimensions absurdes (0, NaN, négatif) : on ne calcule rien, l'appelant
  // renoncera. Mieux vaut un refus clair qu'un canvas de taille NaN.
  if (!Number.isFinite(l) || !Number.isFinite(h) || l <= 0 || h <= 0) return null;

  const grandCote = Math.max(l, h);
  if (grandCote <= maxCote) return { largeur: Math.round(l), hauteur: Math.round(h) };

  const facteur = maxCote / grandCote;
  return {
    // Math.max(1, ...) : une image extrêmement allongée pourrait arrondir son
    // petit côté à 0, ce qui ferait un canvas invalide.
    largeur: Math.max(1, Math.round(l * facteur)),
    hauteur: Math.max(1, Math.round(h * facteur)),
  };
}

// extraireBase64 : isole la charge utile d'une data URL ("data:image/jpeg;base64,XXXX").
// Fonction PURE. Retourne '' si l'entrée n'a pas la forme attendue, jamais une
// exception (même doctrine que le backend : une entrée douteuse ne casse rien).
export function extraireBase64(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const virgule = dataUrl.indexOf(',');
  if (virgule === -1) return '';
  return dataUrl.slice(virgule + 1);
}

// creerReducteurPhoto : fabrique la fonction de réduction, avec ses dépendances
// navigateur injectées (même esprit que reception.js / stock.js : le module reste
// exerçable hors navigateur).
//
//   deps.creerImageBitmap : (blob, options) -> Promise<ImageBitmap>
//   deps.creerCanvas      : (largeur, hauteur) -> canvas
//   deps.chargerImage     : (blob) -> Promise<{ image, largeur, hauteur }>  (repli)
//
// Retourne : async (fichier) -> { base64, mimeType } ou null si l'image est
// inexploitable. Ne lève jamais : l'appelant affiche un message et la vie continue.
export function creerReducteurPhoto(deps = {}) {
  const creerImageBitmap = deps.creerImageBitmap ||
    ((blob, options) => globalThis.createImageBitmap(blob, options));
  const creerCanvas = deps.creerCanvas || ((largeur, hauteur) => {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    return canvas;
  });
  const chargerImage = deps.chargerImage || chargerImageParBalise;

  return async function reduire(fichier) {
    if (!fichier) return null;

    let source = null;
    let largeurSource = 0;
    let hauteurSource = 0;

    // Chemin préféré : createImageBitmap avec respect explicite de l'EXIF.
    try {
      const bitmap = await creerImageBitmap(fichier, { imageOrientation: 'from-image' });
      source = bitmap;
      largeurSource = bitmap.width;
      hauteurSource = bitmap.height;
    } catch (_e) {
      // Repli : navigateur sans createImageBitmap, ou sans l'option
      // imageOrientation (Safari l'a longtemps ignorée). Une balise <img>
      // applique l'orientation EXIF d'elle-même au rendu.
      try {
        const chargee = await chargerImage(fichier);
        if (!chargee) return null;
        source = chargee.image;
        largeurSource = chargee.largeur;
        hauteurSource = chargee.hauteur;
      } catch (_e2) {
        return null;
      }
    }

    const cible = calculerDimensions(largeurSource, hauteurSource);
    if (!cible) return null;

    try {
      const canvas = creerCanvas(cible.largeur, cible.hauteur);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, cible.largeur, cible.hauteur);
      const dataUrl = canvas.toDataURL(MIME_SORTIE, QUALITE_JPEG);
      const base64 = extraireBase64(dataUrl);
      if (!base64) return null;
      return { base64, mimeType: MIME_SORTIE };
    } catch (_e) {
      return null;
    } finally {
      // Libère la mémoire du bitmap sur un mobile qui n'en a pas beaucoup.
      if (source && typeof source.close === 'function') source.close();
    }
  };
}

// Repli de chargement par balise <img> + object URL. L'URL est toujours révoquée,
// succès ou échec, pour ne pas fuir de mémoire à chaque photo.
function chargerImageParBalise(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ image, largeur: image.naturalWidth, hauteur: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image illisible'));
    };
    image.src = url;
  });
}

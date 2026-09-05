// STOVO — contact par mail et numéro de version affiché (lot A4, 24/08/2026)
// ====================================================================
// Module PUR : aucun DOM, aucun Supabase, aucun `navigator` lu directement
// (le user-agent et le nom du cache actif sont passés en paramètre par
// reglages.js, qui lit le vrai navigateur). Même famille que pertes.js /
// export.js. Un lien `mailto:`, rien d'autre (§3.1 de l'analyse) : pas de
// formulaire, pas d'Edge Function, pas d'envoi depuis un serveur.

// Adresse changee le 27/08/2026 (lot "apres S-6, D22/contact/D6") : la boite
// bonjour@stovo.fr existe chez OVH (recoit et envoie, prouve le 27/08), la
// vitrine et les mails d'Auth l'utilisent deja. L'app etait le dernier
// endroit qui pointait sur l'ancienne adresse Outlook.
export const DESTINATAIRE_CONTACT = 'bonjour@stovo.fr';
export const SUJET_CONTACT = 'Stovo : une question';

// Résumé de l'appareil en UN mot (§3.1 de l'analyse), pour la ligne de pied
// du mail. Ordre de test important : un iPad se dit parfois "Macintosh" côté
// user-agent récent (iPadOS 13+), mais reste minoritaire sur la cible TPE
// (téléphone au comptoir) — non géré ici par souci de simplicité (principe
// n°2, une règle suffit pour le cas réel), signalé au rapport de passation.
export function resumerAppareil(userAgent) {
  const ua = String(userAgent || '');
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone';
  if (/android/i.test(ua)) return 'Android';
  return 'PC';
}

// Résumé du navigateur, pour la même ligne ("iPhone (Safari)"). L'ordre
// compte : Chrome et Edge embarquent tous deux la chaîne "Safari" dans leur
// user-agent (moteur WebKit/Blink hérité), donc leurs propres signatures
// doivent être testées AVANT "Safari", sinon Chrome serait toujours détecté
// comme Safari.
export function resumerNavigateur(userAgent) {
  const ua = String(userAgent || '');
  if (/edg\//i.test(ua)) return 'Edge';
  if (/crios|chrome/i.test(ua)) return 'Chrome';
  if (/fxios|firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'navigateur inconnu';
}

// Extrait le numéro de version depuis le nom du cache actif du service
// worker (ex. "stovo-app-v32" -> "32"). C'est LA source de vérité déjà
// utilisée par sw.js (CACHE_NAME) : aucune constante de version à maintenir
// en double ici. `null` si le format ne correspond pas (aucun cache Stovo
// trouvé, ou nom inattendu) : à l'appelant de décider du repli affiché.
export function extraireNumeroVersion(nomCache) {
  const trouve = String(nomCache || '').match(/^stovo-app-v(\d+)$/);
  return trouve ? trouve[1] : null;
}

// Corps du mail (texte brut, avec de vrais retours à la ligne). Structure
// EXACTE du brief (point 11) : "Bonjour Corentin," puis DEUX lignes vides
// pour le message, puis la ligne "—" et la ligne d'envoi. `version` est déjà
// une chaîne (le repli "?" si extraireNumeroVersion n'a rien trouvé est
// décidé par l'appelant, pas ici).
export function construireCorpsMail({ version, email, userAgent }) {
  const appareil = resumerAppareil(userAgent);
  const navigateur = resumerNavigateur(userAgent);
  const ligneEnvoi = `Envoyé depuis Stovo, version ${version}, compte ${email}, ${appareil} (${navigateur}).`;
  return ['Bonjour Corentin,', '', '', '—', ligneEnvoi].join('\n');
}

// Lien mailto complet, prêt pour `<a href>`. `encodeURIComponent` transforme
// chaque retour à la ligne du corps en %0A (vérifié au banc) : c'est lui qui
// fait tout l'encodage, aucune substitution manuelle de caractères ici.
export function construireLienMailto({ version, email, userAgent }) {
  const corps = construireCorpsMail({ version, email, userAgent });
  const params = `subject=${encodeURIComponent(SUJET_CONTACT)}&body=${encodeURIComponent(corps)}`;
  return `mailto:${DESTINATAIRE_CONTACT}?${params}`;
}

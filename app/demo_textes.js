// STOVO — textes de la démo en libre-service (lot L6a, 07/10/2026)
// ====================================================================
// Ce fichier ne contient QUE des textes, aucune logique. Source unique :
// livrables/rapports/2026-10-07_stovo_demo-textes_v1.md (sections 2 à 6 et 12),
// textes validés par Corentin le 07/10/2026, recopiés SANS retouche par script
// et vérifiés à l'octet. Pour en changer un : le modifier dans ce fichier ET
// dans le littéral indépendant de demo_logique_test.js (les deux se
// surveillent), puis dans la source.
//
// L'app tutoie (décision du 23/08/2026), sauf le mail pré-rempli, qui vouvoie
// parce que c'est le visiteur qui écrit à Corentin.
//
// Deux marqueurs sont remplacés par le code (demo_logique.js) :
//   {jours}  dans TEXTE_BANDEAU                    -> le nombre de jours restants
//   {code}   dans TEXTE_MAIL_SUJET et TEXTE_MAIL_CORPS -> le code complet DEMO-XXXX
// Un test échoue si un texte réécrit les oublie.

// --- L'écran de lancement (URL ?demo, aucune session) ---

export const TEXTE_LANCEMENT_TITRE =
  'Essaie Stovo sur une épicerie';
export const TEXTE_LANCEMENT_CORPS =
  'Une épicerie fictive de 40 produits, avec trois semaines d\'activité déjà dedans. Dis ce que tu reçois, ce que tu vends, ce qui te manque : Stovo tient le stock.';
export const TEXTE_LANCEMENT_BOUTON =
  'Lancer la démo';
export const TEXTE_LANCEMENT_ENCOURS =
  'Ouverture de ta démo…';
export const MSG_DEMO_LANCEMENT_RGPD =
  'Aucun e-mail, aucun mot de passe. Ce que tu dictes est gardé 7 jours, puis effacé. Ne dicte ni nom de client ni information personnelle. Le détail est dans Confidentialité.';
export const TEXTE_LANCEMENT_PAS_INSCRIPTION =
  'La démo n\'est pas une inscription : c\'est l\'étape d\'avant un essai d\'un mois sur ton vrai stock.';

// --- Un message pour chaque appareil (décision 6) ---

export const MSG_DEMO_ANDROID =
  'Sur Android, la dictée n\'a pas encore été testée en conditions réelles. Si le micro ne réagit pas, le clavier fait exactement la même chose.';
export const MSG_DEMO_ORDINATEUR =
  'Stovo est fait pour le téléphone. Ici, tape tes phrases au clavier, ou ouvre stovo.fr sur ton téléphone.';

// --- Les refus du lancement (ce qui bloque, pourquoi, quand ça se lève, comment passer tout de suite) ---

export const MSG_DEMO_RESEAU_PARTAGE =
  'Trop de démos ont été ouvertes depuis ce réseau dans la dernière heure. C\'est une protection contre les robots, elle se lève d\'elle-même dans l\'heure. Tout de suite : coupe le wifi, passe en 4G et réessaie.';
export const MSG_DEMO_COMPLETE =
  'Les 200 places de la démo sont prises. Des places se libèrent chaque nuit, quand les démos de plus de 7 jours s\'effacent. Tout de suite : écris-moi à bonjour@stovo.fr, je t\'ouvre un accès.';
export const MSG_DEMO_FERMEE =
  'La démo est fermée pour le moment. Écris-moi à bonjour@stovo.fr, je te réponds et je t\'ouvre un accès.';
export const MSG_DEMO_LANCEMENT_ECHEC =
  'La démo n\'a pas pu s\'ouvrir. Réessaie dans un instant. Si ça recommence, écris-moi à bonjour@stovo.fr.';

// --- Le bandeau (dans le flux de la page, jamais en surimpression) ---
// Deux formes seulement : « encore 1 jour » ne s'affiche jamais (dernier jour dès qu'il reste un jour ou moins).

export const TEXTE_BANDEAU =
  'Démo · encore {jours} jours';
export const TEXTE_BANDEAU_DERNIER_JOUR =
  'Démo · dernier jour';
export const TEXTE_BANDEAU_BOUTON =
  'Essayer sur mon vrai stock';
export const TEXTE_SORTIE_JOUR3 =
  'Trois jours que tu essaies Stovo. Pour le tester sur ton vrai stock, écris-moi : un essai d\'un mois, gratuit, que j\'installe avec toi.';

// --- L'écran de fin (démo expirée, ou démo effacée puis visiteur de retour) ---
// Le bouton de l'écran de fin porte le MÊME libellé que celui du bandeau : voulu.

export const TEXTE_FIN_TITRE =
  'Ta démo est terminée';
export const TEXTE_FIN_CORPS_EXPIREE =
  'Les 7 jours sont passés. Ta démo et tout ce que tu y as dicté seront effacés cette nuit. Pour continuer sur ton vrai stock : un essai d\'un mois, gratuit, que j\'installe avec toi.';
export const TEXTE_FIN_CORPS_EFFACEE =
  'Les 7 jours sont passés. Ta démo et tout ce que tu y as dicté ont été effacés. Pour continuer sur ton vrai stock : un essai d\'un mois, gratuit, que j\'installe avec toi.';
export const TEXTE_FIN_BOUTON =
  'Essayer sur mon vrai stock';
export const TEXTE_FIN_J_AI_UN_COMPTE =
  'J\'ai un compte Stovo';

// --- Le mail pré-rempli, vers bonjour@stovo.fr (vouvoiement) ---

export const TEXTE_MAIL_SUJET =
  'Essayer Stovo sur mon stock ({code})';
export const TEXTE_MAIL_CORPS =
  'Bonjour Corentin,\n\nJ\'ai essayé la démo de Stovo et j\'aimerais l\'essayer sur mon vrai stock.\n\nMon commerce :\n\nAujourd\'hui, je tiens mon stock avec (cahier, tableur, logiciel de caisse, de tête) :\n\nMon code de démo est {code}. Il vous permet de voir ce que j\'ai fait dans la démo, tant qu\'elle n\'est pas effacée.';

// --- Lot L6b (07/10/2026) : fonctions grisées et Aide de la démo ---
// Sources : sections 7 et 9 du même fichier. MSG_DEMO_FONCTION_GRISEE est le MÊME texte
// que celui du serveur (_shared/demo.ts) : un test les compare à l'octet.
// AIDE_DEMO_LIMITES : six puces, une par ligne, le début de chaque puce entre ** ** (gras) ;
// demo_logique.js les transforme en HTML pour l'Aide.

export const MSG_DEMO_FONCTION_GRISEE =
  'La photo de bon et l\'import de tableur sont désactivés dans la démo : ils demandent tes vrais documents, et la démo est faite pour ne rien garder de toi. Les deux sont dans l\'essai accompagné. En attendant, dicte par exemple « j\'ai reçu 24 lait ».';
export const AIDE_DEMO_LIMITES_TITRE =
  'Ce que la démo ne fait pas';
export const AIDE_DEMO_LIMITES =
  '**Ni photo de bon, ni import de tableur.** Ils demandent tes vrais documents, et la démo est faite pour ne rien garder de toi. Les deux sont dans l\'essai accompagné.\n' +
  '**Pas d\'intelligence artificielle.** Seules les règles répondent. Une phrase qu\'elles ne reconnaissent pas reçoit « pas compris », avec deux exemples.\n' +
  '**7 jours.** Ensuite, tout est effacé, et la démo ne se relance pas d\'un clic.\n' +
  '**Ce navigateur seulement.** Sans e-mail ni mot de passe, impossible de retrouver ta démo sur un autre appareil. Si tu vides les données du site, elle est perdue.\n' +
  '**100 produits et 500 mouvements au plus.** Au-delà, tout reste consultable, rien ne s\'ajoute.\n' +
  '**Ni mot de passe, ni déconnexion** dans Réglages : la démo n\'a pas de compte à protéger.';

// --- Correctif de revue L6b (07/10/2026) : sortir de la démo depuis Réglages ---
// Texte validé le 23/10/2026 (arbitrage du Jarvis, autonomie confiée par Corentin). La ligne elle-même
// porte TEXTE_FIN_J_AI_UN_COMPTE (déjà validé, réutilisé). Ce texte est celui de la confirmation avant
// de fermer la démo.

export const TEXTE_REGLAGES_QUITTER_DEMO_CONFIRMATION =
  'Passer à ton compte Stovo ? Ta démo se ferme sur ce téléphone, et tu ne pourras plus la rouvrir.';

// --- Lot L7 (08/10/2026) : les missions « L'essentiel » ---
// Source : section 8 du même fichier de textes validés (carte, ligne sous la mission 4, titre et phrase
// exacte des cinq missions), recopiée par script sans retouche. La phrase d'une mission est celle que le
// visiteur dit : rejouée sans IA sur une démo du bac (campagne L4). Les missions 6 à 10 (« Pour aller plus
// loin », lot L10) n'ont pas encore leurs textes ici : elles sont inactives dans missions_demo_logique.js.

export const TEXTE_MISSIONS_TITRE =
  'L\'essentiel, en 5 phrases';
export const TEXTE_MISSIONS_CONSIGNE =
  'Dis chaque phrase au micro, ou tape-la. Elle se coche toute seule.';
export const TEXTE_MISSIONS_FINI =
  'Les 5 sont faites : tu as vu l\'essentiel de Stovo.';
export const TEXTE_MISSIONS_APRES_MATIN =
  'Puis ouvre Pilotage : c\'est ton écran du matin.';
export const TEXTE_MISSION_01_TITRE =
  'Recevoir une livraison';
export const TEXTE_MISSION_01_PHRASE =
  'j\'ai reçu 24 lait';
export const TEXTE_MISSION_02_TITRE =
  'Vendre ou casser';
export const TEXTE_MISSION_02_PHRASE =
  'j\'ai vendu 3 pâtes';
export const TEXTE_MISSION_03_TITRE =
  'Demander un stock';
export const TEXTE_MISSION_03_PHRASE =
  'combien de bières ?';
export const TEXTE_MISSION_04_TITRE =
  'Le matin : quoi commander';
export const TEXTE_MISSION_04_PHRASE =
  'Qu\'est-ce que je dois commander ?';
export const TEXTE_MISSION_05_TITRE =
  'Créer un produit';
export const TEXTE_MISSION_05_PHRASE =
  'crée le produit yaourt';

// Texte d, version A (décision de Corentin du 12/10/2026) : le bandeau de la démo, une fois les cinq
// missions faites. Distinct de TEXTE_MISSIONS_FINI, qui reste la phrase de la carte.
export const TEXTE_SORTIE_ESSENTIEL =
  'Et si tu faisais la même chose avec ton vrai stock ? Écris-moi : un essai d\'un mois, gratuit, que j\'installe avec toi.';

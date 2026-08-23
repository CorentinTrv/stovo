// parler_logique.js - Lot A11-2 (tests front de la boucle vocale, 23/08/2026)
// ==========================================================================
// Extraction de la logique PURE de app/parler.js (module ZERO DOM, ZERO
// import de supabase.js -- aucun `document`, `fetch`, `FileReader`,
// `SpeechRecognition` ici). Meme esprit que app/pilotage.js ou app/photo.js
// (fonctions pures et petites machines d'etat, testables sans navigateur).
//
// REGLE ABSOLUE tenue lors de l'extraction : chaque fonction ci-dessous
// reproduit EXACTEMENT le comportement du code qu'elle remplace dans
// parler.js (memes conditions, memes valeurs par defaut, meme ordre
// d'evaluation). parler.js appelle desormais ces fonctions au lieu de
// contenir leur logique ; il garde les memes ids, les memes messages, le
// meme ordre d'appels.
//
// Ce qui N'A PAS ete extrait ici (et pourquoi) est documente dans le rapport
// de passation du lot A11 (livrables/sites-web/stovo/APP_compte-rendu-lotA11-
// tests-boucle-vocale_2026-08-23.md).

// ---------------------------------------------------------------------------
// Lecture du corps d'une reponse d'erreur pwa-api (supabase-js)
// ---------------------------------------------------------------------------
// pwa-api repond parfois 400 sur un corps de kind reception-*/sortie-*/
// inventaire-* malformé, MAIS renvoie quand meme { reply, session|sortie|
// inventaire } (choix §3.4/§3.5 du rapport API-3) : supabase-js expose alors
// la Response dans error.context, il faut la lire au lieu de traiter ca
// comme un echec sec. Ne leve jamais : un corps illisible retombe sur `null`,
// l'appelant affichera le message d'erreur generique.
export async function lireCorpsReponse(error) {
  try {
    const reponse = error && error.context;
    if (reponse && typeof reponse.json === 'function') return await reponse.json();
  } catch (_erreur) {
    /* corps illisible : on retombera sur le message d'erreur generique */
  }
  return null;
}

// Un corps d'erreur lu via lireCorpsReponse est-il exploitable (contient au
// moins un `reply` ou une `session`) ? Copie exacte de la condition qui
// vivait dans appelerReceptionApi (parler.js) : ne verifie QUE ces deux
// champs (ni `sortie` ni `inventaire`), parce qu'en pratique pwa-api pose
// toujours `reply` sur un corps d'erreur -- changer cette liste changerait
// un comportement deja eprouve, donc on ne le fait pas ici.
export function corpsErreurExploitable(corps) {
  return Boolean(corps && (corps.reply || corps.session));
}

// ---------------------------------------------------------------------------
// Lot A10-6 (23/08/2026) : normalisation du champ optionnel `choix` renvoye
// par pwa-api ({numero, nom}[], 2 a 4 elements en temps normal cf. le plan
// A10 §4). Entree externe (reseau) toujours suspecte : on ne garde que les
// elements qui ont vraiment un `numero` entier et un `nom` non vide, et on
// tronque a 4 (plutot que de tout rejeter) si le serveur en renvoyait
// davantage -- un exces cote serveur ne doit jamais faire planter l'ecran,
// et 4 reste la limite affichable sans que la liste devienne illisible
// debout (§4 du plan A10).
//
// Reprise apres relecture du Jarvis (23/08/2026) : exportee pour devenir
// aussi le filtre de afficherChoix (parler.js), qui rend les boutons pour
// les TROIS contextes (declaration, reception, sortie). Avant ce correctif,
// seule la declaration passait par interpreterReponsePwaApi -- reception.js/
// sortie.js relayaient payload.choix brut, donc un candidat sans nom y
// affichait un bouton " undefined" au lieu d'etre filtre.
export function normaliserChoix(choixBrut) {
  if (!Array.isArray(choixBrut)) return [];
  const valides = choixBrut.filter(
    (c) => c && Number.isInteger(c.numero) && typeof c.nom === 'string' && c.nom.trim() !== '',
  );
  return valides.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Interpretation d'une reponse de pwa-api (kinds mono-coup declaration/
// confirmation/import) : quoi afficher, faut-il montrer les boutons Oui/Non,
// et le choix numerote a afficher le cas echeant.
// ---------------------------------------------------------------------------
// Copie exacte de la ligne finale d'appelerPwaApi (parler.js). `enAttente`
// pilote l'affichage des boutons Oui/Non (afficherReponse dans parler.js).
//
// Lot A10-6 : un `choix` non vide force `enAttente` a false, quoi que dise le
// serveur -- Oui/Non et les boutons 1/2/3/4 ne s'affichent JAMAIS ensemble
// (§2.2 de la consigne). Le serveur ne devrait jamais renvoyer les deux a la
// fois (un choix en attente empeche toute autre chose d'etre en attente,
// cf. _shared/choix.ts), mais le front ne suppose pas ce cote juste : c'est
// lui qui tranche en dernier ressort, pas une confiance aveugle au serveur.
export function interpreterReponsePwaApi(data) {
  const choix = normaliserChoix(data?.choix);
  return {
    texte: data?.reply ?? 'Pas de réponse du serveur.',
    enAttente: choix.length > 0 ? false : Boolean(data?.enAttente),
    choix,
  };
}

// ---------------------------------------------------------------------------
// Lot A10-6b (23/08/2026, polish apres critique Impeccable) : pli d'ecran
// pendant un choix.
// ---------------------------------------------------------------------------
// En contexte DECLARATION seulement (aucun mode de session ouvert), le menu
// (bouton Importer + les trois boutons Demarrer) se replie tant qu'un choix
// numerote occupe l'ecran, pour lui laisser toute la place. En reception ou
// en sortie, le mode gere DEJA son propre ecran (il masque deja l'import et
// les Demarrer a l'entree, voir reception.js/sortie.js) : y toucher ferait
// REVENIR ces boutons a la fin d'un choix EN SESSION, ce qui serait un bug.
// C'est pour ca que masquerMenu n'est vrai que si modeCourant est null.
export function calculerPliChoix(choixVisible, modeCourant) {
  return { masquerMenu: Boolean(choixVisible) && modeCourant === null };
}

// ---------------------------------------------------------------------------
// Verrou de mode unique (lot S-0) : petite machine d'etat PURE.
// ---------------------------------------------------------------------------
// Stovo n'autorise qu'un seul mode de session actif (reception, inventaire,
// sortie) a la fois. Cette machine ne connait ni le DOM ni les autres modes :
// elle ne fait que suivre QUI detient le verrou. Les effets de bord (masquer
// les boutons Demarrer, afficher le message de refus) restent dans
// parler.js, qui lit le resultat renvoye ici.
export function creerVerrouDeMode() {
  let modeCourant = null;
  return {
    // Lecture seule : le mode qui detient actuellement le verrou (ou null).
    modeCourant: () => modeCourant,

    // Tente de prendre le verrou pour `nom`. Autorise si personne ne le
    // detient, OU si c'est deja `nom` (reprise du meme mode). `modeBloquant`
    // n'est rempli que si le refus vient d'un AUTRE mode : c'est ce que
    // parler.js utilise pour nommer le coupable dans son message de refus.
    prendre(nom) {
      if (modeCourant !== null && modeCourant !== nom) {
        return { autorise: false, modeBloquant: modeCourant };
      }
      modeCourant = nom;
      return { autorise: true, modeBloquant: null };
    },

    // Libere le verrou SEULEMENT si `nom` en est bien le detenteur actuel
    // (sans ce garde-fou, un mode pourrait liberer le verrou d'un autre, par
    // exemple une reprise refusee qui appellerait quand meme son nettoyage).
    // Renvoie `true` si le verrou a reellement ete libere.
    rendre(nom) {
      if (modeCourant !== nom) return false;
      modeCourant = null;
      return true;
    },
  };
}

// Messages de refus du verrou, ecrits en entier pour que l'accord soit juste
// (« Termine-LA » pour une reception/sortie, « Termine-LE » pour un
// inventaire). Memes phrases que le filet serveur (_shared/verrou_mode.ts).
const MESSAGES_VERROU = {
  reception: 'Tu as une réception en cours. Termine-la ou abandonne-la d\'abord.',
  inventaire: 'Tu as un inventaire en cours. Termine-le ou abandonne-le d\'abord.',
  sortie: 'Tu as une sortie en cours. Termine-la ou abandonne-la d\'abord.',
};

// Texte a afficher quand `prendre()` refuse (modeBloquant non-null). Copie
// exacte du repli utilise dans parler.js avant l'extraction.
export function texteRefusVerrou(modeBloquant) {
  return MESSAGES_VERROU[modeBloquant]
    || 'Tu as déjà une opération en cours. Termine-la ou abandonne-la d\'abord.';
}

// Etat cache/visible des boutons "Demarrer" des AUTRES modes (celui qui vient
// de prendre/perdre le verrou gere deja le sien dans son propre entrer()/
// sortir()). Copie exacte de la boucle de majBoutonsDemarrer (parler.js) :
// pour chaque nom de bouton different de `modeActif`, hidden = (modeActif
// !== null). Fonction pure : elle ne touche aucun noeud DOM, elle se contente
// de dire quoi faire ; parler.js applique le resultat sur les vrais boutons.
export function calculerVisibiliteAutresDemarrer(noms, modeActif) {
  const visibilite = {};
  for (const nom of noms) {
    if (nom === modeActif) continue; // le mode actif gere lui-meme son propre bouton
    visibilite[nom] = modeActif !== null;
  }
  return visibilite;
}

// ---------------------------------------------------------------------------
// Routage d'une phrase dictee (formulaire "Parler") vers le bon mode.
// ---------------------------------------------------------------------------
// Lot S-0 : le verrou choisit la branche CANDIDATE, l'etat REEL de chaque
// mode (son propre `estEnXxx()`) la CONFIRME, et a defaut on retombe sur
// 'normal' (jamais un tampon de session qui n'existe plus). Cas concret : une
// banniere de reprise prend le verrou avant qu'on ait clique "Reprendre" --
// dans ce cas le mode n'est pas encore "actif" (`etats.reception` est faux),
// et la phrase doit repartir en saisie normale avec son propre rempart
// Oui/Non, PAS dans un tampon de session pas encore ouvert.
export function choisirBranche(modeCourant, etats) {
  if (modeCourant === 'reception' && etats.reception) return 'reception';
  if (modeCourant === 'inventaire' && etats.inventaire) return 'inventaire';
  if (modeCourant === 'sortie' && etats.sortie) return 'sortie';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Lot saisie multiligne (23/08/2026) : le champ de Parler est un textarea,
// mais Entree doit ENVOYER comme avant (sur iOS, la touche « retour » est le
// seul bouton d'envoi au clavier). Maj+Entree insere une ligne, et une
// composition en cours (clavier japonais, dictee en cours d'edition) n'envoie
// jamais : la touche valide la composition, pas la phrase.
// ---------------------------------------------------------------------------
export function toucheEnvoie(touche) {
  return touche.key === 'Enter' && !touche.shiftKey && !touche.isComposing;
}

// ---------------------------------------------------------------------------
// Construction des corps JSON envoyes a pwa-api (kinds mono-coup).
// ---------------------------------------------------------------------------
export function corpsDeclaration(texte) {
  return { kind: 'declaration', texte };
}

export function corpsConfirmation(reponse) {
  return { kind: 'confirmation', reponse };
}

// Lot A10-6 : reponse a un choix numerote pose par pwa-api (§4 du plan A10),
// jumelle de corpsConfirmation ci-dessus.
export function corpsChoix(numero) {
  return { kind: 'choix', numero };
}

export function corpsImport(nomFichier, contenuBase64) {
  return { kind: 'import', nomFichier, contenuBase64 };
}

// ---------------------------------------------------------------------------
// Conversion d'un resultat FileReader.readAsDataURL en base64 nu.
// ---------------------------------------------------------------------------
// FileReader lui-meme (l'objet navigateur) n'est PAS separable : c'est une
// API navigateur qui lit un vrai fichier de maniere asynchrone. Ce qui EST
// separable, c'est le decoupage de sa sortie ("data:...;base64,XXXX" -> la
// partie apres la virgule), copie exacte de la logique qui vivait dans
// lireFichierEnBase64 (parler.js).
//
// Piege signale (pas corrige, voir le rapport de passation) : cette fonction
// N'EST PAS identique a extraireBase64 (app/photo.js), qui renvoie '' quand
// aucune virgule n'est trouvee. Ici, en l'absence de virgule, on renvoie la
// chaine ENTIERE telle quelle (comportement d'origine de parler.js). Fusionner
// les deux changerait un comportement existant, donc on ne le fait pas.
export function extraireBase64DepuisDataUrl(resultatFileReader) {
  const texte = String(resultatFileReader || '');
  const virgule = texte.indexOf(',');
  return virgule === -1 ? texte : texte.slice(virgule + 1);
}

// ---------------------------------------------------------------------------
// Message d'etat du micro selon le code d'erreur SpeechRecognition.
// ---------------------------------------------------------------------------
const MESSAGES_ERREUR_MICRO = {
  'not-allowed': 'Micro refusé. Autorise le micro dans les réglages du navigateur.',
  'service-not-allowed': 'Micro refusé. Autorise le micro dans les réglages du navigateur.',
  'no-speech': "Je n'ai rien entendu, réessaie.",
  'network': 'Souci réseau pour la reconnaissance vocale.',
};

// Copie exacte du repli utilise dans reconnaissance.onerror (parler.js).
export function texteErreurMicro(code) {
  return MESSAGES_ERREUR_MICRO[code] || 'Problème avec le micro, réessaie ou utilise le clavier.';
}

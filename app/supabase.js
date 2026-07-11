// STOVO — client Supabase centralisé (lot 9b)
// ================================================
// Un SEUL client pour toute l'app (dashboard.js ET auth.js l'importent
// d'ici). Avant ce lot, dashboard.js créait son propre client : ça
// marchait tant qu'il n'y avait pas d'auth, mais deux clients auraient
// signifié deux sessions potentiellement désynchronisées. Un seul client
// = une seule session, gérée au même endroit.
//
// Clé PUBLISHABLE (comme avant, reprise telle quelle depuis dashboard.js) :
// c'est une clé publique par nature, elle ne donne aucun accès en écriture
// (Row Level Security côté base). L'authentification ci-dessous ne change
// pas ça : elle pose une session utilisateur, elle n'élève pas les droits
// du client Supabase lui-même.
//
// auth.persistSession + autoRefreshToken : la session survit à la
// fermeture de l'app (stockée en localStorage par supabase-js) et se
// renouvelle toute seule avant expiration, sans reconnexion manuelle.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hivaawwjrimacfkguauc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h-tBhpJfbAP4YUS6OmYsaA_GNAfWkjh';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

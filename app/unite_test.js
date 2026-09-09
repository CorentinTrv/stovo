// unite_test.js — lot D24 (06/09/2026), l'unite enfin accordee
//
// Banc FRONT du juge commun : rejoue _shared/unite_cas.ts (jeu d'essai
// commun) contre app/unite.js. Le MEME jeu d'essai est rejoue cote backend
// par _shared/unite_test.ts contre unite.ts : c'est ce qui garantit que les
// deux implementations dupliquees a la main restent identiques, cas pour cas
// (meme patron que pilotage_test.js/pilotage_cas.ts, lot P-1).
//
// Lancer avec (depuis n'importe quel dossier) :
//   deno test --allow-read livrables/sites-web/stovo/app/unite_test.js

import { assertEquals } from "jsr:@std/assert";
import { accorderUnite } from "./unite.js";
import { CAS_UNITE } from "../../../backend-stovo/supabase/functions/_shared/unite_cas.ts";

for (const cas of CAS_UNITE) {
  Deno.test(`accorderUnite (front) : ${cas.nom}`, () => {
    assertEquals(accorderUnite(cas.unite, cas.quantite), cas.attendu);
  });
}

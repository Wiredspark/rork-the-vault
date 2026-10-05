export type ModuleStatus = "live" | "soon";

export interface VaultModule {
  id: string;
  name: string;
  status: ModuleStatus;
}

/** Trivia modules. Only R&B is playable today; the rest are placeholders for future vaults. */
export const VAULT_MODULES: VaultModule[] = [
  { id: "rnb", name: "The R&B Vault", status: "live" },
  { id: "hiphop", name: "The Hip-Hop Vault", status: "soon" },
  { id: "jazz", name: "The Jazz Vault", status: "soon" },
  { id: "rock", name: "The Rock Vault", status: "soon" },
  { id: "blues", name: "The Blues Vault", status: "soon" },
  { id: "country", name: "The Country Vault", status: "soon" },
];

export const ACTIVE_MODULE = VAULT_MODULES[0];

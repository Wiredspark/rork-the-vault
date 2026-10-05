import { Link } from "react-router-dom";

import { VaultDial } from "@/components/vault/VaultDial";

const NotFound = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
    <VaultDial className="h-24 w-24 opacity-70" />
    <h1 className="mt-6 font-display text-6xl font-medium text-vault-ice">404</h1>
    <p className="mt-3 text-lg text-vault-ice/70">This room of the vault doesn't exist.</p>
    <Link to="/" className="neon-button mt-8 h-12">
      Return to the dashboard
    </Link>
  </div>
);

export default NotFound;

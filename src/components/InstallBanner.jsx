import { useState } from "react";
import { X, Download } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";

export default function InstallBanner({ onInstall, onDismiss }) {
  const [visible, setVisible] = useState(true);
  const { org } = useOrg();   // ← gets the correct org directly

  const appName = org?.company_name || "Academy";
  const logoUrl = org?.logo_light_url || "/icon-192x192.png";   // existing icon as fallback

  if (!visible) return null;

  function handleInstall() {
    onInstall();
    setVisible(false);
  }

  function handleDismiss() {
    setVisible(false);
    if (onDismiss) onDismiss();
  }

  return (
    <div className="bg-primary text-white px-4 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-3">
        <img src={logoUrl} alt="Logo" className="h-8 w-auto" />
        <div>
          <p className="text-sm font-montserrat font-semibold">Wondernest Learning Hub ERP</p>
          <p className="text-xs text-secondary-light">Install for a better experience</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="bg-white text-primary px-3 py-1.5 rounded-lg text-sm font-montserrat font-medium flex items-center gap-1 hover:bg-secondary-bg transition"
        >
          <Download size={16} />
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-primary-light transition"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
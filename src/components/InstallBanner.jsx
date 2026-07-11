import { useState } from "react";
import { X, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOrganization } from "../services/organizationService";

export default function InstallBanner({ onInstall, onDismiss }) {
  const [visible, setVisible] = useState(true);

  // Fetch dynamic light logo
  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: getOrganization,
    staleTime: 10 * 60 * 1000,
  });

  const logoUrl = org?.logo_light_url || "/ShreeVidhyalight.png";

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
          <p className="text-sm font-montserrat font-semibold">ShreeVidhya ERP</p>
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
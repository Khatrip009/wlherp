// src/components/DomainSettings.jsx
import { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";  // ✅ dynamic theme
import toast from "react-hot-toast";
import { Globe, CheckCircle, XCircle } from "lucide-react";

export default function DomainSettings() {
  const { org, setOrg } = useOrg();
  const theme = useTheme();
  const bodyFont = theme?.font_body || "Montserrat";

  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");

  useEffect(() => {
    if (org?.id) {
      supabase
        .from("organization_domains")
        .select("*")
        .eq("organization_id", org.id)
        .then(({ data }) => setDomains(data || []));
    }
  }, [org?.id]);

  const addDomain = async () => {
    if (!newDomain) return;
    const { data, error } = await supabase
      .from("organization_domains")
      .insert({
        organization_id: org.id,
        domain: newDomain,
        is_primary: false,
        verified: false,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setDomains([...domains, data]);
    setNewDomain("");
    toast.success("Domain added. Please verify it.");
  };

  const verifyDomain = async (domainId) => {
    // Call an edge function to verify domain (checks DNS)
    const { data, error } = await supabase.functions.invoke("verify-domain", {
      body: { domainId },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.verified) {
      setDomains(
        domains.map((d) => (d.id === domainId ? { ...d, verified: true } : d))
      );
      toast.success("Domain verified!");
    } else {
      toast.error("Verification failed. Check your DNS settings.");
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-primary-bg">
      <h2
        className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary"
        style={{ fontFamily: bodyFont }}
      >
        <Globe size={18} /> Custom Domain
      </h2>
      <div className="space-y-3">
        {domains.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between border border-primary-bg rounded-lg px-3 py-2"
          >
            <span className="text-primary-dark" style={{ fontFamily: bodyFont }}>
              {d.domain}
            </span>
            <span className="flex items-center gap-2">
              {d.verified ? (
                <CheckCircle className="text-primary" size={16} />
              ) : (
                <XCircle className="text-accent-dark" size={16} />
              )}
              {!d.verified && (
                <button
                  onClick={() => verifyDomain(d.id)}
                  className="text-xs bg-primary hover:bg-primary-light text-white px-2 py-1 rounded transition-colors"
                  style={{ fontFamily: bodyFont }}
                >
                  Verify
                </button>
              )}
            </span>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="erp.myacademy.com"
            className="flex-1 border border-primary-bg rounded-lg p-2 text-sm bg-white text-primary-dark placeholder-primary-dark/40"
            style={{ fontFamily: bodyFont }}
          />
          <button
            onClick={addDomain}
            className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            Add
          </button>
        </div>
        <p
          className="text-xs text-primary-dark/60 mt-1"
          style={{ fontFamily: bodyFont }}
        >
          Add a CNAME record pointing to your app to verify the domain.
        </p>
      </div>
    </div>
  );
}
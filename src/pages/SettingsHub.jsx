import AdminLayout from "../layouts/AdminLayout";
import HubCard from "../components/HubCard";
import {
  Settings, Building, Shield, Palette, Percent,
  FileText, UserCog,
} from "lucide-react";

const groups = [
  {
    label: "Organization",
    items: [
      { to: "/organization-settings", icon: Building, label: "Organization Settings", desc: "Name, logo, address and contact details" },
      { to: "/settings", icon: Settings, label: "General Settings", desc: "App-wide preferences" },
      { to: "/theme-settings", icon: Palette, label: "Theme Settings", desc: "Colors, fonts and branding" },
    ],
  },
  {
    label: "Tax & GST",
    items: [
      { to: "/tax-settings", icon: FileText, label: "Tax Settings", desc: "Configure tax rates" },
      { to: "/gst-settings", icon: Percent, label: "GST Settings", desc: "GST registration and configuration" },
    ],
  },
  {
    label: "Users & Security",
    items: [
      { to: "/user-management", icon: Shield, label: "User Management", desc: "Manage system login accounts and roles" },
    ],
  },
];

export default function SettingsHub() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Settings Hub</h1>
        <p className="text-sm text-secondary-dark mt-1">Organization, theme, tax, GST and user management</p>
      </div>
      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.label}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-secondary-light border-b pb-2 mb-4">{g.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {g.items.map((m) => <HubCard key={m.to} {...m} />)}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}

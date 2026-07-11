import { OrganizationProvider } from "../context/OrganizationContext";
import { Outlet } from "react-router-dom";

export default function AuthenticatedApp() {
  return (
    <OrganizationProvider>
      <Outlet />
    </OrganizationProvider>
  );
}
// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, profile, loading, orgAccessDenied } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (orgAccessDenied || profile.organization_id !== 3) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
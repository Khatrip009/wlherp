// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PUBLIC_AUTH_ROUTES = ["/settings", "/login"];

const STUDENT_ROUTES = [
  "/student",
  "/student/fees",
  "/student/batch",
  "/student/attendance",
  "/student/homework",
  "/student/results",
  "/student/certificates",
  "/student/profile",
  "/student/timetable",
  "/student/exams",
  "/student/resources",
  "/student/notifications",
  "/online-classes",
  "/online-classes/join",
];

const TEACHER_ROUTES = [
  "/teacher",
  "/teacher/salary",
  "/teacher/leaves",
  "/teacher/profile",
  "/teacher/calendar",
  "/teacher/timetable",
  "/attendance",
  "/attendance/mark/:sessionId",
  "/homework",
  "/exams",
  "/results",
  "/results/enter/:examId",
  "/results/view/:examId",
  "/teachers",
  "/settings",
  "/login",
  "/notifications",
  "/online-classes",
  "/online-classes/join",
  "/online-classes/create",
];

function normaliseRole(rawRole) {
  return (rawRole || "").toLowerCase().replace(/\s+/g, "_");
}

export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <div className="min-h-screen flex items-center justify-center">Loading profile...</div>;
  }

  const role = normaliseRole(profile.role);
  const currentPath = location.pathname;

  // Public authenticated routes (all roles)
  if (PUBLIC_AUTH_ROUTES.includes(currentPath)) {
    return children;
  }

  // Student
  if (role === "student") {
    if (STUDENT_ROUTES.some((r) => currentPath.startsWith(r.split(":")[0]))) {
      return children;
    }
    return <Navigate to="/student" replace />;
  }

  // Teacher
  if (role === "teacher") {
    if (TEACHER_ROUTES.some((r) => currentPath.startsWith(r.split(":")[0]))) {
      return children;
    }
    return <Navigate to="/teacher" replace />;
  }

  // All admin roles – full access (includes /reports and /reports/:reportId)
  const adminRoles = ["admin", "super_admin", "organization_admin", "branch_admin"];
  if (adminRoles.includes(role)) {
    return children;
  }

  // Parent role – no portal yet, show a holding page
  if (role === "parent") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-bg">
        <div className="text-center p-8">
          <h1 className="text-2xl font-righteous text-primary-dark mb-2">Parent Portal</h1>
          <p className="text-sm text-secondary font-montserrat">
            Coming soon. Please contact the academy for updates.
          </p>
        </div>
      </div>
    );
  }

  // Fallback
  return <Navigate to="/login" replace />;
}
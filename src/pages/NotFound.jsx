import { Link } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";

export default function NotFound() {
  return (
    <AdminLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-6xl font-righteous text-secondary-light">404</h1>
          <p className="text-xl text-secondary-dark font-montserrat mt-4">Page not found</p>
          <Link to="/" className="text-primary hover:underline mt-6 inline-block font-montserrat text-sm">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
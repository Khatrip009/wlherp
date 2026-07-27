import { Link } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";

export default function NotFound() {
  return (
    <AdminLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-6xl font-heading text-primary">
            404
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 font-body mt-4">
            Page not found
          </p>
          <Link
            to="/"
            className="text-primary hover:underline mt-6 inline-block font-body text-sm"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
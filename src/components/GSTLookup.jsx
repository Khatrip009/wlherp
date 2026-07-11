// src/components/GSTLookup.jsx
import { useState } from "react";
import { lookupGSTIN } from "../services/gstLookupService";
import { Loader, Search, CheckCircle, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function GSTLookup({
  gstin,
  onSuccess,
  buttonText = "Fetch GST Details",
  className = "",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState(false);

  const handleLookup = async () => {
    if (!gstin || gstin.trim().length === 0) {
      toast.error("Please enter a GSTIN first.");
      return;
    }

    setLoading(true);
    setError(null);
    setFetched(false);

    try {
      const data = await lookupGSTIN(gstin);
      setFetched(true);
      toast.success("GST details fetched successfully!");
      if (onSuccess) {
        onSuccess(data);
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Failed to fetch GST details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading || !gstin}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              {buttonText}
            </>
          )}
        </button>
        {fetched && !error && (
          <span className="text-green-600 text-sm flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            Fetched
          </span>
        )}
        {error && (
          <span className="text-red-600 text-sm flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {error}
          </span>
        )}
      </div>
      {fetched && !error && (
        <p className="text-xs text-green-600">
          ✓ Details loaded successfully. Please review and save.
        </p>
      )}
    </div>
  );
}
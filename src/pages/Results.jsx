// src/pages/Results.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Award, Edit3, Eye, AlertCircle } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";
import { getAllExams } from "../services/examService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";

export default function Results() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin";

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const {
    data: exams = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["all-exams", branchId, financialYearId],
    queryFn: async () => {
      const result = await getAllExams(branchId, financialYearId);
      if (!result) throw new Error("No data returned");
      return result;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = exams.filter((exam) =>
    exam.exam_name.toLowerCase().includes(search.toLowerCase())
  );

  if (isError) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-red-600">
          <AlertCircle size={32} className="mx-auto mb-2" />
          <p>Failed to load exams.</p>
          <p className="text-sm mt-1">{error?.message || "Unknown error"}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <BackButton to="/academics-hub" label="Academics Hub" />
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Results</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Enter and view exam results
        </p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="text"
          placeholder="Search exam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Exam</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Total Marks</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    Loading exams…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-secondary-light" />
                      <span>No exams found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((exam) => (
                  <tr
                    key={exam.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium">{exam.exam_name}</td>
                    <td className="p-3 text-sm">{exam.batches?.batch_name}</td>
                    <td className="p-3 text-sm">{exam.batches?.mediums?.name || "—"}</td>
                    <td className="p-3 text-sm">{exam.exam_date}</td>
                    <td className="p-3 text-sm">{exam.total_marks || "-"}</td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        {isAdmin && (
                          <button
                            onClick={() => navigate(`/results/enter/${exam.id}`)}
                            className="text-green-600 hover:underline flex items-center gap-1"
                          >
                            <Edit3 size={15} /> Enter Results
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/results/view/${exam.id}`)}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Eye size={15} /> View Results
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
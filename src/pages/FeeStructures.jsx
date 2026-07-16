// src/pages/FeeStructures.jsx
import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search, Plus, Edit3, Trash2 } from "lucide-react";
import { supabase } from "../api/supabase";
import FeeStructureForm from "../components/FeeStructureForm";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { deleteFeeStructure } from "../services/feeService";

// Fetch fee structures with components (including tax rates) – scoped to branch & FY
async function getFeeStructures({ pageParam = 0, filters = {}, branchId, financialYearId }) {
  const limit = 100;
  let query = supabase
    .from("fee_structures")
    .select(
      `*,
      courses(course_name),
      fee_structure_components(
        *,
        tax_rates(id, name, rate)
      )`
    )
    .order("id")
    .range(pageParam * limit, (pageParam + 1) * limit - 1);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(`courses.course_name.ilike.%${filters.search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count };
}

export default function FeeStructures() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["fee-structures", search, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getFeeStructures({ pageParam, filters: { search }, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const feeStructures = data?.pages.flatMap((page) => page.data) || [];

  const deleteMut = useMutation({
    mutationFn: (id) => deleteFeeStructure(id, ctx),
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries(["fee-structures"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (fs) => {
    setEditing(fs);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    queryClient.invalidateQueries(["fee-structures"]);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/accounting" label="Finance & Accounting Hub" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Fee Structures
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Define fee amounts and components for each course
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus size={16} /> Add Structure
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          placeholder="Search by course..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Course</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Fee</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Components</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : feeStructures.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No fee structures.
                  </td>
                </tr>
              ) : (
                feeStructures.map((fs) => (
                  <tr
                    key={fs.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {fs.courses?.course_name || "—"}
                    </td>
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      ₹ {Number(fs.fee_amount).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {fs.fee_structure_components?.map((comp) => (
                          <span
                            key={comp.id}
                            className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs"
                          >
                            {comp.component_name}: ₹{Number(comp.amount).toLocaleString("en-IN")}
                            {comp.tax_rates && (
                              <span className="ml-1 text-gray-500 dark:text-gray-400 text-[10px]">
                                ({comp.tax_rates.name} {comp.tax_rates.rate}%)
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(fs)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this structure?")) deleteMut.mutate(fs.id);
                          }}
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          <Trash2 size={15} />
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

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => fetchNextPage()}
            className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {isFetchingNextPage ? "Loading…" : "Load More"}
          </button>
        </div>
      )}

      {/* FeeStructureForm modal */}
      <FeeStructureForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={handleFormSuccess}
        initialData={editing}
      />
    </div>
  );
}
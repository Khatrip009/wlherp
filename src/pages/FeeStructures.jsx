// src/pages/FeeStructures.jsx
import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search, Plus, Edit3, Trash2 } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import FeeStructureForm from "../components/FeeStructureForm";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { deleteFeeStructure } from "../services/feeService";   // scoped service

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

  // Delete mutation – uses scoped service
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
    <AdminLayout>
      <BackButton to="/accounting" label="Finance & Accounting Hub" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Fee Structures</h1>
        <button
          onClick={openCreate}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Plus size={16} /> Add Structure
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input
          type="text"
          placeholder="Search by course..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm">Course</th>
                <th className="p-3 text-left text-sm">Total Fee</th>
                <th className="p-3 text-left text-sm">Components</th>
                <th className="p-3 text-left text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="p-6 text-center">Loading…</td></tr>
              ) : feeStructures.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-secondary">No fee structures.</td></tr>
              ) : (
                feeStructures.map((fs) => (
                  <tr key={fs.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-sm">{fs.courses?.course_name || "—"}</td>
                    <td className="p-3 text-sm font-medium">
                      ₹ {Number(fs.fee_amount).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {fs.fee_structure_components?.map((comp) => (
                          <span
                            key={comp.id}
                            className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs"
                          >
                            {comp.component_name}: ₹{Number(comp.amount).toLocaleString("en-IN")}
                            {comp.tax_rates && (
                              <span className="ml-1 text-gray-500 text-[10px]">
                                ({comp.tax_rates.name} {comp.tax_rates.rate}%)
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-sm">
                      <button
                        onClick={() => openEdit(fs)}
                        className="text-blue-600 mr-2 hover:underline"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("Delete this structure?")) deleteMut.mutate(fs.id);
                        }}
                        className="text-red-600 hover:underline"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {hasNextPage && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => fetchNextPage()}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm"
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
    </AdminLayout>
  );
}
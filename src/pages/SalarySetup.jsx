import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveTeachers, updateTeacherSalary } from "../services/teacherService";
import toast from "react-hot-toast";
import { Search, Save, RefreshCw } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";

export default function SalarySetup() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["active-teachers-salary", branchId, financialYearId],
    queryFn: () => getActiveTeachers(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const filteredTeachers = useMemo(() => {
    if (!search.trim()) return teachers;
    const term = search.toLowerCase();
    return teachers.filter(
      (t) =>
        `${t.first_name} ${t.last_name}`.toLowerCase().includes(term) ||
        (t.employee_code || "").toLowerCase().includes(term)
    );
  }, [teachers, search]);

  const mutation = useMutation({
    mutationFn: ({ id, payload }) => updateTeacherSalary(id, payload, ctx),
    onSuccess: () => {
      toast.success("Salary settings updated");
      qc.invalidateQueries(["active-teachers-salary"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleChange = (teacherId, field, value) => {
    mutation.mutate({ id: teacherId, payload: { [field]: value } });
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Salary Setup</h1>
        <div className="relative mt-2 sm:mt-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-light w-4 h-4" />
          <input
            type="text"
            placeholder="Search teacher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border rounded-lg text-sm w-full sm:w-64 focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Teacher</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Monthly Salary</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Per Lecture</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">TDS %</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-secondary">Loading teachers...</td>
                </tr>
              ) : filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-secondary">No active teachers found.</td>
                </tr>
              ) : (
                filteredTeachers.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{t.first_name} {t.last_name}</div>
                      <div className="text-xs text-secondary-light">{t.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={t.salary_type || "fixed"}
                        onChange={(e) => handleChange(t.id, "salary_type", e.target.value)}
                        className="border rounded p-1.5 text-sm bg-white focus:ring-1 focus:ring-primary"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="lecture_based">Lecture</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={t.monthly_salary || ""}
                        onChange={(e) => handleChange(t.id, "monthly_salary", e.target.value)}
                        className="w-28 border rounded p-1.5 text-sm focus:ring-1 focus:ring-primary"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={t.per_lecture_rate || ""}
                        onChange={(e) => handleChange(t.id, "per_lecture_rate", e.target.value)}
                        className="w-28 border rounded p-1.5 text-sm focus:ring-1 focus:ring-primary"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={t.tds_percentage || "10.00"}
                        onChange={(e) => handleChange(t.id, "tds_percentage", e.target.value)}
                        className="w-20 border rounded p-1.5 text-sm focus:ring-1 focus:ring-primary"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredTeachers.length > 0 && (
          <div className="px-4 py-2 text-xs text-secondary-light border-t">
            Showing {filteredTeachers.length} of {teachers.length} teachers
          </div>
        )}
      </div>
    </>
  );
}
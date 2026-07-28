// src/pages/TeacherSalarySettings.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTeacherWithSalary, updateTeacherSalary } from "../services/teacherService";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { useOrg } from "../context/OrganizationContext";

export default function TeacherSalarySettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Branch & financial year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const { data: teacher, isLoading } = useQuery({
    queryKey: ["teacher-salary", id, branchId, financialYearId],
    queryFn: () => getTeacherWithSalary(id, branchId, financialYearId),
    enabled: !!id && !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const [form, setForm] = useState({
    salary_type: "fixed",
    monthly_salary: "",
    per_lecture_rate: "",
    tds_percentage: "10.00",
  });

  useEffect(() => {
    if (teacher) {
      setForm({
        salary_type: teacher.salary_type || "fixed",
        monthly_salary: teacher.monthly_salary || "",
        per_lecture_rate: teacher.per_lecture_rate || "",
        tds_percentage: teacher.tds_percentage || "10.00",
      });
    }
  }, [teacher]);

  const mutation = useMutation({
    mutationFn: (payload) => updateTeacherSalary(id, payload, ctx),
    onSuccess: () => {
      toast.success("Salary settings updated");
      qc.invalidateQueries(["teacher-salary"]);
      navigate("/teachers");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  if (isLoading) return <AdminLayout><div>Loading...</div></AdminLayout>;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-6">
        Salary Settings – {teacher?.first_name} {teacher?.last_name}
      </h1>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-accent p-6 rounded-lg shadow max-w-lg space-y-4 border border-gray-200 dark:border-gray-700">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Salary Type</label>
          <select
            value={form.salary_type}
            onChange={(e) => setForm({ ...form, salary_type: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 focus:ring-2 focus:ring-primary outline-none"
          >
            <option value="fixed">Fixed Monthly</option>
            <option value="lecture_based">Lecture‑based</option>
          </select>
        </div>
        {form.salary_type === "fixed" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Salary (₹)</label>
            <input
              type="number"
              value={form.monthly_salary}
              onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 focus:ring-2 focus:ring-primary outline-none"
              required
            />
          </div>
        )}
        {form.salary_type === "lecture_based" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Per Lecture Rate (₹)</label>
            <input
              type="number"
              value={form.per_lecture_rate}
              onChange={(e) => setForm({ ...form, per_lecture_rate: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 focus:ring-2 focus:ring-primary outline-none"
              required
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">TDS Percentage (%)</label>
          <input
            type="number"
            step="0.01"
            value={form.tds_percentage}
            onChange={(e) => setForm({ ...form, tds_percentage: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 focus:ring-2 focus:ring-primary outline-none"
            required
          />
        </div>
        <button type="submit" className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded transition-colors">
          Save Settings
        </button>
      </form>
    </AdminLayout>
  );
}
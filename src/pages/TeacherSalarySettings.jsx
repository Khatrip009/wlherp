// src/pages/TeacherSalarySettings.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTeacherWithSalary, updateTeacherSalary } from "../services/teacherService";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function TeacherSalarySettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Branch & financial year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const { data: teacher, isLoading } = useQuery({
    queryKey: ["teacher-salary", id],
    queryFn: () => getTeacherWithSalary(id),
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
    mutationFn: (payload) => updateTeacherSalary(id, payload, ctx),   // pass context
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
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium">Salary Type</label>
          <select
            value={form.salary_type}
            onChange={(e) => setForm({ ...form, salary_type: e.target.value })}
            className="w-full border rounded p-2"
          >
            <option value="fixed">Fixed Monthly</option>
            <option value="lecture_based">Lecture‑based</option>
          </select>
        </div>
        {form.salary_type === "fixed" && (
          <div>
            <label className="block text-sm font-medium">Monthly Salary (₹)</label>
            <input
              type="number"
              value={form.monthly_salary}
              onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
              className="w-full border rounded p-2"
              required
            />
          </div>
        )}
        {form.salary_type === "lecture_based" && (
          <div>
            <label className="block text-sm font-medium">Per Lecture Rate (₹)</label>
            <input
              type="number"
              value={form.per_lecture_rate}
              onChange={(e) => setForm({ ...form, per_lecture_rate: e.target.value })}
              className="w-full border rounded p-2"
              required
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium">TDS Percentage (%)</label>
          <input
            type="number"
            step="0.01"
            value={form.tds_percentage}
            onChange={(e) => setForm({ ...form, tds_percentage: e.target.value })}
            className="w-full border rounded p-2"
            required
          />
        </div>
        <button type="submit" className="bg-primary text-white px-4 py-2 rounded">
          Save Settings
        </button>
      </form>
    </AdminLayout>
  );
}
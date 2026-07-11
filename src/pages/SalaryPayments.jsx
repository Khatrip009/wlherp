// src/pages/SalaryPayments.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalaryPayments } from "../services/salaryService";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { Search, Download, Filter, X } from "lucide-react";
import Papa from "papaparse";
import toast from "react-hot-toast";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function SalaryPayments() {
  // ── Context for potential future writes – not currently used ──
  useOrg();   // just to have it available, no mutations here

  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["salary-payments"],
    queryFn: getSalaryPayments,
  });

  const filteredPayments = useMemo(() => {
    let list = payments;
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(
        (p) =>
          `${p.teachers?.first_name} ${p.teachers?.last_name}`.toLowerCase().includes(term) ||
          (p.teachers?.employee_code || "").toLowerCase().includes(term)
      );
    }
    if (teacherFilter) {
      list = list.filter((p) => p.teacher_id === Number(teacherFilter));
    }
    if (startDate) {
      list = list.filter((p) => p.payment_date >= startDate);
    }
    if (endDate) {
      list = list.filter((p) => p.payment_date <= endDate);
    }
    return list;
  }, [payments, search, teacherFilter, startDate, endDate]);

  const totalGross = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalTDS = filteredPayments.reduce((s, p) => s + (p.tds_amount || 0), 0);
  const totalNet = filteredPayments.reduce((s, p) => s + (p.net_amount || 0), 0);

  const handleExport = () => {
    if (!filteredPayments.length) {
      toast.error("No data to export");
      return;
    }
    const csv = Papa.unparse(
      filteredPayments.map((p) => ({
        Teacher: `${p.teachers?.first_name} ${p.teachers?.last_name}`,
        Date: p.payment_date,
        Gross: p.amount,
        TDS: p.tds_amount,
        Net: p.net_amount,
        Type: p.payment_type,
        Mode: p.payment_mode,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salary_payments.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get unique teachers for filter
  const teacherOptions = useMemo(() => {
    const map = {};
    payments.forEach((p) => {
      if (p.teacher_id && p.teachers) {
        map[p.teacher_id] = `${p.teachers.first_name} ${p.teachers.last_name}`;
      }
    });
    return Object.entries(map).map(([id, name]) => ({ id: Number(id), name }));
  }, [payments]);

  return (
    <AdminLayout>
      <BackButton to="/hr-hub" label="HR & Staff" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Salary Payments</h1>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <button
            onClick={handleExport}
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" />
            Filters {showFilters && <X className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-light w-4 h-4" />
          <input
            type="text"
            placeholder="Search by teacher name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary"
          />
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-3">
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary"
            >
              <option value="">All Teachers</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary"
              placeholder="From"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary"
              placeholder="To"
            />
            <button
              onClick={() => {
                setTeacherFilter("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-primary text-sm hover:underline"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {filteredPayments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Gross Total</p>
            <p className="text-xl font-bold text-primary">₹ {totalGross.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Total TDS</p>
            <p className="text-xl font-bold text-red-600">₹ {totalTDS.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Net Total</p>
            <p className="text-xl font-bold text-green-600">₹ {totalNet.toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Teacher</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Date</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">Gross</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">TDS %</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">TDS Amount</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">Net</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Mode</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-secondary">
                    Loading payments...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-secondary">
                    No salary payments found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">
                        {p.teachers?.first_name} {p.teachers?.last_name}
                      </div>
                      <div className="text-xs text-secondary-light">{p.teachers?.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{p.payment_date}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      ₹ {p.amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{p.tds_percentage || 0}%</td>
                    <td className="px-4 py-3 text-right text-sm">₹ {p.tds_amount?.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-green-700">
                      ₹ {p.net_amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.payment_type === "fixed" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                      }`}>
                        {p.payment_type || "fixed"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{p.payment_mode || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredPayments.length > 0 && (
          <div className="px-4 py-2 text-xs text-secondary-light border-t">
            Showing {filteredPayments.length} of {payments.length} payments
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
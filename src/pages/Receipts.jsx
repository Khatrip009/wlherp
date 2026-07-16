// src/pages/Receipts.jsx
import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Printer, Download, Filter, X, Layers, BookOpen, GraduationCap, User } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { generateReceiptPdf } from "../utils/receiptPdf";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";

export default function Receipts({ noLayout = false }) {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    course_id: "",
    batch_id: "",
    medium_id: "",
    student_id: "",
    start_date: "",
    end_date: "",
  });

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, course_name").eq("status", true).order("course_name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("batches").select("id, batch_name").eq("status", "active").order("batch_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("mediums").select("id, name").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: ["students-list", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("students").select("id, first_name, last_name, admission_no, medium_id").order("first_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["receipts", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("receipts")
        .select(`*, students ( id, first_name, last_name, admission_no, medium_id ), fee_payments ( payment_mode, transaction_no, student_fee_id )`)
        .order("receipt_date", { ascending: false })
        .limit(500);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: filteredStudentIds = null } = useQuery({
    queryKey: ["filtered-student-ids", filters.course_id, filters.batch_id, filters.medium_id, branchId, financialYearId],
    queryFn: async () => {
      if (!filters.course_id && !filters.batch_id && !filters.medium_id) return null;
      let studentIds = new Set();
      if (filters.medium_id) {
        let query = supabase.from("students").select("id").eq("medium_id", filters.medium_id);
        if (branchId) query = query.eq("branch_id", branchId);
        if (financialYearId) query = query.eq("financial_year_id", financialYearId);
        const { data: studentsByMedium } = await query;
        studentsByMedium?.forEach((s) => studentIds.add(s.id));
        if (studentIds.size === 0) return [];
      }
      if (filters.batch_id) {
        let query = supabase.from("student_batches").select("student_id").eq("batch_id", filters.batch_id).eq("status", "active");
        if (branchId) query = query.eq("branch_id", branchId);
        if (financialYearId) query = query.eq("financial_year_id", financialYearId);
        const { data: batchStudents } = await query;
        const batchStudentIds = new Set(batchStudents?.map((bs) => bs.student_id) || []);
        if (studentIds.size > 0) {
          studentIds = new Set([...studentIds].filter((id) => batchStudentIds.has(id)));
        } else {
          studentIds = batchStudentIds;
        }
        if (studentIds.size === 0) return [];
      }
      if (filters.course_id) {
        let query = supabase.from("batches").select("id").eq("course_id", filters.course_id);
        if (branchId) query = query.eq("branch_id", branchId);
        if (financialYearId) query = query.eq("financial_year_id", financialYearId);
        const { data: courseBatches } = await query;
        const batchIds = courseBatches?.map((b) => b.id) || [];
        if (batchIds.length === 0) return [];
        let courseStudentsQuery = supabase.from("student_batches").select("student_id").in("batch_id", batchIds).eq("status", "active");
        if (branchId) courseStudentsQuery = courseStudentsQuery.eq("branch_id", branchId);
        if (financialYearId) courseStudentsQuery = courseStudentsQuery.eq("financial_year_id", financialYearId);
        const { data: courseStudents } = await courseStudentsQuery;
        const courseStudentIds = new Set(courseStudents?.map((cs) => cs.student_id) || []);
        if (studentIds.size > 0) {
          studentIds = new Set([...studentIds].filter((id) => courseStudentIds.has(id)));
        } else {
          studentIds = courseStudentIds;
        }
      }
      return Array.from(studentIds);
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const filteredReceipts = useMemo(() => {
    let result = receipts;
    if (filters.start_date) result = result.filter((r) => r.receipt_date >= filters.start_date);
    if (filters.end_date) result = result.filter((r) => r.receipt_date <= filters.end_date);
    if (filters.student_id) result = result.filter((r) => r.students?.id == filters.student_id);
    if (filteredStudentIds !== null) {
      const idSet = new Set(filteredStudentIds);
      result = result.filter((r) => idSet.has(r.students?.id));
    }
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.receipt_no.toLowerCase().includes(term) ||
          r.students?.first_name?.toLowerCase().includes(term) ||
          r.students?.last_name?.toLowerCase().includes(term) ||
          r.students?.admission_no?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [receipts, filters, search, filteredStudentIds]);

  const filteredStudents = useMemo(() => {
    if (!filters.course_id && !filters.batch_id && !filters.medium_id) return allStudents;
    if (!filteredStudentIds) return allStudents;
    const idSet = new Set(filteredStudentIds);
    return allStudents.filter((s) => idSet.has(s.id));
  }, [allStudents, filteredStudentIds, filters]);

  async function handleDownloadPdf(receipt) {
    try {
      await generateReceiptPdf(receipt);
    } catch (err) {
      console.error("PDF generation failed", err);
      const printWindow = window.open("", "_blank");
      printWindow.document.write(
        `<html><head><title>Receipt</title></head><body>` +
        `<h2>ShreeVidhya Academy</h2>` +
        `<p>Receipt No: ${receipt.receipt_no}</p>` +
        `<p>Date: ${receipt.receipt_date}</p>` +
        `<p>Student: ${receipt.students?.first_name} ${receipt.students?.last_name} (${receipt.students?.admission_no})</p>` +
        `<p>Amount: ₹${Number(receipt.amount).toLocaleString()}</p>` +
        `<p>Payment Mode: ${receipt.fee_payments?.payment_mode || "N/A"}</p>` +
        `</body></html>`
      );
      printWindow.document.close();
      printWindow.print();
    }
  }

  const clearFilters = () => {
    setFilters({ course_id: "", batch_id: "", medium_id: "", student_id: "", start_date: "", end_date: "" });
    setSearch("");
  };

  const content = (
    <>
      {!noLayout && <BackButton to="/accounting" label="Finance & Accounting Hub" />}
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Receipts</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">View and download fee receipts</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by receipt no, student name, or admission no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2 self-start"
        >
          <Filter size={18} /> Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark"><BookOpen size={14} className="inline mr-1" /> Course</label>
            <select
              value={filters.course_id}
              onChange={(e) => setFilters({ ...filters, course_id: e.target.value, batch_id: "", student_id: "" })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark"><Layers size={14} className="inline mr-1" /> Batch</label>
            <select
              value={filters.batch_id}
              onChange={(e) => setFilters({ ...filters, batch_id: e.target.value, student_id: "" })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Batches</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark"><GraduationCap size={14} className="inline mr-1" /> Medium</label>
            <select
              value={filters.medium_id}
              onChange={(e) => setFilters({ ...filters, medium_id: e.target.value, student_id: "" })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark"><User size={14} className="inline mr-1" /> Student</label>
            <select
              value={filters.student_id}
              onChange={(e) => setFilters({ ...filters, student_id: e.target.value })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Students</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.admission_no})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">From Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">To Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1"
            />
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="text-primary text-sm hover:underline">Clear Filters</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Receipt No</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Student</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Amount</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Mode</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">Loading receipts…</td></tr>
              ) : filteredReceipts.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">
                  <div className="flex flex-col items-center gap-2">
                    <Printer size={32} className="text-secondary-light" />
                    <span>No receipts found</span>
                    <span className="text-xs text-secondary-light">{search || Object.values(filters).some(Boolean) ? "Try adjusting your filters" : ""}</span>
                  </div>
                </td></tr>
              ) : (
                filteredReceipts.map((receipt) => (
                  <tr key={receipt.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm font-medium">{receipt.receipt_no}</td>
                    <td className="text-sm">{receipt.receipt_date}</td>
                    <td className="text-sm">
                      {receipt.students?.first_name} {receipt.students?.last_name}{" "}
                      <span className="text-xs text-secondary-light">({receipt.students?.admission_no})</span>
                    </td>
                    <td className="text-sm font-semibold">₹{Number(receipt.amount).toLocaleString("en-IN")}</td>
                    <td className="text-sm">{receipt.fee_payments?.payment_mode || "-"}</td>
                    <td className="text-sm">
                      <button onClick={() => handleDownloadPdf(receipt)} className="text-primary hover:underline flex items-center gap-1">
                        <Download size={16} /> PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  return noLayout ? content : <AdminLayout>{content}</AdminLayout>;
}
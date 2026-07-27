// src/pages/Receipts.jsx
import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Printer,
  Download,
  Filter,
  X,
  Layers,
  BookOpen,
  GraduationCap,
  User,
  Mail,
} from "lucide-react";
import toast from "react-hot-toast";

import { supabase } from "../api/supabase";
import { generateReceiptPdf } from "../utils/receiptPdf";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

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
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme(); // full theme object
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map((p) => p.email).filter(Boolean) || [];
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (filteredReceipts.length === 0) {
      alert("No receipts to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      let tableRows = filteredReceipts
        .map(
          (r) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.receipt_no}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.receipt_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${
            r.students?.first_name || ""
          } ${r.students?.last_name || ""}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(
            r.amount
          ).toLocaleString("en-IN")}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${
            r.fee_payments?.payment_mode || "—"
          }</td>
        </tr>
      `
        )
        .join("");

      const totalAmount = filteredReceipts.reduce((sum, r) => sum + Number(r.amount), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:${theme.primary_color};">Receipt Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || "N/A"}</p>
          <p><strong>Total Receipts:</strong> ${filteredReceipts.length}</p>
          <p><strong>Total Amount:</strong> ₹ ${totalAmount.toLocaleString("en-IN")}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:${
              theme.primary_light_color || "#e3f2fd"
            };">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Receipt No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Amount</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mode</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="3" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalAmount.toLocaleString(
                  "en-IN"
                )}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${
            org?.company_name || "Academy"
          }</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Receipt Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Resend Receipt Email ──────────────────────────────────────────
  const resendReceiptEmail = async (receipt) => {
    setSendingEmailId(receipt.id);
    try {
      const student = receipt.students;
      if (!student) {
        toast.error("Student not found for this receipt.");
        setSendingEmailId(null);
        return;
      }

      let recipientEmail = student.email;
      const { data: parent, error: parentError } = await supabase
        .from("student_parents")
        .select("parents!inner(email)")
        .eq("student_id", student.id)
        .maybeSingle();
      if (!parentError && parent && parent.parents?.email) {
        recipientEmail = parent.parents.email;
      }

      if (!recipientEmail) {
        toast.error("No email found for this student or parent.");
        setSendingEmailId(null);
        return;
      }

      const context = {
        academyName: org?.company_name || "Academy",
        studentName: `${student.first_name || ""} ${student.last_name || ""}`.trim(),
        receiptNo: receipt.receipt_no,
        amount: Number(receipt.amount).toLocaleString("en-IN"),
        paymentDate: receipt.receipt_date,
        paymentMode: receipt.fee_payments?.payment_mode || "N/A",
        transactionNo: receipt.fee_payments?.transaction_no || "",
        balanceDue: "0",
      };

      await sendTemplateEmail({
        to: recipientEmail,
        organizationId: org?.id,
        slug: "fee_receipt",
        context,
        branchId,
      });

      toast.success(`Receipt sent to ${recipientEmail}`);
    } catch (err) {
      console.error("Resend error:", err);
      toast.error("Failed to send receipt email.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ─── Queries (unchanged) ────────────────────────────────────────────
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, course_name")
        .eq("status", true)
        .order("course_name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select("id, batch_name")
        .eq("status", "active")
        .order("batch_name");
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
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, medium_id")
        .order("first_name");
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
        .select(
          `*, students ( id, first_name, last_name, admission_no, medium_id ), fee_payments ( payment_mode, transaction_no, student_fee_id )`
        )
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
    queryKey: [
      "filtered-student-ids",
      filters.course_id,
      filters.batch_id,
      filters.medium_id,
      branchId,
      financialYearId,
    ],
    queryFn: async () => {
      if (!filters.course_id && !filters.batch_id && !filters.medium_id) return null;
      let studentIds = new Set();
      if (filters.medium_id) {
        let query = supabase
          .from("students")
          .select("id")
          .eq("medium_id", filters.medium_id);
        if (branchId) query = query.eq("branch_id", branchId);
        if (financialYearId) query = query.eq("financial_year_id", financialYearId);
        const { data: studentsByMedium } = await query;
        studentsByMedium?.forEach((s) => studentIds.add(s.id));
        if (studentIds.size === 0) return [];
      }
      if (filters.batch_id) {
        let query = supabase
          .from("student_batches")
          .select("student_id")
          .eq("batch_id", filters.batch_id)
          .eq("status", "active");
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
        let query = supabase
          .from("batches")
          .select("id")
          .eq("course_id", filters.course_id);
        if (branchId) query = query.eq("branch_id", branchId);
        if (financialYearId) query = query.eq("financial_year_id", financialYearId);
        const { data: courseBatches } = await query;
        const batchIds = courseBatches?.map((b) => b.id) || [];
        if (batchIds.length === 0) return [];
        let courseStudentsQuery = supabase
          .from("student_batches")
          .select("student_id")
          .in("batch_id", batchIds)
          .eq("status", "active");
        if (branchId) courseStudentsQuery = courseStudentsQuery.eq("branch_id", branchId);
        if (financialYearId)
          courseStudentsQuery = courseStudentsQuery.eq("financial_year_id", financialYearId);
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

  // ─── Memoized filtered data ────────────────────────────────────────
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const filteredStudents = useMemo(() => {
    if (!filters.course_id && !filters.batch_id && !filters.medium_id) return allStudents;
    if (!filteredStudentIds) return allStudents;
    const idSet = new Set(filteredStudentIds);
    return allStudents.filter((s) => idSet.has(s.id));
  }, [allStudents, filteredStudentIds, filters]);

  async function handleDownloadPdf(receipt) {
    try {
      await generateReceiptPdf(receipt, { theme });
    } catch (err) {
      console.error("PDF generation failed", err);
      const printWindow = window.open("", "_blank");
      printWindow.document.write(
        `<html><head><title>Receipt</title></head><body>` +
          `<h2>${org?.company_name || "Academy"}</h2>` +
          `<p>Receipt No: ${receipt.receipt_no}</p>` +
          `<p>Date: ${receipt.receipt_date}</p>` +
          `<p>Student: ${receipt.students?.first_name} ${receipt.students?.last_name} (${
            receipt.students?.admission_no
          })</p>` +
          `<p>Amount: ₹${Number(receipt.amount).toLocaleString()}</p>` +
          `<p>Payment Mode: ${receipt.fee_payments?.payment_mode || "N/A"}</p>` +
          `</body></html>`
      );
      printWindow.document.close();
      printWindow.print();
    }
  }

  const clearFilters = () => {
    setFilters({
      course_id: "",
      batch_id: "",
      medium_id: "",
      student_id: "",
      start_date: "",
      end_date: "",
    });
    setSearch("");
  };

  const content = (
    <>
      {!noLayout && <BackButton to="/accounting" label="Finance & Accounting Hub" />}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-heading text-primary-dark">Receipts</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body mt-1">
            View and download fee receipts
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sendReportEmail}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 font-body"
          >
            <Mail size={16} /> Send Report
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            placeholder="Search by receipt no, student name, or admission no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-body text-sm flex items-center gap-2 self-start"
        >
          <Filter size={18} /> Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white dark:bg-accent rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border border-gray-200 dark:border-gray-700">
          <div>
            <label className="text-xs font-body text-gray-700 dark:text-gray-300">
              <BookOpen size={14} className="inline mr-1" /> Course
            </label>
            <select
              value={filters.course_id}
              onChange={(e) =>
                setFilters({ ...filters, course_id: e.target.value, batch_id: "", student_id: "" })
              }
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1 focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-body text-gray-700 dark:text-gray-300">
              <Layers size={14} className="inline mr-1" /> Batch
            </label>
            <select
              value={filters.batch_id}
              onChange={(e) =>
                setFilters({ ...filters, batch_id: e.target.value, student_id: "" })
              }
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1 focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-body text-gray-700 dark:text-gray-300">
              <GraduationCap size={14} className="inline mr-1" /> Medium
            </label>
            <select
              value={filters.medium_id}
              onChange={(e) =>
                setFilters({ ...filters, medium_id: e.target.value, student_id: "" })
              }
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1 focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-body text-gray-700 dark:text-gray-300">
              <User size={14} className="inline mr-1" /> Student
            </label>
            <select
              value={filters.student_id}
              onChange={(e) => setFilters({ ...filters, student_id: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1 focus:ring-2 focus:ring-primary outline-none"
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
            <label className="text-xs font-body text-gray-700 dark:text-gray-300">From Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-body text-gray-700 dark:text-gray-300">To Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1"
            />
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="text-primary text-sm hover:underline font-body">
              Clear Filters
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Receipt No
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Student
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Mode
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading receipts…
                  </td>
                </tr>
              ) : filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Printer size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No receipts found</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {search || Object.values(filters).some(Boolean)
                          ? "Try adjusting your filters"
                          : ""}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((receipt) => (
                  <tr
                    key={receipt.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {receipt.receipt_no}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {receipt.receipt_date}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {receipt.students?.first_name} {receipt.students?.last_name}{" "}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        ({receipt.students?.admission_no})
                      </span>
                    </td>
                    <td className="p-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      ₹{Number(receipt.amount).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {receipt.fee_payments?.payment_mode || "-"}
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => resendReceiptEmail(receipt)}
                          disabled={sendingEmailId === receipt.id}
                          className="text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                          title="Resend receipt email"
                        >
                          <Mail size={16} />
                          {sendingEmailId === receipt.id ? "..." : ""}
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(receipt)}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <Download size={16} /> PDF
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
    </>
  );

  return noLayout ? content : <>{content}</>;
}
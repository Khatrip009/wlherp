// src/pages/Certificates.jsx
import React, { useState, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Filter,
  Download,
  Upload,
  X,
  Award,
  Printer,
  Mail,
} from "lucide-react"; // 👈 Added Mail
import Papa from "papaparse";
import CertificateForm from "../components/CertificateForm";
import BackButton from "../components/BackButton";
import {
  getCertificates,
  createCertificate,
  deleteCertificate,
  getAllCertificatesForExport,
} from "../services/certificateService";
import { generateCertificatePdf } from "../utils/certificatePdf";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { sendTemplateEmail, sendEmail } from "../services/emailService"; // 👈 Import

export default function Certificates() {
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear, org } = useOrg(); // 👈 Added org
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const fileInputRef = useRef(null);

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
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Query ──────────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["certificates", { search }, branchId, financialYearId],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = 20;
      const from = pageParam * limit;
      const to = from + limit - 1;

      let query = supabase
        .from("certificates")
        .select(
          `*,
          students ( first_name, last_name, admission_no, email ),
          courses ( course_name ),
          course_levels ( level_name )`,
          { count: "exact" }
        )
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("issue_date", { ascending: false })
        .range(from, to);

      if (search) {
        query = query.or(
          `certificate_no.ilike.%${search}%,students.first_name.ilike.%${search}%,students.last_name.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], count };
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const certificates = data?.pages.flatMap((page) => page.data) || [];

  // ─── Mutations ──────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => createCertificate(payload, { branchId, financialYearId }),
    onSuccess: () => {
      toast.success("Certificate issued");
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to issue certificate"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCertificate(id, { branchId, financialYearId }),
    onSuccess: () => {
      toast.success("Certificate deleted");
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // ─── Send certificate email manually ──────────────────────────────
  const sendCertificateEmailMutation = useMutation({
    mutationFn: async (cert) => {
      // Build context similar to what the service does
      const student = cert.students;
      const parentEmail = student?.email; // we can also fetch parent later, but we'll use student email

      if (!parentEmail) {
        throw new Error("No email found for the student.");
      }

      const context = {
        academyName: org?.company_name || "Academy",
        student_name: `${student?.first_name || ''} ${student?.last_name || ''}`.trim(),
        certificate_no: cert.certificate_no,
        course_name: cert.courses?.course_name || 'N/A',
        level_name: cert.course_levels?.level_name || '',
        issue_date: cert.issue_date,
        download_link: cert.certificate_url || '',
      };

      await sendTemplateEmail({
        to: parentEmail,
        organizationId: org?.id,
        slug: "certificate_issued",
        context,
        branchId,
      });
      return true;
    },
    onSuccess: () => {
      toast.success("Certificate email sent.");
    },
    onError: (err) => {
      toast.error("Failed to send email: " + err.message);
    },
  });

  // ─── Send Report to Admins ─────────────────────────────────────────
  const sendReportEmail = async () => {
    if (certificates.length === 0) {
      alert("No certificates to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = certificates.map((c) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${c.certificate_no}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${c.students?.first_name || ''} ${c.students?.last_name || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${c.students?.admission_no || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${c.courses?.course_name || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${c.course_levels?.level_name || '-'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${c.issue_date}</td>
        </tr>
      `).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Certificate Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Certificates:</strong> ${certificates.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#e3f2fd;">
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Certificate No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Admission No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Level</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Issue Date</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Certificate Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── CSV import/export (unchanged) ─────────────────────────────────
  async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        for (const row of results.data) {
          try {
            const payload = {
              certificate_no: row.certificate_no || "CERT-" + Date.now(),
              student_id: row.student_id,
              course_id: row.course_id,
              level_id: row.level_id || null,
              issue_date: row.issue_date || new Date().toISOString().split("T")[0],
              certificate_url: row.certificate_url || null,
              issued_by: 1,
            };
            await createCertificate(payload, { branchId, financialYearId });
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} certificates imported`);
        queryClient.invalidateQueries({ queryKey: ["certificates"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllCertificatesForExport(branchId, financialYearId);
      const filtered = search
        ? allData.filter(
            (c) =>
              c.certificate_no.toLowerCase().includes(search.toLowerCase()) ||
              c.students?.first_name?.toLowerCase().includes(search.toLowerCase()) ||
              c.students?.last_name?.toLowerCase().includes(search.toLowerCase())
          )
        : allData;

      const csv = Papa.unparse(
        filtered.map((c) => ({
          certificate_no: c.certificate_no,
          student: `${c.students?.first_name} ${c.students?.last_name}`,
          admission_no: c.students?.admission_no,
          course: c.courses?.course_name,
          level: c.course_levels?.level_name,
          issue_date: c.issue_date,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "certificates.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  async function handleDownloadPdf(cert) {
    try {
      await generateCertificatePdf(cert);
    } catch (err) {
      toast.error("PDF generation failed");
    }
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/academics-hub" label="Academics Hub" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-primary"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Certificates
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Issue and manage certificates
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Award size={18} /> Issue Certificate
          </button>
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Mail size={18} /> Send Report
          </button>
          <button
            onClick={handleCSVExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Upload size={18} /> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleCSVImport}
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        />
        <input
          type="text"
          placeholder="Search by certificate no or student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        />
      </div>

      {/* Certificates Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Certificate No
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Student
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Course
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Level
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Issue Date
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
                    Loading certificates…
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No certificates found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => (
                  <tr
                    key={cert.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {cert.certificate_no}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {cert.students?.first_name} {cert.students?.last_name}{" "}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({cert.students?.admission_no})
                      </span>
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {cert.courses?.course_name}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {cert.course_levels?.level_name || "-"}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {cert.issue_date}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleDownloadPdf(cert)}
                          className="text-primary hover:underline flex items-center gap-1"
                          title="Download PDF"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => sendCertificateEmailMutation.mutate(cert)}
                          disabled={sendCertificateEmailMutation.isPending}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                          title="Send Email"
                        >
                          <Mail size={16} />
                          {sendCertificateEmailMutation.isPending ? '...' : ''}
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm("Delete this certificate?")) return;
                            deleteMutation.mutate(cert.id);
                          }}
                          className="text-red-600 dark:text-red-400 hover:underline"
                          title="Delete"
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
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Certificate Form Modal */}
      {showForm && (
        <CertificateForm
          onSubmit={(payload, context) => createMutation.mutate(payload)}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
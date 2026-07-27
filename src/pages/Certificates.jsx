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
} from "lucide-react";
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
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme
import { sendTemplateEmail, sendEmail } from "../services/emailService";

export default function Certificates() {
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

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
      const student = cert.students;
      const parentEmail = student?.email;

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
            style={{ fontFamily: headingFont }}
          >
            Certificates
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Issue and manage certificates
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Award size={18} /> Issue Certificate
          </button>
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={18} /> Send Report
          </button>
          <button
            onClick={handleCSVExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm"
            style={{ fontFamily: bodyFont }}
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
          className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60"
        />
        <input
          type="text"
          placeholder="Search by certificate no or student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg pl-10 pr-4 py-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        />
      </div>

      {/* Certificates Table */}
      <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-primary-bg">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Certificate No
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Student
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Course
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Level
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Issue Date
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-bg">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-primary-dark/60">
                    Loading certificates…
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-primary-dark/60">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-primary-dark/40" />
                      <span>No certificates found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => (
                  <tr
                    key={cert.id}
                    className="hover:bg-primary-bg transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-primary">
                      {cert.certificate_no}
                    </td>
                    <td className="text-sm text-primary-dark">
                      {cert.students?.first_name} {cert.students?.last_name}{" "}
                      <span className="text-xs text-primary-dark/60">
                        ({cert.students?.admission_no})
                      </span>
                    </td>
                    <td className="text-sm text-primary-dark">
                      {cert.courses?.course_name}
                    </td>
                    <td className="text-sm text-primary-dark">
                      {cert.course_levels?.level_name || "-"}
                    </td>
                    <td className="text-sm text-primary-dark">
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
                          className="text-primary hover:underline flex items-center gap-1"
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
                          className="text-accent hover:underline"
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
            style={{ fontFamily: bodyFont }}
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
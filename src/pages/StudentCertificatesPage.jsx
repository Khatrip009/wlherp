// src/pages/StudentCertificatesPage.jsx
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Mail } from "lucide-react";
import toast from "react-hot-toast";

import BackButton from "../components/BackButton";
import { useStudentId } from "../hooks/useStudentId";
import { supabase } from "../api/supabase";
import { generateCertificatePdf } from "../utils/certificatePdf";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function StudentCertificatesPage() {
  const { studentId, isLoading: idLoading } = useStudentId();
  const { branch, selectedFinancialYear, org } = useOrg();
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ─── Helper: get student email (or parent email) ──────────────────────
  const getStudentParentEmail = async (studentId) => {
    // Fetch student email
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("email, first_name, last_name")
      .eq("id", studentId)
      .single();
    if (studentError) return null;

    // Try to find parent email
    const { data: parent, error: parentError } = await supabase
      .from("student_parents")
      .select("parents!inner(email, father_name, mother_name)")
      .eq("student_id", studentId)
      .maybeSingle();

    if (!parentError && parent && parent.parents?.email) {
      return {
        email: parent.parents.email,
        name: parent.parents.father_name || parent.parents.mother_name || `${student.first_name} ${student.last_name}`,
      };
    }
    return {
      email: student.email,
      name: `${student.first_name} ${student.last_name}`.trim(),
    };
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (certificates.length === 0) {
      alert("No certificates to send.");
      return;
    }

    try {
      const recipient = await getStudentParentEmail(studentId);
      if (!recipient || !recipient.email) {
        toast.error("No email found for this student or parent.");
        return;
      }

      // Build HTML table rows
      let tableRows = certificates.map((cert) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${cert.certificate_no}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${cert.courses?.course_name || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${cert.course_levels?.level_name || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${cert.issue_date}</td>
        </tr>
      `).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#0D47A1;">My Certificates</h2>
          <p><strong>Student:</strong> ${recipient.name}</p>
          <p><strong>Total Certificates:</strong> ${certificates.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Certificate No</th>
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
        to: recipient.email,
        subject: `My Certificates - ${org?.company_name || 'Academy'}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      toast.success(`Report sent to ${recipient.email}`);
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── Resend Certificate Email ───────────────────────────────────────
  const sendCertificateEmail = async (cert) => {
    setSendingEmailId(cert.id);
    try {
      const recipient = await getStudentParentEmail(studentId);
      if (!recipient || !recipient.email) {
        toast.error("No email found for this student or parent.");
        setSendingEmailId(null);
        return;
      }

      const context = {
        academyName: org?.company_name || "Academy",
        student_name: recipient.name,
        certificate_no: cert.certificate_no,
        course_name: cert.courses?.course_name || 'N/A',
        level_name: cert.course_levels?.level_name || '',
        issue_date: cert.issue_date,
        download_link: cert.certificate_url || '',
      };

      await sendTemplateEmail({
        to: recipient.email,
        organizationId: org?.id,
        slug: "certificate_issued",
        context,
        branchId,
      });

      toast.success(`Certificate email sent to ${recipient.email}`);
    } catch (err) {
      console.error("Certificate email error:", err);
      toast.error("Failed to send certificate email.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ["student-certificates-list", studentId, branchId, financialYearId],
    queryFn: async () => {
      if (!studentId) return [];
      let query = supabase
        .from("certificates")
        .select(`*, courses(course_name), course_levels(level_name)`)
        .eq("student_id", studentId)
        .order("issue_date", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!studentId && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  async function handleDownload(cert) {
    try {
      await generateCertificatePdf(cert);
    } catch (err) {
      console.error(err);
      if (cert.certificate_url) {
        window.open(cert.certificate_url, "_blank");
      } else {
        alert("Failed to generate PDF. No certificate file available.");
      }
    }
  }

  if (idLoading || isLoading) {
    return (
      <>
        <BackButton to="/student" label="My Dashboard" />
        <div className="p-8 text-center">Loading...</div>
      </>
    );
  }

  return (
    <>
      <BackButton to="/student" label="My Dashboard" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-3xl font-righteous text-primary-dark">My Certificates</h1>
        {/* 👇 Send Report button */}
        {certificates.length > 0 && (
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Mail size={16} /> Send Report
          </button>
        )}
      </div>

      {certificates.length === 0 ? (
        <p className="text-secondary">No certificates issued yet.</p>
      ) : (
        <div className="space-y-4">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
            >
              <div>
                <p className="font-semibold">
                  {cert.courses?.course_name} - {cert.course_levels?.level_name}
                </p>
                <p className="text-sm text-secondary">Certificate No: {cert.certificate_no}</p>
                <p className="text-xs text-secondary">Issued: {cert.issue_date}</p>
              </div>
              <div className="flex gap-2">
                {/* 👇 Resend Certificate Email button */}
                <button
                  onClick={() => sendCertificateEmail(cert)}
                  disabled={sendingEmailId === cert.id}
                  className="text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                  title="Resend certificate email"
                >
                  <Mail size={16} />
                  {sendingEmailId === cert.id ? '...' : ''}
                </button>
                <button
                  onClick={() => handleDownload(cert)}
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <Download size={16} /> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
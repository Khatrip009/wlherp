import { useQuery } from "@tanstack/react-query";
import { FileText, Download } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useStudentId } from "../hooks/useStudentId";
import { supabase } from "../api/supabase";
import { generateCertificatePdf } from "../utils/certificatePdf";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function StudentCertificatesPage() {
  const { studentId, isLoading: idLoading } = useStudentId();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ["student-certificates-list", studentId, branchId, financialYearId],
    queryFn: async () => {
      if (!studentId) return [];
      let query = supabase
        .from("certificates")
        .select(`*, courses(course_name), course_levels(level_name)`)
        .eq("student_id", studentId)
        .order("issue_date", { ascending: false });

      // Scope to branch & FY
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
      // Fallback: if a certificate_url exists, open it
      if (cert.certificate_url) {
        window.open(cert.certificate_url, "_blank");
      } else {
        alert("Failed to generate PDF. No certificate file available.");
      }
    }
  }

  if (idLoading || isLoading) {
    return <AdminLayout>
      <BackButton to="/student" label="My Dashboard" /><div className="p-8 text-center">Loading...</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">My Certificates</h1>
      {certificates.length === 0 ? (
        <p className="text-secondary">No certificates issued yet.</p>
      ) : (
        <div className="space-y-4">
          {certificates.map((cert) => (
            <div key={cert.id} className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light flex justify-between items-center">
              <div>
                <p className="font-semibold">{cert.courses?.course_name} - {cert.course_levels?.level_name}</p>
                <p className="text-sm text-secondary">Certificate No: {cert.certificate_no}</p>
                <p className="text-xs text-secondary">Issued: {cert.issue_date}</p>
              </div>
              <button
                onClick={() => handleDownload(cert)}
                className="text-primary hover:underline flex items-center gap-1"
              >
                <Download size={16} /> Download
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
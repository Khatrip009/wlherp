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
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
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
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function Certificates() {
  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const ctx = {
    branchId: branch?.id,
    financialYearId: selectedFinancialYear?.id,
  };

  // Search & filters
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const fileInputRef = useRef(null);

  // Infinite query for certificates (unchanged)
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["certificates", { search }],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = 20;
      const from = pageParam * limit;
      const to = from + limit - 1;

      let query = supabase
        .from("certificates")
        .select(
          `*,
          students ( first_name, last_name, admission_no ),
          courses ( course_name ),
          course_levels ( level_name )`,
          { count: "exact" }
        )
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
    staleTime: 5 * 60 * 1000,
  });

  const certificates = data?.pages.flatMap((page) => page.data) || [];

  // Mutations – now accept context
  const createMutation = useMutation({
    mutationFn: (payload) => createCertificate(payload, ctx),
    onSuccess: () => {
      toast.success("Certificate issued");
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to issue certificate"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCertificate(id, ctx),
    onSuccess: () => {
      toast.success("Certificate deleted");
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // CSV Import – also pass context
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
            await createCertificate(payload, ctx);
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

  // CSV Export (unchanged)
  async function handleCSVExport() {
    try {
      const { data: allData } = await supabase
        .from("certificates")
        .select(
          `*,
          students ( first_name, last_name, admission_no ),
          courses ( course_name ),
          course_levels ( level_name )`
        )
        .order("issue_date", { ascending: false });

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
    <AdminLayout>
      <BackButton to="/academics-hub" label="Academics Hub" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Certificates</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Issue and manage certificates
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Award size={18} /> Issue Certificate
          </button>
          <button
            onClick={handleCSVExport}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
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
      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="text"
          placeholder="Search by certificate no or student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      {/* Certificates Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">
                  Certificate No
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Student
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Course
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Level
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Issue Date
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    Loading certificates…
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-secondary-light" />
                      <span>No certificates found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => (
                  <tr
                    key={cert.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium">
                      {cert.certificate_no}
                    </td>
                    <td className="text-sm">
                      {cert.students?.first_name} {cert.students?.last_name}{" "}
                      <span className="text-xs text-secondary-light">
                        ({cert.students?.admission_no})
                      </span>
                    </td>
                    <td className="text-sm">{cert.courses?.course_name}</td>
                    <td className="text-sm">
                      {cert.course_levels?.level_name || "-"}
                    </td>
                    <td className="text-sm">{cert.issue_date}</td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownloadPdf(cert)}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <Download size={16} /> PDF
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm("Delete this certificate?"))
                              return;
                            deleteMutation.mutate(cert.id);
                          }}
                          className="text-red-600 hover:underline"
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
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Certificate Form Modal – passes context to createMutation */}
      {showForm && (
        <CertificateForm
          onSubmit={(payload, context) => createMutation.mutate(payload)}
          onClose={() => setShowForm(false)}
        />
      )}
    </AdminLayout>
  );
}
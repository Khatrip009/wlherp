// src/pages/Students.jsx
import { useState, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Table, Button, Input, Select, Space, Tag, Popconfirm, message, Drawer } from "antd";
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined, FilePdfOutlined, MailOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import StudentForm from "../components/StudentForm";
import { getStudents, createStudent, updateStudent, deleteStudent, getMediumOptions, getAllStudentsForExport } from "../services/studentService";
import { useOrg } from "../context/OrganizationContext";
import { generateReportPdf } from "../utils/generateReportPdf";
import { supabase } from "../api/supabase";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function Students() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterMedium, setFilterMedium] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState(null);
  const fileInputRef = useRef();

  const { branch, selectedFinancialYear, org, theme } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

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

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (students.length === 0) {
      alert("No students to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = students.map((s) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${s.admission_no || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${s.first_name || ''} ${s.last_name || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${s.medium_name || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${s.mobile || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${s.status || 'Active'}</td>
        </tr>
      `).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Student List Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Filters:</strong> ${search ? `Search: "${search}"` : 'None'} ${filterMedium ? `, Medium: ${mediums.find(m => m.id === filterMedium)?.name || ''}` : ''}</p>
          <p><strong>Total Students:</strong> ${students.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Admission No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Name</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Medium</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mobile</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
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
        subject: `Student List Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Resend Welcome Email to Student ──────────────────────────────
  const resendWelcomeEmail = async (student) => {
    setSendingEmailId(student.id);
    try {
      // 1. Get student email
      let recipientEmail = student.email;
      if (!recipientEmail) {
        // Try to fetch from DB (just in case)
        const { data: freshStudent, error } = await supabase
          .from("students")
          .select("email")
          .eq("id", student.id)
          .single();
        if (error) throw error;
        recipientEmail = freshStudent?.email;
      }
      if (!recipientEmail) {
        message.warning("No email address for this student.");
        setSendingEmailId(null);
        return;
      }

      // 2. Try to find parent email (prefer parent)
      const { data: parent, error: parentError } = await supabase
        .from("student_parents")
        .select("parents!inner(email)")
        .eq("student_id", student.id)
        .maybeSingle();
      if (!parentError && parent && parent.parents?.email) {
        recipientEmail = parent.parents.email;
      }

      // 3. Build context for account_welcome template
      const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';
      const context = {
        academyName: org?.company_name || "Academy",
        full_name: fullName,
        role: 'Student',
        login_link: `${window.location.origin}/login`,
      };

      await sendTemplateEmail({
        to: recipientEmail,
        organizationId: org?.id,
        slug: "account_welcome",
        context,
        branchId,
      });

      message.success(`Welcome email sent to ${recipientEmail}`);
    } catch (err) {
      console.error("Resend welcome error:", err);
      message.error("Failed to send welcome email.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: getMediumOptions,
  });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["students", search, filterMedium, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getStudents({ pageParam, filters: { search, medium_id: filterMedium }, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const students = data?.pages.flatMap((page) => page.data) || [];

  // ─── Mutations ──────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteStudent(id, ctx),
    onSuccess: () => {
      message.success("Student deleted");
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (err) => message.error(err.message),
  });

  // ─── PDF Export ─────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const allStudents = await getAllStudentsForExport({
        filters: { search, medium_id: filterMedium },
        branchId,
        financialYearId,
      });

      if (!allStudents.length) {
        message.warning("No students to export");
        setExporting(false);
        return;
      }

      const rows = allStudents.map((s) => ({
        admission_no: s.admission_no || "-",
        name: `${s.first_name || ""} ${s.last_name || ""}`.trim() || "-",
        medium: s.medium_name || "-",
        mobile: s.mobile || "-",
        status: s.status || "Active",
      }));

      const config = {
        title: "Student List",
        description: `Filtered students${search ? ` (search: "${search}")` : ""}${filterMedium ? `, Medium: ${mediums.find(m => m.id === filterMedium)?.name || ''}` : ""}`,
        columns: [
          { header: "Admission No", accessor: "admission_no" },
          { header: "Name", accessor: "name" },
          { header: "Medium", accessor: "medium" },
          { header: "Mobile", accessor: "mobile" },
          { header: "Status", accessor: "status" },
        ],
        pdfConfig: {
          orientation: "landscape",
          includeLetterhead: false,
          showHeader: true,
          showFooter: true,
          pageSize: "a4",
          fontSize: 8,
          headerFontSize: 14,
          footerFontSize: 8,
        },
      };

      const filters = { start_date: null, end_date: null };
      const doc = await generateReportPdf(config, rows, filters, org, theme);
      doc.save(`students_${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success("PDF exported successfully");
    } catch (err) {
      console.error(err);
      message.error("Failed to export PDF: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  // ─── CSV Import ─────────────────────────────────────────────────────
  const handleImport = (event) => {
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
              first_name: row.first_name,
              last_name: row.last_name,
              email: row.email,
              mobile: row.mobile,
              admission_no: row.admission_no,
              dob: row.date_of_birth || row.dob || null,
              gender: row.gender,
              address: row.address,
              standard: row.standard,
              medium_id: row.medium_id || null,
              status: row.status || "Active",
            };
            await createStudent(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        message.success(`${successCount} students imported`);
        queryClient.invalidateQueries({ queryKey: ["students"] });
      },
      error: () => message.error("CSV parsing error"),
    });
  };

  // ─── Columns ────────────────────────────────────────────────────────
  const columns = [
    {
      title: "Admission No",
      dataIndex: "admission_no",
      sorter: true,
      width: 120,
    },
    {
      title: "Name",
      render: (_, record) => (
        <Link to={`/students/${record.id}`} style={{ fontWeight: 500 }}>
          {record.first_name} {record.last_name}
        </Link>
      ),
      sorter: (a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    },
    {
      title: "Medium",
      dataIndex: "medium_name",
      filters: mediums.map((m) => ({ text: m.name, value: m.id })),
      onFilter: (value, record) => record.medium_id === value,
    },
    {
      title: "Mobile",
      dataIndex: "mobile",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status) => {
        const color = status === "Active" ? "green" : status === "Inactive" ? "volcano" : "default";
        return <Tag color={color}>{status || "Active"}</Tag>;
      },
      filters: [
        { text: "Active", value: "Active" },
        { text: "Inactive", value: "Inactive" },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Actions",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<MailOutlined />}
            onClick={() => resendWelcomeEmail(record)}
            disabled={sendingEmailId === record.id}
            title="Resend welcome email"
          />
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingStudent(record);
              setDrawerOpen(true);
            }}
          />
          <Popconfirm
            title="Delete this student?"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Space>
          <Input
            placeholder="Search by name or admission no"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Select
            allowClear
            placeholder="All Mediums"
            value={filterMedium}
            onChange={(val) => setFilterMedium(val)}
            style={{ width: 150 }}
            options={mediums.map((m) => ({ label: m.name, value: m.id }))}
          />
        </Space>
        <Space>
          {/* 👇 Send Report button */}
          <Button icon={<MailOutlined />} onClick={sendReportEmail}>
            Send Report
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={handleExportPDF} loading={exporting}>
            PDF
          </Button>
          <Button icon={<DownloadOutlined />}>Export</Button>
          <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>Import</Button>
          <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleImport} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingStudent(null);
              setDrawerOpen(true);
            }}
          >
            Add Student
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={students}
        loading={isLoading}
        rowKey="id"
        pagination={false}
        scroll={{ x: 700 }}
      />

      {hasNextPage && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Button
            onClick={() => fetchNextPage()}
            loading={isFetchingNextPage}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </Button>
        </div>
      )}

      {/* Drawer for Add / Edit */}
      <Drawer
        title={editingStudent ? "Edit Student" : "Add Student"}
        width={640}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingStudent(null);
        }}
        destroyOnClose
      >
        <StudentForm
          initialData={editingStudent || {}}
          onSubmit={async (payload) => {
            if (editingStudent) {
              await updateStudent(editingStudent.id, payload, ctx);
            } else {
              await createStudent(payload, ctx);
            }
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["students"] });
            setDrawerOpen(false);
            setEditingStudent(null);
          }}
          onClose={() => {
            setDrawerOpen(false);
            setEditingStudent(null);
          }}
        />
      </Drawer>
    </div>
  );
}
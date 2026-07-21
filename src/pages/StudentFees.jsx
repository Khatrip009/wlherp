// src/pages/StudentFees.jsx
import React, { useState, useRef } from "react";
import {
  Table, Button, Input, Select, Space, Tag, Modal, Drawer, Form,
  InputNumber, message, Row, Col, Card, Typography, Tooltip, Checkbox,
  Dropdown,
} from "antd";
import {
  PlusOutlined, SearchOutlined, ExportOutlined, UploadOutlined,
  DollarOutlined, FileTextOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, SendOutlined, FilePdfOutlined, PrinterOutlined,
  MailOutlined,
} from "@ant-design/icons";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  getStudentFees, createStudentFee, updateStudentFee, deleteStudentFee,
  getPayments, getAllStudentFeesForExport, generateInvoiceFromStudentFee,
  getFeeStructures,
} from "../services/feeService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import CollectPaymentModal from "../components/CollectPaymentModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { generateReceiptPdf } from "../utils/receiptPdf";
import { generateInvoicePDF } from "../utils/invoicePdf";
import { sendEmail, sendFeeReceiptEmail } from "../services/emailService";

const { Text } = Typography;

export default function StudentFees() {
  const queryClient = useQueryClient();
  const { org, branch, selectedFinancialYear } = useOrg();
  const { user } = useAuth();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);

  // ── Print / Invoice modals ──
  const [printReceiptModal, setPrintReceiptModal] = useState({ open: false, feeId: null, payments: [] });
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [printingInvoice, setPrintingInvoice] = useState(false);

  // ── Helper: get admin emails ──────────────────────────────────────
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
    if (studentFees.length === 0) {
      alert("No fee records to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = studentFees.map((fee) => {
        const studentName = fee.students ? `${fee.students.first_name || ''} ${fee.students.last_name || ''}`.trim() : '—';
        const course = fee.fee_structures?.courses?.course_name || '—';
        const total = `₹ ${Number(fee.final_fee).toLocaleString('en-IN')}`;
        const paid = `₹ ${Number(fee.total_paid || 0).toLocaleString('en-IN')}`;
        const pending = `₹ ${Number(fee.pending || 0).toLocaleString('en-IN')}`;
        const statusColor = fee.status === "Paid" ? "#2e7d32" : "#e65100";
        const statusBg = fee.status === "Paid" ? "#e8f5e9" : "#fff3e0";
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${studentName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${course}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${total}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${paid}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${pending}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${fee.status}</span>
            </td>
          </tr>
        `;
      }).join('');

      const totalPending = studentFees.reduce((sum, f) => sum + Number(f.pending || 0), 0);
      const totalPaid = studentFees.reduce((sum, f) => sum + Number(f.total_paid || 0), 0);
      const totalFee = studentFees.reduce((sum, f) => sum + Number(f.final_fee || 0), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Student Fee Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Fees:</strong> ${studentFees.length}</p>
          <p><strong>Total Amount:</strong> ₹ ${totalFee.toLocaleString('en-IN')}</p>
          <p><strong>Total Paid:</strong> ₹ ${totalPaid.toLocaleString('en-IN')}</p>
          <p><strong>Total Pending:</strong> ₹ ${totalPending.toLocaleString('en-IN')}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Paid</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Pending</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="2" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Totals</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalFee.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalPaid.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalPending.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Student Fee Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Resend Receipt Email ──────────────────────────────────────────
  const resendReceiptEmail = async (fee) => {
    setSendingEmailId(fee.id);
    try {
      // 1. Find the latest payment that has a receipt
      const { data: payments, error } = await supabase
        .from("fee_payments")
        .select("id, receipt_number")
        .eq("student_fee_id", fee.id)
        .not("receipt_number", "is", null)
        .order("payment_date", { ascending: false })
        .limit(1)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);

      if (error) throw error;
      if (!payments || payments.length === 0) {
        message.warning("No receipt found for this fee.");
        setSendingEmailId(null);
        return;
      }

      const paymentId = payments[0].id;
      // Use the existing sendFeeReceiptEmail from emailService
      await sendFeeReceiptEmail(paymentId, org);
      message.success("Receipt email sent.");
    } catch (err) {
      console.error("Resend receipt error:", err);
      message.error("Failed to send receipt email.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ── Data fetching ──────────────────────────────────────────────────
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["studentFees", search, statusFilter, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getStudentFees({ pageParam, filters: { search }, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const studentFees = data?.pages.flatMap((page) => page.data) || [];

  const { data: students = [] } = useQuery({
    queryKey: ["students-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("students").select("id, first_name, last_name, admission_no").order("first_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: feeStructures = [] } = useQuery({
    queryKey: ["feeStructures-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("fee_structures").select(`
        id, fee_amount, installment_allowed, tax_rate_id, tax_inclusive,
        courses(course_name), tax_rates(id, name, rate)
      `).order("id");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ── UI state ──
  const [assignOpen, setAssignOpen] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [collectingFee, setCollectingFee] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmInvoice, setConfirmInvoice] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkReminderOpen, setBulkReminderOpen] = useState(false);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (payload) => createStudentFee(payload, ctx),
    onSuccess: () => {
      message.success("Fee assigned");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
      setAssignOpen(false);
      setEditingFee(null);
    },
    onError: (err) => message.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateStudentFee(id, payload, ctx),
    onSuccess: () => {
      message.success("Fee updated");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
      setAssignOpen(false);
      setEditingFee(null);
    },
    onError: (err) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteStudentFee(id, ctx),
    onSuccess: () => {
      message.success("Fee record deleted");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
    },
    onError: () => message.error("Delete failed"),
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: ({ feeId }) => generateInvoiceFromStudentFee(feeId, null, ctx),
    onSuccess: () => {
      message.success("Invoice generated");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
    },
    onError: (err) => message.error(err.message),
  });

  // ── CSV ──
  const fileInputRef = useRef();
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
            await createStudentFee({
              student_id: row.student_id,
              fee_structure_id: row.fee_structure_id,
              total_fee: Number(row.total_fee),
              discount: Number(row.discount) || 0,
              final_fee: Number(row.final_fee),
              status: row.status || "Pending",
            }, ctx);
            successCount++;
          } catch (err) { console.error(err); }
        }
        message.success(`${successCount} fee records imported`);
        queryClient.invalidateQueries({ queryKey: ["studentFees"] });
      },
      error: () => message.error("CSV parsing error"),
    });
  };

  const handleExport = async () => {
    try {
      const allData = await getAllStudentFeesForExport({ search }, branchId, financialYearId);
      const csv = Papa.unparse(allData.map(f => ({
        student: `${f.students?.first_name} ${f.students?.last_name}`,
        course: f.fee_structures?.courses?.course_name,
        total_fee: f.total_fee,
        discount: f.discount,
        final_fee: f.final_fee,
        paid: f.total_paid,
        pending: f.pending,
        status: f.status,
      })));
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student_fees.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error("Export failed");
    }
  };

  // ── Handlers ──
  const openAssign = (fee = null) => {
    setEditingFee(fee);
    setAssignOpen(true);
  };

  const handleAssignSubmit = async (values) => {
    let installmentData = null;
    if (values.installments_enabled && values.installments && values.installments.length > 0) {
      installmentData = values.installments.map((inst, idx) => ({
        installment_number: idx + 1,
        amount: Number(inst.amount),
        due_date: inst.due_date || null,
      }));
    }

    const payload = {
      student_id: values.student_id,
      fee_structure_id: values.fee_structure_id,
      total_fee: Number(values.total_fee),
      discount: Number(values.discount || 0),
      final_fee: Number(values.final_fee),
      status: values.status || "Pending",
      installment_data: installmentData,
    };

    if (editingFee) {
      await updateMutation.mutateAsync({ id: editingFee.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const handleBulkAssign = async (values) => {
    const structId = values.fee_structure_id;
    const structure = feeStructures.find(s => s.id === structId);
    if (!structure) return;
    for (const studentId of selectedRowKeys) {
      await createStudentFee({
        student_id: studentId,
        fee_structure_id: structId,
        total_fee: structure.fee_amount,
        discount: 0,
        final_fee: structure.fee_amount,
        status: "Pending",
      }, ctx);
    }
    message.success(`Fee assigned to ${selectedRowKeys.length} students`);
    queryClient.invalidateQueries({ queryKey: ["studentFees"] });
    setBulkAssignOpen(false);
    setSelectedRowKeys([]);
  };

  const sendReminders = async () => {
    message.success(`Reminders will be sent to ${selectedRowKeys.length} students (feature in progress)`);
    setBulkReminderOpen(false);
    setSelectedRowKeys([]);
  };

  // ── Print Receipt ──
  const handlePrintReceiptClick = async (fee) => {
    try {
      const { data: payments, error } = await supabase
        .from("fee_payments")
        .select("*, receipts(*)")
        .eq("student_fee_id", fee.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("payment_date", { ascending: false });

      if (error) throw error;

      const paymentsWithReceipt = payments.filter(p => p.receipts && p.receipts.length > 0);
      if (paymentsWithReceipt.length === 0) {
        message.warning("No receipt found for this fee.");
        return;
      }

      if (paymentsWithReceipt.length === 1) {
        await printReceipt(paymentsWithReceipt[0].id);
      } else {
        setPrintReceiptModal({
          open: true,
          feeId: fee.id,
          payments: paymentsWithReceipt,
        });
        setSelectedPaymentId(paymentsWithReceipt[0].id);
      }
    } catch (err) {
      console.error(err);
      message.error("Failed to fetch payments");
    }
  };

  const printReceipt = async (paymentId) => {
    setPrintingReceipt(true);
    try {
      const { data: receipt, error } = await supabase
        .from("receipts")
        .select(`
          *,
          students (*),
          fee_payments (*)
        `)
        .eq("payment_id", paymentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();

      if (error) throw error;
      await generateReceiptPdf(receipt);
      message.success("Receipt downloaded");
    } catch (err) {
      console.error(err);
      message.error("Failed to generate receipt PDF");
    } finally {
      setPrintingReceipt(false);
      setPrintReceiptModal({ open: false, feeId: null, payments: [] });
    }
  };

  // ── Print Invoice ──
  const handlePrintInvoiceClick = async (fee) => {
    setPrintingInvoice(true);
    try {
      let invoiceId = null;

      const { data: existingInvoice, error: fetchError } = await supabase
        .from("invoices")
        .select("id")
        .eq("student_fee_id", fee.id)
        .is("fee_installment_id", null)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingInvoice) {
        invoiceId = existingInvoice.id;
      } else {
        try {
          const generated = await generateInvoiceFromStudentFee(fee.id, null, ctx);
          invoiceId = generated.id;
          message.success("Invoice generated");
        } catch (genErr) {
          if (genErr?.code === '23505' || genErr?.message?.includes('duplicate key')) {
            const { data: existing } = await supabase
              .from("invoices")
              .select("id")
              .eq("student_fee_id", fee.id)
              .is("fee_installment_id", null)
              .eq("branch_id", branchId)
              .eq("financial_year_id", financialYearId)
              .maybeSingle();
            if (existing) {
              invoiceId = existing.id;
              message.info("Invoice already exists, opening existing.");
            } else {
              throw new Error("Invoice generation failed and no existing found.");
            }
          } else {
            throw genErr;
          }
        }
      }

      if (!invoiceId) {
        throw new Error("Could not find or generate invoice.");
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select(`
          *,
          students(*),
          invoice_items(*)
        `)
        .eq("id", invoiceId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();

      if (invoiceError) throw invoiceError;

      if (!invoice.invoice_items || invoice.invoice_items.length === 0) {
        const { data: items, error: itemsError } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", invoiceId)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);
        if (!itemsError && items && items.length > 0) {
          invoice.invoice_items = items;
        } else {
          console.warn("Invoice has no items. Generating PDF with empty table.");
          invoice.invoice_items = [];
        }
      }

      const doc = await generateInvoicePDF(invoice, org, 'sales');
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
      message.success("Invoice opened in new tab");

    } catch (err) {
      console.error(err);
      message.error(err?.message || "Failed to generate invoice");
    } finally {
      setPrintingInvoice(false);
    }
  };

  // ── Columns ──
  const columns = [
    {
      title: "Student",
      render: (_, record) => (
        <span>
          {record.students?.first_name} {record.students?.last_name}
          <div style={{ fontSize: 12, color: "#888" }}>{record.students?.admission_no}</div>
        </span>
      ),
      sorter: (a, b) =>
        `${a.students?.first_name} ${a.students?.last_name}`.localeCompare(
          `${b.students?.first_name} ${b.students?.last_name}`
        ),
    },
    {
      title: "Course",
      dataIndex: ["fee_structures", "courses", "course_name"],
    },
    {
      title: "Total Fee",
      dataIndex: "final_fee",
      render: (val) => `₹${Number(val).toLocaleString()}`,
      sorter: (a, b) => a.final_fee - b.final_fee,
    },
    {
      title: "Paid",
      dataIndex: "total_paid",
      render: (val) => `₹${Number(val || 0).toLocaleString()}`,
    },
    {
      title: "Balance",
      dataIndex: "pending",
      render: (val) => (
        <Text style={{ color: val > 0 ? "#ff4d4f" : "#52c41a" }}>
          ₹{Number(val).toLocaleString()}
        </Text>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag color={status === "Paid" ? "green" : "volcano"}>{status}</Tag>,
      filters: [
        { text: "Paid", value: "Paid" },
        { text: "Pending", value: "Pending" },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Actions",
      width: 320,
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openAssign(record)} /></Tooltip>
          <Tooltip title="Collect Payment"><Button size="small" icon={<DollarOutlined />} onClick={() => setCollectingFee(record)} /></Tooltip>
          <Tooltip title="View Payments"><Button size="small" icon={<EyeOutlined />} /></Tooltip>
          <Tooltip title="Generate Invoice"><Button size="small" icon={<FileTextOutlined />} onClick={() => setConfirmInvoice(record.id)} /></Tooltip>
          <Tooltip title="Print Receipt">
            <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrintReceiptClick(record)} />
          </Tooltip>
          <Tooltip title="Print Invoice">
            <Button size="small" icon={<FilePdfOutlined />} onClick={() => handlePrintInvoiceClick(record)} />
          </Tooltip>
          {/* 👇 Resend Receipt Email */}
          <Tooltip title="Resend Receipt Email">
            <Button
              size="small"
              icon={<MailOutlined />}
              onClick={() => resendReceiptEmail(record)}
              loading={sendingEmailId === record.id}
              disabled={sendingEmailId === record.id}
            />
          </Tooltip>
          <Tooltip title="Delete"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => setConfirmDelete(record.id)} /></Tooltip>
        </Space>
      ),
    },
  ];

  // Expandable installments
  const expandable = {
    expandedRowRender: (record) => {
      const installments = record.installments || [];
      if (!installments.length) return <Text type="secondary">No installments</Text>;
      return (
        <Table
          dataSource={installments}
          columns={[
            { title: "#", dataIndex: "installment_number", width: 40 },
            { title: "Amount", dataIndex: "amount", render: val => `₹${val}` },
            { title: "Due Date", dataIndex: "due_date" },
            { title: "Status", dataIndex: "status", render: (status) => <Tag color={status === "Paid" ? "green" : "orange"}>{status}</Tag> },
          ]}
          pagination={false}
          rowKey="id"
          size="small"
        />
      );
    },
    rowExpandable: (record) => record.installments && record.installments.length > 0,
  };

  return (
    <div>
      {/* Header */}
      <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Input
            placeholder="Search by student name..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={16}>
          <Space wrap style={{ float: "right" }}>
            <Select
              allowClear
              placeholder="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
              options={[
                { label: "Paid", value: "Paid" },
                { label: "Pending", value: "Pending" },
              ]}
            />
            <Button icon={<ExportOutlined />} onClick={handleExport}>Export</Button>
            <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>Import</Button>
            <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleImport} />
            {/* 👇 Send Report button */}
            <Button icon={<MailOutlined />} onClick={sendReportEmail}>Send Report</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openAssign(null)}>
              Assign Fee
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Bulk actions */}
      {selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 16, background: "#e6f7ff", padding: "8px 16px", borderRadius: 8 }}>
          <Space>
            <span>{selectedRowKeys.length} selected</span>
            <Button icon={<DollarOutlined />} onClick={() => setBulkAssignOpen(true)}>Bulk Assign Fee</Button>
            <Button icon={<SendOutlined />} onClick={() => setBulkReminderOpen(true)}>Send Reminders</Button>
          </Space>
        </div>
      )}

      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        columns={columns}
        dataSource={studentFees}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        expandable={expandable}
        scroll={{ x: 1000 }}
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

      {/* Assign / Edit Drawer */}
      <FeeAssignDrawer
        open={assignOpen}
        editingFee={editingFee}
        students={students}
        feeStructures={feeStructures}
        onSubmit={handleAssignSubmit}
        onClose={() => {
          setAssignOpen(false);
          setEditingFee(null);
        }}
        loading={createMutation.isLoading || updateMutation.isLoading}
      />

      {/* Collect Payment */}
      {collectingFee && (
        <CollectPaymentModal
          fee={collectingFee}
          onClose={() => setCollectingFee(null)}
          onSuccess={() => {
            setCollectingFee(null);
            queryClient.invalidateQueries({ queryKey: ["studentFees"] });
          }}
        />
      )}

      {/* Bulk Assign Modal */}
      <Modal
        title="Bulk Assign Fee"
        open={bulkAssignOpen}
        onCancel={() => setBulkAssignOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <BulkAssignForm
          students={students}
          feeStructures={feeStructures}
          selectedStudents={selectedRowKeys}
          onSubmit={handleBulkAssign}
          onCancel={() => setBulkAssignOpen(false)}
        />
      </Modal>

      {/* Bulk Reminder Modal */}
      <Modal
        title="Send Payment Reminders"
        open={bulkReminderOpen}
        onCancel={() => setBulkReminderOpen(false)}
        onOk={sendReminders}
        okText="Send"
        destroyOnHidden
      >
        <p>Send payment reminders to {selectedRowKeys.length} students?</p>
      </Modal>

      {/* Print Receipt Selection Modal */}
      <Modal
        title="Select Payment to Print Receipt"
        open={printReceiptModal.open}
        onCancel={() => setPrintReceiptModal({ open: false, feeId: null, payments: [] })}
        footer={
          <Space>
            <Button onClick={() => setPrintReceiptModal({ open: false, feeId: null, payments: [] })}>Cancel</Button>
            <Button
              type="primary"
              onClick={() => printReceipt(selectedPaymentId)}
              loading={printingReceipt}
              disabled={!selectedPaymentId}
            >
              Print Receipt
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        <Select
          style={{ width: "100%" }}
          value={selectedPaymentId}
          onChange={(val) => setSelectedPaymentId(val)}
          placeholder="Select a payment"
        >
          {printReceiptModal.payments.map((p) => (
            <Select.Option key={p.id} value={p.id}>
              {p.payment_date} – ₹{Number(p.amount).toLocaleString('en-IN')} {p.receipts?.[0]?.receipt_no ? `(Receipt: ${p.receipts[0].receipt_no})` : ''}
            </Select.Option>
          ))}
        </Select>
        <p style={{ marginTop: 12, color: '#888' }}>
          {printReceiptModal.payments.length} payment(s) available
        </p>
      </Modal>

      {/* Confirmations */}
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this fee record?"
          onConfirm={() => { deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
          confirmText="Delete"
          variant="danger"
        />
      )}

      {confirmInvoice && (
        <ConfirmDialog
          message="Generate invoice for this fee?"
          onConfirm={() => { generateInvoiceMutation.mutate({ feeId: confirmInvoice }); setConfirmInvoice(null); }}
          onCancel={() => setConfirmInvoice(null)}
          confirmText="Generate"
          variant="primary"
        />
      )}
    </div>
  );
}

// ─── Internal Components ────────────────────────────────────────────────

function FeeAssignDrawer({ open, editingFee, students, feeStructures, onSubmit, onClose, loading }) {
  const [form] = Form.useForm();
  const [enableInstallments, setEnableInstallments] = useState(false);
  const [installments, setInstallments] = useState([]);
  const [taxPreview, setTaxPreview] = useState(null);

  React.useEffect(() => {
    if (!open) return;
    if (editingFee) {
      const structure = feeStructures.find(fs => fs.id === editingFee.fee_structure_id);
      const baseAmount = structure ? Number(structure.fee_amount) : Number(editingFee.total_fee);
      const discount = Number(editingFee.discount || 0);
      form.setFieldsValue({
        student_id: editingFee.student_id,
        fee_structure_id: editingFee.fee_structure_id,
        total_fee: baseAmount,
        discount: discount,
        final_fee: baseAmount - discount,
        status: editingFee.status,
      });
      if (editingFee.installments?.length) {
        setEnableInstallments(true);
        setInstallments(editingFee.installments.map(inst => ({
          amount: inst.amount,
          due_date: inst.due_date,
        })));
      } else {
        setEnableInstallments(false);
        setInstallments([]);
      }
    } else {
      form.resetFields();
      setEnableInstallments(false);
      setInstallments([]);
    }
  }, [open, editingFee, form, feeStructures]);

  const handleFinish = (values) => {
    const payload = {
      ...values,
      installments_enabled: enableInstallments,
      installments: enableInstallments ? installments : null,
    };
    onSubmit(payload);
  };

  const recalcTax = () => {
    const structId = form.getFieldValue("fee_structure_id");
    const finalFee = form.getFieldValue("final_fee") || 0;
    if (!structId || !finalFee) return setTaxPreview(null);
    const structure = feeStructures.find(s => s.id === structId);
    if (!structure) return;
    const rate = structure.tax_rates?.rate ? structure.tax_rates.rate / 100 : 0;
    const inclusive = structure.tax_inclusive !== false;
    let base, tax;
    if (inclusive) {
      base = finalFee / (1 + rate);
      tax = finalFee - base;
    } else {
      base = finalFee;
      tax = finalFee * rate;
    }
    setTaxPreview({ base: Math.round(base * 100) / 100, tax: Math.round(tax * 100) / 100, total: finalFee });
  };

  return (
    <Drawer
      title={editingFee ? "Edit Fee" : "Assign Fee"}
      open={open}
      onClose={onClose}
      size="medium"
      footer={
        <Space style={{ float: "right" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={() => form.submit()} loading={loading}>
            {editingFee ? "Update" : "Assign"}
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="student_id" label="Student" rules={[{ required: true }]}>
          <Select
            showSearch
            placeholder="Select student"
            optionFilterProp="label"
            options={students.map(s => ({ label: `${s.first_name} ${s.last_name} (${s.admission_no})`, value: s.id }))}
          />
        </Form.Item>
        <Form.Item name="fee_structure_id" label="Fee Structure" rules={[{ required: true }]}>
          <Select
            showSearch
            placeholder="Select fee structure"
            optionFilterProp="label"
            options={feeStructures.map(fs => ({
              label: `${fs.courses?.course_name} (₹${fs.fee_amount})`,
              value: fs.id,
            }))}
            onChange={() => {
              const id = form.getFieldValue("fee_structure_id");
              const structure = feeStructures.find(s => s.id === id);
              if (structure) {
                form.setFieldsValue({ total_fee: structure.fee_amount, final_fee: structure.fee_amount });
                recalcTax();
              }
            }}
          />
        </Form.Item>
        <Form.Item name="total_fee" label="Total Fee">
          <InputNumber style={{ width: "100%" }} disabled />
        </Form.Item>
        <Form.Item name="discount" label="Discount">
          <InputNumber style={{ width: "100%" }} min={0} onChange={() => {
            const total = form.getFieldValue("total_fee") || 0;
            const discount = form.getFieldValue("discount") || 0;
            form.setFieldsValue({ final_fee: total - discount });
            recalcTax();
          }} />
        </Form.Item>
        <Form.Item name="final_fee" label="Final Fee">
          <InputNumber style={{ width: "100%" }} disabled />
        </Form.Item>
        {taxPreview && (
          <Card size="small" style={{ marginBottom: 16 }}>
            <p>Base: ₹{taxPreview.base.toFixed(2)}</p>
            <p>Tax: ₹{taxPreview.tax.toFixed(2)}</p>
            <p>Total: ₹{taxPreview.total.toFixed(2)}</p>
          </Card>
        )}
        <Form.Item name="status" label="Status">
          <Select>
            <Select.Option value="Pending">Pending</Select.Option>
            <Select.Option value="Paid">Paid</Select.Option>
          </Select>
        </Form.Item>

        {/* Installments */}
        <Form.Item label="Installments">
          <Checkbox checked={enableInstallments} onChange={e => setEnableInstallments(e.target.checked)}>
            Enable Installments
          </Checkbox>
        </Form.Item>
        {enableInstallments && (
          <InstallmentEditor
            installments={installments}
            onChange={setInstallments}
            totalAmount={form.getFieldValue("final_fee") || 0}
          />
        )}
      </Form>
    </Drawer>
  );
}

function InstallmentEditor({ installments, onChange, totalAmount }) {
  const add = () => {
    onChange([...installments, { amount: 0, due_date: "" }]);
  };
  const update = (index, field, value) => {
    const updated = [...installments];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };
  const remove = (index) => {
    onChange(installments.filter((_, i) => i !== index));
  };
  return (
    <div style={{ marginBottom: 16 }}>
      {installments.map((inst, idx) => (
        <Space key={idx} style={{ display: "flex", marginBottom: 8 }} align="baseline">
          <InputNumber
            placeholder="Amount"
            value={inst.amount}
            onChange={v => update(idx, "amount", v)}
            style={{ width: 120 }}
          />
          <input
            type="date"
            value={inst.due_date || ""}
            onChange={(e) => update(idx, "due_date", e.target.value)}
            style={{ padding: "4px 11px", border: "1px solid #d9d9d9", borderRadius: 6 }}
          />
          <Button icon={<DeleteOutlined />} size="small" onClick={() => remove(idx)} />
        </Space>
      ))}
      <Button type="dashed" onClick={add} block>
        + Add Installment
      </Button>
      <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
        Total installments: ₹{installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)} / ₹{totalAmount}
      </Text>
    </div>
  );
}

function BulkAssignForm({ students, feeStructures, selectedStudents, onSubmit, onCancel }) {
  const [form] = Form.useForm();
  return (
    <Form form={form} layout="vertical" onFinish={(values) => onSubmit(values)}>
      <p>Assign fee to {selectedStudents.length} selected students:</p>
      <Form.Item name="fee_structure_id" label="Fee Structure" rules={[{ required: true }]}>
        <Select
          showSearch
          placeholder="Select fee structure"
          optionFilterProp="label"
          options={feeStructures.map(fs => ({
            label: `${fs.courses?.course_name} (₹${fs.fee_amount})`,
            value: fs.id,
          }))}
        />
      </Form.Item>
      <div style={{ textAlign: "right" }}>
        <Space>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" htmlType="submit">Assign</Button>
        </Space>
      </div>
    </Form>
  );
}
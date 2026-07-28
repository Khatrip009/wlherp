// src/pages/StudentFees.jsx
import React, { useState, useRef, useEffect } from "react";
import {
  Table, Button, Input, Select, Space, Tag, Modal, Drawer, Form,
  InputNumber, message, Row, Col, Card, Typography, Tooltip, Checkbox,
  Dropdown, Tabs, DatePicker, Badge, Popconfirm,
} from "antd";
import {
  PlusOutlined, SearchOutlined, ExportOutlined, UploadOutlined,
  DollarOutlined, FileTextOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, SendOutlined, FilePdfOutlined, PrinterOutlined,
  MailOutlined, FilterOutlined, ReloadOutlined,
} from "@ant-design/icons";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import Papa from "papaparse";
import dayjs from "dayjs";
import {
  getStudentFees, createStudentFee, updateStudentFee, deleteStudentFee,
  getPayments, getAllStudentFeesForExport, generateInvoiceFromStudentFee,
  getFeeStructures,
} from "../services/feeService";
import { getInvoices } from "../services/invoiceService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import CollectPaymentModal from "../components/CollectPaymentModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { generateReceiptPdf } from "../utils/receiptPdf";
import { generateInvoicePDF } from "../utils/invoicePdf";
import { sendEmail, sendFeeReceiptEmail } from "../services/emailService";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// ─── Helper ────────────────────────────────────────────────────────────
const formatCurrency = (amount) => `₹${Number(amount).toLocaleString("en-IN")}`;

// ─── Main Component ────────────────────────────────────────────────────
export default function StudentFees() {
  const queryClient = useQueryClient();
  const { org, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();
  const { user } = useAuth();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // ── Theme colors ──
  const primaryColor = theme?.primary_color || "#0D47A1";
  const primaryBg = theme?.primary_bg_color || "#E3F2FD";
  const accentColor = theme?.accent_color || "#FF1070";

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState("payments");

  // ── Payments filter state ──
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentDateRange, setPaymentDateRange] = useState(null);
  const [paymentMode, setPaymentMode] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // ── Fees filter state ──
  const [feeSearch, setFeeSearch] = useState("");
  const [feeStatusFilter, setFeeStatusFilter] = useState(null);

  // ── UI state ──
  const [collectingFee, setCollectingFee] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmInvoice, setConfirmInvoice] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkReminderOpen, setBulkReminderOpen] = useState(false);
  const [printReceiptModal, setPrintReceiptModal] = useState({ open: false, paymentId: null });
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const fileInputRef = useRef(null);

  // ── State for expanded invoices/receipts per fee ──
  const [expandedFeeId, setExpandedFeeId] = useState(null);
  const [invoicesMap, setInvoicesMap] = useState({});
  const [receiptsMap, setReceiptsMap] = useState({});
  const [loadingInvoices, setLoadingInvoices] = useState({});

  // ─── Helper: fetch admin emails ────────────────────────────────────
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
    return data.map(p => p.email).filter(Boolean);
  };

  // ── Fetch Payments ──────────────────────────────────────────────────
  const {
    data: paymentsData,
    isLoading: paymentsLoading,
    fetchNextPage: fetchMorePayments,
    hasNextPage: hasMorePayments,
    isFetchingNextPage: isFetchingMorePayments,
  } = useInfiniteQuery({
    queryKey: ["payments", paymentSearch, paymentDateRange, paymentMode, paymentStatus, branchId, financialYearId],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("fee_payments")
        .select(`
          *,
          student_fees!inner (
            student_id,
            students ( id, first_name, last_name, admission_no ),
            fee_structures ( courses ( course_name ) )
          ),
          receipts ( * ),
          invoices ( id, invoice_number, status )
        `, { count: "exact" })
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("payment_date", { ascending: false })
        .range(pageParam * 20, (pageParam + 1) * 20 - 1);

      if (paymentSearch) {
        const { data: matchingStudents } = await supabase
          .from("students")
          .select("id")
          .or(`first_name.ilike.%${paymentSearch}%,last_name.ilike.%${paymentSearch}%,admission_no.ilike.%${paymentSearch}%`)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);
        const ids = matchingStudents?.map(s => s.id) || [];
        if (ids.length) {
          query = query.in("student_fees.student_id", ids);
        } else {
          return { data: [], count: 0 };
        }
      }

      if (paymentDateRange) {
        const start = dayjs(paymentDateRange[0]).format("YYYY-MM-DD");
        const end = dayjs(paymentDateRange[1]).format("YYYY-MM-DD");
        query = query.gte("payment_date", start).lte("payment_date", end);
      }
      if (paymentMode) query = query.eq("payment_mode", paymentMode);
      if (paymentStatus === "has_receipt") query = query.not("receipts.receipt_no", "is", null);
      else if (paymentStatus === "no_receipt") query = query.is("receipts.receipt_no", null);

      const { data, error, count } = await query;
      if (error) throw error;

      const payments = data.map(p => ({
        ...p,
        student: p.student_fees?.students || null,
        course: p.student_fees?.fee_structures?.courses?.course_name || null,
        receipt: p.receipts?.[0] || null,
        invoice: p.invoices?.[0] || null,
      }));
      return { data: payments, count };
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const allPayments = React.useMemo(() => {
    const flat = paymentsData?.pages.flatMap(p => p.data) || [];
    const seen = new Set();
    return flat.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [paymentsData]);

  // ── Fetch Student Fees ──
  const {
    data: feesData,
    isLoading: feesLoading,
    fetchNextPage: fetchMoreFees,
    hasNextPage: hasMoreFees,
    isFetchingNextPage: isFetchingMoreFees,
  } = useInfiniteQuery({
    queryKey: ["studentFees", feeSearch, feeStatusFilter, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getStudentFees({ pageParam, filters: { search: feeSearch, status: feeStatusFilter }, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId && activeTab === "fees",
    staleTime: 2 * 60 * 1000,
  });

  const studentFees = React.useMemo(() => {
    const flat = feesData?.pages.flatMap(p => p.data) || [];
    const seen = new Set();
    return flat.filter(f => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [feesData]);

  // ── Fetch dropdowns ──
  const { data: students = [] } = useQuery({
    queryKey: ["students-dropdown", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, admission_no")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("first_name");
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: feeStructures = [] } = useQuery({
    queryKey: ["feeStructures-dropdown", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_structures")
        .select(`
          id, fee_amount, installment_allowed,
          courses(course_name),
          fee_structure_components (
            id, component_name, amount, is_taxable, tax_rate_id, tax_inclusive,
            tax_rates ( id, name, rate )
          )
        `)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("id");
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ── Mutations ──
const deletePaymentMutation = useMutation({
  mutationFn: async (paymentId) => {
    // Delete allocations first
    await supabase.from("payment_allocations").delete().eq("payment_id", paymentId);
    const { error } = await supabase.from("fee_payments").delete().eq("id", paymentId);
    if (error) throw error;
  },

    onSuccess: () => {
      message.success("Payment deleted");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
    },
    onError: (err) => message.error(err.message),
  });

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

  const deleteFeeMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => message.error(err.message),
  });

  // ── Print functions ──
  const handlePrintReceipt = async (paymentId) => {
    setPrintingReceipt(true);
    try {
      const { data: receipt, error } = await supabase
        .from("receipts")
        .select(`*, students (*), fee_payments (*)`)
        .eq("payment_id", paymentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (error) throw error;
      await generateReceiptPdf(receipt, { theme });
      message.success("Receipt downloaded");
    } catch (err) {
      console.error(err);
      message.error("Failed to generate receipt PDF");
    } finally {
      setPrintingReceipt(false);
    }
  };

const handlePrintInvoice = async (invoiceId) => {
  setPrintingInvoice(true);
  try {
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*, invoice_items(*), students(*), receipt_id")   // ← added receipt_id
      .eq("id", invoiceId)
      .eq("branch_id", branchId)
      .eq("financial_year_id", financialYearId)
      .single();
    if (error) throw error;
    const doc = await generateInvoicePDF(invoice, org, 'sales', { theme });
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    message.success("Invoice opened");
  } catch (err) {
    console.error(err);
    message.error("Failed to generate invoice");
  } finally {
    setPrintingInvoice(false);
  }
};

  const handleResendReceiptEmail = async (paymentId) => {
    setSendingEmailId(paymentId);
    try {
      await sendFeeReceiptEmail(paymentId, org);
      message.success("Receipt email sent");
    } catch (err) {
      console.error(err);
      message.error("Failed to send email");
    } finally {
      setSendingEmailId(null);
    }
  };

  const sendReportEmail = async () => {
    if (allPayments.length === 0) {
      message.warning("No payments to send.");
      return;
    }
    try {
      const adminEmails = await getAdminEmails();
      if (!adminEmails.length) {
        message.warning("No admin emails found.");
        return;
      }
      const rows = allPayments.map(p => {
        const studentName = p.student ? `${p.student.first_name} ${p.student.last_name}` : '—';
        return `
          <tr>
            <td>${studentName}</td>
            <td>${formatCurrency(p.amount)}</td>
            <td>${p.payment_date}</td>
            <td>${p.payment_mode}</td>
            <td>${p.receipt?.receipt_no || '—'}</td>
            <td>${p.invoice?.invoice_number || '—'}</td>
          </tr>
        `;
      }).join('');
      const html = `
        <h2>Payment Report</h2>
        <table border="1" cellpadding="4" style="border-collapse:collapse;">
          <thead><tr><th>Student</th><th>Amount</th><th>Date</th><th>Mode</th><th>Receipt</th><th>Invoice</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p>Total Payments: ${allPayments.length}</p>
        <p>Total Amount: ${formatCurrency(allPayments.reduce((s, p) => s + Number(p.amount), 0))}</p>
      `;
      await sendEmail({ to: adminEmails, subject: `Payment Report - ${dayjs().format("DD-MMM-YYYY")}`, html });
      message.success("Report sent to admins.");
    } catch (err) {
      console.error(err);
      message.error("Failed to send report");
    }
  };

  const handleExportPayments = () => {
    if (!allPayments.length) {
      message.warning("No payments to export.");
      return;
    }
    const csvData = allPayments.map(p => ({
      Student: p.student ? `${p.student.first_name} ${p.student.last_name}` : '—',
      Amount: p.amount,
      Date: p.payment_date,
      Mode: p.payment_mode,
      Receipt: p.receipt?.receipt_no || '—',
      Invoice: p.invoice?.invoice_number || '—',
      Status: p.invoice?.status || '—',
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments_${dayjs().format("YYYY-MM-DD")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("Export complete");
  };

  const handleExportFees = async () => {
    try {
      const allData = await getAllStudentFeesForExport({ search: feeSearch, status: feeStatusFilter }, branchId, financialYearId);
      if (!allData.length) {
        message.warning("No fee records to export.");
        return;
      }
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
      message.success("Export complete");
    } catch (err) {
      console.error(err);
      message.error("Export failed");
    }
  };

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
    event.target.value = null;
  };

  // ── Fee assignment handlers ──
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

  // ── Helper for fee actions ──
  const handlePrintReceiptFromFee = async (fee) => {
    try {
      const { data: payments } = await supabase
        .from("fee_payments")
        .select("id")
        .eq("student_fee_id", fee.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("payment_date", { ascending: false })
        .limit(1);
      if (payments && payments.length) {
        await handlePrintReceipt(payments[0].id);
      } else {
        message.warning("No payment found");
      }
    } catch (err) {
      message.error("Failed to fetch payment");
    }
  };

  const handlePrintInvoiceFromFee = async (fee) => {
    try {
      // Fetch invoices for this fee
      const invoices = await getInvoices({ student_fee_id: fee.id }, branchId, financialYearId);
      if (!invoices || invoices.length === 0) {
        message.warning("No invoices found. Generate one first.");
        return;
      }
      // If multiple, show a selection modal or just use the latest
      if (invoices.length === 1) {
        await handlePrintInvoice(invoices[0].id);
      } else {
        // Show a modal to select invoice
        showInvoiceSelectionModal(invoices);
      }
    } catch (err) {
      message.error("Failed to fetch invoices");
    }
  };

  // ── Invoice selection modal ──
  const [invoiceSelectionModal, setInvoiceSelectionModal] = useState({ visible: false, invoices: [] });
  const showInvoiceSelectionModal = (invoices) => {
    setInvoiceSelectionModal({ visible: true, invoices });
  };

  // ── Load invoices/receipts for expanded fee ──
  const toggleExpandFee = async (feeId) => {
    if (expandedFeeId === feeId) {
      setExpandedFeeId(null);
      return;
    }
    setExpandedFeeId(feeId);
    // Load invoices and receipts
    setLoadingInvoices(prev => ({ ...prev, [feeId]: true }));
    try {
      const [invoices, payments] = await Promise.all([
        getInvoices({ student_fee_id: feeId }, branchId, financialYearId),
        supabase
          .from("fee_payments")
          .select("*, receipts(*)")
          .eq("student_fee_id", feeId)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId)
          .order("payment_date", { ascending: false })
      ]);
      setInvoicesMap(prev => ({ ...prev, [feeId]: invoices || [] }));
      setReceiptsMap(prev => ({ ...prev, [feeId]: payments.data || [] }));
    } catch (err) {
      console.error(err);
      message.error("Failed to load invoices/receipts");
    } finally {
      setLoadingInvoices(prev => ({ ...prev, [feeId]: false }));
    }
  };

  // ── Columns ──
  const paymentColumns = [
    {
      title: "Student",
      render: (_, p) => (
        <span>
          {p.student ? `${p.student.first_name} ${p.student.last_name}` : '—'}
          <div style={{ fontSize: 12, color: "#888" }}>{p.student?.admission_no || ''}</div>
        </span>
      ),
      sorter: (a, b) => ((a.student?.first_name || '') + (a.student?.last_name || '')).localeCompare((b.student?.first_name || '') + (b.student?.last_name || '')),
    },
    {
      title: "Amount",
      dataIndex: "amount",
      render: (val) => <Text strong>{formatCurrency(val)}</Text>,
      sorter: (a, b) => a.amount - b.amount,
    },
    {
      title: "Date",
      dataIndex: "payment_date",
      sorter: (a, b) => dayjs(a.payment_date).unix() - dayjs(b.payment_date).unix(),
    },
    {
      title: "Mode",
      dataIndex: "payment_mode",
      filters: [
        { text: "Cash", value: "Cash" },
        { text: "Card", value: "Card" },
        { text: "UPI", value: "UPI" },
        { text: "Bank Transfer", value: "Bank Transfer" },
      ],
      onFilter: (value, record) => record.payment_mode === value,
    },
    {
      title: "Receipt",
      render: (_, p) => p.receipt ? <Tag color={primaryColor}>{p.receipt.receipt_no}</Tag> : <Tag color="orange">No Receipt</Tag>,
    },
    {
      title: "Invoice",
      render: (_, p) => p.invoice ? <Tag color={primaryColor}>{p.invoice.invoice_number}</Tag> : <Tag color="default">—</Tag>,
    },
    {
      title: "Actions",
      width: 280,
      render: (_, p) => (
        <Space size="small">
          {p.receipt && (
            <Tooltip title="Print Receipt">
              <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrintReceipt(p.id)} loading={printingReceipt} />
            </Tooltip>
          )}
          {p.invoice && (
            <Tooltip title="Print Invoice">
              <Button size="small" icon={<FilePdfOutlined />} onClick={() => handlePrintInvoice(p.invoice.id)} loading={printingInvoice} />
            </Tooltip>
          )}
          <Tooltip title="Email Receipt">
            <Button
              size="small"
              icon={<MailOutlined />}
              onClick={() => handleResendReceiptEmail(p.id)}
              loading={sendingEmailId === p.id}
              disabled={!p.receipt}
            />
          </Tooltip>
          <Tooltip title="Delete Payment">
            <Popconfirm
              title="Delete this payment?"
              onConfirm={() => deletePaymentMutation.mutate(p.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const feeColumns = [
    {
      title: "Student",
      render: (_, record) => (
        <span>
          {record.students?.first_name} {record.students?.last_name}
          <div style={{ fontSize: 12, color: "#888" }}>{record.students?.admission_no}</div>
        </span>
      ),
      sorter: (a, b) => `${a.students?.first_name} ${a.students?.last_name}`.localeCompare(`${b.students?.first_name} ${b.students?.last_name}`),
    },
    {
      title: "Course",
      dataIndex: ["fee_structures", "courses", "course_name"],
    },
    {
      title: "Total Fee",
      dataIndex: "final_fee",
      render: (val) => formatCurrency(val),
      sorter: (a, b) => a.final_fee - b.final_fee,
    },
    {
      title: "Paid",
      dataIndex: "total_paid",
      render: (val) => formatCurrency(val || 0),
    },
    {
      title: "Balance",
      dataIndex: "pending",
      render: (val) => <Text style={{ color: val > 0 ? accentColor : "#52c41a" }}>{formatCurrency(val)}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag color={status === "Paid" ? primaryColor : accentColor}>{status}</Tag>,
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
          <Tooltip title="Generate Invoice"><Button size="small" icon={<FileTextOutlined />} onClick={() => setConfirmInvoice(record.id)} /></Tooltip>
          <Tooltip title="Print Receipt">
            <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrintReceiptFromFee(record)} />
          </Tooltip>
          <Tooltip title="Print Invoice">
            <Button size="small" icon={<FilePdfOutlined />} onClick={() => handlePrintInvoiceFromFee(record)} />
          </Tooltip>
          <Tooltip title="Delete"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => setConfirmDelete(record.id)} /></Tooltip>
        </Space>
      ),
    },
  ];

  // ── Render ──
  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
        <Tabs.TabPane tab="Payments" key="payments">
          {/* Payment filters and table (unchanged) */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 8]} align="middle">
              <Col xs={24} sm={8}>
                <Input
                  placeholder="Search by student name / admission no"
                  prefix={<SearchOutlined />}
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  allowClear
                />
              </Col>
              <Col xs={12} sm={6}>
                <Select
                  allowClear
                  placeholder="Payment Mode"
                  value={paymentMode}
                  onChange={setPaymentMode}
                  style={{ width: "100%" }}
                >
                  <Select.Option value="Cash">Cash</Select.Option>
                  <Select.Option value="Card">Card</Select.Option>
                  <Select.Option value="UPI">UPI</Select.Option>
                  <Select.Option value="Bank Transfer">Bank Transfer</Select.Option>
                </Select>
              </Col>
              <Col xs={12} sm={6}>
                <Select
                  allowClear
                  placeholder="Receipt Status"
                  value={paymentStatus}
                  onChange={setPaymentStatus}
                  style={{ width: "100%" }}
                >
                  <Select.Option value="has_receipt">Has Receipt</Select.Option>
                  <Select.Option value="no_receipt">No Receipt</Select.Option>
                </Select>
              </Col>
              <Col xs={24} sm={4}>
                <Button
                  icon={<FilterOutlined />}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? "Hide" : "Show"} Date Range
                </Button>
              </Col>
            </Row>
            {showFilters && (
              <Row style={{ marginTop: 8 }}>
                <Col span={24}>
                  <RangePicker
                    onChange={(dates) => setPaymentDateRange(dates)}
                    style={{ width: "100%" }}
                  />
                </Col>
              </Row>
            )}
          </Card>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12}>
              <Space>
                <Button icon={<ExportOutlined />} onClick={handleExportPayments}>Export CSV</Button>
                <Button icon={<MailOutlined />} onClick={sendReportEmail}>Send Report</Button>
                <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ["payments"] })}>Refresh</Button>
              </Space>
            </Col>
            <Col xs={24} sm={12} style={{ textAlign: "right" }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setActiveTab("fees")}>Assign Fee</Button>
            </Col>
          </Row>

          <Table
            columns={paymentColumns}
            dataSource={allPayments}
            rowKey="id"
            loading={paymentsLoading}
            pagination={false}
            scroll={{ x: 1000 }}
            expandable={{
              expandedRowRender: (record) => (
                <div style={{ padding: 8 }}>
                  <p><strong>Course:</strong> {record.course || '—'}</p>
                  <p><strong>Transaction No:</strong> {record.transaction_no || '—'}</p>
                  <p><strong>Remarks:</strong> {record.remarks || '—'}</p>
                  {record.receipt && <p><strong>Receipt No:</strong> {record.receipt.receipt_no}</p>}
                  {record.invoice && <p><strong>Invoice No:</strong> {record.invoice.invoice_number} (Status: {record.invoice.status})</p>}
                </div>
              ),
            }}
          />
          {hasMorePayments && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <Button onClick={() => fetchMorePayments()} loading={isFetchingMorePayments}>Load More</Button>
            </div>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane tab="Fee Records" key="fees">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Input
                placeholder="Search by student name..."
                prefix={<SearchOutlined />}
                value={feeSearch}
                onChange={(e) => setFeeSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={16}>
              <Space wrap style={{ float: "right" }}>
                <Select
                  allowClear
                  placeholder="Status"
                  value={feeStatusFilter}
                  onChange={setFeeStatusFilter}
                  style={{ width: 120 }}
                  options={[
                    { label: "Paid", value: "Paid" },
                    { label: "Pending", value: "Pending" },
                  ]}
                />
                <Button icon={<ExportOutlined />} onClick={handleExportFees}>Export</Button>
                <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>Import</Button>
                <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleImport} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openAssign(null)}>Assign Fee</Button>
              </Space>
            </Col>
          </Row>

          {selectedRowKeys.length > 0 && (
            <div style={{ marginBottom: 16, background: primaryBg, padding: "8px 16px", borderRadius: 8 }}>
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
            columns={feeColumns}
            dataSource={studentFees}
            rowKey="id"
            loading={feesLoading}
            pagination={false}
            expandable={{
              expandedRowKeys: expandedFeeId ? [expandedFeeId] : [],
              onExpand: (expanded, record) => {
                if (expanded) toggleExpandFee(record.id);
                else setExpandedFeeId(null);
              },
              expandedRowRender: (record) => {
                const feeId = record.id;
                const isLoading = loadingInvoices[feeId];
                const invoices = invoicesMap[feeId] || [];
                const receipts = receiptsMap[feeId] || [];

                return (
                  <div style={{ padding: 8 }}>
                    <h4>Invoices</h4>
                    {isLoading ? (
                      <Text type="secondary">Loading...</Text>
                    ) : invoices.length === 0 ? (
                      <Text type="secondary">No invoices found.</Text>
                    ) : (
                      <Table
                        dataSource={invoices}
                        columns={[
                          { title: "Invoice #", dataIndex: "invoice_number" },
                          { title: "Date", dataIndex: "invoice_date" },
                          { title: "Total", dataIndex: "grand_total", render: val => formatCurrency(val) },
                          { title: "Paid", dataIndex: "paid_amount", render: val => formatCurrency(val || 0) },
                          { title: "Balance", dataIndex: "balance_due", render: val => formatCurrency(val || 0) },
                          {
                            title: "Status",
                            dataIndex: "status",
                            render: (status) => (
                              <Tag color={status === "Paid" ? primaryColor : accentColor}>
                                {status}
                              </Tag>
                            ),
                          },
                          {
                            title: "Action",
                            render: (_, inv) => (
                              <Button
                                size="small"
                                icon={<FilePdfOutlined />}
                                onClick={() => handlePrintInvoice(inv.id)}
                                loading={printingInvoice}
                              >
                                Print
                              </Button>
                            ),
                          },
                        ]}
                        rowKey="id"
                        pagination={false}
                        size="small"
                      />
                    )}

                    <h4 style={{ marginTop: 16 }}>Receipts</h4>
                    {isLoading ? (
                      <Text type="secondary">Loading...</Text>
                    ) : receipts.length === 0 ? (
                      <Text type="secondary">No receipts found.</Text>
                    ) : (
                      <Table
                        dataSource={receipts}
                        columns={[
                          { title: "Receipt #", dataIndex: ["receipts", "receipt_no"] },
                          { title: "Date", dataIndex: "payment_date" },
                          { title: "Amount", dataIndex: "amount", render: val => formatCurrency(val) },
                          { title: "Mode", dataIndex: "payment_mode" },
                          {
                            title: "Invoice",
                            dataIndex: "invoice_id",
                            render: (invoiceId) => {
                              if (!invoiceId) return "—";
                              const inv = invoices.find(i => i.id === invoiceId);
                              return inv ? inv.invoice_number : "—";
                            },
                          },
                          {
                            title: "Action",
                            render: (_, rec) => (
                              <Button
                                size="small"
                                icon={<PrinterOutlined />}
                                onClick={() => handlePrintReceipt(rec.id)}
                                loading={printingReceipt}
                              >
                                Print
                              </Button>
                            ),
                          },
                        ]}
                        rowKey="id"
                        pagination={false}
                        size="small"
                      />
                    )}
                  </div>
                );
              },
            }}
          />
          {hasMoreFees && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <Button onClick={() => fetchMoreFees()} loading={isFetchingMoreFees}>Load More</Button>
            </div>
          )}
        </Tabs.TabPane>
      </Tabs>

      {/* ─── Modals and Drawers ─────────────────────────────────────── */}

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
        primaryColor={primaryColor}
      />

      {collectingFee && (
        <CollectPaymentModal
          fee={collectingFee}
          onClose={() => setCollectingFee(null)}
          onSuccess={() => {
            setCollectingFee(null);
            queryClient.invalidateQueries({ queryKey: ["studentFees"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
          }}
        />
      )}

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

      {/* Invoice Selection Modal */}
      <Modal
        title="Select Invoice to Print"
        open={invoiceSelectionModal.visible}
        onCancel={() => setInvoiceSelectionModal({ visible: false, invoices: [] })}
        footer={null}
        destroyOnHidden
      >
        <div style={{ marginTop: 16 }}>
          {invoiceSelectionModal.invoices.map(inv => (
            <div key={inv.id} style={{ padding: 8, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{inv.invoice_number} – {formatCurrency(inv.grand_total)} ({inv.status})</span>
              <Button
                type="primary"
                size="small"
                icon={<FilePdfOutlined />}
                onClick={() => {
                  handlePrintInvoice(inv.id);
                  setInvoiceSelectionModal({ visible: false, invoices: [] });
                }}
              >
                Print
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          message="Delete this fee record?"
          onConfirm={() => { deleteFeeMutation.mutate(confirmDelete); setConfirmDelete(null); }}
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

// ─── Helper Components ────────────────────────────────────────────────

function FeeAssignDrawer({ open, editingFee, students, feeStructures, onSubmit, onClose, loading, primaryColor }) {
  const [form] = Form.useForm();
  const [enableInstallments, setEnableInstallments] = useState(false);
  const [installments, setInstallments] = useState([]);
  const [selectedStructure, setSelectedStructure] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (editingFee) {
      const structure = feeStructures.find(fs => fs.id === editingFee.fee_structure_id);
      setSelectedStructure(structure || null);
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
      setSelectedStructure(null);
    }
  }, [open, editingFee, form, feeStructures]);

  const handleStructureChange = (id) => {
    const structure = feeStructures.find(s => s.id === id);
    setSelectedStructure(structure || null);
    if (structure) {
      form.setFieldsValue({
        total_fee: structure.fee_amount,
        final_fee: structure.fee_amount,
      });
    }
  };

  const handleFinish = (values) => {
    const payload = {
      ...values,
      installments_enabled: enableInstallments,
      installments: enableInstallments ? installments : null,
    };
    onSubmit(payload);
  };

  // Component display table
  const componentColumns = [
    { title: "Component", dataIndex: "component_name", key: "name" },
    { title: "Amount", dataIndex: "amount", render: (val) => formatCurrency(val), align: "right" },
    { title: "Tax Rate", dataIndex: "tax_rates", render: (tax) => tax ? `${tax.name} (${tax.rate}%)` : "No Tax", align: "center" },
    { title: "Tax Type", dataIndex: "tax_inclusive", render: (val) => val ? "Inclusive" : "Exclusive", align: "center" },
  ];

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
              label: `${fs.courses?.course_name} (${formatCurrency(fs.fee_amount)})`,
              value: fs.id,
            }))}
            onChange={handleStructureChange}
          />
        </Form.Item>

        {selectedStructure && selectedStructure.fee_structure_components && selectedStructure.fee_structure_components.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Components included:</Text>
            <Table
              dataSource={selectedStructure.fee_structure_components}
              columns={componentColumns}
              rowKey="id"
              pagination={false}
              size="small"
              style={{ marginTop: 8 }}
            />
          </div>
        )}

        <Form.Item name="total_fee" label="Total Fee">
          <InputNumber style={{ width: "100%" }} disabled />
        </Form.Item>
        <Form.Item name="discount" label="Discount">
          <InputNumber style={{ width: "100%" }} min={0} onChange={() => {
            const total = form.getFieldValue("total_fee") || 0;
            const discount = form.getFieldValue("discount") || 0;
            form.setFieldsValue({ final_fee: total - discount });
          }} />
        </Form.Item>
        <Form.Item name="final_fee" label="Final Fee">
          <InputNumber style={{ width: "100%" }} disabled />
        </Form.Item>

        <Form.Item name="status" label="Status">
          <Select>
            <Select.Option value="Pending">Pending</Select.Option>
            <Select.Option value="Paid">Paid</Select.Option>
          </Select>
        </Form.Item>

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
  const add = () => onChange([...installments, { amount: 0, due_date: "" }]);
  const update = (index, field, value) => {
    const updated = [...installments];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };
  const remove = (index) => onChange(installments.filter((_, i) => i !== index));
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
        Total installments: {formatCurrency(installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0))} / {formatCurrency(totalAmount)}
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
            label: `${fs.courses?.course_name} (${formatCurrency(fs.fee_amount)})`,
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
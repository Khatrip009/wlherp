// src/components/FeeManagement.jsx
import { useState } from "react";
import {
  Drawer,
  Descriptions,
  Table,
  Button,
  Space,
  message,
  Tag,
  Spin,
} from "antd";

import {
  DollarOutlined,
  FileTextOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStudentFees,
  getPayments,
  generateInvoiceFromStudentFee,
  getStudentFeeComponents,
} from "../services/feeService";
import { getInvoices, getInvoice } from "../services/invoiceService";
import { useOrg } from "../context/OrganizationContext";
import CollectPaymentModal from "./CollectPaymentModal";
import { generateInvoicePDF } from "../utils/invoicePdf";
import { useTheme } from "../context/ThemeContext";   // dynamic theme

export default function FeeManagement({ studentId, open, onClose }) {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear, org } = useOrg();
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };
  const theme = useTheme();

  const [collectingFee, setCollectingFee] = useState(null);
  const [printingInvoice, setPrintingInvoice] = useState(false);

  // Fetch the student fee record
  const { data: fee, isLoading, isError } = useQuery({
    queryKey: ["student-fee", studentId, ctx],
    queryFn: async () => {
      const result = await getStudentFees({
        pageParam: 0,
        filters: {},
        branchId: ctx.branchId,
        financialYearId: ctx.financialYearId,
      });
      const allFees = result.data || [];
      return allFees.find((f) => f.student_id == studentId) || null;
    },
    enabled: !!open && !!studentId,
  });

  // Fetch payments for the specific fee
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", fee?.id, ctx],
    queryFn: () => getPayments(fee.id, ctx.branchId, ctx.financialYearId),
    enabled: !!fee?.id,
  });

  // Fetch student fee components
  const { data: components = [], isLoading: loadingComponents } = useQuery({
    queryKey: ["student-fee-components", fee?.id, ctx],
    queryFn: () => getStudentFeeComponents(fee.id, ctx.branchId, ctx.financialYearId),
    enabled: !!fee?.id,
  });

  // Fetch invoices for this fee
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["student-invoices", fee?.id, ctx],
    queryFn: () => getInvoices({ student_fee_id: fee.id }, ctx.branchId, ctx.financialYearId),
    enabled: !!fee?.id,
  });

  // Mutation to generate invoice
  const generateInvoiceMutation = useMutation({
    mutationFn: () => {
      if (!fee) throw new Error("No fee record found");
      return generateInvoiceFromStudentFee(fee.id, null, ctx);
    },
    onSuccess: () => {
      message.success("Invoice generated successfully");
      queryClient.invalidateQueries({ queryKey: ["student-fee", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-invoices", fee?.id] });
    },
    onError: (err) => message.error(err.message),
  });

  // Print invoice handler
  const handlePrintInvoice = async (invoiceId) => {
    setPrintingInvoice(true);
    try {
      const invoice = await getInvoice(invoiceId, ctx.branchId, ctx.financialYearId);
      if (!invoice) throw new Error("Invoice not found");
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

  if (!open) return null;

  return (
    <Drawer
      title="Fee Management"
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose
    >
      {isLoading ? (
        <Spin style={{ display: "block", textAlign: "center", marginTop: 40 }} />
      ) : isError || !fee ? (
        <div>
          <p>No fee record found for this student.</p>
          <Button type="primary" onClick={() => message.info("Assign fee structure feature coming soon")}>
            Assign Fee Structure
          </Button>
        </div>
      ) : (
        <>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Course">
              {fee.fee_structures?.courses?.course_name || "N/A"}
            </Descriptions.Item>
            <Descriptions.Item label="Total Fee">
              ₹{Number(fee.final_fee).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Paid">
              <span style={{ color: theme?.primary_color }}>
                ₹{(fee.total_paid || 0).toLocaleString()}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Balance">
              <span style={{ color: theme?.accent_color }}>
                ₹{(fee.pending || 0).toLocaleString()}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={fee.status === "Paid" ? "green" : "volcano"}>
                {fee.status}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          {/* Fee Components Breakdown */}
          {!loadingComponents && components.length > 0 && (
            <>
              <h4 style={{ marginTop: 16 }}>Fee Breakdown</h4>
              <Table
                dataSource={components}
                columns={[
                  {
                    title: "Component",
                    dataIndex: ["fee_structure_components", "component_name"],
                    render: (text) => text || "N/A",
                  },
                  {
                    title: "Due",
                    dataIndex: "due_amount",
                    render: (val) => `₹${Number(val).toFixed(2)}`,
                  },
                  {
                    title: "Paid",
                    dataIndex: "paid_amount",
                    render: (val) => `₹${Number(val).toFixed(2)}`,
                  },
                  {
                    title: "Pending",
                    render: (_, record) => {
                      const pending = Math.max(Number(record.due_amount) - Number(record.paid_amount), 0);
                      return `₹${pending.toFixed(2)}`;
                    },
                  },
                  {
                    title: "Status",
                    dataIndex: "status",
                    render: (status) => (
                      <Tag color={status === "Paid" ? "green" : status === "Partial" ? "orange" : "volcano"}>
                        {status}
                      </Tag>
                    ),
                  },
                ]}
                rowKey="id"
                pagination={false}
                size="small"
                style={{ marginTop: 8 }}
              />
            </>
          )}

          {fee.installments?.length > 0 && (
            <>
              <h4 style={{ marginTop: 16 }}>Installments</h4>
              <Table
                dataSource={fee.installments}
                columns={[
                  { title: "#", dataIndex: "installment_number", width: 40 },
                  { title: "Amount", dataIndex: "amount", render: (val) => `₹${val}` },
                  { title: "Due Date", dataIndex: "due_date" },
                  {
                    title: "Status",
                    dataIndex: "status",
                    render: (status) => (
                      <Tag color={status === "Paid" ? "green" : "orange"}>{status}</Tag>
                    ),
                  },
                ]}
                rowKey="id"
                pagination={false}
                size="small"
                style={{ marginTop: 8 }}
              />
            </>
          )}

          <div style={{ marginTop: 24 }}>
            <Space>
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={() => setCollectingFee(fee)}
              >
                Collect Payment
              </Button>
              <Button
                icon={<FileTextOutlined />}
                onClick={() => generateInvoiceMutation.mutate()}
                loading={generateInvoiceMutation.isLoading}
              >
                Generate Invoice
              </Button>
            </Space>
          </div>

          {/* Invoices */}
          {!loadingInvoices && invoices.length > 0 && (
            <>
              <h4 style={{ marginTop: 24 }}>Invoices</h4>
              <Table
                dataSource={invoices}
                columns={[
                  { title: "Invoice #", dataIndex: "invoice_number" },
                  { title: "Date", dataIndex: "invoice_date" },
                  { title: "Total", dataIndex: "grand_total", render: (val) => `₹${Number(val).toFixed(2)}` },
                  { title: "Paid", dataIndex: "paid_amount", render: (val) => `₹${Number(val || 0).toFixed(2)}` },
                  { title: "Balance", dataIndex: "balance_due", render: (val) => `₹${Number(val || 0).toFixed(2)}` },
                  {
                    title: "Status",
                    dataIndex: "status",
                    render: (status) => (
                      <Tag color={status === "Paid" ? "green" : status === "Partially Paid" ? "orange" : "volcano"}>
                        {status}
                      </Tag>
                    ),
                  },
                  {
                    title: "Receipt",
                    dataIndex: "receipt_id",
                    render: (receiptId) => receiptId ? "Yes" : "—",
                  },
                  {
                    title: "Action",
                    render: (_, record) => (
                      <Button
                        size="small"
                        icon={<FilePdfOutlined />}
                        onClick={() => handlePrintInvoice(record.id)}
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
                style={{ marginTop: 8 }}
              />
            </>
          )}

          {/* Payment History */}
          <h4 style={{ marginTop: 24 }}>Payment History</h4>
          <Table
            dataSource={payments}
            columns={[
              { title: "Date", dataIndex: "payment_date" },
              { title: "Amount", dataIndex: "amount", render: (val) => `₹${val}` },
              { title: "Mode", dataIndex: "payment_mode" },
              { title: "Receipt", dataIndex: "receipt_number", render: (val) => val || "—" },
              {
                title: "Invoice",
                dataIndex: "invoice_id",
                render: (invoiceId) => {
                  if (!invoiceId) return "—";
                  const inv = invoices.find(i => i.id === invoiceId);
                  return inv ? inv.invoice_number : "—";
                },
              },
            ]}
            rowKey="id"
            pagination={false}
            size="small"
          />

          {/* ─── Collect Payment Modal ─── */}
          {collectingFee && (
            <CollectPaymentModal
              fee={collectingFee}
              onClose={() => setCollectingFee(null)}
              onSuccess={() => {
                setCollectingFee(null);
                queryClient.invalidateQueries({ queryKey: ["student-fee", studentId] });
                queryClient.invalidateQueries({ queryKey: ["payments", fee?.id] });
                queryClient.invalidateQueries({ queryKey: ["student-fee-components", fee?.id] });
                queryClient.invalidateQueries({ queryKey: ["student-invoices", fee?.id] });
              }}
            />
          )}
        </>
      )}
    </Drawer>
  );
}
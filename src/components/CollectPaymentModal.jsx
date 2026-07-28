// src/components/CollectPaymentModal.jsx
import { useState, useEffect } from "react";
import {
  Modal,
  Form,
  InputNumber,
  Select,
  DatePicker,
  Input,
  Button,
  Space,
  message,
  Descriptions,
  Divider,
  Result,
  Table,
  Typography,
} from "antd";
import { FileTextOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collectPaymentWithAllocation,
  getStudentFeeComponents,
} from "../services/feeService";
import { createInvoice, getInvoices } from "../services/invoiceService";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import { generateReceiptPdf } from "../utils/receiptPdf";
import { generateInvoicePDF } from "../utils/invoicePdf";
import { sendFeeReceiptEmail } from "../services/emailService";

const { Text } = Typography;

export default function CollectPaymentModal({ fee, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { org, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [installments, setInstallments] = useState([]);
  const [loadingInstallments, setLoadingInstallments] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const [components, setComponents] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(true);
  const [componentAllocations, setComponentAllocations] = useState({});

  const [step, setStep] = useState("form");
  const [receiptData, setReceiptData] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [studentName, setStudentName] = useState("");

  // ── Fetch existing invoices for this student (info only) ──
  const { data: existingInvoices = [] } = useQuery({
    queryKey: ["student-invoices", fee.student_id, branchId, financialYearId],
    queryFn: () => getInvoices({ student_id: fee.student_id }, branchId, financialYearId),
    enabled: !!fee.student_id && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Fetch installments ──
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    async function loadInstallments() {
      const { data: instData } = await supabase
        .from("fee_installments")
        .select("*")
        .eq("student_fee_id", fee.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("installment_number");
      setInstallments(instData || []);
      setLoadingInstallments(false);
    }
    loadInstallments();
  }, [fee, branchId, financialYearId]);

  // ── Fetch student fee components ──
  useEffect(() => {
    if (!branchId || !financialYearId || !fee.id) return;
    async function loadComponents() {
      setLoadingComponents(true);
      try {
        const data = await getStudentFeeComponents(fee.id, branchId, financialYearId);
        setComponents(data);
        const allocs = {};
        data.forEach(comp => {
          const pending = Math.max(Number(comp.due_amount) - Number(comp.paid_amount), 0);
          allocs[comp.id] = pending > 0 ? pending : 0;
        });
        setComponentAllocations(allocs);
      } catch (err) {
        console.error("Failed to load fee components:", err);
        message.error("Could not load fee breakdown");
      } finally {
        setLoadingComponents(false);
      }
    }
    loadComponents();
  }, [fee, branchId, financialYearId]);

  // ── Compute inclusive totals for the summary ──
  const totalInclusiveFee = components.reduce((sum, c) => sum + Number(c.due_amount), 0);
  const totalInclusivePaid = components.reduce((sum, c) => sum + Number(c.paid_amount), 0);
  const inclusiveBalance = Math.max(totalInclusiveFee - totalInclusivePaid, 0);

  // ── Compute totals (base, tax, total) for the current allocation ──
  const computeTotals = () => {
    let totalBase = 0;
    let totalTax = 0;
    let totalPayable = 0;
    const breakdown = [];

    components.forEach(comp => {
      const entered = Number(componentAllocations[comp.id] || 0);
      if (entered <= 0) return;

      const taxRate = comp.fee_structure_components?.tax_rates?.rate || 0;
      const rate = taxRate / 100;
      const taxInclusive = comp.fee_structure_components?.tax_inclusive !== undefined
        ? comp.fee_structure_components.tax_inclusive
        : false;

      let base, tax, total;
      if (taxInclusive) {
        total = entered;
        if (rate > 0) {
          base = entered / (1 + rate);
          tax = entered - base;
        } else {
          base = entered;
          tax = 0;
        }
      } else {
        base = entered;
        tax = entered * rate;
        total = base + tax;
      }

      base = Math.round(base * 100) / 100;
      tax = Math.round(tax * 100) / 100;
      total = Math.round(total * 100) / 100;

      totalBase += base;
      totalTax += tax;
      totalPayable += total;

      breakdown.push({
        componentId: comp.id,
        componentName: comp.fee_structure_components?.component_name || "Component",
        entered,
        base,
        tax,
        total,
        rate: taxRate,
        taxInclusive,
        taxRateId: comp.fee_structure_components?.tax_rate_id || null,
      });
    });

    return {
      totalBase: Math.round(totalBase * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalPayable: Math.round(totalPayable * 100) / 100,
      breakdown,
    };
  };

  const totals = computeTotals();

  useEffect(() => {
    form.setFieldValue("amount", totals.totalPayable);
  }, [totals.totalPayable, form]);

  // ── Print handlers ──
  const handlePrintReceipt = async () => {
    if (!receiptData) {
      message.error("Receipt data not available");
      return;
    }
    try {
      const { data: fullReceipt, error } = await supabase
        .from("receipts")
        .select(`*, students (*), fee_payments (*)`)
        .eq("id", receiptData.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (error) throw error;
      await generateReceiptPdf(fullReceipt, { theme });
      message.success("Receipt PDF downloaded");
    } catch (err) {
      console.error(err);
      message.error("Failed to generate receipt PDF");
    }
  };

  const handlePrintInvoice = async () => {
    if (!invoiceId) {
      message.error("Invoice ID not available");
      return;
    }
    try {
      const { data: invoice, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*), students(*), receipt_id")
        .eq("id", invoiceId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (error) throw error;

      const doc = await generateInvoicePDF(invoice, org, 'sales', {
        theme,
        receiptNumber: receiptData?.receipt_no,
      });
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
      message.success("Invoice PDF opened in new tab");
    } catch (err) {
      console.error(err);
      message.error("Failed to generate invoice PDF");
    }
  };

  // ─── Create invoice from allocated amounts ──────────────────────────
  const createInvoiceFromAllocations = async (breakdown, totalPayable, receiptId = null) => {
    const items = breakdown.map(b => ({
      item_type: "fee_component",
      description: b.componentName,
      quantity: 1,
      unit_price: b.base,
      tax_rate_id: b.taxRateId,
      tax_inclusive: false,
      hsn_sac_code: '999294',
    }));

    if (items.length === 0) {
      items.push({
        item_type: "fee_payment",
        description: `Fee Payment - ${fee.fee_structures?.courses?.course_name || "N/A"}`,
        quantity: 1,
        unit_price: totalPayable,
        tax_rate_id: null,
        tax_inclusive: false,
      });
    }

    const payload = {
      student_id: fee.student_id,
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: null,
      payment_terms: "Immediate",
      gst_applicable: totals.totalTax > 0,
      place_of_supply: fee.students?.state_code || "",
      reverse_charge: false,
      items,
      student_fee_id: fee.id,
      fee_installment_id: null,
      receipt_id: receiptId,
      status: "Final",
    };
    const result = await createInvoice(payload, ctx);
    return result.id;
  };

  // ── Submit payment ──
  const onFinish = async (values) => {
    const allocations = totals.breakdown
      .filter(b => b.entered > 0)
      .map(b => ({
        studentFeeComponentId: b.componentId,
        amount: b.total,
        baseAmount: b.base,
        taxAmount: b.tax,
        taxRateId: b.taxRateId,
      }));

    if (allocations.length === 0) {
      message.error("Please allocate at least one component");
      return;
    }

    const payable = totals.totalPayable;
    if (payable <= 0) {
      message.error("Invalid payment amount");
      return;
    }

    try {
      setCreatingInvoice(true);
      const finalInvoiceId = await createInvoiceFromAllocations(totals.breakdown, payable);
      setCreatingInvoice(false);

      const payment = await collectPaymentWithAllocation({
        studentFeeId: fee.id,
        paymentDate: values.payment_date ? values.payment_date.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        paymentMode: values.payment_mode,
        transactionNo: values.transaction_no,
        remarks: values.remarks,
        installmentId: values.installment_id || null,
        allocations: allocations.map(a => ({
          studentFeeComponentId: a.studentFeeComponentId,
          amount: a.amount,
          baseAmount: a.baseAmount,
          taxAmount: a.taxAmount,
        })),
        generatedBy: profile?.id,
        invoiceId: finalInvoiceId,
      }, ctx);

      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .select("*")
        .eq("payment_id", payment.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (receiptError) {
        console.warn("Receipt not found for payment", payment.id);
      } else {
        setReceiptData(receipt);
        if (finalInvoiceId && receipt) {
          await supabase
            .from("invoices")
            .update({ receipt_id: receipt.id })
            .eq("id", finalInvoiceId);
        }
      }

      setInvoiceId(finalInvoiceId);
      setPaymentAmount(payment.amount);
      setStudentName(`${fee.students?.first_name} ${fee.students?.last_name}`);
      setStep("success");

      if (org && payment.id) {
        sendFeeReceiptEmail(payment.id, org).catch((emailErr) =>
          console.error("Failed to send receipt email", emailErr)
        );
      }

      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
      queryClient.invalidateQueries({ queryKey: ["student-invoices"] });
      onSuccess?.();
    } catch (err) {
      setCreatingInvoice(false);
      console.error(err);
      message.error(err.message || "Payment failed");
    }
  };

  // ── Handlers for allocation changes ──
  const handleAllocationChange = (componentId, value) => {
    const comp = components.find(c => c.id === componentId);
    if (!comp) return;
    const pending = Math.max(Number(comp.due_amount) - Number(comp.paid_amount), 0);
    let num = Number(value);
    if (isNaN(num) || num < 0) num = 0;
    if (num > pending) num = pending;
    setComponentAllocations(prev => ({
      ...prev,
      [componentId]: num,
    }));
  };

  const handlePayAll = () => {
    const allocs = {};
    components.forEach(comp => {
      const pending = Math.max(Number(comp.due_amount) - Number(comp.paid_amount), 0);
      allocs[comp.id] = pending;
    });
    setComponentAllocations(allocs);
  };

  const handleClose = () => {
    setStep("form");
    onClose();
  };

  // ── Render ──
  return (
    <Modal
      title={
        step === "form"
          ? `Collect Payment - ${fee.students?.first_name} ${fee.students?.last_name}`
          : "Payment Successful"
      }
      open
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width={step === "form" ? 680 : 480}
    >
      {step === "form" ? (
        <>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Course">
              {fee.fee_structures?.courses?.course_name || "N/A"}
            </Descriptions.Item>
            <Descriptions.Item label="Total Fee (incl. tax)">
              ₹{totalInclusiveFee.toLocaleString("en-IN")}
            </Descriptions.Item>
            {totalInclusivePaid > 0 && (
              <Descriptions.Item label="Paid (incl. tax)">
                ₹{totalInclusivePaid.toLocaleString("en-IN")}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Balance (incl. tax)">
              ₹{inclusiveBalance.toLocaleString("en-IN")}
            </Descriptions.Item>
          </Descriptions>

          <Divider />

          {/* ── Fee Components Allocation ── */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <Text strong>Allocate Payment to Components</Text>
              <Button size="small" onClick={handlePayAll}>Pay All</Button>
            </div>
            {loadingComponents ? (
              <Text type="secondary">Loading components...</Text>
            ) : components.length === 0 ? (
              <Text type="secondary">No components found for this fee.</Text>
            ) : (
              <Table
                dataSource={components}
                rowKey="id"
                pagination={false}
                size="small"
                columns={[
                  {
                    title: "Component",
                    dataIndex: ["fee_structure_components", "component_name"],
                    key: "name",
                  },
                  {
                    title: "Due",
                    dataIndex: "due_amount",
                    render: val => `₹${Number(val).toFixed(2)}`,
                    align: "right",
                  },
                  {
                    title: "Paid",
                    dataIndex: "paid_amount",
                    render: val => `₹${Number(val).toFixed(2)}`,
                    align: "right",
                  },
                  {
                    title: "Pending",
                    render: (_, comp) => {
                      const pending = Math.max(Number(comp.due_amount) - Number(comp.paid_amount), 0);
                      return <Text strong>₹{pending.toFixed(2)}</Text>;
                    },
                    align: "right",
                  },
                  {
                    title: "Pay Now",
                    render: (_, comp) => {
                      const pending = Math.max(Number(comp.due_amount) - Number(comp.paid_amount), 0);
                      return (
                        <InputNumber
                          min={0}
                          max={pending}
                          value={componentAllocations[comp.id] || 0}
                          onChange={(val) => handleAllocationChange(comp.id, val)}
                          style={{ width: 100 }}
                          formatter={value => `₹${value}`}
                          parser={value => value.replace(/₹\s?|(,*)/g, '')}
                        />
                      );
                    },
                  },
                ]}
              />
            )}
          </div>

          {/* ── Tax Breakdown ── */}
          {totals.breakdown.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3 mb-4">
              <Text strong>Tax Breakdown</Text>
              <Table
                dataSource={totals.breakdown}
                rowKey="componentName"
                pagination={false}
                size="small"
                columns={[
                  { title: "Component", dataIndex: "componentName" },
                  {
                    title: "Entered",
                    dataIndex: "entered",
                    render: val => `₹${val.toFixed(2)}`,
                    align: "right",
                  },
                  {
                    title: "Base",
                    dataIndex: "base",
                    render: val => `₹${val.toFixed(2)}`,
                    align: "right",
                  },
                  {
                    title: "Tax",
                    dataIndex: "tax",
                    render: val => `₹${val.toFixed(2)}`,
                    align: "right",
                  },
                  {
                    title: "Total",
                    dataIndex: "total",
                    render: val => `₹${val.toFixed(2)}`,
                    align: "right",
                  },
                  {
                    title: "Rate",
                    render: (_, row) => row.rate > 0 ? `${row.rate}%` : "0%",
                    align: "right",
                  },
                  {
                    title: "Type",
                    render: (_, row) => row.taxInclusive ? "Inclusive" : "Exclusive",
                    align: "center",
                  },
                ]}
              />
              <div className="mt-2 text-right">
                <Text strong>Total Payable: </Text>
                <Text strong>₹{totals.totalPayable.toFixed(2)}</Text>
                <br />
                <Text type="secondary">Base: ₹{totals.totalBase.toFixed(2)}</Text>
                <Text type="secondary" style={{ marginLeft: 12 }}>Tax: ₹{totals.totalTax.toFixed(2)}</Text>
              </div>
            </div>
          )}

          {/* ── Invoice Info ── */}
          <div className="mb-4 p-3 bg-primary-bg rounded border border-primary">
            <Text strong>Invoice: </Text>
            <Text>A new invoice will be created for this payment based on the allocated amounts.</Text>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{
              payment_date: dayjs(),
              amount: totals.totalPayable || 0,
              payment_mode: "Cash",
            }}
          >
            {!loadingInstallments && installments.length > 0 && (
              <Form.Item name="installment_id" label="Installment (optional)">
                <Select
                  placeholder="No specific installment"
                  allowClear
                  options={installments.map((inst) => ({
                    label: `#${inst.installment_number} – ₹${inst.amount} ${inst.due_date ? `(Due ${inst.due_date})` : ""} ${inst.status === "Paid" ? "✓ Paid" : ""}`,
                    value: inst.id,
                  }))}
                />
              </Form.Item>
            )}

            <Form.Item
              name="payment_date"
              label="Payment Date"
              rules={[{ required: true }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item
              name="amount"
              label="Total Payment Amount (Auto-calculated)"
            >
              <InputNumber
                style={{ width: "100%" }}
                value={totals.totalPayable}
                disabled
                formatter={value => `₹${value}`}
              />
            </Form.Item>

            <Form.Item name="payment_mode" label="Payment Mode">
              <Select>
                <Select.Option value="Cash">Cash</Select.Option>
                <Select.Option value="Card">Card</Select.Option>
                <Select.Option value="UPI">UPI</Select.Option>
                <Select.Option value="Bank Transfer">Bank Transfer</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="transaction_no" label="Transaction No / Reference">
              <Input placeholder="e.g., UTR or Cheque No" />
            </Form.Item>

            <Form.Item name="remarks" label="Remarks">
              <Input.TextArea rows={2} placeholder="Any additional note" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Space style={{ float: "right" }}>
                <Button onClick={handleClose}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={creatingInvoice}>
                  Collect Payment
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </>
      ) : (
        <div style={{ textAlign: "center" }}>
          <Result
            status="success"
            title={`₹${paymentAmount.toLocaleString("en-IN")} collected successfully`}
            subTitle={`For ${studentName}`}
          />
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 12 }}>
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              onClick={handlePrintReceipt}
              disabled={!receiptData}
            >
              Print Receipt
            </Button>
            {invoiceId && (
              <Button
                type="primary"
                icon={<FilePdfOutlined />}
                onClick={handlePrintInvoice}
              >
                Print Invoice
              </Button>
            )}
            <Button onClick={handleClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
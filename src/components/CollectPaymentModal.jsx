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
} from "antd";
import { FileTextOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collectPayment } from "../services/feeService";
import { createInvoice, getInvoices } from "../services/invoiceService";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { generateReceiptPdf } from "../utils/receiptPdf";
import { generateInvoicePDF } from "../utils/invoicePdf";
import { sendFeeReceiptEmail } from "../services/emailService";

export default function CollectPaymentModal({ fee, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [installments, setInstallments] = useState([]);
  const [loadingInstallments, setLoadingInstallments] = useState(true);
  const [taxInfo, setTaxInfo] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [createNewInvoice, setCreateNewInvoice] = useState(false);

  // Success state
  const [step, setStep] = useState("form");
  const [receiptData, setReceiptData] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [studentName, setStudentName] = useState("");

  // ── Fetch existing invoices for this student ──
  const { data: existingInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["student-invoices", fee.student_id, branchId, financialYearId],
    queryFn: () => getInvoices({ student_id: fee.student_id }, branchId, financialYearId),
    enabled: !!fee.student_id && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Auto-select an invoice (prefer one linked to this fee)
  useEffect(() => {
    if (existingInvoices.length === 0) {
      setSelectedInvoiceId(null);
      setCreateNewInvoice(true);
      return;
    }
    // Check if any invoice is linked to this fee
    const linked = existingInvoices.find(inv => inv.student_fee_id === fee.id);
    if (linked) {
      setSelectedInvoiceId(linked.id);
      setCreateNewInvoice(false);
    } else if (existingInvoices.length === 1) {
      setSelectedInvoiceId(existingInvoices[0].id);
      setCreateNewInvoice(false);
    } else {
      setSelectedInvoiceId(null);
      setCreateNewInvoice(true);
    }
  }, [existingInvoices, fee.id]);

  // ── Fetch installments & tax info ──
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    async function loadData() {
      const { data: instData } = await supabase
        .from("fee_installments")
        .select("*")
        .eq("student_fee_id", fee.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("installment_number");
      setInstallments(instData || []);
      setLoadingInstallments(false);

      if (fee.fee_structures?.tax_rate_id) {
        const taxRateId = fee.fee_structures.tax_rate_id;
        const taxInclusive = fee.fee_structures.tax_inclusive !== undefined
          ? fee.fee_structures.tax_inclusive
          : true;
        const taxRate = fee.fee_structures.tax_rates;

        if (taxRate) {
          setTaxInfo({
            rate: Number(taxRate.rate),
            name: taxRate.name,
            taxInclusive,
          });
        } else {
          const { data: taxRateData } = await supabase
            .from("tax_rates")
            .select("rate, name")
            .eq("id", taxRateId)
            .eq("branch_id", branchId)
            .eq("financial_year_id", financialYearId)
            .single();
          if (taxRateData) {
            setTaxInfo({
              rate: Number(taxRateData.rate),
              name: taxRateData.name,
              taxInclusive,
            });
          }
        }
      }
    }
    loadData();
  }, [fee, branchId, financialYearId]);

  // Auto‑fill amount when installment is selected
  const watchedInstallment = Form.useWatch("installment_id", form);
  useEffect(() => {
    if (watchedInstallment) {
      const inst = installments.find((i) => i.id === Number(watchedInstallment));
      if (inst) form.setFieldValue("amount", inst.amount);
    }
  }, [watchedInstallment, installments, form]);

  // Tax breakdown
  const watchedAmount = Form.useWatch("amount", form);
  const taxBreakdown = () => {
    const amt = Number(watchedAmount) || 0;
    if (!taxInfo || taxInfo.rate === 0 || amt <= 0) return null;
    const rate = taxInfo.rate / 100;
    let base, tax;
    if (taxInfo.taxInclusive) {
      base = amt / (1 + rate);
      tax = amt - base;
    } else {
      base = amt;
      tax = amt * rate;
    }
    return {
      base: base.toFixed(2),
      tax: tax.toFixed(2),
      total: amt.toFixed(2),
    };
  };

  // ── Print handlers ──
  const handlePrintReceipt = async () => {
    if (!receiptData) {
      message.error("Receipt data not available");
      return;
    }
    try {
      const { data: fullReceipt, error } = await supabase
        .from("receipts")
        .select(`
          *,
          students (*),
          fee_payments (*)
        `)
        .eq("id", receiptData.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (error) throw error;
      await generateReceiptPdf(fullReceipt);
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
        .select("*, invoice_items(*)")
        .eq("id", invoiceId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (error) throw error;
      const doc = await generateInvoicePDF(invoice, org, 'sales');
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
      message.success("Invoice PDF opened in new tab");
    } catch (err) {
      console.error(err);
      message.error("Failed to generate invoice PDF");
    }
  };

  // ── Create invoice if needed ──
  const createInvoiceForFee = async () => {
    const components = fee.fee_structures?.fee_structure_components || [];
    let items = components.map(comp => ({
      item_type: "fee_component",
      item_id: comp.id,
      description: comp.component_name,
      quantity: 1,
      unit_price: comp.amount,
      tax_rate_id: comp.tax_rate_id || fee.fee_structures?.tax_rate_id,
    }));
    if (!items.length) {
      items.push({
        item_type: "fee_payment",
        description: `Fee Payment - ${fee.fee_structures?.courses?.course_name || "N/A"}`,
        quantity: 1,
        unit_price: fee.final_fee,
        tax_rate_id: fee.fee_structures?.tax_rate_id,
      });
    }
    const payload = {
      student_id: fee.student_id,
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: null,
      payment_terms: "Immediate",
      gst_applicable: taxInfo && taxInfo.rate > 0,
      place_of_supply: fee.students?.state_code || "",
      reverse_charge: false,
      items,
      student_fee_id: fee.id,
      fee_installment_id: null,
    };
    const result = await createInvoice(payload, ctx);
    return result.id;
  };

  // ── Submit payment ──
  const onFinish = async (values) => {
    const paymentAmountVal = Number(values.amount);
    if (!paymentAmountVal || paymentAmountVal <= 0) {
      message.error("Enter a valid amount");
      return;
    }

    let baseAmount = paymentAmountVal;
    let taxAmount = 0;
    if (taxInfo && taxInfo.rate > 0) {
      const rate = taxInfo.rate / 100;
      if (taxInfo.taxInclusive) {
        baseAmount = paymentAmountVal / (1 + rate);
        taxAmount = paymentAmountVal - baseAmount;
      } else {
        taxAmount = paymentAmountVal * rate;
      }
      baseAmount = Math.round(baseAmount * 100) / 100;
      taxAmount = Math.round(taxAmount * 100) / 100;
    }

    const paymentPayload = {
      student_fee_id: fee.id,
      payment_date: values.payment_date
        ? values.payment_date.format("YYYY-MM-DD")
        : dayjs().format("YYYY-MM-DD"),
      amount: paymentAmountVal,
      base_amount: baseAmount,
      tax_amount: taxAmount,
      payment_mode: values.payment_mode,
      transaction_no: values.transaction_no,
      remarks: values.remarks,
      installment_id: values.installment_id || null,
    };

    try {
  // Determine invoice ID
let finalInvoiceId = selectedInvoiceId;
if (createNewInvoice || !finalInvoiceId) {
  setCreatingInvoice(true);
  finalInvoiceId = await createInvoiceForFee();   // automatically reuses existing invoice
  setCreatingInvoice(false);
}
      // ── Collect payment with invoice ID ──
      const payment = await collectPayment(
        paymentPayload,
        fee.student_id,
        profile?.id,
        finalInvoiceId,
        ctx
      );

      // ── Fetch receipt ──
      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .select("*")
        .eq("payment_id", payment.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (!receiptError) setReceiptData(receipt);

      setInvoiceId(finalInvoiceId);
      setPaymentAmount(paymentAmountVal);
      setStudentName(`${fee.students?.first_name} ${fee.students?.last_name}`);
      setStep("success");

      // ── Send receipt email (non-blocking) ──
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

  // ── Reset and close ──
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
      width={step === "form" ? 560 : 480}
    >
      {step === "form" ? (
        <>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Course">
              {fee.fee_structures?.courses?.course_name || "N/A"}
            </Descriptions.Item>
            <Descriptions.Item label="Total Fee">
              ₹{Number(fee.final_fee).toLocaleString("en-IN")}
            </Descriptions.Item>
            {fee.total_paid > 0 && (
              <Descriptions.Item label="Paid">
                ₹{Number(fee.total_paid).toLocaleString("en-IN")}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Balance">
              ₹{Number(fee.pending).toLocaleString("en-IN")}
            </Descriptions.Item>
            {taxInfo && (
              <Descriptions.Item label="Tax">
                {taxInfo.name} ({taxInfo.rate}%) – {taxInfo.taxInclusive ? "Inclusive" : "Exclusive"}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          {/* ── Invoice Selector ── */}
          {!loadingInvoices && existingInvoices.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Apply to Invoice</label>
              <Select
                placeholder="Select an existing invoice or create new"
                value={selectedInvoiceId}
                onChange={(val) => {
                  if (val === "create_new") {
                    setSelectedInvoiceId(null);
                    setCreateNewInvoice(true);
                  } else {
                    setSelectedInvoiceId(val);
                    setCreateNewInvoice(false);
                  }
                }}
                style={{ width: "100%" }}
                options={[
                  ...existingInvoices.map(inv => ({
                    label: `${inv.invoice_number} (₹${Number(inv.grand_total).toLocaleString()}) – ${inv.status}`,
                    value: inv.id,
                  })),
                  { label: "+ Create new invoice", value: "create_new" },
                ]}
              />
            </div>
          )}
          {!loadingInvoices && existingInvoices.length === 0 && (
            <div className="mb-4 text-sm text-secondary">
              No existing invoices – a new invoice will be created automatically.
            </div>
          )}

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{
              payment_date: dayjs(),
              amount: fee.pending,
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
              label="Amount"
              rules={[{ required: true, message: "Please enter amount" }]}
            >
              <InputNumber
                min={0}
                max={fee.pending}
                style={{ width: "100%" }}
                placeholder={`Max: ₹${fee.pending}`}
              />
            </Form.Item>

            {taxBreakdown() && (
              <div
                style={{
                  background: "#fafafa",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <div>Base: ₹{taxBreakdown().base}</div>
                <div>Tax ({taxInfo.rate}%): ₹{taxBreakdown().tax}</div>
                <div style={{ fontWeight: 600 }}>Total: ₹{taxBreakdown().total}</div>
              </div>
            )}

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
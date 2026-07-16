// src/components/FeeManagement.jsx
import { useState, useEffect } from "react";
import {
  Drawer,
  Descriptions,
  Table,
  Button,
  Select,
  InputNumber,
  Form,
  Space,
  message,
  Popconfirm,
  Tag,
  Spin,
} from "antd";
import {
  DollarOutlined,
  FileTextOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStudentFees,           // fetch the single student fee record (you can adjust if you need a single one)
  getPayments,
  generateInvoiceFromStudentFee,
  collectPayment,
  // if you need to fetch fee structures for assignment, import that too
} from "../services/feeService";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase"; // if needed for fetching fee structures
import { useAuth } from "../context/AuthContext";

export default function FeeManagement({ studentId, open, onClose }) {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const { user } = useAuth();
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const [paymentForm] = Form.useForm();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedFeeId, setSelectedFeeId] = useState(null);

  // Fetch the student fee record (assuming one record per student; adjust if multiple)
  const { data: feeRecord, isLoading, isError } = useQuery({
    queryKey: ["student-fee", studentId, ctx],
    queryFn: async () => {
      // getStudentFees returns paginated; we'll use a small page to get the latest
      const result = await getStudentFees({
        pageParam: 0,
        filters: {},
        branchId: ctx.branchId,
        financialYearId: ctx.financialYearId,
      });
      // Since getStudentFees returns all student fees, we need to filter for this student
      // Alternatively, you can create a dedicated service function. For now, we'll filter the result.
      const allFees = result.data || [];
      const studentFee = allFees.find((f) => f.student_id == studentId);
      return studentFee || null;
    },
    enabled: !!open && !!studentId,
  });

  // Fetch payments for the specific fee
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", selectedFeeId || feeRecord?.id, ctx],
    queryFn: () => getPayments(selectedFeeId || feeRecord?.id, ctx.branchId, ctx.financialYearId),
    enabled: !!(selectedFeeId || feeRecord?.id),
  });

  // Mutation to collect payment
 const collectMutation = useMutation({
  mutationFn: (values) =>
    collectPayment(
      {
        student_fee_id: feeRecord.id,
        payment_date: values.payment_date || new Date().toISOString().split("T")[0],
        amount: Number(values.amount),
        payment_mode: values.payment_mode,
        base_amount: values.base_amount || 0,
        tax_amount: values.tax_amount || 0,
        generated_by: user?.id,          // ✅ Add this
      },
      studentId,
      null,    // invoice_id
      ctx
    ),

    onSuccess: () => {
      message.success("Payment collected");
      queryClient.invalidateQueries({ queryKey: ["student-fee", studentId] });
      queryClient.invalidateQueries({ queryKey: ["payments", feeRecord?.id] });
      paymentForm.resetFields();
      setPaymentModalOpen(false);
    },
    onError: (err) => message.error(err.message),
  });

  // Mutation to generate invoice
  const generateInvoiceMutation = useMutation({
    mutationFn: () => generateInvoiceFromStudentFee(feeRecord.id, null, ctx),
    onSuccess: () => {
      message.success("Invoice generated successfully");
      queryClient.invalidateQueries({ queryKey: ["student-fee", studentId] });
    },
    onError: (err) => message.error(err.message),
  });

  // Open payment modal
  const openPaymentModal = () => setPaymentModalOpen(true);
  const closePaymentModal = () => setPaymentModalOpen(false);

  if (!open) return null;

  return (
    <Drawer
      title="Fee Management"
      open={open}
      onClose={onClose}
      width={600}
      destroyOnClose
    >
      {isLoading ? (
        <Spin style={{ display: "block", textAlign: "center", marginTop: 40 }} />
      ) : isError || !feeRecord ? (
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
              {feeRecord.fee_structures?.courses?.course_name || "N/A"}
            </Descriptions.Item>
            <Descriptions.Item label="Total Fee">
              ₹{Number(feeRecord.final_fee).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Paid">
              <span style={{ color: "green" }}>
                ₹{(feeRecord.total_paid || 0).toLocaleString()}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Balance">
              <span style={{ color: "red" }}>
                ₹{(feeRecord.pending || 0).toLocaleString()}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={feeRecord.status === "Paid" ? "green" : "volcano"}>
                {feeRecord.status}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          {feeRecord.installments?.length > 0 && (
            <Table
              dataSource={feeRecord.installments}
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
              style={{ marginTop: 16 }}
            />
          )}

          <div style={{ marginTop: 24 }}>
            <Space>
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={openPaymentModal}
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

          <h4 style={{ marginTop: 24 }}>Payment History</h4>
          <Table
            dataSource={payments}
            columns={[
              { title: "Date", dataIndex: "payment_date" },
              { title: "Amount", dataIndex: "amount", render: (val) => `₹${val}` },
              { title: "Mode", dataIndex: "payment_mode" },
            ]}
            rowKey="id"
            pagination={false}
            size="small"
          />

          {/* Payment Collection Modal */}
          {paymentModalOpen && (
            <Drawer
              title="Collect Payment"
              open={paymentModalOpen}
              onClose={closePaymentModal}
              width={400}
              destroyOnClose
            >
              <Form
                form={paymentForm}
                layout="vertical"
                onFinish={(values) => collectMutation.mutate(values)}
              >
                <Form.Item
                  name="amount"
                  label="Amount"
                  rules={[{ required: true, message: "Please enter amount" }]}
                >
                  <InputNumber
                    min={0}
                    max={feeRecord.pending}
                    style={{ width: "100%" }}
                    placeholder={`Max: ₹${feeRecord.pending}`}
                  />
                </Form.Item>
                <Form.Item
                  name="payment_mode"
                  label="Payment Mode"
                  rules={[{ required: true }]}
                >
                  <Select placeholder="Select mode">
                    <Select.Option value="Cash">Cash</Select.Option>
                    <Select.Option value="Card">Card</Select.Option>
                    <Select.Option value="UPI">UPI</Select.Option>
                    <Select.Option value="Bank Transfer">Bank Transfer</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="payment_date" label="Payment Date">
                  <input type="date" style={{ width: "100%", padding: "4px 11px" }} />
                </Form.Item>
                <Form.Item name="base_amount" hidden initialValue={0} />
                <Form.Item name="tax_amount" hidden initialValue={0} />
                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={collectMutation.isLoading}
                    block
                  >
                    Save Payment
                  </Button>
                </Form.Item>
              </Form>
            </Drawer>
          )}
        </>
      )}
    </Drawer>
  );
}
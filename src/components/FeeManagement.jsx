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
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStudentFees,
  getPayments,
  generateInvoiceFromStudentFee,
} from "../services/feeService";
import { useOrg } from "../context/OrganizationContext";
import CollectPaymentModal from "./CollectPaymentModal";

export default function FeeManagement({ studentId, open, onClose }) {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const [collectingFee, setCollectingFee] = useState(null);

  // Fetch the student fee record
  const { data: feeRecord, isLoading, isError } = useQuery({
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
    queryKey: ["payments", feeRecord?.id, ctx],
    queryFn: () => getPayments(feeRecord?.id, ctx.branchId, ctx.financialYearId),
    enabled: !!feeRecord?.id,
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
                onClick={() => setCollectingFee(feeRecord)}
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

          {/* ─── Collect Payment Modal (enhanced) ─── */}
          {collectingFee && (
            <CollectPaymentModal
              fee={collectingFee}
              onClose={() => setCollectingFee(null)}
              onSuccess={() => {
                setCollectingFee(null);
                queryClient.invalidateQueries({ queryKey: ["student-fee", studentId] });
                queryClient.invalidateQueries({ queryKey: ["payments", feeRecord?.id] });
              }}
            />
          )}
        </>
      )}
    </Drawer>
  );
}
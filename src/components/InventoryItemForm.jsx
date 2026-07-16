import { useState, useEffect } from "react";
import { Form, Input, InputNumber, Select, Button, Space, message } from "antd";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

const { TextArea } = Input;

export default function InventoryItemForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const [form] = Form.useForm();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const [categories, setCategories] = useState([]);

  // ── Fetch categories (scoped to branch & FY if available) ──
  useEffect(() => {
    const fetchCategories = async () => {
      let query = supabase
        .from("inventory_categories")
        .select("id, name")
        .order("name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      setCategories(data || []);
    };
    fetchCategories();
  }, [branchId, financialYearId]);

  // ── Set form values when editing ──
  useEffect(() => {
    if (initialData?.id) {
      form.setFieldsValue(initialData);
    } else {
      form.resetFields();
      // Set defaults
      form.setFieldsValue({
        unit: "pcs",
        unit_price: 0,
        current_stock: 0,
        reorder_level: 5,
      });
    }
  }, [initialData, form]);

  const handleFinish = async (values) => {
    try {
      await onSubmit(values);
      message.success(initialData.id ? "Item updated" : "Item created");
    } catch (err) {
      message.error(err.message || "Operation failed");
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={initialData}>
      <Form.Item name="item_name" label="Item Name" rules={[{ required: true }]}>
        <Input placeholder="e.g., Notebook" />
      </Form.Item>

      <Form.Item name="description" label="Description">
        <TextArea rows={2} placeholder="Optional description" />
      </Form.Item>

      <Form.Item name="category_id" label="Category">
        <Select
          allowClear
          placeholder="Select category"
          options={categories.map((c) => ({ label: c.name, value: c.id }))}
        />
      </Form.Item>

      <Form.Item name="unit" label="Unit" initialValue="pcs">
        <Input placeholder="e.g., pcs, kg, box" />
      </Form.Item>

      <Form.Item name="unit_price" label="Unit Price" initialValue={0}>
        <InputNumber min={0} style={{ width: "100%" }} placeholder="0.00" />
      </Form.Item>

      {/* ─── NEW: Current Stock (quantity) ─── */}
      <Form.Item name="current_stock" label="Current Stock" initialValue={0}>
        <InputNumber min={0} style={{ width: "100%" }} placeholder="0" />
      </Form.Item>

      <Form.Item name="reorder_level" label="Reorder Level" initialValue={5}>
        <InputNumber min={0} style={{ width: "100%" }} />
      </Form.Item>

      <Form.Item>
        <Space style={{ float: "right" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {initialData.id ? "Update" : "Create"}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
// src/components/InventoryItemForm.jsx
import { useState, useEffect } from "react";
import { Form, Input, InputNumber, Select, Button, Space, message } from "antd";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function InventoryItemForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const [form] = Form.useForm();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!branchId || !financialYearId) return;
    supabase
      .from("inventory_categories")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCategories(data || []));
  }, [branchId, financialYearId]);

  useEffect(() => {
    if (initialData?.id) {
      form.setFieldsValue(initialData);
    } else {
      form.resetFields();
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
      <Form.Item name="category_id" label="Category">
        <Select allowClear placeholder="Select category" options={categories.map(c => ({ label: c.name, value: c.id }))} />
      </Form.Item>
      <Form.Item name="unit" label="Unit" initialValue="pcs">
        <Input placeholder="e.g., pcs, kg, box" />
      </Form.Item>
      <Form.Item name="unit_price" label="Unit Price" initialValue={0}>
        <InputNumber min={0} style={{ width: "100%" }} placeholder="0.00" />
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
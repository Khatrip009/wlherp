import { useState, useEffect } from "react";
import { Form, Input, Button, Space, message } from "antd";

export default function MediumForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const [form] = Form.useForm();

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
      message.success(initialData.id ? "Medium updated" : "Medium created");
    } catch (err) {
      message.error(err.message || "Operation failed");
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={initialData}>
      <Form.Item name="name" label="Medium Name" rules={[{ required: true }]}>
        <Input placeholder="e.g., English, Gujarati" />
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
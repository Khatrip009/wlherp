import { useState, useEffect } from "react";
import { Form, Input, Button, Space, message } from "antd";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

export default function MediumForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const theme = useTheme();
  const bodyFont = theme?.font_body || "Montserrat";
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
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={initialData}
      style={{ fontFamily: bodyFont }}
    >
      <Form.Item name="name" label="Medium Name" rules={[{ required: true }]}>
        <Input placeholder="e.g., English, Gujarati" style={{ fontFamily: bodyFont }} />
      </Form.Item>
      <Form.Item>
        <Space style={{ float: "right" }}>
          <Button onClick={onClose} style={{ fontFamily: bodyFont }}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading} style={{ fontFamily: bodyFont }}>
            {initialData.id ? "Update" : "Create"}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
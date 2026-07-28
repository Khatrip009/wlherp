import { useState, useEffect } from "react";
import { Form, Input, InputNumber, Select, Button, Space, message, ConfigProvider } from "antd";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

export default function TaxRateForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const [form] = Form.useForm();
  const theme = useTheme();
  const primaryColor = theme?.primary_color || "#0D47A1";
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

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
      message.success(initialData.id ? "Tax Rate updated" : "Tax Rate created");
    } catch (err) {
      message.error(err.message || "Operation failed");
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: primaryColor,
          fontFamily: bodyFont,
        },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={initialData}
        style={{ fontFamily: bodyFont }}
      >
        <Form.Item
          name="name"
          label={<span style={{ fontFamily: headingFont }}>Tax Name</span>}
          rules={[{ required: true }]}
        >
          <Input placeholder="e.g., GST" style={{ fontFamily: bodyFont }} />
        </Form.Item>
        <Form.Item
          name="rate"
          label={<span style={{ fontFamily: headingFont }}>Rate (%)</span>}
          rules={[{ required: true }]}
        >
          <InputNumber min={0} max={100} style={{ width: "100%", fontFamily: bodyFont }} placeholder="e.g., 18" />
        </Form.Item>
        <Form.Item
          name="type"
          label={<span style={{ fontFamily: headingFont }}>Type</span>}
          initialValue="percentage"
        >
          <Select style={{ fontFamily: bodyFont }}>
            <Select.Option value="percentage">Percentage</Select.Option>
            <Select.Option value="fixed">Fixed</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item
          name="is_default"
          label={<span style={{ fontFamily: headingFont }}>Default</span>}
          valuePropName="checked"
        >
          <Select style={{ fontFamily: bodyFont }}>
            <Select.Option value={true}>Yes</Select.Option>
            <Select.Option value={false}>No</Select.Option>
          </Select>
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
    </ConfigProvider>
  );
}
import { useState, useEffect } from "react";
import { Form, Input, InputNumber, Select, Button, Space, message } from "antd";

export default function TaxRateForm({ initialData = {}, onSubmit, onClose, loading = false }) {
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
      message.success(initialData.id ? "Tax Rate updated" : "Tax Rate created");
    } catch (err) {
      message.error(err.message || "Operation failed");
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={initialData}>
      <Form.Item name="name" label="Tax Name" rules={[{ required: true }]}>
        <Input placeholder="e.g., GST" />
      </Form.Item>
      <Form.Item name="rate" label="Rate (%)" rules={[{ required: true }]}>
        <InputNumber min={0} max={100} style={{ width: "100%" }} placeholder="e.g., 18" />
      </Form.Item>
      <Form.Item name="type" label="Type" initialValue="percentage">
        <Select>
          <Select.Option value="percentage">Percentage</Select.Option>
          <Select.Option value="fixed">Fixed</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item name="is_default" label="Default" valuePropName="checked">
        <Select>
          <Select.Option value={true}>Yes</Select.Option>
          <Select.Option value={false}>No</Select.Option>
        </Select>
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
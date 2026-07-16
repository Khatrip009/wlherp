import { useState, useEffect } from "react";
import { Form, Input, Select, Button, Space, message } from "antd";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function SubjectForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const [form] = Form.useForm();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    if (!branchId || !financialYearId) return;
    supabase
      .from("courses")
      .select("id, course_name")
      .eq("branch_id", branchId)
      .eq("financial_year_id", financialYearId)
      .eq("status", true)
      .order("course_name")
      .then(({ data }) => setCourses(data || []));
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
      message.success(initialData.id ? "Subject updated" : "Subject created");
    } catch (err) {
      message.error(err.message || "Operation failed");
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={initialData}>
      <Form.Item name="subject_name" label="Subject Name" rules={[{ required: true }]}>
        <Input placeholder="e.g., Mathematics" />
      </Form.Item>
      <Form.Item name="course_id" label="Course" rules={[{ required: true }]}>
        <Select
          showSearch
          placeholder="Select course"
          optionFilterProp="label"
          options={courses.map((c) => ({ label: c.course_name, value: c.id }))}
        />
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
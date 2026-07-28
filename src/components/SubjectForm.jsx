import { useState, useEffect } from "react";
import { Form, Input, Select, Button, Space, message, ConfigProvider } from "antd";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

export default function SubjectForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const [form] = Form.useForm();
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const [courses, setCourses] = useState([]);

  const primaryColor = theme?.primary_color || "#0D47A1";
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

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
          name="subject_name"
          label={<span style={{ fontFamily: headingFont }}>Subject Name</span>}
          rules={[{ required: true }]}
        >
          <Input placeholder="e.g., Mathematics" style={{ fontFamily: bodyFont }} />
        </Form.Item>
        <Form.Item
          name="course_id"
          label={<span style={{ fontFamily: headingFont }}>Course</span>}
          rules={[{ required: true }]}
        >
          <Select
            showSearch
            placeholder="Select course"
            optionFilterProp="label"
            options={courses.map((c) => ({ label: c.course_name, value: c.id }))}
            style={{ fontFamily: bodyFont }}
          />
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
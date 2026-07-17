import { useState } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Mail, Lock, LogIn } from "lucide-react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";
import { Card, Input, Button, Typography, Form, Space } from "antd";

const { Title, Text } = Typography;

export default function Login() {
  const darkLogo = useOrgDarkLogo();
  const { org } = useOrg();
  const orgName = org?.company_name || "Ahead in Learning, Ahead in Life";
  const { user, profile, loading: authLoading, orgAccessDenied } = useAuth();

  const [loading, setLoading] = useState(false);

  if (user && profile) {
    return <Navigate to="/" replace />;
  }

  if (user && orgAccessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-bg px-4">
        <Card className="w-full max-w-md text-center shadow-xl">
          <Title level={2} className="text-red-600">Access Denied</Title>
          <Text className="text-secondary block mb-4">
            You are not authorized to access this system.
          </Text>
          <Button
            type="primary"
            danger
            onClick={() => supabase.auth.signOut()}
          >
            Sign Out
          </Button>
        </Card>
      </div>
    );
  }

  if (authLoading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-bg">
        <Text className="text-secondary font-montserrat">Loading your account…</Text>
      </div>
    );
  }

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      // AuthContext will fetch profile and enforce org=3
    } catch (err) {
      console.error(err);
      toast.error("Login failed");
      setLoading(false);
    }
  };

  const handleForgotPassword = (email) => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/#/login",
    })
      .then(() => toast.success("Password reset link sent"))
      .catch((err) => toast.error(err.message));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-bg px-4">
      <Card className="w-full max-w-md shadow-xl" bordered={false}>
        <Space direction="vertical" size="large" className="w-full">
          <div className="flex justify-center">
            <img src={darkLogo} alt={orgName} className="h-20 w-auto" />
          </div>

          <Title level={1} className="text-center font-righteous text-primary-dark" style={{ fontSize: '1rem' }}>
            {orgName}
          </Title>
          <Text className="text-center text-secondary block font-montserrat">
            Sign in to your account
          </Text>

          <Form
            name="login"
            onFinish={onFinish}
            layout="vertical"
            requiredMark={false}
            className="mt-4"
          >
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, message: 'Please enter your email' }]}
            >
              <Input
                prefix={<Mail size={16} className="text-secondary-light" />}
                placeholder="you@example.com"
                size="large"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password
                prefix={<Lock size={16} className="text-secondary-light" />}
                placeholder="Your password"
                size="large"
                className="rounded-lg"
              />
            </Form.Item>

            <div className="flex justify-end mb-2">
              <Button
                type="link"
                className="text-xs p-0 h-auto"
                onClick={() => {
                  const email = document.querySelector('input[name="email"]')?.value;
                  handleForgotPassword(email);
                }}
              >
                Forgot password?
              </Button>
            </div>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                icon={<LogIn size={18} />}
                className="font-montserrat"
              >
                {loading ? "Signing In..." : "Sign In"}
              </Button>
            </Form.Item>
          </Form>

          <Text className="text-xs text-secondary-light text-center block font-montserrat">
            © {new Date().getFullYear()} {orgName}. All rights reserved.
          </Text>
        </Space>
      </Card>
    </div>
  );
}
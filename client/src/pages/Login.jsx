import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Tabs, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, SendOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export default function Login() {
  const { login, register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      message.success('Logged in successfully');
    } catch (err) {
      message.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    setLoading(true);
    try {
      await register(values.email, values.password, values.displayName);
      message.success('Account created successfully');
    } catch (err) {
      message.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const items = [
    {
      key: 'login',
      label: 'Sign In',
      children: (
        <Form onFinish={handleLogin} layout="vertical" size="large" requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
            <Input prefix={<MailOutlined style={{ color: '#94A3B8' }} />} placeholder="you@company.com" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Password required' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#94A3B8' }} />} placeholder="Enter password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large"
              style={{ height: 48, fontWeight: 600, fontSize: 15 }}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'register',
      label: 'Create Account',
      children: (
        <Form onFinish={handleRegister} layout="vertical" size="large" requiredMark={false}>
          <Form.Item name="displayName" label="Full Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input prefix={<UserOutlined style={{ color: '#94A3B8' }} />} placeholder="John Doe" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
            <Input prefix={<MailOutlined style={{ color: '#94A3B8' }} />} placeholder="you@company.com" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 6, message: 'Min 6 characters' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#94A3B8' }} />} placeholder="Min 6 characters" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large"
              style={{ height: 48, fontWeight: 600, fontSize: 15 }}
            >
              Create Account
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 50%, #F1F5F9 100%)',
      padding: 16,
    }}>
      <Card
        style={{
          width: 420,
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid #E2E8F0',
        }}
        styles={{ body: { padding: '32px 32px 24px' } }}
      >
        {/* Logo & Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
          }}>
            <SendOutlined style={{ color: '#fff', fontSize: 22 }} />
          </div>
          <Title level={3} style={{ margin: 0, color: '#1E293B', letterSpacing: '-0.02em' }}>
            Social Posting Tool
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            Manage your social media in one place
          </Text>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} centered />
      </Card>
    </div>
  );
}

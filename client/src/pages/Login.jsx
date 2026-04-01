import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { LockOutlined, MailOutlined, SendOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export default function Login() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

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
            Sign in to manage your social media
          </Text>
        </div>

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

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Contact your admin for account access
          </Text>
        </div>
      </Card>
    </div>
  );
}

import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, Spin, Avatar, Typography } from 'antd';
import {
  PlusCircleOutlined,
  UnorderedListOutlined,
  TeamOutlined,
  LogoutOutlined,
  UserOutlined,
  CloudUploadOutlined,
  SendOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';

const CreatePost = lazy(() => import('./pages/CreatePost'));
const ManagePosts = lazy(() => import('./pages/ManagePosts'));
const BulkSchedule = lazy(() => import('./pages/BulkSchedule'));
const Clients = lazy(() => import('./pages/Clients'));
const MerchantSettings = lazy(() => import('./pages/MerchantSettings'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Login = lazy(() => import('./pages/Login'));

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const PAGE_TITLES = {
  '/create': 'Create Post',
  '/': 'Create Post',
  '/bulk': 'Bulk Schedule',
  '/posts': 'Manage Posts',
  '/clients': 'Clients',
  '/analytics': 'Analytics',
};

const menuItems = [
  { key: '/create', icon: <PlusCircleOutlined />, label: <NavLink to="/create">Create Post</NavLink> },
  { key: '/bulk', icon: <CloudUploadOutlined />, label: <NavLink to="/bulk">Bulk Schedule</NavLink> },
  { key: '/posts', icon: <UnorderedListOutlined />, label: <NavLink to="/posts">Manage Posts</NavLink> },
  { key: '/clients', icon: <TeamOutlined />, label: <NavLink to="/clients">Clients</NavLink> },
  { key: '/analytics', icon: <BarChartOutlined />, label: <NavLink to="/analytics">Analytics</NavLink> },
];

function PageHeader({ user, logout }) {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] || 'Social Posting Tool';

  const userMenu = {
    items: [
      { key: 'name', label: user.displayName || user.email, disabled: true },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', danger: true, onClick: logout },
    ],
  };

  return (
    <Header style={{
      background: '#fff',
      padding: '0 28px',
      borderBottom: '1px solid #E2E8F0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: 64,
    }}>
      <Text strong style={{ fontSize: 18, color: '#1E293B', letterSpacing: '-0.01em' }}>
        {pageTitle}
      </Text>
      <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
        <Button
          type="text"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 40, borderRadius: 8, padding: '4px 12px',
          }}
        >
          <Avatar
            size={28}
            style={{ background: '#2563EB', fontSize: 12, fontWeight: 600 }}
          >
            {(user.displayName || user.email || '?')[0].toUpperCase()}
          </Avatar>
          <span style={{ color: '#1E293B', fontWeight: 500 }}>
            {user.displayName || user.email}
          </span>
        </Button>
      </Dropdown>
    </Header>
  );
}

function AppLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#F1F5F9' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#F1F5F9' }}>
          <Spin size="large" />
        </div>
      }>
        <Login />
      </Suspense>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="60"
        width={240}
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Sidebar branding */}
        <div style={{
          padding: '20px 16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
          }}>
            <SendOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <Text strong style={{ color: '#fff', fontSize: 15, display: 'block', lineHeight: '18px' }}>
              Social Poster
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              Multi-Platform
            </Text>
          </div>
        </div>

        {/* Navigation divider */}
        <div style={{
          margin: '0 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }} />

        <Menu theme="dark" mode="inline" items={menuItems} />
      </Sider>

      <Layout>
        <PageHeader user={user} logout={logout} />
        <Content style={{
          margin: 20,
          padding: 24,
          background: '#fff',
          borderRadius: 14,
          minHeight: 360,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
              <Spin size="large" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<CreatePost />} />
              <Route path="/create" element={<CreatePost />} />
              <Route path="/posts" element={<ManagePosts />} />
              <Route path="/bulk" element={<BulkSchedule />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings/:id" element={<MerchantSettings />} />
              <Route path="*" element={<Navigate to="/create" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

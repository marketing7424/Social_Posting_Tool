import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Input,
  Button,
  Modal,
  Form,
  Space,
  message,
  Popconfirm,
  Typography,
  Tooltip,
  Segmented,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  SettingOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  WarningFilled,
  QuestionCircleFilled,
  ExperimentOutlined,
  FacebookFilled,
  InstagramFilled,
  GoogleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  searchMerchants,
  createMerchant,
  updateMerchant,
  deleteMerchant,
  testAllConnections,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import PhoneInput from '../components/merchants/PhoneInput';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

const STALE_HOURS = 24;

const PLATFORM_ICONS = {
  facebook: { icon: <FacebookFilled />, color: '#1D4ED8', label: 'Facebook' },
  instagram: { icon: <InstagramFilled />, color: '#EAB308', label: 'Instagram' },
  google: { icon: <GoogleOutlined />, color: '#EA580C', label: 'Google' },
};

function getTokenAgeDays(tokenCreatedAt) {
  if (!tokenCreatedAt) return null;
  const created = new Date(tokenCreatedAt);
  if (isNaN(created)) return null;
  return Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function getHoursSince(timestamp) {
  if (!timestamp) return null;
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

// Decides what icon to show next to a platform logo based on:
//   • whether the merchant has the platform configured in DB (`hasId`)
//   • the most recent liveness check result (`lastCheckOk`, `lastCheckAt`, `lastCheckError`)
//   • token age (for FB/IG which expire at 60d)
// Live-check state is authoritative when available — token-age only flags a soft "expiring soon"
// for FB/IG when we never failed a check but the token is approaching its TTL.
const platformDot = ({ hasId, platformKey, lastCheckOk, lastCheckAt, lastCheckError, tokenCreatedAt }) => {
  const cfg = PLATFORM_ICONS[platformKey];
  const hoursSinceCheck = getHoursSince(lastCheckAt);
  const ageDays = getTokenAgeDays(tokenCreatedAt);
  const tokenExpiring = platformKey !== 'google' && hasId && ageDays !== null && ageDays >= 50 && ageDays < 60;

  let statusIcon;
  if (!hasId) {
    statusIcon = (
      <Tooltip title="Not configured">
        <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 11 }} />
      </Tooltip>
    );
  } else if (!lastCheckAt) {
    statusIcon = (
      <Tooltip title="Not tested yet — click 'Test all connections' to verify">
        <QuestionCircleFilled style={{ color: '#9ca3af', fontSize: 11 }} />
      </Tooltip>
    );
  } else if (!lastCheckOk) {
    statusIcon = (
      <Tooltip title={`Broken: ${lastCheckError || 'connection test failed'}`}>
        <WarningFilled style={{ color: '#ff4d4f', fontSize: 11 }} />
      </Tooltip>
    );
  } else if (hoursSinceCheck !== null && hoursSinceCheck >= STALE_HOURS) {
    statusIcon = (
      <Tooltip title={`Last verified ${dayjs(lastCheckAt).fromNow()} — re-test to confirm still live`}>
        <WarningFilled style={{ color: '#faad14', fontSize: 11 }} />
      </Tooltip>
    );
  } else if (tokenExpiring) {
    statusIcon = (
      <Tooltip title={`Token expires soon (${ageDays}/60 days) — reconnect soon`}>
        <WarningFilled style={{ color: '#faad14', fontSize: 11 }} />
      </Tooltip>
    );
  } else {
    statusIcon = (
      <Tooltip title={`Live — last verified ${dayjs(lastCheckAt).fromNow()}`}>
        <CheckCircleFilled style={{ color: '#52c41a', fontSize: 11 }} />
      </Tooltip>
    );
  }

  return (
    <Space size={4}>
      <span style={{ color: hasId ? cfg.color : '#d1d5db', fontSize: 16, display: 'flex' }}>
        {cfg.icon}
      </span>
      {statusIcon}
    </Space>
  );
};

export default function Clients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [brokenFilter, setBrokenFilter] = useState('all');
  const [form] = Form.useForm();

  const fetchMerchants = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const data = await searchMerchants(search);
      setMerchants(Array.isArray(data) ? data : []);
    } catch {
      message.error('Failed to load merchants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  const handleSearch = (value) => {
    setSearchText(value);
    fetchMerchants(value);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    fetchMerchants(value);
  };

  const openAddModal = () => {
    setEditingMerchant(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (merchant) => {
    setEditingMerchant(merchant);
    form.setFieldsValue({
      mid: merchant.mid,
      dbaName: merchant.dbaName,
      address: merchant.address,
      phone: merchant.phone,
      phone2: merchant.phone2 || '',
      website: merchant.website,
      hashtags: merchant.hashtags || '',
    });
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setConfirmLoading(true);

      if (editingMerchant) {
        await updateMerchant(editingMerchant.mid, values);
        message.success('Merchant updated');
      } else {
        await createMerchant(values);
        message.success('Merchant created');
      }

      setModalOpen(false);
      form.resetFields();
      setEditingMerchant(null);
      fetchMerchants(searchText);
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to save merchant');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDelete = async (mid) => {
    try {
      await deleteMerchant(mid);
      message.success('Merchant deleted');
      fetchMerchants(searchText);
    } catch {
      message.error('Failed to delete merchant');
    }
  };

  const handleTestAll = async () => {
    setTesting(true);
    try {
      const s = await testAllConnections();
      const fbTotal = s.fbOk + s.fbFail;
      const igTotal = s.igOk + s.igFail;
      const gTotal = s.googleOk + s.googleFail;
      message.success(
        `Tested ${s.tested} merchants — ` +
        `FB ${s.fbOk}/${fbTotal}, IG ${s.igOk}/${igTotal}, Google ${s.googleOk}/${gTotal}`
      );
      await fetchMerchants(searchText);
    } catch (err) {
      message.error('Test failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  };

  // Most recent liveness check across all merchants + all platforms — used for the
  // "Connection statuses last tested X ago" banner.
  const lastTestedAt = (() => {
    let best = null;
    for (const m of merchants) {
      for (const ts of [m.fbLastCheckAt, m.igLastCheckAt, m.googleLastCheckAt]) {
        if (!ts) continue;
        if (!best || ts > best) best = ts;
      }
    }
    return best;
  })();

  // "Broken" = platform is configured AND has been tested AND test failed.
  // Stale/expiring/not-tested don't count — we only want confirmed failures.
  const isFbBroken = (m) => !!m.fbPageId && !!m.fbLastCheckAt && !m.fbLastCheckOk;
  const isIgBroken = (m) => !!m.igUserId && !!m.igLastCheckAt && !m.igLastCheckOk;
  const isGoogleBroken = (m) => !!m.googleToken && !!m.googleLastCheckAt && !m.googleLastCheckOk;

  const fbBrokenCount = merchants.filter(isFbBroken).length;
  const igBrokenCount = merchants.filter(isIgBroken).length;
  const googleBrokenCount = merchants.filter(isGoogleBroken).length;
  const anyBrokenCount = merchants.filter(
    (m) => isFbBroken(m) || isIgBroken(m) || isGoogleBroken(m)
  ).length;

  const filteredMerchants = merchants.filter((m) => {
    switch (brokenFilter) {
      case 'any': return isFbBroken(m) || isIgBroken(m) || isGoogleBroken(m);
      case 'fb': return isFbBroken(m);
      case 'ig': return isIgBroken(m);
      case 'google': return isGoogleBroken(m);
      default: return true;
    }
  });

  const columns = [
    {
      title: 'MID',
      dataIndex: 'mid',
      key: 'mid',
      width: 120,
    },
    {
      title: 'DBA Name',
      dataIndex: 'dbaName',
      key: 'dbaName',
      sorter: (a, b) => (a.dbaName || '').localeCompare(b.dbaName || ''),
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      responsive: ['md'],
    },
    {
      title: 'Phone',
      key: 'phone',
      responsive: ['md'],
      render: (_, r) => {
        const fmt = (t) => {
          const d = (t || '').replace(/\D/g, '').slice(0, 10);
          return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (t || '');
        };
        const a = fmt(r.phone);
        const b = fmt(r.phone2);
        return a && b ? `${a} or ${b}` : (a || b || '');
      },
    },
    {
      title: 'Website',
      dataIndex: 'website',
      key: 'website',
      responsive: ['lg'],
      render: (text) => text ? <a href={text.startsWith('http') ? text : `https://${text}`} target="_blank" rel="noopener noreferrer">{text}</a> : '',
    },
    {
      title: 'Platforms Connected',
      key: 'platforms',
      render: (_, record) => (
        <Space size="middle">
          {platformDot({
            hasId: !!record.fbPageId,
            platformKey: 'facebook',
            lastCheckOk: record.fbLastCheckOk,
            lastCheckAt: record.fbLastCheckAt,
            lastCheckError: record.fbLastCheckError,
            tokenCreatedAt: record.fbTokenCreatedAt,
          })}
          {platformDot({
            hasId: !!record.igUserId,
            platformKey: 'instagram',
            lastCheckOk: record.igLastCheckOk,
            lastCheckAt: record.igLastCheckAt,
            lastCheckError: record.igLastCheckError,
            tokenCreatedAt: record.fbTokenCreatedAt,
          })}
          {platformDot({
            hasId: !!record.googleToken,
            platformKey: 'google',
            lastCheckOk: record.googleLastCheckOk,
            lastCheckAt: record.googleLastCheckAt,
            lastCheckError: record.googleLastCheckError,
            tokenCreatedAt: record.googleTokenCreatedAt,
          })}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          />
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => navigate(`/settings/${record.mid}`)}
          />
          <Popconfirm
            title="Delete merchant?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.mid)}
            okText="Delete"
            okType="danger"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        align="center"
      >
        <Title level={3} style={{ margin: 0 }}>Clients</Title>
        <Space>
          {user?.role === 'admin' && (
            <Button icon={<ExperimentOutlined />} loading={testing} onClick={handleTestAll}>
              Test all connections
            </Button>
          )}
          {user?.role === 'admin' && (
            <Button icon={<FacebookFilled />} onClick={() => navigate('/bulk-reconnect-facebook')}>
              Reconnect Facebook
            </Button>
          )}
          {user?.role === 'admin' && (
            <Button icon={<GoogleOutlined />} onClick={() => navigate('/bulk-reconnect')}>
              Reconnect Google
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            Add Merchant
          </Button>
        </Space>
      </Space>

      <Input.Search
        placeholder="Search by MID or name..."
        allowClear
        enterButton={<SearchOutlined />}
        value={searchText}
        onChange={handleSearchChange}
        onSearch={handleSearch}
        style={{ marginBottom: 8, maxWidth: 480 }}
      />

      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        {lastTestedAt
          ? `Connection statuses last tested ${dayjs(lastTestedAt).fromNow()} — click "Test all connections" to re-verify`
          : 'Connections not tested yet — click "Test all connections" to verify which tokens are actually live'}
      </Text>

      <Segmented
        value={brokenFilter}
        onChange={setBrokenFilter}
        style={{ marginBottom: 12 }}
        options={[
          { label: `All (${merchants.length})`, value: 'all' },
          { label: `Any broken (${anyBrokenCount})`, value: 'any', disabled: anyBrokenCount === 0 },
          { label: `FB broken (${fbBrokenCount})`, value: 'fb', disabled: fbBrokenCount === 0 },
          { label: `IG broken (${igBrokenCount})`, value: 'ig', disabled: igBrokenCount === 0 },
          { label: `Google broken (${googleBrokenCount})`, value: 'google', disabled: googleBrokenCount === 0 },
        ]}
      />

      <Table
        columns={columns}
        dataSource={filteredMerchants}
        rowKey="mid"
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: true }}
      />

      <Modal
        title={editingMerchant ? 'Edit Merchant' : 'Add Merchant'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setEditingMerchant(null);
        }}
        confirmLoading={confirmLoading}
        okText={editingMerchant ? 'Update' : 'Create'}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingMerchant && (
            <Form.Item
              name="mid"
              label="MID"
              rules={[{ required: true, message: 'MID is required' }]}
            >
              <Input placeholder="Merchant ID" />
            </Form.Item>
          )}
          <Form.Item
            name="dbaName"
            label="DBA Name"
            rules={[{ required: true, message: 'DBA Name is required' }]}
          >
            <Input placeholder="Business name" />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input placeholder="Street address" />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <PhoneInput />
          </Form.Item>
          <Form.Item name="phone2" label="Phone 2 (optional)">
            <PhoneInput />
          </Form.Item>
          <Form.Item name="website" label="Website">
            <Input placeholder="https://www.example.com" />
          </Form.Item>
          <Form.Item
            name="hashtags"
            label="Default Hashtags (optional)"
            extra="Auto-added to every post for this client. Example: #nailspa #grandopening"
          >
            <Input.TextArea rows={2} placeholder="#tag1 #tag2 #tag3" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

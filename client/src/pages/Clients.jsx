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
  FacebookFilled,
  InstagramFilled,
  GoogleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  searchMerchants,
  createMerchant,
  updateMerchant,
  deleteMerchant,
} from '../api/client';
import PhoneInput from '../components/merchants/PhoneInput';

const { Title } = Typography;

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

const platformDot = (connected, platformKey, tokenCreatedAt) => {
  const cfg = PLATFORM_ICONS[platformKey];
  const ageDays = getTokenAgeDays(tokenCreatedAt);
  // Meta tokens expire after 60 days; warn at 50+
  const isExpiring = platformKey !== 'google' && connected && ageDays !== null && ageDays >= 50;
  const isExpired = platformKey !== 'google' && connected && ageDays !== null && ageDays >= 60;
  const statusIcon = !connected ? (
    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 11 }} />
  ) : isExpired ? (
    <Tooltip title={`Token expired (${ageDays} days old) — reconnect now`}>
      <WarningFilled style={{ color: '#ff4d4f', fontSize: 11 }} />
    </Tooltip>
  ) : isExpiring ? (
    <Tooltip title={`Token expires soon (${ageDays}/60 days) — reconnect soon`}>
      <WarningFilled style={{ color: '#faad14', fontSize: 11 }} />
    </Tooltip>
  ) : (
    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 11 }} />
  );

  return (
    <Space size={4}>
      <span style={{ color: connected ? cfg.color : '#d1d5db', fontSize: 16, display: 'flex' }}>
        {cfg.icon}
      </span>
      {statusIcon}
    </Space>
  );
};

export default function Clients() {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
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
          {platformDot(!!record.fbPageId, 'facebook', record.fbTokenCreatedAt)}
          {platformDot(!!record.igUserId, 'instagram', record.fbTokenCreatedAt)}
          {platformDot(!!record.googleToken, 'google', record.googleTokenCreatedAt)}
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
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          Add Merchant
        </Button>
      </Space>

      <Input.Search
        placeholder="Search by MID or name..."
        allowClear
        enterButton={<SearchOutlined />}
        value={searchText}
        onChange={handleSearchChange}
        onSearch={handleSearch}
        style={{ marginBottom: 16, maxWidth: 480 }}
      />

      <Table
        columns={columns}
        dataSource={merchants}
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

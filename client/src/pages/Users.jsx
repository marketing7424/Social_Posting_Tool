import { useState, useEffect, useCallback } from 'react';
import {
  Table, Input, Button, Modal, Form, Space, message, Popconfirm, Typography, Tag,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, KeyOutlined, CrownFilled,
} from '@ant-design/icons';
import { listUsers, createUser, updateUser, deleteUser } from '../api/client';

const { Title } = Typography;

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(null); // user object to reset
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [createForm] = Form.useForm();
  const [resetForm] = Form.useForm();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async (values) => {
    setConfirmLoading(true);
    try {
      await createUser(values);
      message.success(`User ${values.email} created`);
      setCreateOpen(false);
      createForm.resetFields();
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create user');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleResetPassword = async (values) => {
    setConfirmLoading(true);
    try {
      await updateUser(resetOpen.id, { password: values.password });
      message.success(`Password reset for ${resetOpen.email}`);
      setResetOpen(null);
      resetForm.resetFields();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDelete = async (user) => {
    try {
      await deleteUser(user.id);
      message.success(`User ${user.email} deleted`);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (text, record) => (
        <Space>
          {text || record.email.split('@')[0]}
          {record.role === 'admin' && (
            <Tag color="gold" icon={<CrownFilled />} style={{ margin: 0 }}>Admin</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text) => text ? new Date(text).toLocaleDateString() : '',
      responsive: ['md'],
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<KeyOutlined />}
            onClick={() => {
              setResetOpen(record);
              resetForm.resetFields();
            }}
          >
            Reset Password
          </Button>
          {record.role !== 'admin' && (
            <Popconfirm
              title={`Delete ${record.email}?`}
              description="This user will no longer be able to log in."
              onConfirm={() => handleDelete(record)}
              okText="Delete"
              okType="danger"
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} align="center">
        <Title level={4} style={{ margin: 0 }}>Users</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Add User
        </Button>
      </Space>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
      />

      {/* Create User Modal */}
      <Modal
        title="Add New User"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={confirmLoading}
        okText="Create User"
      >
        <Form form={createForm} onFinish={handleCreate} layout="vertical" requiredMark={false}>
          <Form.Item name="displayName" label="Full Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="Jane Doe" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
            <Input placeholder="jane@company.com" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 6, message: 'Min 6 characters' }]}>
            <Input.Password placeholder="Min 6 characters" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title={`Reset Password: ${resetOpen?.email || ''}`}
        open={!!resetOpen}
        onCancel={() => { setResetOpen(null); resetForm.resetFields(); }}
        onOk={() => resetForm.submit()}
        confirmLoading={confirmLoading}
        okText="Reset Password"
      >
        <Form form={resetForm} onFinish={handleResetPassword} layout="vertical" requiredMark={false}>
          <Form.Item name="password" label="New Password" rules={[{ required: true, min: 6, message: 'Min 6 characters' }]}>
            <Input.Password placeholder="Enter new password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

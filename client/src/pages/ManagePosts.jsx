import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Badge,
  Select,
  Button,
  Space,
  Modal,
  Input,
  DatePicker,
  message,
  Popconfirm,
  Typography,
  Card,
  Row,
  Col,
  Tooltip,
} from 'antd';
import {
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  RetweetOutlined,
  SendOutlined,
  CalendarOutlined,
  FilterOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getPosts,
  searchMerchants,
  updatePost,
  deletePost,
  retryPost,
  publishPost,
  schedulePost,
} from '../api/client';

const { TextArea } = Input;
const { Text, Title } = Typography;

const STATUS_CONFIG = {
  draft: { color: 'default', text: 'Draft' },
  pending: { color: 'blue', text: 'Pending' },
  scheduled: { color: 'orange', text: 'Scheduled' },
  publishing: { color: 'processing', text: 'Publishing' },
  success: { color: 'green', text: 'Published' },
  partial: { color: 'warning', text: 'Partial' },
  failed: { color: 'red', text: 'Failed' },
};

import { PLATFORM_TAG_COLORS as PLATFORM_COLORS } from '../constants/platforms';

const PLATFORM_OPTIONS = [
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Google Business', value: 'google' },
];

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'draft' },
  { label: 'Pending', value: 'pending' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Published', value: 'success' },
  { label: 'Partial', value: 'partial' },
  { label: 'Failed', value: 'failed' },
];

export default function ManagePosts() {
  // Data state
  const [posts, setPosts] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [filters, setFilters] = useState({
    merchant: undefined,
    platform: undefined,
    status: undefined,
  });

  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editCaptions, setEditCaptions] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // Batch reschedule modal state
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleTime, setRescheduleTime] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // Batch status modal state
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState(undefined);

  // Load merchants for filter dropdown
  useEffect(() => {
    searchMerchants()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.merchants || [];
        setMerchants(list);
      })
      .catch(() => message.error('Failed to load merchants'));
  }, []);

  // Fetch posts with current filters
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const cleanFilters = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanFilters[k] = v;
        }
      });
      const data = await getPosts(cleanFilters);
      const list = Array.isArray(data) ? data : data?.posts || [];
      setPosts(list);
    } catch {
      message.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedRowKeys([]);
  }, [posts]);

  // --- Filter handlers ---

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ merchant: undefined, platform: undefined, status: undefined });
  };

  // --- Individual actions ---

  const handleEdit = (post) => {
    setEditingPost(post);
    const captions = {};
    if (post.platforms && Array.isArray(post.platforms)) {
      post.platforms.forEach(p => {
        captions[p.platform] = p.caption || '';
      });
    }
    setEditCaptions(captions);
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingPost) return;
    setEditSaving(true);
    try {
      const updatedCaptions =
        '_single' in editCaptions ? editCaptions._single : editCaptions;
      await updatePost(editingPost.id, { captions: updatedCaptions });
      message.success('Post updated');
      setEditModalOpen(false);
      setEditingPost(null);
      fetchPosts();
    } catch {
      message.error('Failed to update post');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePost(id);
      message.success('Post deleted');
      fetchPosts();
    } catch {
      message.error('Failed to delete post');
    }
  };

  const handleRetry = async (id) => {
    try {
      await retryPost(id);
      message.success('Retrying post...');
      fetchPosts();
    } catch {
      message.error('Retry failed');
    }
  };

  const handlePublishNow = async (id) => {
    try {
      await publishPost(id);
      message.success('Publishing post...');
      fetchPosts();
    } catch {
      message.error('Publish failed');
    }
  };

  // --- Batch actions ---

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchLoading(true);
    try {
      await Promise.all(selectedRowKeys.map((id) => deletePost(id)));
      message.success(`Deleted ${selectedRowKeys.length} post(s)`);
      setSelectedRowKeys([]);
      fetchPosts();
    } catch {
      message.error('Some deletes failed');
      fetchPosts();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchStatusUpdate = async () => {
    if (!batchStatus || selectedRowKeys.length === 0) return;
    setBatchLoading(true);
    try {
      await Promise.all(selectedRowKeys.map(id => updatePost(id, { status: batchStatus })));
      message.success(`Updated ${selectedRowKeys.length} post(s) to ${batchStatus}`);
      setStatusModalOpen(false);
      setBatchStatus(undefined);
      setSelectedRowKeys([]);
      fetchPosts();
    } catch {
      message.error('Batch status update failed');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchReschedule = async () => {
    if (!rescheduleTime || selectedRowKeys.length === 0) return;
    setBatchLoading(true);
    try {
      const timeStr = rescheduleTime.toISOString();
      await Promise.all(selectedRowKeys.map((id) => schedulePost(id, timeStr)));
      message.success(`Rescheduled ${selectedRowKeys.length} post(s)`);
      setRescheduleModalOpen(false);
      setRescheduleTime(null);
      setSelectedRowKeys([]);
      fetchPosts();
    } catch {
      message.error('Batch reschedule failed');
    } finally {
      setBatchLoading(false);
    }
  };

  // --- Helpers ---

  const getMerchantName = (merchantMid) => {
    const m = merchants.find((mer) => mer.mid === merchantMid || mer.id === merchantMid);
    return m ? m.dbaName || m.dba_name || m.name || m.mid : merchantMid || '—';
  };

  const truncate = (text, len = 80) => {
    if (!text) return '—';
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    return str.length > len ? str.slice(0, len) + '...' : str;
  };

  // --- Table columns ---

  const columns = [
    {
      title: 'Merchant',
      dataIndex: 'merchant_mid',
      key: 'merchant',
      width: 160,
      render: (mid) => <Text strong>{getMerchantName(mid)}</Text>,
    },
    {
      title: 'Platforms',
      dataIndex: 'platforms',
      key: 'platforms',
      width: 200,
      render: (platforms) => {
        if (!platforms) return '—';
        const list = Array.isArray(platforms) ? platforms : [platforms];
        return (
          <Space size={[0, 4]} wrap>
            {list.map((p) => {
              const name = typeof p === 'string' ? p : p.platform;
              const status = typeof p === 'object' ? p.status : null;
              return (
                <Tag key={name} color={PLATFORM_COLORS[name] || 'default'}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                  {status === 'failed' ? ' ✗' : status === 'success' ? ' ✓' : ''}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const cfg = STATUS_CONFIG[status] || { color: 'default', text: status };
        return <Badge color={cfg.color} text={cfg.text} />;
      },
    },
    {
      title: 'Captions',
      key: 'captions',
      ellipsis: true,
      render: (_, record) => {
        const platforms = record.platforms || [];
        if (platforms.length === 0) return '—';
        const first = platforms[0]?.caption || '';
        const count = platforms.length;
        const preview = truncate(first, 60);
        const suffix = count > 1 ? ` (+${count - 1} more)` : '';
        const full = platforms.map(p => `${p.platform}: ${p.caption || ''}`).join('\n\n');
        return (
          <Tooltip title={<pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxWidth: 400 }}>{full}</pre>}>
            <Text>{preview}{suffix}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Publish Time',
      dataIndex: 'scheduled_time',
      key: 'scheduled_time',
      width: 180,
      sorter: (a, b) => {
        const ta = a.scheduled_time ? new Date(a.scheduled_time).getTime() : 0;
        const tb = b.scheduled_time ? new Date(b.scheduled_time).getTime() : 0;
        return ta - tb;
      },
      render: (time) =>
        time ? dayjs(time).format('MMM D, YYYY h:mm A') : <Text type="secondary">Not set</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>

          {record.status === 'failed' && (
            <Tooltip title="Retry">
              <Button
                type="text"
                size="small"
                icon={<RetweetOutlined />}
                onClick={() => handleRetry(record.id)}
              />
            </Tooltip>
          )}

          {(record.status === 'draft' || record.status === 'pending' || record.status === 'scheduled') && (
            <Tooltip title="Publish Now">
              <Button
                type="text"
                size="small"
                icon={<SendOutlined />}
                onClick={() => handlePublishNow(record.id)}
              />
            </Tooltip>
          )}

          <Popconfirm
            title="Delete this post?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // --- Row selection ---

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  const hasSelected = selectedRowKeys.length > 0;

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        Manage Posts
      </Title>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col>
            <FilterOutlined style={{ marginRight: 8 }} />
            <Text strong>Filters:</Text>
          </Col>
          <Col flex="200px">
            <Select
              allowClear
              placeholder="Merchant"
              value={filters.merchant}
              onChange={(v) => handleFilterChange('merchant', v)}
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={merchants.map((m) => ({
                label: m.dbaName || m.dba_name || m.name || m.mid,
                value: m.mid || m.id,
              }))}
            />
          </Col>
          <Col flex="180px">
            <Select
              allowClear
              placeholder="Platform"
              value={filters.platform}
              onChange={(v) => handleFilterChange('platform', v)}
              style={{ width: '100%' }}
              options={PLATFORM_OPTIONS}
            />
          </Col>
          <Col flex="160px">
            <Select
              allowClear
              placeholder="Status"
              value={filters.status}
              onChange={(v) => handleFilterChange('status', v)}
              style={{ width: '100%' }}
              options={STATUS_OPTIONS}
            />
          </Col>
          <Col>
            <Space>
              <Button icon={<ClearOutlined />} onClick={clearFilters}>
                Clear
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchPosts} loading={loading}>
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Batch Actions Toolbar */}
      {hasSelected && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            background: '#e6f4ff',
            borderColor: '#91caff',
          }}
        >
          <Space>
            <Text>
              <strong>{selectedRowKeys.length}</strong> post(s) selected
            </Text>
            <Button
              size="small"
              onClick={() => setStatusModalOpen(true)}
            >
              Update Status
            </Button>
            <Button
              size="small"
              icon={<CalendarOutlined />}
              onClick={() => setRescheduleModalOpen(true)}
            >
              Reschedule
            </Button>
            <Popconfirm
              title={`Delete ${selectedRowKeys.length} post(s)?`}
              description="This action cannot be undone."
              onConfirm={handleBatchDelete}
              okText="Delete All"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger loading={batchLoading}>
                Delete Selected
              </Button>
            </Popconfirm>
            <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
              Clear Selection
            </Button>
          </Space>
        </Card>
      )}

      {/* Posts Table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={posts}
        loading={loading}
        rowSelection={rowSelection}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} posts`,
        }}
        scroll={{ x: 1100 }}
        size="middle"
      />

      {/* Edit Post Modal */}
      <Modal
        title="Edit Post Captions"
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingPost(null);
        }}
        confirmLoading={editSaving}
        okText="Save"
        width={640}
        destroyOnClose
      >
        {editingPost && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Merchant: <strong>{getMerchantName(editingPost.merchant_mid)}</strong>
              {' | '}Status: <Badge
                color={STATUS_CONFIG[editingPost.status]?.color || 'default'}
                text={STATUS_CONFIG[editingPost.status]?.text || editingPost.status}
              />
            </Text>

            {'_single' in editCaptions ? (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  Caption
                </Text>
                <TextArea
                  rows={4}
                  value={editCaptions._single}
                  onChange={(e) =>
                    setEditCaptions({ _single: e.target.value })
                  }
                />
              </div>
            ) : (
              Object.keys(editCaptions).map((platform) => (
                <div key={platform} style={{ marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>
                    <Tag color={PLATFORM_COLORS[platform] || 'default'}>
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </Tag>
                  </Text>
                  <TextArea
                    rows={3}
                    value={editCaptions[platform]}
                    onChange={(e) =>
                      setEditCaptions((prev) => ({
                        ...prev,
                        [platform]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* Batch Reschedule Modal */}
      <Modal
        title="Reschedule Selected Posts"
        open={rescheduleModalOpen}
        onOk={handleBatchReschedule}
        onCancel={() => {
          setRescheduleModalOpen(false);
          setRescheduleTime(null);
        }}
        confirmLoading={batchLoading}
        okText="Reschedule"
        okButtonProps={{ disabled: !rescheduleTime }}
        destroyOnClose
      >
        <Text style={{ display: 'block', marginBottom: 12 }}>
          Set a new publish time for <strong>{selectedRowKeys.length}</strong> post(s):
        </Text>
        <DatePicker
          showTime
          value={rescheduleTime}
          onChange={setRescheduleTime}
          style={{ width: '100%' }}
          disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
        />
      </Modal>

      {/* Batch Status Update Modal */}
      <Modal
        title="Update Status"
        open={statusModalOpen}
        onOk={handleBatchStatusUpdate}
        onCancel={() => {
          setStatusModalOpen(false);
          setBatchStatus(undefined);
        }}
        confirmLoading={batchLoading}
        okText="Update"
        okButtonProps={{ disabled: !batchStatus }}
        destroyOnClose
      >
        <Text style={{ display: 'block', marginBottom: 12 }}>
          Set status for <strong>{selectedRowKeys.length}</strong> post(s):
        </Text>
        <Select
          placeholder="Select status"
          value={batchStatus}
          onChange={setBatchStatus}
          style={{ width: '100%' }}
          options={STATUS_OPTIONS}
        />
      </Modal>
    </div>
  );
}

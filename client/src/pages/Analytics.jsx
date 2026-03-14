import { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Card, Statistic, Table, Select, Space, Tag, Empty, Spin, Avatar,
  Typography, Segmented, message,
} from 'antd';
import {
  FacebookFilled, InstagramFilled, HeartOutlined, CommentOutlined,
  ShareAltOutlined, EyeOutlined, TeamOutlined, FileTextOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { searchMerchants, getAnalytics } from '../api/client';
import MerchantSearch from '../components/merchants/MerchantSearch';

const { Text, Title } = Typography;

function StatCard({ title, value, icon, color, suffix }) {
  return (
    <Card size="small" style={{ borderRadius: 10 }}>
      <Statistic
        title={<Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>}
        value={value}
        prefix={<span style={{ color, fontSize: 18 }}>{icon}</span>}
        suffix={suffix}
        valueStyle={{ fontSize: 22, fontWeight: 600 }}
      />
    </Card>
  );
}

const FB_POST_COLUMNS = [
  {
    title: 'Post',
    dataIndex: 'message',
    key: 'message',
    ellipsis: true,
    render: (text, record) => (
      <Space>
        {record.image && (
          <Avatar shape="square" size={36} src={record.image} />
        )}
        <Text style={{ fontSize: 13 }}>{text || '(no text)'}</Text>
      </Space>
    ),
  },
  {
    title: 'Date',
    dataIndex: 'createdTime',
    key: 'date',
    width: 100,
    render: (v) => new Date(v).toLocaleDateString(),
  },
  {
    title: <><HeartOutlined /> Likes</>,
    dataIndex: 'likes',
    key: 'likes',
    width: 80,
    sorter: (a, b) => a.likes - b.likes,
  },
  {
    title: <><CommentOutlined /> Comments</>,
    dataIndex: 'comments',
    key: 'comments',
    width: 100,
    sorter: (a, b) => a.comments - b.comments,
  },
  {
    title: <><ShareAltOutlined /> Shares</>,
    dataIndex: 'shares',
    key: 'shares',
    width: 80,
    sorter: (a, b) => a.shares - b.shares,
  },
];

const IG_POST_COLUMNS = [
  {
    title: 'Post',
    dataIndex: 'caption',
    key: 'caption',
    ellipsis: true,
    render: (text, record) => (
      <Space>
        {record.image && (
          <Avatar shape="square" size={36} src={record.image} />
        )}
        <div>
          <Text style={{ fontSize: 13 }}>{text || '(no caption)'}</Text>
          <br />
          <Tag style={{ fontSize: 10, marginTop: 2 }}>{record.mediaType}</Tag>
        </div>
      </Space>
    ),
  },
  {
    title: 'Date',
    dataIndex: 'createdTime',
    key: 'date',
    width: 100,
    render: (v) => new Date(v).toLocaleDateString(),
  },
  {
    title: <><HeartOutlined /> Likes</>,
    dataIndex: 'likes',
    key: 'likes',
    width: 80,
    sorter: (a, b) => a.likes - b.likes,
  },
  {
    title: <><CommentOutlined /> Comments</>,
    dataIndex: 'comments',
    key: 'comments',
    width: 100,
    sorter: (a, b) => a.comments - b.comments,
  },
];

export default function Analytics() {
  const [merchant, setMerchant] = useState(null);
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState('facebook');

  const fetchAnalytics = useCallback(async (mid, days) => {
    setLoading(true);
    try {
      const result = await getAnalytics(mid, days);
      setData(result);
      // Auto-select first available platform
      if (result.facebook && !result.facebook.error) setPlatform('facebook');
      else if (result.instagram && !result.instagram.error) setPlatform('instagram');
    } catch (err) {
      message.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (merchant?.mid) {
      fetchAnalytics(merchant.mid, period);
    }
  }, [merchant, period, fetchAnalytics]);

  const fb = data?.facebook;
  const ig = data?.instagram;

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 20 }} align="middle">
        <Col flex="auto">
          <MerchantSearch value={merchant} onChange={setMerchant} />
        </Col>
        <Col>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 130 }}
            options={[
              { value: 7, label: 'Last 7 days' },
              { value: 14, label: 'Last 14 days' },
              { value: 30, label: 'Last 30 days' },
              { value: 90, label: 'Last 90 days' },
            ]}
          />
        </Col>
      </Row>

      {!merchant && (
        <Empty description="Select a merchant to view analytics" style={{ marginTop: 80 }} />
      )}

      {merchant && loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      )}

      {merchant && !loading && data && (
        <>
          <Segmented
            value={platform}
            onChange={setPlatform}
            style={{ marginBottom: 20 }}
            options={[
              ...(fb && !fb.error ? [{
                value: 'facebook',
                label: <Space size={6}><FacebookFilled style={{ color: '#1D4ED8' }} /> Facebook</Space>,
              }] : []),
              ...(ig && !ig.error ? [{
                value: 'instagram',
                label: <Space size={6}><InstagramFilled style={{ color: '#E1306C' }} /> Instagram</Space>,
              }] : []),
            ]}
          />

          {/* Facebook Analytics */}
          {platform === 'facebook' && fb && !fb.error && (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                  <StatCard title="Followers" value={fb.followers} icon={<TeamOutlined />} color="#1D4ED8" />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard title="Likes" value={fb.totalLikes} icon={<HeartOutlined />} color="#DC2626" />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard title="Comments" value={fb.totalComments} icon={<CommentOutlined />} color="#16A34A" />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard title="Posts" value={fb.postCount} icon={<FileTextOutlined />} color="#9333EA" />
                </Col>
              </Row>

              <Card
                size="small"
                title={<Text strong style={{ fontSize: 14 }}>Recent Posts</Text>}
                style={{ borderRadius: 10 }}
              >
                <Table
                  dataSource={fb.posts}
                  columns={FB_POST_COLUMNS}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            </>
          )}

          {platform === 'facebook' && fb?.error && (
            <Empty description={`Facebook error: ${fb.error}`} />
          )}

          {/* Instagram Analytics */}
          {platform === 'instagram' && ig && !ig.error && (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                  <StatCard title="Followers" value={ig.followers} icon={<TeamOutlined />} color="#E1306C" />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard title="Likes" value={ig.totalLikes} icon={<HeartOutlined />} color="#DC2626" />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard title="Comments" value={ig.totalComments} icon={<CommentOutlined />} color="#2563EB" />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard
                    title="Engagement Rate"
                    value={ig.engagementRate}
                    icon={<RiseOutlined />}
                    color="#16A34A"
                    suffix="%"
                  />
                </Col>
              </Row>

              <Card
                size="small"
                title={<Text strong style={{ fontSize: 14 }}>Recent Posts</Text>}
                style={{ borderRadius: 10 }}
              >
                <Table
                  dataSource={ig.posts}
                  columns={IG_POST_COLUMNS}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            </>
          )}

          {platform === 'instagram' && ig?.error && (
            <Empty description={`Instagram error: ${ig.error}`} />
          )}

          {!fb && !ig && (
            <Empty description="No platforms connected for this merchant" />
          )}
        </>
      )}
    </div>
  );
}

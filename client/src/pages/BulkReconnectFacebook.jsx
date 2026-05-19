import { useState, useEffect, useCallback } from 'react';
import {
  Typography, Button, Alert, Table, Card, Space, Spin, message, Tag, Result,
} from 'antd';
import {
  FacebookFilled, InstagramFilled, LinkOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getMetaBulkPreview, applyMetaBulkReconnect } from '../api/client';

const { Title, Text, Paragraph } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';

function ageLabel(days) {
  if (days === null || days === undefined) return <Tag>unknown</Tag>;
  // FB user tokens expire after 60 days; warn at 50+, red at 60+ (or revoked → forced reconnect anyway)
  if (days >= 60) return <Tag color="red">{days}d old — expired</Tag>;
  if (days >= 50) return <Tag color="gold">{days}d old — expiring soon</Tag>;
  return <Tag color="blue">{days}d old</Tag>;
}

export default function BulkReconnectFacebook() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState(null); // { pageCount, matched, unmatched }
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [error, setError] = useState('');
  const [doneCount, setDoneCount] = useState(null);
  const [doneIgCount, setDoneIgCount] = useState(0);

  const oauthError = searchParams.get('oauth_error');
  const ready = searchParams.get('ready') === '1';

  const startOAuth = () => {
    window.location.href = `${API_BASE}/api/oauth/meta/bulk-authorize`;
  };

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    setDoneCount(null);
    setDoneIgCount(0);
    try {
      const data = await getMetaBulkPreview();
      setPreview(data);
      setSelectedKeys((data.matched || []).map(m => m.mid));
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.error || err.message || 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) loadPreview();
  }, [ready, loadPreview]);

  const handleApply = async () => {
    if (selectedKeys.length === 0) return;
    setApplying(true);
    try {
      const res = await applyMetaBulkReconnect(selectedKeys);
      const igMsg = res.igUpdated ? ` (+${res.igUpdated} Instagram)` : '';
      message.success(`Reconnected ${res.updated} merchant${res.updated === 1 ? '' : 's'}${igMsg}`);
      setDoneCount(res.updated);
      setDoneIgCount(res.igUpdated || 0);
      if (res.skipped?.length) {
        message.warning(`${res.skipped.length} skipped (page not under this account)`);
      }
      // Drop the applied ones from the matched list
      setPreview(prev => prev && {
        ...prev,
        matched: (prev.matched || []).filter(m => !selectedKeys.includes(m.mid)),
      });
      setSelectedKeys([]);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || 'Failed to reconnect');
    } finally {
      setApplying(false);
    }
  };

  const matchedColumns = [
    { title: 'MID', dataIndex: 'mid', width: 120 },
    { title: 'Business', dataIndex: 'dbaName' },
    {
      title: 'Facebook Page',
      dataIndex: 'fbPageName',
      render: (v, r) => v || r.fbPageId,
    },
    {
      title: 'IG',
      dataIndex: 'hasInstagram',
      width: 70,
      render: (v) => v ? <Tag color="magenta" icon={<InstagramFilled />}>+IG</Tag> : null,
    },
    { title: 'Current token', dataIndex: 'tokenAgeDays', width: 180, render: ageLabel },
  ];
  const unmatchedColumns = [
    { title: 'MID', dataIndex: 'mid', width: 120 },
    { title: 'Business', dataIndex: 'dbaName' },
    { title: 'Saved page name', dataIndex: 'fbPageName' },
    { title: 'Saved page id', dataIndex: 'fbPageId' },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }} align="center">
        <Title level={3} style={{ margin: 0 }}>
          <FacebookFilled style={{ color: '#1D4ED8', marginRight: 8 }} />
          Reconnect Facebook &amp; Instagram (bulk)
        </Title>
        <Button onClick={() => navigate('/clients')}>Back to Clients</Button>
      </Space>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Sign in with one Facebook account and re-attach a fresh Page token to every merchant whose
        Facebook Page it manages. Instagram accounts linked to those Pages reconnect automatically in
        the same step. Repeat with another Facebook account for any pages it doesn&apos;t manage.
      </Paragraph>

      {oauthError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Facebook sign-in failed"
          description={oauthError}
          closable
          onClose={() => { searchParams.delete('oauth_error'); setSearchParams(searchParams); }}
        />
      )}

      {!ready && !preview && (
        <Card>
          <Space direction="vertical" size="middle">
            <Text>Click below, choose the Facebook account that manages these salons, and approve access.</Text>
            <Button type="primary" size="large" icon={<LinkOutlined />} onClick={startOAuth}>
              Connect a Facebook account
            </Button>
          </Space>
        </Card>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>
      )}

      {error && !loading && (
        <Card>
          <Space direction="vertical" size="middle">
            <Alert type="error" showIcon message={error} />
            <Button type="primary" icon={<LinkOutlined />} onClick={startOAuth}>Connect a Facebook account</Button>
          </Space>
        </Card>
      )}

      {preview && !loading && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Text type="secondary">{preview.pageCount} Page{preview.pageCount === 1 ? '' : 's'} found under this Facebook account.</Text>

          {doneCount !== null && (preview.matched || []).length === 0 ? (
            <Result
              status="success"
              title={`Reconnected ${doneCount} merchant${doneCount === 1 ? '' : 's'}${doneIgCount ? ` (+${doneIgCount} Instagram)` : ''}`}
              subTitle={preview.unmatched?.length
                ? 'Some merchants belong to a different Facebook account — connect that one next.'
                : 'All set. Facebook & Instagram reconnected.'}
              extra={[
                <Button key="another" type="primary" icon={<ReloadOutlined />} onClick={startOAuth}>Connect another Facebook account</Button>,
                <Button key="clients" onClick={() => navigate('/clients')}>Back to Clients</Button>,
              ]}
            />
          ) : (
            <Card
              title={`Will be reconnected (${(preview.matched || []).length})`}
              extra={
                <Button type="primary" loading={applying} disabled={selectedKeys.length === 0} onClick={handleApply}>
                  Reconnect selected ({selectedKeys.length})
                </Button>
              }
            >
              {(preview.matched || []).length === 0 ? (
                <Alert type="info" showIcon message="No merchants matched this Facebook account." />
              ) : (
                <Table
                  rowKey="mid"
                  size="small"
                  pagination={false}
                  columns={matchedColumns}
                  dataSource={preview.matched}
                  rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
                />
              )}
            </Card>
          )}

          {(preview.unmatched || []).length > 0 && (
            <Card title={`Not under this account (${preview.unmatched.length})`}>
              <Paragraph type="secondary">
                These merchants have a Facebook Page saved, but it isn&apos;t managed by the account you just
                signed in with. Sign in with the right Facebook account and run this again — they&apos;ll move
                into the list above.
              </Paragraph>
              <Table
                rowKey="mid"
                size="small"
                pagination={false}
                columns={unmatchedColumns}
                dataSource={preview.unmatched}
              />
              <div style={{ marginTop: 12 }}>
                <Button icon={<ReloadOutlined />} onClick={startOAuth}>Connect another Facebook account</Button>
              </div>
            </Card>
          )}
        </Space>
      )}
    </div>
  );
}

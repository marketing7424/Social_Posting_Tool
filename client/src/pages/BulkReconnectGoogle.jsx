import { useState, useEffect, useCallback } from 'react';
import {
  Typography, Button, Alert, Table, Card, Space, Spin, message, Tag, Result,
} from 'antd';
import { GoogleOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getGoogleBulkPreview, applyGoogleBulkReconnect } from '../api/client';

const { Title, Text, Paragraph } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';

function ageLabel(days) {
  if (days === null || days === undefined) return <Tag>unknown</Tag>;
  if (days >= 7) return <Tag color="red">{days}d old — expired</Tag>;
  return <Tag color="gold">{days}d old</Tag>;
}

export default function BulkReconnectGoogle() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState(null); // { locationCount, matched, unmatched }
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [error, setError] = useState('');
  const [doneCount, setDoneCount] = useState(null);

  const oauthError = searchParams.get('oauth_error');
  const ready = searchParams.get('ready') === '1';

  const startOAuth = () => {
    window.location.href = `${API_BASE}/api/oauth/google/bulk-authorize`;
  };

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    setDoneCount(null);
    try {
      const data = await getGoogleBulkPreview();
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
      const res = await applyGoogleBulkReconnect(selectedKeys);
      message.success(`Reconnected ${res.updated} merchant${res.updated === 1 ? '' : 's'}`);
      setDoneCount(res.updated);
      if (res.skipped?.length) {
        message.warning(`${res.skipped.length} skipped (location not under this account)`);
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
    { title: 'Google location', dataIndex: 'googleLocationName', render: (v, r) => v || r.googleLocationId },
    { title: 'Current token', dataIndex: 'tokenAgeDays', width: 180, render: ageLabel },
  ];
  const unmatchedColumns = [
    { title: 'MID', dataIndex: 'mid', width: 120 },
    { title: 'Business', dataIndex: 'dbaName' },
    { title: 'Saved location id', dataIndex: 'googleLocationId' },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }} align="center">
        <Title level={3} style={{ margin: 0 }}>
          <GoogleOutlined style={{ color: '#EA580C', marginRight: 8 }} />
          Reconnect Google (bulk)
        </Title>
        <Button onClick={() => navigate('/clients')}>Back to Clients</Button>
      </Space>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Sign in with one Google account and re-attach a fresh token to every merchant whose Business
        Profile location it manages. Repeat with another Google account for the rest.
      </Paragraph>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Publish the OAuth consent screen to production first"
        description={
          <>In Google Cloud Console (project <code>social-posting-tool-490121</code>) → APIs &amp; Services →
          OAuth consent screen → <b>Publish app</b>. Otherwise the new tokens expire again after 7 days.</>
        }
      />

      {oauthError && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Google sign-in failed" description={oauthError} closable onClose={() => { searchParams.delete('oauth_error'); setSearchParams(searchParams); }} />
      )}

      {!ready && !preview && (
        <Card>
          <Space direction="vertical" size="middle">
            <Text>Click below, choose the Google account that manages these salons, and approve access.</Text>
            <Button type="primary" size="large" icon={<LinkOutlined />} onClick={startOAuth}>
              Connect a Google account
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
            <Button type="primary" icon={<LinkOutlined />} onClick={startOAuth}>Connect a Google account</Button>
          </Space>
        </Card>
      )}

      {preview && !loading && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Text type="secondary">{preview.locationCount} location{preview.locationCount === 1 ? '' : 's'} found under this Google account.</Text>

          {doneCount !== null && (preview.matched || []).length === 0 ? (
            <Result
              status="success"
              title={`Reconnected ${doneCount} merchant${doneCount === 1 ? '' : 's'}`}
              subTitle={preview.unmatched?.length ? 'Some merchants belong to a different Google account — connect that one next.' : 'All set.'}
              extra={[
                <Button key="another" type="primary" icon={<ReloadOutlined />} onClick={startOAuth}>Connect another Google account</Button>,
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
                <Alert type="info" showIcon message="No merchants matched this Google account." />
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
                These merchants have a Google Business location saved, but it isn&apos;t managed by the account you
                just signed in with. Sign in with the right Google account and run this again — they&apos;ll move
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
                <Button icon={<ReloadOutlined />} onClick={startOAuth}>Connect another Google account</Button>
              </div>
            </Card>
          )}
        </Space>
      )}
    </div>
  );
}

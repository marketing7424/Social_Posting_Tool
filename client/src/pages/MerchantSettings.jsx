import { useState, useEffect } from 'react';
import {
  Card, Form, Input, Button, Space, message, Spin, Alert, Typography, Result, Badge, Divider, Modal, List,
} from 'antd';
import {
  FacebookFilled, InstagramFilled, GoogleOutlined,
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LinkOutlined, ApiOutlined, LoadingOutlined, DisconnectOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getMerchant, updateMerchant, testConnections, getMetaPages, selectMetaPage, getGoogleLocations, selectGoogleLocation } from '../api/client';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';

function ConnectionStatus({ result }) {
  if (!result) return null;
  if (result.connected) {
    return (
      <Alert
        type="success" showIcon icon={<CheckCircleOutlined />}
        message="Connected"
        description={result.details}
        style={{ marginTop: 12 }}
      />
    );
  }
  return (
    <Alert
      type="error" showIcon icon={<CloseCircleOutlined />}
      message="Not Connected"
      description={result.error}
      style={{ marginTop: 12 }}
    />
  );
}

function PlatformBadge({ connected }) {
  return connected
    ? <Badge status="success" text="Connected" />
    : <Badge status="default" text="Not connected" />;
}

export default function MerchantSettings() {
  const { id: mid } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [merchant, setMerchant] = useState(null);
  const [error, setError] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [manualIgId, setManualIgId] = useState('');
  const [connectingIg, setConnectingIg] = useState(false);
  const [availablePages, setAvailablePages] = useState([]);
  const [selectingPageId, setSelectingPageId] = useState(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectingLocation, setSelectingLocation] = useState(false);

  // Handle OAuth redirect query params
  useEffect(() => {
    const oauthSuccess = searchParams.get('oauth_success');
    const oauthError = searchParams.get('oauth_error');
    const platforms = searchParams.get('platforms');
    const pickPage = searchParams.get('pick_page');

    const pickGoogleLocation = searchParams.get('pick_google_location');

    if (pickPage) {
      // Load available pages and show picker
      searchParams.delete('pick_page');
      setSearchParams(searchParams, { replace: true });
      getMetaPages(mid).then(data => {
        setAvailablePages(data.pages);
        setPagePickerOpen(true);
      }).catch(err => {
        message.error('Failed to load pages: ' + (err.response?.data?.error || err.message));
      });
    }
    if (pickGoogleLocation) {
      searchParams.delete('pick_google_location');
      setSearchParams(searchParams, { replace: true });
      getGoogleLocations(mid).then(data => {
        setAvailableLocations(data.locations);
        setLocationPickerOpen(true);
      }).catch(err => {
        message.error('Failed to load locations: ' + (err.response?.data?.error || err.message));
      });
    }
    if (oauthSuccess) {
      const platformList = platforms ? platforms.split(',').join(', ') : oauthSuccess;
      message.success(`Successfully connected: ${platformList}`);
      searchParams.delete('oauth_success');
      searchParams.delete('platforms');
      setSearchParams(searchParams, { replace: true });
      loadMerchant();
    }
    if (oauthError) {
      message.error(`OAuth error: ${oauthError}`);
      searchParams.delete('oauth_error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSelectPage = async (pageId) => {
    setSelectingPageId(pageId);
    try {
      const result = await selectMetaPage(mid, pageId);
      setPagePickerOpen(false);
      setPageSearch('');
      message.success(`Connected: ${result.platforms.join(', ')}`);
      loadMerchant();
    } catch (err) {
      message.error('Failed to select page: ' + (err.response?.data?.error || err.message));
    } finally {
      setSelectingPageId(null);
    }
  };

  const handleManualIgConnect = async () => {
    if (!manualIgId.trim()) {
      message.error('Please enter an Instagram Business Account ID');
      return;
    }
    setConnectingIg(true);
    try {
      const resp = await fetch(`${API_BASE}/api/oauth/meta/connect-instagram/${mid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ igUserId: manualIgId.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to connect Instagram');
      message.success(`Instagram connected: @${data.username || manualIgId}`);
      setManualIgId('');
      loadMerchant();
    } catch (err) {
      message.error(err.message);
    } finally {
      setConnectingIg(false);
    }
  };

  const handleSelectLocation = async (locationName) => {
    setSelectingLocation(true);
    try {
      await selectGoogleLocation(mid, locationName);
      setLocationPickerOpen(false);
      message.success('Google Business location connected!');
      loadMerchant();
    } catch (err) {
      message.error('Failed to select location: ' + (err.response?.data?.error || err.message));
    } finally {
      setSelectingLocation(false);
    }
  };

  const handleDisconnect = (platform) => {
    const fieldsToClear = {
      facebook: { fbPageId: '', fbToken: '', fbPageName: '', igUserId: '', igToken: '', igUsername: '' },
      instagram: { igUserId: '', igToken: '', igUsername: '' },
      google: { googleToken: '', googleLocationId: '', googleLocationName: '' },
    };
    Modal.confirm({
      title: `Disconnect ${platform}?`,
      content: platform === 'facebook'
        ? 'This will also disconnect Instagram since it uses the same Facebook token.'
        : `This will remove the ${platform} credentials for this merchant.`,
      okText: 'Disconnect',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const updated = await updateMerchant(mid, fieldsToClear[platform]);
          setMerchant(updated);
          form.setFieldsValue(fieldsToClear[platform]);
          setTestResults(null);
          message.success(`${platform} disconnected`);
        } catch {
          message.error(`Failed to disconnect ${platform}`);
        }
      },
    });
  };

  // Load merchant data
  const loadMerchant = async () => {
    try {
      setLoading(true);
      const data = await getMerchant(mid);
      setMerchant(data);
      form.setFieldsValue({
        fbPageId: data.fbPageId || '',
        fbToken: data.fbToken || '',
        igUserId: data.igUserId || '',
        igToken: data.igToken || '',
        googleToken: data.googleToken || '',
        googleLocationId: data.googleLocationId || '',
      });
    } catch {
      setError('Failed to load merchant data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMerchant();
  }, [mid]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const updated = await updateMerchant(mid, values);
      setMerchant(updated);
      message.success('Credentials saved');
    } catch (err) {
      if (err.errorFields) return;
      message.error('Failed to save credentials');
    } finally {
      setSaving(false);
    }
  };

  const handleTestAll = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const results = await testConnections(mid);
      setTestResults(results);
      const connected = Object.values(results).filter(r => r.connected).length;
      const total = Object.keys(results).length;
      if (connected === total) {
        message.success('All platforms connected!');
      } else if (connected > 0) {
        message.warning(`${connected}/${total} platforms connected`);
      } else {
        message.error('No platforms connected');
      }
    } catch (err) {
      message.error('Connection test failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', marginTop: 80 }}><Spin size="large" /></div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Result status="error" title="Error Loading Merchant" subTitle={error}
          extra={<Button onClick={() => navigate('/clients')}>Back to Clients</Button>} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} align="center">
        <Space align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/clients')}>Back</Button>
          <Title level={3} style={{ margin: 0 }}>Settings: {merchant?.dbaName}</Title>
        </Space>
        <Button
          icon={testing ? <LoadingOutlined /> : <ApiOutlined />}
          onClick={handleTestAll}
          loading={testing}
        >
          Test All Connections
        </Button>
      </Space>

      <Form form={form} layout="vertical">
        {/* Facebook */}
        <Card
          title={
            <Space>
              <FacebookFilled style={{ color: '#1D4ED8', fontSize: 20 }} />
              <span>Facebook</span>
              <PlatformBadge connected={!!merchant?.fbPageId} />
            </Space>
          }
          extra={
            <Space>
              {merchant?.fbPageId && (
                <Button
                  danger
                  icon={<DisconnectOutlined />}
                  onClick={() => handleDisconnect('facebook')}
                >
                  Disconnect
                </Button>
              )}
              <Button
                type="primary"
                icon={<LinkOutlined />}
                href={`${API_BASE}/api/oauth/meta/authorize/${mid}`}
              >
                {merchant?.fbPageId ? 'Reconnect' : 'Connect with Facebook'}
              </Button>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          {merchant?.fbPageId ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 16 }}
              message={`Connected to: ${merchant.fbPageName || merchant.fbPageId}`}
              description={`Page ID: ${merchant.fbPageId}`}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="How to connect Facebook & Instagram"
              description={
                <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  <li>Click "Connect with Facebook" above</li>
                  <li>Log in with the Facebook account that manages your Page</li>
                  <li>Grant all requested permissions</li>
                  <li>Select the Facebook Page you want to post to</li>
                  <li>If the Page has a linked Instagram Business account, it will be connected automatically</li>
                </ol>
              }
            />
          )}

          <Form.Item name="fbPageId" label="Page ID" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="fbToken" label="Page Access Token" hidden>
            <Input.Password />
          </Form.Item>
          <ConnectionStatus result={testResults?.facebook} />
        </Card>

        {/* Instagram */}
        <Card
          title={
            <Space>
              <InstagramFilled style={{ color: '#EAB308', fontSize: 20 }} />
              <span>Instagram</span>
              <PlatformBadge connected={!!merchant?.igUserId} />
            </Space>
          }
          extra={
            merchant?.igUserId && (
              <Button
                danger
                icon={<DisconnectOutlined />}
                onClick={() => handleDisconnect('instagram')}
              >
                Disconnect
              </Button>
            )
          }
          style={{ marginBottom: 16 }}
        >
          {merchant?.igUserId ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 16 }}
              message={`Connected to: ${merchant.igUsername ? '@' + merchant.igUsername : merchant.igUserId}`}
              description={`User ID: ${merchant.igUserId}`}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Instagram connects through Facebook"
              description={
                <div>
                  When you connect Facebook above, a linked Instagram Business account is automatically connected.
                  If auto-detection doesn't work, you can connect manually below.
                </div>
              }
            />
          )}

          <Form.Item name="igUserId" hidden><Input /></Form.Item>
          <Form.Item name="igToken" hidden><Input.Password /></Form.Item>

          {!merchant?.igUserId && (
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Manual Instagram Connection</Text>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="Instagram Business Account ID (e.g. 17841472647254584)"
                  value={manualIgId}
                  onChange={(e) => setManualIgId(e.target.value)}
                />
                <Button
                  type="primary"
                  loading={connectingIg}
                  onClick={handleManualIgConnect}
                >
                  Connect
                </Button>
              </Space.Compact>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                Find the ID in your Business Portfolio &gt; Instagram accounts &gt; click the account &gt; copy the ID number.
                {!merchant?.fbToken && ' Connect Facebook first, or the verification may fail.'}
              </Text>
            </div>
          )}
          <ConnectionStatus result={testResults?.instagram} />
        </Card>

        {/* Google Business */}
        <Card
          title={
            <Space>
              <GoogleOutlined style={{ color: '#EA580C', fontSize: 20 }} />
              <span>Google Business Profile</span>
              <PlatformBadge connected={!!merchant?.googleToken} />
            </Space>
          }
          extra={
            <Space>
              {merchant?.googleToken && (
                <Button
                  danger
                  icon={<DisconnectOutlined />}
                  onClick={() => handleDisconnect('google')}
                >
                  Disconnect
                </Button>
              )}
              <Button
                type="primary"
                icon={<LinkOutlined />}
                href={`${API_BASE}/api/oauth/google/authorize/${mid}`}
              >
                {merchant?.googleToken ? 'Reconnect' : 'Connect with Google'}
              </Button>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          {merchant?.googleToken ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 16 }}
              message={`Connected${merchant.googleLocationName ? ': ' + merchant.googleLocationName : ''}`}
              description={merchant.googleLocationId ? `Location: ${merchant.googleLocationId}` : 'No location set'}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Google Business Profile setup"
              description={
                <div>
                  To connect Google Business Profile:
                  <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                    <li>Set up <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in your <code>.env</code> file</li>
                    <li>Add <code>http://localhost:3001/api/oauth/google/callback</code> as an authorized redirect URI in Google Cloud Console</li>
                    <li>Click "Connect with Google" above</li>
                  </ol>
                </div>
              }
            />
          )}

          <Form.Item name="googleToken" hidden><Input.Password /></Form.Item>
          <Form.Item name="googleLocationId" label="Location ID">
            <Input placeholder="accounts/xxx/locations/yyy" />
          </Form.Item>
          <ConnectionStatus result={testResults?.google} />
        </Card>

        <Divider />

        <Space>
          <Button type="primary" onClick={handleSave} loading={saving} size="large">
            Save Credentials
          </Button>
          <Button onClick={handleTestAll} loading={testing} icon={<ApiOutlined />} size="large">
            Test Connections
          </Button>
        </Space>
      </Form>

      <Modal
        title="Select a Facebook Page"
        open={pagePickerOpen}
        onCancel={() => { setPagePickerOpen(false); setPageSearch(''); }}
        footer={null}
        width={600}
      >
        <p>Choose which Facebook Page to connect:</p>
        <Input.Search
          placeholder="Search by page name or Page ID..."
          value={pageSearch}
          onChange={(e) => setPageSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 16 }}
        />
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <List
            dataSource={availablePages.filter((page) => {
              if (!pageSearch) return true;
              const q = pageSearch.toLowerCase();
              return page.name.toLowerCase().includes(q) || page.id.includes(q);
            })}
            locale={{ emptyText: pageSearch ? 'No pages match your search' : 'No pages found' }}
            renderItem={(page) => (
              <List.Item
                actions={[
                  <Button
                    type="primary"
                    onClick={() => handleSelectPage(page.id)}
                    loading={selectingPageId === page.id}
                    disabled={selectingPageId && selectingPageId !== page.id}
                    key="select"
                  >
                    Select
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={page.name}
                  description={
                    <Space wrap>
                      <span>Page ID: {page.id}</span>
                      {page.business && <Badge status="processing" text={page.business} />}
                      {page.hasInstagram && <Badge status="success" text="Instagram linked" />}
                      {!page.hasInstagram && <Badge status="default" text="No Instagram" />}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      </Modal>

      <Modal
        title={
          <Space>
            <GoogleOutlined style={{ color: '#EA580C', fontSize: 20 }} />
            <span>Select a Google Business Location</span>
          </Space>
        }
        open={locationPickerOpen}
        onCancel={() => setLocationPickerOpen(false)}
        footer={null}
        width={560}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Choose which location to connect for this merchant:
        </Text>
        {availableLocations.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="No locations found"
            description="No Google Business Profile locations were found for this account. Make sure you have a verified business location."
          />
        ) : (
          <List
            dataSource={availableLocations}
            renderItem={(loc) => (
              <List.Item
                actions={[
                  <Button
                    type="primary"
                    onClick={() => handleSelectLocation(loc.name)}
                    loading={selectingLocation}
                    key="select"
                  >
                    Connect
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', background: '#EA580C',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: 16,
                    }}>
                      {loc.title?.charAt(0)?.toUpperCase() || 'G'}
                    </div>
                  }
                  title={loc.title || loc.name}
                  description={
                    <div>
                      {loc.address && <div style={{ fontSize: 12, color: '#64748B' }}>{loc.address}</div>}
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{loc.name}</div>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  );
}

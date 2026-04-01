import { useState, useCallback } from 'react';
import {
  Row, Col, Card, Steps, Button, Checkbox, Space, DatePicker, TimePicker,
  message, Divider, Modal, Typography, Tag,
} from 'antd';
import {
  SendOutlined, ClockCircleOutlined, PlusOutlined,
  CheckCircleFilled, CloseCircleFilled, LoadingOutlined,
  FacebookFilled, InstagramFilled, GoogleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import MerchantSearch from '../components/merchants/MerchantSearch';
import MediaUploader from '../components/media/MediaUploader';
import MediaGrid from '../components/media/MediaGrid';
import LayoutSelector from '../components/media/LayoutSelector';
import CaptionEditor from '../components/captions/CaptionEditor';
import PreviewPanel from '../components/previews/PreviewPanel';
import {
  deleteMedia, generateCaptions, regenerateCaption,
  createPost, publishPost, getPostStatus, schedulePost,
} from '../api/client';

const { Title, Text } = Typography;

const PLATFORM_ICON_MAP = {
  facebook: { icon: <FacebookFilled />, color: '#1D4ED8', label: 'Facebook' },
  instagram: { icon: <InstagramFilled />, color: '#EAB308', label: 'Instagram' },
  google: { icon: <GoogleOutlined />, color: '#EA580C', label: 'Google Business' },
};

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'google', label: 'Google Business' },
];

export default function CreatePost() {
  const navigate = useNavigate();

  // State
  const [merchant, setMerchant] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState(['facebook', 'instagram', 'google']);
  const [captions, setCaptions] = useState({ facebook: '', instagram: '', google: '' });
  const [fbLayout, setFbLayout] = useState('collage');
  const [fbLayoutVariant, setFbLayoutVariant] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [regeneratingPlatform, setRegeneratingPlatform] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(null);
  const [scheduleTime, setScheduleTime] = useState(null);
  const [publishResults, setPublishResults] = useState(null); // { status: 'publishing'|'done', platforms: { facebook: {status,error}, ... } }

  // Current step based on state
  const currentStep = !merchant ? 0 : mediaFiles.length === 0 ? 1 : selectedPlatforms.length === 0 ? 2 : 3;

  // Media upload - receives already-uploaded files from MediaUploader
  const handleUpload = useCallback((uploadedFiles) => {
    setMediaFiles(prev => [...prev, ...uploadedFiles]);
  }, []);

  const handleMediaReorder = useCallback((newFiles) => {
    setMediaFiles(newFiles);
  }, []);

  const handleMediaDelete = useCallback(async (filename) => {
    try {
      await deleteMedia(filename);
      setMediaFiles(prev => prev.filter(f => f.filename !== filename));
    } catch (_) {
      setMediaFiles(prev => prev.filter(f => f.filename !== filename));
    }
  }, []);

  // Platform toggle
  const handlePlatformChange = useCallback((platform, checked) => {
    setSelectedPlatforms(prev =>
      checked ? [...prev, platform] : prev.filter(p => p !== platform)
    );
  }, []);

  // AI Caption generation
  const handleGenerateCaptions = useCallback(async () => {
    if (selectedPlatforms.length === 0) {
      message.warning('Select at least one platform');
      return;
    }
    setGenerating(true);
    try {
      // Generate captions excluding Google (defaults to empty/photo-only)
      // FB and IG share the same caption — only generate for facebook, then copy to instagram
      const captionPlatforms = selectedPlatforms.filter(p => p !== 'google');
      if (captionPlatforms.length === 0) {
        message.info('Google captions are not auto-generated. Type one manually or use Regenerate.');
        setGenerating(false);
        return;
      }
      const genPlatforms = captionPlatforms.includes('facebook') ? ['facebook'] :
                           captionPlatforms.includes('instagram') ? ['instagram'] : captionPlatforms;
      const result = await generateCaptions({
        mediaFiles: mediaFiles.map(f => f.filename),
        merchantName: merchant?.dbaName || merchant?.mid || '',
        merchantPhone: merchant?.phone || '',
        merchantAddress: merchant?.address || '',
        merchantWebsite: merchant?.website || '',
        platforms: genPlatforms,
      });
      // Sync FB and IG to the same caption
      const sharedCaption = result.facebook || result.instagram || '';
      if (sharedCaption) {
        result.facebook = sharedCaption;
        result.instagram = sharedCaption;
      }
      setCaptions(prev => ({ ...prev, ...result }));
      message.success('Captions generated!');
    } catch (err) {
      message.error('Caption generation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setGenerating(false);
    }
  }, [mediaFiles, merchant, selectedPlatforms]);

  const handleRegenerateCaption = useCallback(async (platform, feedback) => {
    setRegeneratingPlatform(platform);
    try {
      const result = await regenerateCaption({
        platform,
        currentCaption: captions[platform],
        feedback: feedback || '',
        merchantName: merchant?.dbaName || merchant?.mid || '',
        merchantPhone: merchant?.phone || '',
        merchantAddress: merchant?.address || '',
        merchantWebsite: merchant?.website || '',
        mediaFiles: mediaFiles.map(f => f.filename),
      });
      // Sync FB and IG captions
      const updated = { [platform]: result.caption };
      if (platform === 'facebook') updated.instagram = result.caption;
      if (platform === 'instagram') updated.facebook = result.caption;
      setCaptions(prev => ({ ...prev, ...updated }));
      message.success(`${platform} caption regenerated`);
    } catch (err) {
      message.error('Regeneration failed');
    } finally {
      setRegeneratingPlatform(null);
    }
  }, [captions, merchant, mediaFiles]);

  // Publish — fires instantly, polls for results in background
  const handlePublish = useCallback(async () => {
    if (!merchant || selectedPlatforms.length === 0) {
      message.warning('Select a merchant and at least one platform');
      return;
    }
    setPublishing(true);

    // Build initial publishing state for each selected platform
    const initialPlatforms = {};
    for (const p of selectedPlatforms) {
      initialPlatforms[p] = { status: 'publishing' };
    }
    setPublishResults({ status: 'publishing', platforms: initialPlatforms });

    try {
      const post = await createPost({
        merchantMid: merchant.mid,
        platforms: selectedPlatforms,
        captions,
        mediaFiles: mediaFiles.map(f => ({ filename: f.filename, originalName: f.originalName, mimetype: f.mimetype })),
        fbLayout,
        fbLayoutVariant,
      });
      await publishPost(post.id);
      setPublishing(false);

      // Poll for results in background — UI stays usable
      const pollForResults = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const status = await getPostStatus(post.id);
            if (status.status === 'publishing') continue;

            const platformResults = {};
            for (const [plat, r] of Object.entries(status.results || {})) {
              platformResults[plat] = { status: r.status, error: r.error || null };
            }
            setPublishResults({ status: 'done', platforms: platformResults });
            return;
          } catch { /* keep polling */ }
        }
        // Timeout — mark remaining as unknown
        setPublishResults(prev => {
          const updated = { ...prev, status: 'done' };
          const platforms = { ...prev.platforms };
          for (const p of Object.keys(platforms)) {
            if (platforms[p].status === 'publishing') {
              platforms[p] = { status: 'failed', error: 'Timed out — check Manage Posts' };
            }
          }
          updated.platforms = platforms;
          return updated;
        });
      };
      pollForResults();
    } catch (err) {
      message.error('Publish failed: ' + (err.response?.data?.error || err.message));
      setPublishing(false);
      setPublishResults(null);
    }
  }, [merchant, selectedPlatforms, captions, mediaFiles, fbLayout, fbLayoutVariant]);

  // Schedule
  const handleSchedule = useCallback(async () => {
    if (!scheduleDate || !scheduleTime) {
      message.warning('Select date and time');
      return;
    }
    const scheduledTime = dayjs(scheduleDate)
      .hour(scheduleTime.hour())
      .minute(scheduleTime.minute())
      .second(0)
      .toISOString();

    setPublishing(true);
    try {
      const post = await createPost({
        merchantMid: merchant.mid,
        platforms: selectedPlatforms,
        captions,
        mediaFiles: mediaFiles.map(f => ({ filename: f.filename, originalName: f.originalName, mimetype: f.mimetype })),
        fbLayout,
        scheduledTime,
      });
      await schedulePost(post.id, scheduledTime);
      message.success(`Scheduled for ${dayjs(scheduledTime).format('MMM D, YYYY h:mm A')}`);
      setScheduleVisible(false);
      resetForm();
    } catch (err) {
      message.error('Scheduling failed');
    } finally {
      setPublishing(false);
    }
  }, [merchant, selectedPlatforms, captions, mediaFiles, fbLayout, scheduleDate, scheduleTime]);

  const resetForm = () => {
    setMerchant(null);
    setMediaFiles([]);
    setCaptions({ facebook: '', instagram: '', google: '' });
    setSelectedPlatforms(['facebook', 'instagram', 'google']);
    setFbLayout('collage');
    setFbLayoutVariant(0);
    setScheduleDate(null);
    setScheduleTime(null);
    setPublishResults(null);
  };

  const hasContent = selectedPlatforms.some(p => captions[p]?.trim()) || mediaFiles.length > 0;

  return (
    <Row gutter={24}>
      {/* Left column - Form */}
      <Col xs={24} lg={14}>
        <Steps
          current={currentStep}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: 'Merchant' },
            { title: 'Media' },
            { title: 'Platforms' },
            { title: 'Captions' },
          ]}
        />

        {/* 1. Select Merchant */}
        <Card size="small" title="1. Select Merchant" style={{ marginBottom: 16 }}>
          <MerchantSearch
            value={merchant}
            onChange={setMerchant}
            onCreateNew={() => navigate('/clients')}
          />
          {!merchant && (
            <div style={{ marginTop: 12, color: '#888' }}>
              <Text type="secondary">
                Search for an existing client above, or{' '}
                <Button type="link" size="small" icon={<PlusOutlined />} style={{ padding: 0 }} onClick={() => navigate('/clients')}>
                  create a new client
                </Button>
                {' '}to get started.
              </Text>
            </div>
          )}
        </Card>

        {/* 2. Upload Media */}
        <Card size="small" title="2. Upload Media" style={{ marginBottom: 16 }}>
          <MediaUploader onUpload={handleUpload} loading={uploading} />
          {mediaFiles.length > 0 && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <MediaGrid
                files={mediaFiles}
                onReorder={handleMediaReorder}
                onDelete={handleMediaDelete}
              />
              {mediaFiles.length > 1 && selectedPlatforms.includes('facebook') && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ marginRight: 8 }}>Facebook layout:</Text>
                  <LayoutSelector value={fbLayout} onChange={setFbLayout} />
                </div>
              )}
            </>
          )}
        </Card>

        {/* 3. Select Platforms */}
        <Card size="small" title="3. Select Platforms" style={{ marginBottom: 16 }}>
          <Space size="large">
            {PLATFORMS.map(({ key, label }) => {
              const cfg = PLATFORM_ICON_MAP[key];
              return (
                <Checkbox
                  key={key}
                  checked={selectedPlatforms.includes(key)}
                  onChange={e => handlePlatformChange(key, e.target.checked)}
                >
                  <Space size={4}>
                    <span style={{ color: cfg?.color, fontSize: 15, display: 'inline-flex' }}>{cfg?.icon}</span>
                    {label}
                  </Space>
                </Checkbox>
              );
            })}
          </Space>
        </Card>

        {/* 4. Captions */}
        <Card size="small" title="4. Captions" style={{ marginBottom: 16 }}>
          <CaptionEditor
            captions={captions}
            platforms={selectedPlatforms}
            onCaptionsChange={setCaptions}
            onGenerate={handleGenerateCaptions}
            onRegenerate={handleRegenerateCaption}
            generating={generating}
            regeneratingPlatform={regeneratingPlatform}
          />
        </Card>

        {/* 5. Publish */}
        <Card size="small" title="5. Publish">
          <Space wrap>
            <Button
              type="primary"
              icon={publishResults?.status === 'done' ? <CheckCircleFilled /> : <SendOutlined />}
              size="large"
              loading={publishing}
              disabled={!merchant || !hasContent || publishResults?.status === 'done'}
              onClick={handlePublish}
              style={publishResults?.status === 'done' ? { background: '#52c41a', borderColor: '#52c41a' } : undefined}
            >
              {publishResults?.status === 'done' ? 'Posted!' : 'Post Now'}
            </Button>
            <Button
              icon={<ClockCircleOutlined />}
              size="large"
              disabled={!merchant || !hasContent}
              onClick={() => {
                // Default to tomorrow at 10 AM in the merchant's timezone
                if (!scheduleDate) {
                  setScheduleDate(dayjs().add(1, 'day'));
                }
                if (!scheduleTime) {
                  if (merchant?.timezone) {
                    // 10 AM in the merchant's timezone, converted to local
                    const tenAm = dayjs().tz(merchant.timezone).startOf('day').hour(10);
                    setScheduleTime(tenAm.local());
                  } else {
                    setScheduleTime(dayjs().hour(10).minute(0).second(0));
                  }
                }
                setScheduleVisible(true);
              }}
            >
              Schedule
            </Button>
            {publishResults && publishResults.status === 'done' && (
              <Button
                icon={<PlusOutlined />}
                size="large"
                onClick={resetForm}
              >
                New Post
              </Button>
            )}
          </Space>

          {/* Publish status box */}
          {publishResults && (
            <div style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              background: publishResults.status === 'publishing' ? '#F8FAFC' : '#F8FAFC',
              border: '1px solid #E2E8F0',
            }}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12, color: '#475569' }}>
                {publishResults.status === 'publishing' ? 'Publishing...' : 'Publish Results'}
              </Text>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {['facebook', 'instagram', 'google'].filter(p => publishResults.platforms[p]).map(platform => {
                  const result = publishResults.platforms[platform];
                  const cfg = PLATFORM_ICON_MAP[platform];
                  if (!cfg) return null;
                  const isPublishing = result.status === 'publishing';
                  const isSuccess = result.status === 'success';
                  const isFailed = result.status === 'failed';
                  return (
                    <div key={platform} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: isSuccess ? '#F0FDF4' : isFailed ? '#FEF2F2' : '#fff',
                      border: `1px solid ${isSuccess ? '#BBF7D0' : isFailed ? '#FECACA' : '#E2E8F0'}`,
                    }}>
                      <Space size={8}>
                        <span style={{ color: cfg.color, fontSize: 18, display: 'flex' }}>{cfg.icon}</span>
                        <Text strong style={{ fontSize: 13 }}>{cfg.label}</Text>
                      </Space>
                      <Space size={6}>
                        {isPublishing && (
                          <Tag color="processing" icon={<LoadingOutlined spin />} style={{ margin: 0 }}>
                            Publishing
                          </Tag>
                        )}
                        {isSuccess && (
                          <Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0 }}>
                            Published
                          </Tag>
                        )}
                        {isFailed && (
                          <Tag color="error" icon={<CloseCircleFilled />} style={{ margin: 0 }}>
                            Failed
                          </Tag>
                        )}
                      </Space>
                    </div>
                  );
                })}
              </Space>
              {publishResults.status === 'done' && Object.values(publishResults.platforms).some(r => r.status === 'failed') && (
                <div style={{ marginTop: 10 }}>
                  {Object.entries(publishResults.platforms)
                    .filter(([, r]) => r.status === 'failed' && r.error)
                    .map(([platform, r]) => (
                      <Text key={platform} type="danger" style={{ fontSize: 12, display: 'block' }}>
                        {PLATFORM_ICON_MAP[platform]?.label}: {r.error}
                      </Text>
                    ))
                  }
                </div>
              )}
            </div>
          )}
        </Card>
      </Col>

      {/* Right column - Preview */}
      <Col xs={24} lg={10}>
        <div style={{ position: 'sticky', top: 24 }}>
          <PreviewPanel
            captions={captions}
            mediaFiles={mediaFiles}
            merchantName={merchant?.dbaName || merchant?.mid || 'Your Business'}
            selectedPlatforms={selectedPlatforms}
            fbLayout={fbLayout}
            fbLayoutVariant={fbLayoutVariant}
            onFbLayoutVariantChange={setFbLayoutVariant}
          />
        </div>
      </Col>

      {/* Schedule Modal */}
      <Modal
        title="Schedule Post"
        open={scheduleVisible}
        onOk={handleSchedule}
        onCancel={() => setScheduleVisible(false)}
        confirmLoading={publishing}
        okText="Schedule"
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {merchant?.timezone && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Times shown in {merchant.timezone.replace(/^America\//, '').replace(/_/g, ' ')} time ({merchant.timezone})
            </Text>
          )}
          <div>
            <Text strong>Date</Text>
            <DatePicker
              style={{ width: '100%', marginTop: 4 }}
              value={scheduleDate}
              onChange={setScheduleDate}
              disabledDate={current => current && current < dayjs().startOf('day')}
            />
          </div>
          <div>
            <Text strong>Time</Text>
            <TimePicker
              style={{ width: '100%', marginTop: 4 }}
              value={scheduleTime}
              onChange={setScheduleTime}
              format="h:mm A"
              use12Hours
              minuteStep={5}
            />
          </div>
        </Space>
      </Modal>
    </Row>
  );
}

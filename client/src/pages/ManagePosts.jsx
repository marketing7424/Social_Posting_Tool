import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Badge,
  Button,
  Space,
  Modal,
  Input,
  message,
  Typography,
  Card,
  Row,
  Col,
  Tooltip,
  Checkbox,
  DatePicker,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  RetweetOutlined,
  SendOutlined,
  CalendarOutlined,
  FilterOutlined,
  ClearOutlined,
  CopyOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import {
  getPosts,
  getPostCreators,
  searchMerchants,
  updatePost,
  deletePost,
  retryPost,
  publishPost,
  schedulePost,
  createPost,
  generateCaptions,
  regenerateCaption,
  uploadMedia,
  deleteMedia,
  linkRepostOriginal,
  unlinkRepostOriginal,
} from '../api/client';

const QUICK_SUGGESTIONS = [
  { label: 'Professional', value: 'Make it more professional and formal' },
  { label: 'Casual', value: 'Make it more casual and friendly' },
  { label: 'Holiday', value: 'Rewrite as a holiday/seasonal promotion post' },
  { label: 'Promo / Sale', value: 'Rewrite as a promotional sale or discount post' },
  { label: 'Shorter', value: 'Make it shorter and more concise' },
  { label: 'More Emojis', value: 'Add more emojis and make it fun' },
  { label: 'Funny', value: 'Rewrite with a funny, witty tone' },
  { label: 'Urgent CTA', value: 'Add urgency and a stronger call-to-action' },
];
import SearchableSelect from '../components/merchants/SearchableSelect';
import MediaGrid from '../components/media/MediaGrid';
import { appendHashtags } from '../utils/hashtags';

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
  deleted: { color: 'default', text: 'Deleted' },
};

import { PLATFORM_TAG_COLORS as PLATFORM_COLORS } from '../constants/platforms';

// True when a publish failure is just because the platform isn't connected
// to the merchant — not a real publishing error the user should worry about.
function isNotConnectedError(err) {
  if (!err) return false;
  const s = String(err).toLowerCase();
  return s.includes('credentials not configured') ||
    s.includes('missing credentials') ||
    s.includes('no token') ||
    s.includes('not configured');
}

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
  { label: 'Deleted', value: 'deleted' },
];

export default function ManagePosts() {
  // Data state
  const [posts, setPosts] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const DEFAULT_EXCLUDE = ['draft', 'failed', 'deleted', 'publishing'];
  const [filters, setFilters] = useState({
    merchant: undefined,
    platform: undefined,
    status: undefined,
    created_by: undefined,
    exclude_statuses: DEFAULT_EXCLUDE,
    date_from: dayjs().subtract(2, 'month').format('YYYY-MM-DD'),
    date_to: dayjs().format('YYYY-MM-DD'),
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

  // Repost modal state
  const [repostModalOpen, setRepostModalOpen] = useState(false);
  const [repostingPost, setRepostingPost] = useState(null);
  const [repostCaptions, setRepostCaptions] = useState({});
  const [repostMode, setRepostMode] = useState('now'); // 'now' or 'schedule'
  const [repostDate, setRepostDate] = useState('');
  const [repostTime, setRepostTime] = useState('');
  const [repostGenerating, setRepostGenerating] = useState(false);
  const [repostSubmitting, setRepostSubmitting] = useState(false);
  const [repostRegeneratingPlatform, setRepostRegeneratingPlatform] = useState(null);
  const [repostMedia, setRepostMedia] = useState([]);
  const [repostUploading, setRepostUploading] = useState(false);
  const [adjustStylePlatform, setAdjustStylePlatform] = useState(null);
  const [adjustFeedback, setAdjustFeedback] = useState('');
  const [repostPlatforms, setRepostPlatforms] = useState([]);

  // Failure banner dismissal (per-session)
  const [failureBannerDismissed, setFailureBannerDismissed] = useState(false);

  // Highlighted row (used when jumping from "View repost →" link)
  const [highlightedPostId, setHighlightedPostId] = useState(null);

  // Repost-link picker modal
  const [linkPickerPostId, setLinkPickerPostId] = useState(null);
  const [linkPickerSaving, setLinkPickerSaving] = useState(false);
  const [linkPickerCandidates, setLinkPickerCandidates] = useState([]);
  const [linkPickerLoading, setLinkPickerLoading] = useState(false);

  // Unique creators for "Posted by" filter
  const [creators, setCreators] = useState([]);

  // Load merchants and creators for filter dropdowns
  useEffect(() => {
    searchMerchants()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.merchants || [];
        setMerchants(list);
      })
      .catch(() => message.error('Failed to load merchants'));
    getPostCreators()
      .then((data) => setCreators(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch posts with current filters
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const cleanFilters = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          if (k === 'date_from') {
            // Start of local day → UTC ISO string
            cleanFilters[k] = dayjs(v).startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
          } else if (k === 'date_to') {
            // End of local day → UTC ISO string
            cleanFilters[k] = dayjs(v).endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
          } else {
            // Convert array to comma-separated string for query params
            cleanFilters[k] = Array.isArray(v) ? v.join(',') : v;
          }
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

  // Re-show failure banner when the set of failed/partial posts changes
  const failedPostsKey = posts
    .filter(p => p.status === 'failed' || p.status === 'partial')
    .map(p => p.id)
    .join(',');
  useEffect(() => {
    setFailureBannerDismissed(false);
  }, [failedPostsKey]);

  // --- Filter handlers ---

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Scroll to and briefly highlight a post row (used by the Reposted → link).
  // If the post isn't in the current view, widen filters first so it shows up.
  const jumpToPost = (postId) => {
    if (!postId) return;
    const inView = posts.some(p => p.id === postId);
    if (!inView) {
      // Clear restrictive filters so the linked post is fetchable, then jump
      // once it lands in `posts` (handled by the effect below).
      setFilters(prev => ({
        ...prev,
        status: undefined,
        exclude_statuses: [],
        date_from: dayjs().subtract(6, 'month').format('YYYY-MM-DD'),
        date_to: dayjs().format('YYYY-MM-DD'),
      }));
    }
    setHighlightedPostId(postId);
  };

  // Load failed-post candidates when the link picker opens
  useEffect(() => {
    if (!linkPickerPostId) {
      setLinkPickerCandidates([]);
      return;
    }
    let cancelled = false;
    setLinkPickerLoading(true);
    getPosts({
      status: 'failed',
      date_from: dayjs().subtract(14, 'day').startOf('day').utc().format('YYYY-MM-DD HH:mm:ss'),
      date_to: dayjs().endOf('day').utc().format('YYYY-MM-DD HH:mm:ss'),
      exclude_statuses: '',
    }).then(data => {
      if (cancelled) return;
      const list = Array.isArray(data) ? data : data?.posts || [];
      setLinkPickerCandidates(list);
    }).catch(() => {
      if (!cancelled) message.error('Failed to load failed posts');
    }).finally(() => {
      if (!cancelled) setLinkPickerLoading(false);
    });
    return () => { cancelled = true; };
  }, [linkPickerPostId]);

  // When the highlighted post lands in the current page, scroll it into view
  // and clear the highlight after ~2.5s.
  useEffect(() => {
    if (!highlightedPostId) return;
    if (!posts.some(p => p.id === highlightedPostId)) return;
    const el = document.querySelector(`[data-row-key="${highlightedPostId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightedPostId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightedPostId, posts]);

  const clearFilters = () => {
    setFilters({ merchant: undefined, platform: undefined, status: undefined, created_by: undefined, exclude_statuses: DEFAULT_EXCLUDE, date_from: dayjs().subtract(2, 'month').format('YYYY-MM-DD'), date_to: dayjs().format('YYYY-MM-DD') });
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

  const handleSoftDelete = async (id, currentStatus) => {
    try {
      await updatePost(id, { status: 'deleted', previousStatus: currentStatus });
      message.success('Post marked as deleted');
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

  // --- Repost ---

  const openRepostModal = async (post) => {
    setRepostingPost(post);
    const captions = {};
    if (post.platforms && Array.isArray(post.platforms)) {
      post.platforms.forEach(p => { captions[p.platform] = p.caption || ''; });
    }
    setRepostCaptions(captions);
    setRepostPlatforms(Object.keys(captions));
    setRepostMode('now');
    setRepostDate('');
    setRepostTime('');
    setRepostModalOpen(true);

    // Check which media files still exist on server
    const API_BASE = import.meta.env.VITE_API_BASE || '';
    const existing = [];
    for (const m of (post.media || [])) {
      try {
        const resp = await fetch(`${API_BASE}/uploads/${m.filename}`, { method: 'HEAD' });
        if (resp.ok) {
          existing.push({
            filename: m.filename,
            originalName: m.original_name || m.filename,
            mimetype: m.mimetype || '',
          });
        }
      } catch {}
    }
    setRepostMedia(existing);
    if (existing.length === 0 && (post.media || []).length > 0) {
      message.info('Original media files are no longer available — please re-upload');
    }
  };

  const handleRepostRegenerate = async () => {
    if (!repostingPost) return;
    setRepostGenerating(true);
    try {
      const merchant = merchants.find(m => m.mid === repostingPost.merchant_mid);
      const platforms = repostPlatforms;
      const result = await generateCaptions({
        mediaFiles: (repostingPost.media || []).map(f => f.filename),
        merchantName: merchant?.dbaName || merchant?.dba_name || repostingPost.merchant_mid,
        merchantPhone: merchant?.phone || '',
        merchantPhone2: merchant?.phone2 || '',
        merchantAddress: merchant?.address || '',
        merchantWebsite: merchant?.website || '',
        platforms,
      });
      const tags = merchant?.hashtags || '';
      if (tags) {
        for (const p of Object.keys(result)) {
          result[p] = appendHashtags(result[p], tags);
        }
      }
      setRepostCaptions(prev => ({ ...prev, ...result }));
      message.success('Captions regenerated');
    } catch {
      message.error('Failed to regenerate captions');
    } finally {
      setRepostGenerating(false);
    }
  };

  const handleRepostRegeneratePlatform = async (platform, feedback) => {
    if (!repostingPost) return;
    setRepostRegeneratingPlatform(platform);
    try {
      const merchant = merchants.find(m => m.mid === repostingPost.merchant_mid);
      const result = await regenerateCaption({
        platform,
        currentCaption: repostCaptions[platform],
        feedback: feedback || '',
        merchantName: merchant?.dbaName || merchant?.dba_name || repostingPost.merchant_mid,
        merchantPhone: merchant?.phone || '',
        merchantPhone2: merchant?.phone2 || '',
        merchantAddress: merchant?.address || '',
        merchantWebsite: merchant?.website || '',
        mediaFiles: (repostingPost.media || []).map(f => f.filename),
      });
      const withTags = appendHashtags(result.caption, merchant?.hashtags || '');
      setRepostCaptions(prev => ({ ...prev, [platform]: withTags }));
    } catch {
      message.error('Regeneration failed');
    } finally {
      setRepostRegeneratingPlatform(null);
      setAdjustStylePlatform(null);
      setAdjustFeedback('');
    }
  };

  const handleRepostSubmit = async () => {
    if (!repostingPost) return;
    if (repostPlatforms.length === 0) {
      message.warning('Select at least one platform');
      return;
    }
    setRepostSubmitting(true);
    try {
      const platforms = repostPlatforms;
      let scheduledTime = null;
      if (repostMode === 'schedule' && repostDate) {
        const dt = repostTime ? `${repostDate}T${repostTime}` : `${repostDate}T09:00`;
        scheduledTime = dayjs(dt).toISOString();
      }

      const filteredCaptions = {};
      for (const p of platforms) filteredCaptions[p] = repostCaptions[p] || '';
      const post = await createPost({
        merchantMid: repostingPost.merchant_mid,
        platforms,
        captions: filteredCaptions,
        mediaFiles: repostMedia.map(f => ({
          filename: f.filename, originalName: f.originalName || f.filename, mimetype: f.mimetype || '',
        })),
        fbLayout: repostingPost.fb_layout || 'collage',
        scheduledTime,
        originalPostId: repostingPost.id,
      });

      if (scheduledTime) {
        await schedulePost(post.id, scheduledTime);
        message.success(`Repost scheduled for ${dayjs(scheduledTime).format('MMM D, YYYY h:mm A')}`);
      } else {
        await publishPost(post.id);
        message.success('Repost publishing...');
      }

      setRepostModalOpen(false);
      setRepostingPost(null);
      fetchPosts();
    } catch (err) {
      message.error('Repost failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setRepostSubmitting(false);
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
      width: 220,
      render: (platforms) => {
        if (!platforms) return '—';
        const list = Array.isArray(platforms) ? platforms : [platforms];
        return (
          <Space size={[0, 4]} wrap>
            {list.map((p) => {
              const name = typeof p === 'string' ? p : p.platform;
              const status = typeof p === 'object' ? p.status : null;
              const error = typeof p === 'object' ? p.error : null;
              const notConnected = status === 'failed' && isNotConnectedError(error);
              const realFailure = status === 'failed' && !notConnected;
              const tag = (
                <Tag key={name} color={PLATFORM_COLORS[name] || 'default'} style={{ marginInlineEnd: 0 }}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                  {realFailure ? (
                    <span style={{
                      color: '#fff', background: '#DC2626', borderRadius: 3,
                      padding: '0 4px', marginLeft: 4, fontWeight: 700, fontSize: 11,
                    }}>✗</span>
                  ) : notConnected ? (
                    <span style={{
                      color: '#475569', background: '#E2E8F0', borderRadius: 3,
                      padding: '0 4px', marginLeft: 4, fontWeight: 600, fontSize: 10,
                    }}>not connected</span>
                  ) : status === 'success' ? ' ✓' : ''}
                </Tag>
              );
              if (realFailure) {
                return (
                  <Tooltip
                    key={name}
                    title={error || 'Failed to publish'}
                    overlayStyle={{ maxWidth: 360 }}
                  >
                    {tag}
                  </Tooltip>
                );
              }
              if (notConnected) {
                return (
                  <Tooltip
                    key={name}
                    title={`${name.charAt(0).toUpperCase() + name.slice(1)} isn't connected for this merchant — connect it in the merchant settings to publish here.`}
                    overlayStyle={{ maxWidth: 360 }}
                  >
                    {tag}
                  </Tooltip>
                );
              }
              return tag;
            })}
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status, record) => {
        if (status === 'deleted') {
          const prevCfg = STATUS_CONFIG[record.previous_status] || null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {prevCfg && (
                <span style={{ textDecoration: 'line-through', color: '#bfbfbf', fontSize: 12 }}>
                  {prevCfg.text}
                </span>
              )}
              <span style={{ color: '#DC2626', fontWeight: 600, fontSize: 13 }}>Deleted</span>
            </div>
          );
        }
        const cfg = STATUS_CONFIG[status] || { color: 'default', text: status };
        return <Badge color={cfg.color} text={cfg.text} />;
      },
    },
    {
      title: 'Repost',
      key: 'repost',
      width: 150,
      render: (_, record) => {
        // Row is a repost → click to jump to the original failed post; offer unlink
        if (record.original_post_id) {
          return (
            <Space size={4}>
              <Tooltip title="Jump to the original failed post">
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    jumpToPost(record.original_post_id);
                  }}
                  style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}
                >
                  ← Original
                </a>
              </Tooltip>
              <Tooltip title="Unlink">
                <a
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await unlinkRepostOriginal(record.id);
                      message.success('Unlinked');
                      fetchPosts();
                    } catch {
                      message.error('Failed to unlink');
                    }
                  }}
                  style={{ fontSize: 11, color: '#94A3B8' }}
                >
                  ✕
                </a>
              </Tooltip>
            </Space>
          );
        }
        // Row has been reposted → jump to the new repost
        if (record.reposted_as) {
          return (
            <Tooltip title="Already reposted — click to jump to the repost">
              <a
                onClick={(e) => {
                  e.preventDefault();
                  jumpToPost(record.reposted_as);
                }}
                style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}
              >
                Reposted ↗
              </a>
            </Tooltip>
          );
        }
        // Don't offer "link to failed" on the failed posts themselves, drafts,
        // scheduled posts, or deleted posts — only on regular published posts
        // that could plausibly be a manual repost.
        if (record.status === 'failed' || record.status === 'deleted' ||
            record.status === 'draft' || record.status === 'scheduled' ||
            record.status === 'pending' || record.status === 'publishing') {
          return null;
        }
        return (
          <Tooltip title="Mark this post as a repost of an earlier failed post">
            <Button
              type="link"
              size="small"
              style={{ padding: 0, fontSize: 12 }}
              onClick={() => setLinkPickerPostId(record.id)}
            >
              + Link to failed
            </Button>
          </Tooltip>
        );
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
      title: 'Posted by',
      dataIndex: 'created_by_name',
      key: 'created_by',
      width: 120,
      render: (name) => name ? <Text>{name}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Created Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      render: (val) => val
        ? <Text style={{ fontSize: 12 }}>{dayjs.utc(val).local().format('MMM D, YYYY h:mm A')}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Published Time',
      key: 'published_time',
      width: 200,
      sorter: (a, b) => {
        const getTime = (post) => {
          const pubs = (post.platforms || []).map(p => p.published_at).filter(Boolean);
          if (pubs.length > 0) return new Date(pubs[0]).getTime();
          return post.scheduled_time ? new Date(post.scheduled_time).getTime() : 0;
        };
        return getTime(a) - getTime(b);
      },
      render: (_, record) => {
        const platforms = record.platforms || [];
        const published = platforms.filter(p => p.published_at);
        if (published.length > 0) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {published.map(p => (
                <Text key={p.platform} style={{ fontSize: 12 }}>
                  <span style={{ color: '#64748B' }}>{p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}:</span>{' '}
                  {dayjs.utc(p.published_at).local().format('MMM D, YYYY h:mm A')}
                </Text>
              ))}
            </div>
          );
        }
        if (record.scheduled_time) {
          return <Text type="secondary" style={{ fontSize: 12 }}>Scheduled: {dayjs(record.scheduled_time).format('MMM D, YYYY h:mm A')}</Text>;
        }
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.status !== 'deleted' && (
            <Tooltip title="Repost">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => openRepostModal(record)}
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

          {(record.status === 'draft' || record.status === 'scheduled') && (
            <Tooltip title="Delete">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  if (window.confirm('Delete this post?')) handleSoftDelete(record.id, record.status);
                }}
              />
            </Tooltip>
          )}
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
            <SearchableSelect
              placeholder="All Merchants"
              value={filters.merchant}
              onChange={(v) => handleFilterChange('merchant', v)}
              options={merchants.map((m) => ({
                value: m.mid || m.id,
                label: m.dbaName || m.dba_name || m.name || m.mid,
              }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col flex="180px">
            <select
              value={filters.platform || ''}
              onChange={(e) => handleFilterChange('platform', e.target.value || undefined)}
              style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #d9d9d9', padding: '0 8px', fontSize: 14 }}
            >
              <option value="">All Platforms</option>
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Col>
          <Col flex="160px">
            <select
              value={filters.status || ''}
              onChange={(e) => {
                const val = e.target.value || undefined;
                setFilters(prev => ({
                  ...prev,
                  status: val,
                  // When a specific status is chosen, clear exclude; when "All", restore defaults
                  exclude_statuses: val ? undefined : DEFAULT_EXCLUDE,
                }));
              }}
              style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #d9d9d9', padding: '0 8px', fontSize: 14 }}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Col>
          <Col flex="160px">
            <select
              value={filters.created_by || ''}
              onChange={(e) => handleFilterChange('created_by', e.target.value || undefined)}
              style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #d9d9d9', padding: '0 8px', fontSize: 14 }}
            >
              <option value="">All Users</option>
              {creators.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Col>
          <Col>
            <DatePicker.RangePicker
              value={[
                filters.date_from ? dayjs(filters.date_from) : null,
                filters.date_to ? dayjs(filters.date_to) : null,
              ]}
              onChange={(dates) => {
                setFilters(prev => ({
                  ...prev,
                  date_from: dates?.[0]?.format('YYYY-MM-DD') || undefined,
                  date_to: dates?.[1]?.format('YYYY-MM-DD') || undefined,
                }));
              }}
              allowClear
              style={{ width: 260 }}
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
            <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
              Clear Selection
            </Button>
          </Space>
        </Card>
      )}

      {/* Failure summary banner — only real "failed" posts from the last 14 days */}
      {(() => {
        const twoWeeksAgo = dayjs().subtract(14, 'day');
        const failedPosts = posts.filter(p => {
          if (p.status !== 'failed') return false;
          // Only count posts created in the last 14 days
          if (p.created_at && dayjs(p.created_at).isBefore(twoWeeksAgo)) return false;
          // Already reposted → user has dealt with it
          if (p.reposted_as) return false;
          // Must have at least one real (not just "not connected") failure
          return (p.platforms || []).some(pp =>
            pp.status === 'failed' && !isNotConnectedError(pp.error)
          );
        });
        if (!failedPosts.length || failureBannerDismissed) return null;
        const platformCounts = {};
        failedPosts.forEach(post => {
          (post.platforms || []).forEach(pp => {
            if (pp.status === 'failed' && !isNotConnectedError(pp.error)) {
              platformCounts[pp.platform] = (platformCounts[pp.platform] || 0) + 1;
            }
          });
        });
        const summary = Object.entries(platformCounts)
          .map(([plat, n]) => `${n} ${plat.charAt(0).toUpperCase() + plat.slice(1)}`)
          .join(', ');
        return (
          <Alert
            type="warning"
            showIcon
            closable
            onClose={() => setFailureBannerDismissed(true)}
            style={{ marginBottom: 12 }}
            message={`${failedPosts.length} failed post${failedPosts.length > 1 ? 's' : ''} need attention (last 14 days)`}
            description={
              <span>
                {summary ? `${summary} failed in the last 14 days. ` : 'One or more platforms failed. '}
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => setFilters(prev => ({
                    ...prev,
                    status: 'failed',
                    exclude_statuses: undefined,
                    date_from: dayjs().subtract(14, 'day').format('YYYY-MM-DD'),
                    date_to: dayjs().format('YYYY-MM-DD'),
                  }))}
                >
                  Show only failed
                </Button>
              </span>
            }
          />
        );
      })()}

      {/* Posts Table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={posts}
        loading={loading}
        rowSelection={rowSelection}
        rowClassName={(record) => record.id === highlightedPostId ? 'mp-row-highlight' : ''}
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
        <input
          type="datetime-local"
          min={dayjs().format('YYYY-MM-DDTHH:mm')}
          value={rescheduleTime ? dayjs(rescheduleTime).format('YYYY-MM-DDTHH:mm') : ''}
          onChange={(e) => setRescheduleTime(e.target.value ? dayjs(e.target.value) : null)}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #d9d9d9', padding: '0 12px', fontSize: 14 }}
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
        <select
          value={batchStatus || ''}
          onChange={(e) => setBatchStatus(e.target.value || undefined)}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #d9d9d9', padding: '0 12px', fontSize: 14 }}
        >
          <option value="">Select status...</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Modal>

      {/* Repost Modal */}
      <Modal
        title="Repost"
        open={repostModalOpen}
        onCancel={() => { setRepostModalOpen(false); setRepostingPost(null); }}
        footer={null}
        width={560}
        destroyOnClose
      >
        {repostingPost && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Merchant: <strong>{getMerchantName(repostingPost.merchant_mid)}</strong>
            </Text>

            {/* Platform Selection */}
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Platforms</Text>
              <Checkbox.Group
                value={repostPlatforms}
                onChange={(checked) => {
                  setRepostPlatforms(checked);
                  // Add empty captions for newly checked platforms
                  const updated = { ...repostCaptions };
                  checked.forEach(p => { if (!(p in updated)) updated[p] = ''; });
                  setRepostCaptions(updated);
                }}
                options={PLATFORM_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
              />
            </div>

            {/* Media */}
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Media</Text>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <MediaGrid
                  files={repostMedia}
                  onReorder={(newFiles) => setRepostMedia(newFiles)}
                  onDelete={(filename) => setRepostMedia(prev => prev.filter(f => f.filename !== filename))}
                />
                <label style={{
                  width: 100, height: 100, borderRadius: 8, fontSize: 12,
                  border: '1.5px dashed #CBD5E1', cursor: 'pointer',
                  color: '#64748B', background: '#F8FAFC',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textAlign: 'center', flexShrink: 0,
                }}>
                  {repostUploading ? 'Uploading...' : '+ Add media'}
                  <input
                    type="file"
                    accept="image/*,video/mp4"
                    multiple
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files);
                      if (files.length === 0) return;
                      setRepostUploading(true);
                      try {
                        for (const file of files) {
                          const formData = new FormData();
                          formData.append('files', file);
                          const result = await uploadMedia(formData);
                          const uploaded = Array.isArray(result) ? result : [result];
                          setRepostMedia(prev => [...prev, ...uploaded.map(f => ({
                            filename: f.filename,
                            originalName: f.originalName || file.name,
                            mimetype: f.mimetype || file.type,
                          }))]);
                        }
                        message.success('Media uploaded');
                      } catch {
                        message.error('Upload failed');
                      } finally {
                        setRepostUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
              {repostMedia.length === 0 && (
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>No media — upload images/videos or post as text only</Text>
              )}
            </div>

            {/* Captions with per-platform adjust */}
            {repostPlatforms.map((platform) => {
              const isRegen = repostRegeneratingPlatform === platform;
              const isAdjusting = adjustStylePlatform === platform;
              return (
                <div key={platform} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Tag color={PLATFORM_COLORS[platform] || 'default'}>
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </Tag>
                    {repostCaptions[platform]?.trim() && (
                      <Space size={4}>
                        <Tooltip title="Regenerate">
                          <Button type="text" size="small"
                            icon={isRegen ? <LoadingOutlined spin /> : <ReloadOutlined />}
                            onClick={() => handleRepostRegeneratePlatform(platform, '')}
                            disabled={isRegen}
                            style={{ fontSize: 11, padding: '0 4px', height: 22 }}
                          />
                        </Tooltip>
                        <Tooltip title="Adjust style">
                          <Button type="text" size="small"
                            onClick={() => { setAdjustStylePlatform(isAdjusting ? null : platform); setAdjustFeedback(''); }}
                            style={{ fontSize: 11, padding: '0 6px', height: 22, color: isAdjusting ? '#2563EB' : undefined }}
                          >
                            Adjust
                          </Button>
                        </Tooltip>
                      </Space>
                    )}
                  </div>

                  {isAdjusting && (
                    <div style={{ marginBottom: 6, padding: 8, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {QUICK_SUGGESTIONS.map(s => (
                          <Tag key={s.label}
                            style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}
                            color={adjustFeedback === s.value ? 'blue' : undefined}
                            onClick={() => setAdjustFeedback(s.value)}
                          >
                            {s.label}
                          </Tag>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <TextArea
                          value={adjustFeedback}
                          onChange={(e) => setAdjustFeedback(e.target.value)}
                          placeholder="Or type custom instructions..."
                          autoSize={{ minRows: 1, maxRows: 2 }}
                          style={{ fontSize: 12, flex: 1 }}
                        />
                        <Button
                          type="primary" size="small"
                          icon={isRegen ? <LoadingOutlined spin /> : <ReloadOutlined />}
                          disabled={!adjustFeedback || isRegen}
                          onClick={() => handleRepostRegeneratePlatform(platform, adjustFeedback)}
                        >
                          Go
                        </Button>
                      </div>
                    </div>
                  )}

                  <TextArea
                    rows={3}
                    value={repostCaptions[platform]}
                    onChange={(e) => setRepostCaptions(prev => ({ ...prev, [platform]: e.target.value }))}
                    style={{ fontSize: 13 }}
                  />
                </div>
              );
            })}

            {/* Regenerate all button */}
            <Button
              icon={repostGenerating ? <LoadingOutlined spin /> : <ThunderboltOutlined />}
              onClick={handleRepostRegenerate}
              disabled={repostGenerating}
              style={{ marginBottom: 16, color: '#8B5CF6', borderColor: '#8B5CF6' }}
            >
              {repostGenerating ? 'Generating...' : 'Regenerate All Captions'}
            </Button>

            {/* Post now or Schedule */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
              <div style={{ display: 'flex', marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                {['now', 'schedule'].map(m => (
                  <div key={m} onClick={() => setRepostMode(m)} style={{
                    flex: 1, textAlign: 'center', padding: '8px 0', cursor: 'pointer',
                    background: repostMode === m ? '#F1F5F9' : '#fff',
                    fontWeight: repostMode === m ? 600 : 400, fontSize: 14,
                    borderRight: m === 'now' ? '1px solid #E2E8F0' : 'none',
                  }}>
                    {m === 'now' ? 'Post Now' : 'Schedule'}
                  </div>
                ))}
              </div>

              {repostMode === 'schedule' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="date"
                    value={repostDate}
                    min={dayjs().format('YYYY-MM-DD')}
                    onChange={(e) => setRepostDate(e.target.value)}
                    style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid #d9d9d9', padding: '0 10px', fontSize: 14 }}
                  />
                  <input
                    type="time"
                    value={repostTime}
                    onChange={(e) => setRepostTime(e.target.value)}
                    style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid #d9d9d9', padding: '0 10px', fontSize: 14 }}
                  />
                </div>
              )}

              <Button
                type="primary"
                size="large"
                icon={<SendOutlined />}
                loading={repostSubmitting}
                onClick={handleRepostSubmit}
                disabled={repostMode === 'schedule' && !repostDate}
                style={{ width: '100%' }}
              >
                {repostMode === 'now' ? 'Post Now' : 'Schedule Repost'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Link-to-failed-post picker */}
      <Modal
        title="Link to a failed post"
        open={!!linkPickerPostId}
        onCancel={() => setLinkPickerPostId(null)}
        footer={null}
        width={600}
      >
        {(() => {
          const sourcePost = posts.find(p => p.id === linkPickerPostId);
          const sourceMid = sourcePost?.merchant_mid;
          const sourceMerchantName = sourceMid ? getMerchantName(sourceMid) : '';
          return (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
              Pick the failed post that this post is fixing. Showing only{sourceMerchantName ? <> failed posts for <Text strong>{sourceMerchantName}</Text></> : ' failed posts'} from the last 14 days.
            </Text>
          );
        })()}
        {(() => {
          if (linkPickerLoading) {
            return <Text type="secondary">Loading failed posts…</Text>;
          }
          const sourcePost = posts.find(p => p.id === linkPickerPostId);
          const sourceMid = sourcePost?.merchant_mid;
          const candidates = linkPickerCandidates.filter(p => {
            if (p.id === linkPickerPostId) return false;
            if (p.reposted_as) return false;
            // Only show failed posts for the same merchant
            if (sourceMid && p.merchant_mid !== sourceMid) return false;
            return (p.platforms || []).some(pp =>
              pp.status === 'failed' && !isNotConnectedError(pp.error)
            );
          });
          if (candidates.length === 0) {
            return <Text type="secondary">No failed posts for this merchant in the last 14 days that aren't already linked.</Text>;
          }
          return (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {candidates.map(c => {
                const merch = getMerchantName(c.merchant_mid);
                const cap = (c.platforms?.[0]?.caption || '').slice(0, 80);
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: 10, borderRadius: 6, border: '1px solid #E2E8F0',
                      marginBottom: 8, cursor: linkPickerSaving ? 'wait' : 'pointer',
                      background: '#fff',
                    }}
                    onClick={async () => {
                      if (linkPickerSaving) return;
                      setLinkPickerSaving(true);
                      try {
                        await linkRepostOriginal(linkPickerPostId, c.id);
                        message.success('Linked');
                        setLinkPickerPostId(null);
                        fetchPosts();
                      } catch {
                        message.error('Failed to link');
                      } finally {
                        setLinkPickerSaving(false);
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 13 }}>{merch}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {dayjs(c.created_at).format('MMM D, YYYY h:mm A')}
                      </Text>
                    </div>
                    <Space size={4} wrap style={{ marginBottom: 4 }}>
                      {(c.platforms || []).map(pp => (
                        <Tag key={pp.platform} color={PLATFORM_COLORS[pp.platform] || 'default'} style={{ marginInlineEnd: 0 }}>
                          {pp.platform.charAt(0).toUpperCase() + pp.platform.slice(1)}
                          {pp.status === 'failed' && !isNotConnectedError(pp.error) ? ' ✗' : ''}
                        </Tag>
                      ))}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      {cap || <em>(no caption)</em>}
                    </Text>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Button, Space, message, Typography, Input, Upload,
  Tag, Tooltip, Divider, Modal, Checkbox,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SendOutlined, ClockCircleOutlined,
  LoadingOutlined, CheckCircleFilled, CloseCircleFilled,
  FacebookFilled, InstagramFilled, GoogleOutlined,
  ThunderboltOutlined, PlayCircleFilled, ReloadOutlined, EditOutlined, EyeOutlined, EyeInvisibleOutlined, CopyOutlined, TeamOutlined, SearchOutlined, NumberOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import {
  searchMerchants, uploadMedia, deleteMedia, generateCaptions, regenerateCaption,
  createPost, publishPost, getPostStatus, schedulePost, getPosts,
} from '../api/client';
import PreviewPanel from '../components/previews/PreviewPanel';
import GooglePostTypeFields from '../components/google/GooglePostTypeFields';
import { appendHashtags } from '../utils/hashtags';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Title, Text } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE || '';

const PLATFORMS = [
  { key: 'facebook', icon: <FacebookFilled />, color: '#1D4ED8', label: 'Facebook' },
  { key: 'instagram', icon: <InstagramFilled />, color: '#EAB308', label: 'Instagram' },
  { key: 'google', icon: <GoogleOutlined />, color: '#EA580C', label: 'Google Business' },
];

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

function isVideo(file) {
  return file.mimetype?.startsWith('video/') || file.filename?.match(/\.(mp4|mov|avi)$/i);
}

async function fetchMerchantStats(mid) {
  try {
    const posts = await getPosts({ merchant: mid, limit: 100, exclude_statuses: 'draft,failed,deleted' });
    let lastPublished = null;
    const upcoming = [];
    const now = dayjs();
    for (const p of (posts || [])) {
      for (const pp of (p.platforms || [])) {
        if (pp.status !== 'success') continue;
        const ts = pp.published_at || p.created_at;
        if (!ts) continue;
        const d = dayjs.utc(ts).local();
        if (!lastPublished || d.isAfter(lastPublished)) lastPublished = d;
      }
      if (p.status === 'scheduled' && p.scheduled_time) {
        const d = dayjs(p.scheduled_time);
        if (d.isAfter(now)) upcoming.push(d);
      }
    }
    upcoming.sort((a, b) => a.valueOf() - b.valueOf());
    return { lastPublished, upcoming };
  } catch {
    return { lastPublished: null, upcoming: [] };
  }
}

function MerchantStats({ stats }) {
  if (!stats) return null;
  const { lastPublished, upcoming } = stats;
  if (!lastPublished && (!upcoming || upcoming.length === 0)) return null;
  return (
    <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
      {lastPublished && (
        <div style={{ color: '#DC2626' }}>
          <div>Last published:</div>
          <div style={{ paddingLeft: 8 }}>{lastPublished.format('MMM D, YYYY h:mm A')}</div>
        </div>
      )}
      {upcoming && upcoming.length > 0 && (
        <div style={{ color: '#16A34A' }}>
          <div>Upcoming:</div>
          {upcoming.slice(0, 3).map((d, i) => (
            <div key={i} style={{ paddingLeft: 8 }}>{d.format('MMM D, YYYY h:mm A')}</div>
          ))}
          {upcoming.length > 3 && (
            <div style={{ paddingLeft: 8 }}>(+{upcoming.length - 3} more)</div>
          )}
        </div>
      )}
    </div>
  );
}

function createEmptyRow() {
  return {
    id: Date.now() + Math.random(),
    merchant: null,
    platforms: ['facebook', 'instagram', 'google'],
    mediaFiles: [],
    captions: { facebook: '', instagram: '', google: '' },
    googleFields: { googlePostType: 'STANDARD' },
    scheduleMode: 'now',
    scheduleDate: null,
    scheduleTime: null,
    previewOpen: false,
    generating: false,
    regeneratingPlatform: null,
    publishing: false,
    result: null,
  };
}

/* ── Merchant Select ─────────────────────────────────── */
function RowMerchantSelect({ value, onChange }) {
  const [merchants, setMerchants] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    searchMerchants('').then(results => {
      setMerchants(Array.isArray(results) ? results : []);
    }).catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = search.trim()
    ? merchants.filter(m =>
        (m.mid || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.dbaName || '').toLowerCase().includes(search.toLowerCase())
      )
    : merchants;

  const displayValue = value ? (value.dbaName || value.mid) : '';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={open ? search : displayValue}
        placeholder="Search MID or name..."
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        style={{
          width: '100%', height: 30, borderRadius: 6,
          border: '1px solid #d9d9d9', padding: '0 8px',
          fontSize: 13, color: '#1E293B', background: '#fff',
          outline: 'none',
        }}
      />
      {value && !open && (
        <span
          onClick={() => { onChange(null); setSearch(''); }}
          style={{
            position: 'absolute', right: 6, top: 6,
            cursor: 'pointer', color: '#bfbfbf', fontSize: 13, lineHeight: 1,
          }}
        >&times;</span>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: 32, left: 0, right: 0,
          maxHeight: 200, overflowY: 'auto', background: '#fff',
          border: '1px solid #d9d9d9', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 1050,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: '#bfbfbf', fontSize: 13 }}>No clients found</div>
          ) : filtered.map(m => (
            <div
              key={m.mid}
              onClick={() => { onChange(m); setSearch(''); setOpen(false); }}
              style={{
                padding: '6px 12px', cursor: 'pointer', fontSize: 13,
                display: 'flex', justifyContent: 'space-between',
                background: value?.mid === m.mid ? '#F0F5FF' : '#fff',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F0F5FF'}
              onMouseLeave={(e) => e.currentTarget.style.background = value?.mid === m.mid ? '#F0F5FF' : '#fff'}
            >
              <span>{m.dbaName || m.mid}</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{m.mid}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Platform Toggles ────────────────────────────────── */
function PlatformToggles({ selected, merchant, hasVideo, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PLATFORMS.map(p => {
        const active = selected.includes(p.key);
        const connected = merchant
          ? p.key === 'facebook' ? !!merchant.fbPageId
            : p.key === 'instagram' ? !!merchant.igUserId
            : !!merchant.googleToken
          : false;
        const disabled = p.key === 'google' && hasVideo;

        return (
          <Tooltip key={p.key} title={disabled ? 'Google doesn\'t support video' : `${p.label}${!connected && merchant ? ' (not connected)' : ''}`}>
            <div
              onClick={() => !disabled && onChange(p.key, !active)}
              style={{
                width: 30, height: 30, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 16, transition: 'all 0.15s',
                opacity: disabled ? 0.35 : 1,
                background: active ? (connected ? p.color + '18' : '#FEF2F2') : '#F8FAFC',
                border: `1.5px solid ${active ? (connected ? p.color : '#FCA5A5') : '#E2E8F0'}`,
                color: active ? (connected ? p.color : '#EF4444') : '#CBD5E1',
              }}
            >
              {p.icon}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

/* ── Sortable Media Thumbnail ─────────────────────────── */
function SortableThumb({ file, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.filename });
  const vid = isVideo(file);

  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform), transition,
      opacity: isDragging ? 0.5 : 1, position: 'relative', width: 56, height: 56,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 6, overflow: 'hidden',
        border: '1px solid #E2E8F0', cursor: 'grab', position: 'relative',
      }}
        onMouseEnter={e => { const b = e.currentTarget.querySelector('.del'); if (b) b.style.opacity = '1'; }}
        onMouseLeave={e => { const b = e.currentTarget.querySelector('.del'); if (b) b.style.opacity = '0'; }}
      >
        <div {...attributes} {...listeners} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
        {vid ? (
          <div style={{
            width: '100%', height: '100%', background: '#1E293B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PlayCircleFilled style={{ color: '#fff', fontSize: 20 }} />
          </div>
        ) : (
          <img src={`${API_BASE}${file.url || `/uploads/${file.filename}`}`} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        <button className="del" onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', fontSize: 9,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0, transition: 'opacity 0.15s', zIndex: 2,
          }}>&times;</button>
      </div>
    </div>
  );
}

/* ── Media Row with drag-to-reorder + Upload ─────────── */
function RowMedia({ files, onAdd, onRemove, onReorder }) {
  const [uploading, setUploading] = useState(false);
  const hasVideo = files.some(isVideo);
  const fileInputRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleFiles = async (selectedFiles) => {
    for (const file of selectedFiles) {
      const fileIsVideo = file.type?.startsWith('video/');
      if (fileIsVideo && files.length > 0) {
        message.warning('Only one video per post — remove existing media first');
        continue;
      }
      if (!fileIsVideo && hasVideo) {
        message.warning('Cannot mix images and video');
        continue;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('files', file);
        const result = await uploadMedia(formData);
        onAdd(Array.isArray(result) ? result : [result]);
      } catch {
        message.error('Upload failed');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = files.findIndex(f => f.filename === active.id);
    const newIdx = files.findIndex(f => f.filename === over.id);
    onReorder(arrayMove(files, oldIdx, newIdx));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={files.map(f => f.filename)} strategy={rectSortingStrategy}>
          {files.map((f, i) => (
            <SortableThumb key={f.filename} file={f}
              onRemove={() => { deleteMedia(f.filename).catch(() => {}); onRemove(i); }} />
          ))}
        </SortableContext>
      </DndContext>
      {(!hasVideo || files.length === 0) && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4"
            multiple={!hasVideo}
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 56, height: 56, borderRadius: 6,
              border: '2px dashed #CBD5E1', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#94A3B8', fontSize: 18, background: '#F8FAFC',
            }}
          >
            {uploading ? <LoadingOutlined /> : <PlusOutlined />}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Schedule Option ─────────────────────────────────── */
function RowScheduleOption({ mode, date, time, onModeChange, onDateChange, onTimeChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <Button size="small" style={{ minWidth: 115, fontSize: 12 }} onClick={() => setOpen(true)}>
        {mode === 'now' ? 'Publish now' : 'Schedule'} <ClockCircleOutlined />
      </Button>
      <Modal
        title="Scheduling"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => setOpen(false)}
        okText={mode === 'schedule' ? 'Update' : 'OK'}
        width={340}
        styles={{ body: { overflow: 'visible' } }}
      >
        <div style={{ display: 'flex', marginBottom: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
          {['now', 'schedule'].map(m => (
            <div key={m} onClick={() => onModeChange(m)} style={{
              flex: 1, textAlign: 'center', padding: '6px 0', cursor: 'pointer',
              background: mode === m ? '#F1F5F9' : '#fff',
              fontWeight: mode === m ? 600 : 400, fontSize: 13,
              borderRight: m === 'now' ? '1px solid #E2E8F0' : 'none',
            }}>
              {m === 'now' ? 'Publish now' : 'Schedule'}
            </div>
          ))}
        </div>
        {mode === 'schedule' && (
          <>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Date and time</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <input
                type="date"
                value={date ? date.format('YYYY-MM-DD') : ''}
                min={dayjs().format('YYYY-MM-DD')}
                onChange={(e) => onDateChange(e.target.value ? dayjs(e.target.value) : null)}
                style={{
                  width: '100%', height: 36, borderRadius: 8,
                  border: '1px solid #d9d9d9', padding: '0 10px',
                  fontSize: 14, color: '#1E293B',
                }}
              />
              <input
                type="time"
                value={time ? time.format('HH:mm') : ''}
                onChange={(e) => onTimeChange(e.target.value ? dayjs(`2000-01-01 ${e.target.value}`) : null)}
                style={{
                  width: '100%', height: 36, borderRadius: 8,
                  border: '1px solid #d9d9d9', padding: '0 10px',
                  fontSize: 14, color: '#1E293B',
                }}
              />
            </div>
          </>
        )}
      </Modal>
      {mode === 'schedule' && date && (
        <Text type="secondary" style={{ fontSize: 10 }}>
          {date.format('MMM D, YYYY')}{time ? `, ${time.format('h:mm A')}` : ''}
        </Text>
      )}
    </div>
  );
}

/* ── Publish Result Badges (inline per row) ──────────── */
function PublishResultBadges({ result }) {
  if (!result) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
      {['facebook', 'instagram', 'google'].filter(p => result.platforms?.[p]).map(platform => {
        const r = result.platforms[platform];
        const cfg = PLATFORMS.find(p => p.key === platform);
        const isSuccess = r.status === 'success';
        const isPublishing = r.status === 'publishing';
        return (
          <Tooltip key={platform} title={r.error || (isSuccess ? 'Published successfully' : isPublishing ? 'Publishing...' : 'Failed')}>
            <Tag
              icon={isPublishing ? <LoadingOutlined spin /> : isSuccess ? <CheckCircleFilled /> : <CloseCircleFilled />}
              color={isPublishing ? 'processing' : isSuccess ? 'success' : 'error'}
              style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '20px' }}
            >
              {cfg?.label?.split(' ')[0]}
            </Tag>
          </Tooltip>
        );
      })}
    </div>
  );
}

/* ── Publish Results Summary Panel ───────────────────── */
function PublishResultsSummary({ rows }) {
  const publishedRows = rows.filter(r => r.result);
  if (publishedRows.length === 0) return null;

  const allDone = publishedRows.every(r => r.result.status !== 'publishing');
  const totalSuccess = publishedRows.filter(r => {
    const platforms = r.result.platforms || {};
    return Object.values(platforms).every(p => p.status === 'success');
  }).length;
  const totalPartial = publishedRows.filter(r => {
    const platforms = r.result.platforms || {};
    const statuses = Object.values(platforms).map(p => p.status);
    return statuses.includes('success') && statuses.includes('failed');
  }).length;
  const totalFailed = publishedRows.filter(r => {
    const platforms = r.result.platforms || {};
    const statuses = Object.values(platforms).map(p => p.status);
    return statuses.length > 0 && statuses.every(s => s === 'failed');
  }).length;
  const stillPublishing = publishedRows.filter(r => r.result.status === 'publishing').length;

  return (
    <div style={{
      marginBottom: 16, padding: 16, borderRadius: 10,
      border: `1px solid ${allDone ? (totalFailed === 0 ? '#BBF7D0' : '#FECACA') : '#BFDBFE'}`,
      background: allDone ? (totalFailed === 0 ? '#F0FDF4' : '#FFF5F5') : '#EFF6FF',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 14 }}>
          {allDone ? 'Publish Results' : 'Publishing in progress...'}
        </Text>
        <div style={{ display: 'flex', gap: 8 }}>
          {stillPublishing > 0 && <Tag icon={<LoadingOutlined spin />} color="processing">{stillPublishing} publishing</Tag>}
          {totalSuccess > 0 && <Tag icon={<CheckCircleFilled />} color="success">{totalSuccess} successful</Tag>}
          {totalPartial > 0 && <Tag icon={<CloseCircleFilled />} color="warning">{totalPartial} partial</Tag>}
          {totalFailed > 0 && <Tag icon={<CloseCircleFilled />} color="error">{totalFailed} failed</Tag>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {publishedRows.map((row, i) => {
          const platforms = row.result.platforms || {};
          const isStillPublishing = row.result.status === 'publishing';
          return (
            <div key={row.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8,
              background: '#fff', border: '1px solid #E2E8F0',
            }}>
              <Text style={{ fontSize: 12, color: '#94A3B8', minWidth: 20 }}>{i + 1}</Text>
              <Text strong style={{ fontSize: 13, minWidth: 140 }}>
                {row.merchant?.dbaName || row.merchant?.mid || 'Unknown'}
              </Text>
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                {['facebook', 'instagram', 'google'].filter(p => platforms[p]).map(platform => {
                  const r = platforms[platform];
                  const cfg = PLATFORMS.find(p => p.key === platform);
                  const isSuccess = r.status === 'success';
                  const isPub = r.status === 'publishing';
                  return (
                    <Tooltip key={platform} title={r.error || (isSuccess ? 'Published' : isPub ? 'Publishing...' : 'Failed')}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 6, fontSize: 12,
                        background: isPub ? '#EFF6FF' : isSuccess ? '#F0FDF4' : '#FEF2F2',
                        border: `1px solid ${isPub ? '#BFDBFE' : isSuccess ? '#BBF7D0' : '#FECACA'}`,
                        color: isPub ? '#2563EB' : isSuccess ? '#16A34A' : '#DC2626',
                      }}>
                        <span style={{ color: cfg.color, fontSize: 13 }}>{cfg.icon}</span>
                        {isPub ? <LoadingOutlined spin style={{ fontSize: 11 }} /> : isSuccess ? <CheckCircleFilled style={{ fontSize: 11 }} /> : <CloseCircleFilled style={{ fontSize: 11 }} />}
                        <span style={{ fontWeight: 500 }}>{isPub ? 'Publishing' : isSuccess ? 'Published' : 'Failed'}</span>
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
              {isStillPublishing && <LoadingOutlined spin style={{ color: '#2563EB' }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Adjust Style Modal Button ──────────────────────── */
function AdjustStyleButton({ platform, loading, onRegenerate }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    onRegenerate(feedback);
    setOpen(false);
    setFeedback('');
  };

  return (
    <>
      <Tooltip title="Adjust style">
        <Button type="text" size="small"
          icon={<EditOutlined style={{ fontSize: 11 }} />}
          style={{ padding: '0 4px', height: 20, fontSize: 11 }}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        title="How should AI change this caption?"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSubmit}
        okText="Regenerate"
        okButtonProps={{ icon: <ReloadOutlined />, loading }}
        width={360}
      >
        <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {QUICK_SUGGESTIONS.map(s => (
            <Tag key={s.label}
              style={{ cursor: 'pointer', marginRight: 0, fontSize: 11 }}
              color={feedback === s.value ? 'blue' : undefined}
              onClick={() => setFeedback(s.value)}
            >
              {s.label}
            </Tag>
          ))}
        </div>
        <TextArea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Or type custom instructions..."
          autoSize={{ minRows: 2, maxRows: 3 }}
          style={{ fontSize: 12 }}
        />
      </Modal>
    </>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
export default function BulkSchedule() {
  const [rows, setRows] = useState([createEmptyRow()]);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  // Mass Publish state
  const [massModalOpen, setMassModalOpen] = useState(false);
  const [allMerchants, setAllMerchants] = useState([]);
  const [massSelected, setMassSelected] = useState(new Set());
  const [massSearch, setMassSearch] = useState('');
  const [massPersistExclude, setMassPersistExclude] = useState(false);

  // Load persisted excluded merchants from localStorage
  const EXCLUDE_KEY = 'massPublishExcluded';
  const getPersistedExcluded = () => {
    try { return new Set(JSON.parse(localStorage.getItem(EXCLUDE_KEY) || '[]')); }
    catch { return new Set(); }
  };

  const openMassPublish = async () => {
    try {
      const results = await searchMerchants('');
      const list = Array.isArray(results) ? results : [];
      setAllMerchants(list);
      const excluded = getPersistedExcluded();
      // Pre-check all except persisted excluded
      setMassSelected(new Set(list.filter(m => !excluded.has(m.mid || m.id)).map(m => m.mid || m.id)));
      setMassPersistExclude(false);
      setMassSearch('');
      setMassModalOpen(true);
    } catch {
      message.error('Failed to load merchants');
    }
  };

  const handleMassPublishConfirm = () => {
    // Save excluded merchants if flag is set
    const allIds = allMerchants.map(m => m.mid || m.id);
    const excluded = allIds.filter(id => !massSelected.has(id));
    if (massPersistExclude) {
      localStorage.setItem(EXCLUDE_KEY, JSON.stringify(excluded));
    }

    // Create one row per selected merchant, copying from the first row's content
    const template = rows[0] || createEmptyRow();
    const selectedMerchants = allMerchants.filter(m => massSelected.has(m.mid || m.id));
    if (selectedMerchants.length === 0) {
      message.warning('Select at least one store');
      return;
    }
    const newRows = selectedMerchants.map(m => ({
      ...createEmptyRow(),
      merchant: m,
      platforms: [...template.platforms],
      captions: { ...template.captions },
      mediaFiles: [...template.mediaFiles],
      scheduleMode: template.scheduleMode,
      scheduleDate: template.scheduleDate,
      scheduleTime: template.scheduleTime,
    }));
    setRows(newRows);
    setPublished(false);
    setMassModalOpen(false);
    message.success(`Created ${newRows.length} post(s) for selected stores`);
  };

  const updateRow = (id, updates) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const addRow = () => {
    setPublished(false);
    setRows(prev => {
      const lastMerchant = prev[prev.length - 1]?.merchant || null;
      return [...prev, { ...createEmptyRow(), merchant: lastMerchant }];
    });
  };

  const removeRow = (id) => {
    setRows(prev => prev.length <= 1 ? prev : prev.filter(r => r.id !== id));
  };

  const duplicateRow = (id) => {
    setPublished(false);
    setRows(prev => {
      const source = prev.find(r => r.id === id);
      if (!source) return prev;
      const idx = prev.indexOf(source);
      const copy = {
        ...source,
        id: Date.now() + Math.random(),
        generating: false,
        regeneratingPlatform: null,
        publishing: false,
        result: null,
        captions: { ...source.captions },
        platforms: [...source.platforms],
        mediaFiles: [...source.mediaFiles],
        googleFields: { ...(source.googleFields || { googlePostType: 'STANDARD' }) },
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const addMedia = (id, files) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const newFiles = [...r.mediaFiles, ...files];
      const hasVideo = newFiles.some(f => f.mimetype?.startsWith('video/') || f.filename?.match(/\.(mp4|mov|avi)$/i));
      const platforms = hasVideo ? r.platforms.filter(p => p !== 'google') : r.platforms;
      return { ...r, mediaFiles: newFiles, platforms };
    }));
  };

  const removeMedia = (id, index) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, mediaFiles: r.mediaFiles.filter((_, i) => i !== index) } : r
    ));
  };

  const reorderMedia = (id, newFiles) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, mediaFiles: newFiles } : r
    ));
  };

  const togglePlatform = (id, platform, checked) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const platforms = checked
        ? [...r.platforms, platform]
        : r.platforms.filter(p => p !== platform);
      return { ...r, platforms };
    }));
  };

  const updateCaption = (id, platform, value) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r.captions, [platform]: value };
      // Sync Facebook and Instagram captions
      if (platform === 'facebook') updated.instagram = value;
      if (platform === 'instagram') updated.facebook = value;
      return { ...r, captions: updated };
    }));
  };

  /* ── AI Generate for a single row ──────────────── */
  const handleGenerate = async (row) => {
    if (row.platforms.length === 0) {
      message.warning('Select at least one platform');
      return;
    }

    // Collect existing captions from OTHER rows to avoid duplicates
    const existingCaptions = rows
      .filter(r => r.id !== row.id)
      .flatMap(r => Object.values(r.captions).filter(c => c?.trim()))
      .slice(0, 10); // limit to avoid huge payloads

    const avoidContext = existingCaptions.length > 0
      ? `IMPORTANT: The following captions already exist for other posts. You MUST write something completely different — different hook, angle, wording, and CTA. Do NOT reuse any phrases from these:\n${existingCaptions.map((c, i) => `--- Existing #${i + 1} ---\n${c}`).join('\n')}`
      : '';

    updateRow(row.id, { generating: true });
    try {
      // Generate captions for all platforms except Google (Google defaults to empty/photo-only)
      const captionPlatforms = row.platforms.filter(p => p !== 'google');
      if (captionPlatforms.length === 0) {
        message.info('Google captions are not auto-generated. Type one manually or use Regenerate.');
        updateRow(row.id, { generating: false });
        return;
      }
      // FB and IG share the same caption — only generate for one, then copy
      const genPlatforms = captionPlatforms.includes('facebook') ? ['facebook'] :
                           captionPlatforms.includes('instagram') ? ['instagram'] : captionPlatforms;
      const result = await generateCaptions({
        mediaFiles: row.mediaFiles.map(f => f.filename),
        merchantName: row.merchant?.dbaName || row.merchant?.mid || '',
        merchantPhone: row.merchant?.phone || '',
        merchantPhone2: row.merchant?.phone2 || '',
        merchantAddress: row.merchant?.address || '',
        merchantWebsite: row.merchant?.website || '',
        platforms: genPlatforms,
        context: avoidContext,
      });
      const sharedCaption = result.facebook || result.instagram || '';
      if (sharedCaption) {
        result.facebook = sharedCaption;
        result.instagram = sharedCaption;
      }
      const tags = row.merchant?.hashtags || '';
      if (tags) {
        for (const p of Object.keys(result)) {
          result[p] = appendHashtags(result[p], tags);
        }
      }
      updateRow(row.id, { captions: { ...row.captions, ...result }, generating: false });
    } catch (err) {
      message.error('AI generation failed');
      updateRow(row.id, { generating: false });
    }
  };

  /* ── AI Regenerate for a single platform in a row ── */
  const handleRegenerate = async (row, platform, feedback) => {
    updateRow(row.id, { regeneratingPlatform: platform });
    try {
      const result = await regenerateCaption({
        platform,
        currentCaption: row.captions[platform],
        feedback: feedback || '',
        merchantName: row.merchant?.dbaName || row.merchant?.mid || '',
        merchantPhone: row.merchant?.phone || '',
        merchantPhone2: row.merchant?.phone2 || '',
        merchantAddress: row.merchant?.address || '',
        merchantWebsite: row.merchant?.website || '',
        mediaFiles: row.mediaFiles.map(f => f.filename),
      });
      // Append merchant's default hashtags so user sees and can edit them
      const withTags = appendHashtags(result.caption, row.merchant?.hashtags || '');
      // Sync FB and IG captions
      const updated = { [platform]: withTags };
      if (platform === 'facebook') updated.instagram = withTags;
      if (platform === 'instagram') updated.facebook = withTags;
      updateRow(row.id, {
        captions: { ...row.captions, ...updated },
        regeneratingPlatform: null,
      });
    } catch {
      message.error('Regeneration failed');
      updateRow(row.id, { regeneratingPlatform: null });
    }
  };

  /* ── Publish All ───────────────────────────────── */
  const getValidRows = () => rows.filter(r =>
    r.merchant && r.platforms.length > 0 &&
    (r.platforms.some(p => r.captions[p]?.trim()) || r.mediaFiles.length > 0)
  );

  const handlePublishAll = async () => {
    const valid = getValidRows();
    if (valid.length === 0) {
      message.warning('Add at least one complete post');
      return;
    }

    setPublishing(true);
    let successCount = 0;

    for (const row of valid) {
      updateRow(row.id, { publishing: true });

      try {
        // Build scheduled time
        let scheduledTime = null;
        if (row.scheduleMode === 'schedule' && row.scheduleDate) {
          const dt = dayjs(row.scheduleDate);
          scheduledTime = row.scheduleTime
            ? dt.hour(row.scheduleTime.hour()).minute(row.scheduleTime.minute()).second(0).toISOString()
            : dt.hour(9).minute(0).second(0).toISOString();
        }

        const pubPlatforms = {};
        for (const p of row.platforms) pubPlatforms[p] = { status: 'publishing' };
        updateRow(row.id, { result: { status: 'publishing', platforms: pubPlatforms } });

        const post = await createPost({
          merchantMid: row.merchant.mid,
          platforms: row.platforms,
          captions: row.captions,
          mediaFiles: row.mediaFiles.map(f => ({ filename: f.filename, originalName: f.originalName, mimetype: f.mimetype })),
          fbLayout: 'collage',
          scheduledTime,
          ...(row.googleFields || {}),
        });

        if (row.scheduleMode === 'schedule' && scheduledTime) {
          await schedulePost(post.id, scheduledTime);
          const done = {};
          for (const p of row.platforms) done[p] = { status: 'success' };
          updateRow(row.id, { publishing: false, result: { status: 'done', platforms: done } });
          successCount++;
        } else {
          await publishPost(post.id);
          // Poll in background
          ((rowId, postId) => {
            const poll = async () => {
              for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                  const status = await getPostStatus(postId);
                  if (status.status === 'publishing') continue;
                  const pr = {};
                  for (const [plat, r] of Object.entries(status.results || {})) {
                    pr[plat] = { status: r.status, error: r.error || null };
                  }
                  updateRow(rowId, { publishing: false, result: { status: 'done', platforms: pr } });
                  return;
                } catch { /* keep polling */ }
              }
              updateRow(rowId, { publishing: false });
            };
            poll();
          })(row.id, post.id);
          successCount++;
        }
      } catch (err) {
        updateRow(row.id, {
          publishing: false,
          result: { status: 'failed', platforms: { _error: { status: 'failed', error: err.response?.data?.error || err.message } } },
        });
      }
    }

    setPublishing(false);
    setPublished(true);
    if (successCount > 0) message.success(`${successCount} post(s) submitted!`);
  };

  const validCount = getValidRows().length;
  const hasAnyScheduled = rows.some(r => r.scheduleMode === 'schedule');

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 2 }}>Bulk Schedule Posts</Title>
        <Text type="secondary">Create and publish multiple posts at once across all your clients.</Text>
      </div>

      {/* ── Publish Results Summary ── */}
      <PublishResultsSummary rows={rows} />

      {/* ── Column Headers ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 180px 36px 160px 1fr auto 36px',
        gap: 10, padding: '8px 12px',
        background: '#F8FAFC', borderRadius: '10px 10px 0 0',
        border: '1px solid #E2E8F0', borderBottom: 'none',
        fontWeight: 600, fontSize: 12, color: '#64748B',
        minWidth: 750, overflowX: 'auto',
      }}>
        <div>#</div>
        <div>Post to</div>
        <div />
        <div>Media</div>
        <div>Text</div>
        <div style={{ textAlign: 'right', minWidth: 115 }}>Scheduling</div>
        <div />
      </div>

      {/* ── Rows ── */}
      <div style={{ border: '1px solid #E2E8F0', borderRadius: '0 0 10px 10px', overflowX: 'auto' }}>
        {rows.map((row, index) => (
          <div key={row.id} style={{
            borderBottom: index < rows.length - 1 ? '1px solid #F1F5F9' : 'none',
            background: row.result?.status === 'failed' ? '#FEF2F2' : row.publishing ? '#FAFBFC' : '#fff',
            transition: 'background 0.2s',
          }}>
            {/* Main row grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px 180px 36px 160px 1fr auto 36px',
              gap: 10, padding: '12px', alignItems: 'start',
              minWidth: 750,
            }}>
              {/* # */}
              <div style={{ paddingTop: 4, fontWeight: 600, color: '#94A3B8', fontSize: 13 }}>
                {index + 1}
              </div>

              {/* Merchant + platform toggles */}
              <div>
                <RowMerchantSelect
                  value={row.merchant}
                  onChange={async (m) => {
                    updateRow(row.id, { merchant: m, merchantStats: null });
                    if (m?.mid) {
                      const stats = await fetchMerchantStats(m.mid);
                      updateRow(row.id, { merchantStats: stats });
                    }
                  }}
                />
                <div style={{ marginTop: 6 }}>
                  <PlatformToggles
                    selected={row.platforms}
                    merchant={row.merchant}
                    hasVideo={row.mediaFiles.some(f => f.mimetype?.startsWith('video/') || f.filename?.match(/\.(mp4|mov|avi)$/i))}
                    onChange={(p, checked) => togglePlatform(row.id, p, checked)}
                  />
                </div>
                <MerchantStats stats={row.merchantStats} />
                {row.merchant?.hashtags && (
                  <div style={{ marginTop: 4 }}>
                    <Tooltip title={row.merchant.hashtags}>
                      <Tag
                        color="purple"
                        icon={<NumberOutlined />}
                        style={{ fontSize: 10, padding: '0 6px', lineHeight: '18px', margin: 0 }}
                      >
                        Has hashtags
                      </Tag>
                    </Tooltip>
                  </div>
                )}
                <PublishResultBadges result={row.result} />
                <Button
                  type="text" size="small"
                  icon={row.previewOpen ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => updateRow(row.id, { previewOpen: !row.previewOpen })}
                  style={{ marginTop: 4, padding: '0 4px', height: 22, fontSize: 11, color: '#64748B' }}
                >
                  {row.previewOpen ? 'Hide' : 'Preview'}
                </Button>
              </div>

              {/* AI button */}
              <div style={{ paddingTop: 2 }}>
                <Tooltip title="Generate captions with AI">
                  <Button
                    type="text" size="small"
                    icon={row.generating ? <LoadingOutlined spin /> : <ThunderboltOutlined />}
                    onClick={() => handleGenerate(row)}
                    disabled={row.generating || !row.merchant}
                    style={{ color: '#8B5CF6', fontSize: 16, padding: 4 }}
                  />
                </Tooltip>
              </div>

              {/* Media */}
              <div>
                <RowMedia
                  files={row.mediaFiles}
                  onAdd={(files) => addMedia(row.id, files)}
                  onRemove={(i) => removeMedia(row.id, i)}
                  onReorder={(newFiles) => reorderMedia(row.id, newFiles)}
                />
                {row.mediaFiles.length > 1 && (
                  <Button type="link" danger size="small" style={{ padding: 0, fontSize: 11, marginTop: 4 }}
                    onClick={() => setRows(prev => prev.map(r => r.id === row.id ? { ...r, mediaFiles: [] } : r))}>
                    Clear all media
                  </Button>
                )}
              </div>

              {/* Captions — show one text area per selected platform with regenerate/style */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {row.platforms.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 12, paddingTop: 4 }}>Select platforms</Text>
                )}
                {row.platforms.map(p => {
                  const cfg = PLATFORMS.find(x => x.key === p);
                  const isRegen = row.regeneratingPlatform === p;
                  const hasCaption = !!row.captions[p]?.trim();
                  return (
                    <div key={p}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: cfg.color, fontSize: 12 }}>{cfg.icon}</span>
                          <Text style={{ fontSize: 11, color: '#64748B' }}>{cfg.label}</Text>
                        </div>
                        {(hasCaption || p === 'google') && (
                          <Space size={2}>
                            <Tooltip title="Regenerate">
                              <Button type="text" size="small"
                                icon={<ReloadOutlined style={{ fontSize: 11 }} />}
                                loading={isRegen}
                                onClick={() => handleRegenerate(row, p, '')}
                                style={{ padding: '0 4px', height: 20, fontSize: 11 }}
                              />
                            </Tooltip>
                            <AdjustStyleButton
                              platform={p}
                              loading={isRegen}
                              onRegenerate={(feedback) => handleRegenerate(row, p, feedback)}
                            />
                          </Space>
                        )}
                      </div>
                      <TextArea
                        value={row.captions[p] || ''}
                        onChange={(e) => updateCaption(row.id, p, e.target.value)}
                        placeholder={`${cfg.label} caption...`}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Google Post Type */}
              {row.platforms.includes('google') && (
                <GooglePostTypeFields
                  values={row.googleFields}
                  onChange={(fields) => updateRow(row.id, { googleFields: fields })}
                  compact
                />
              )}

              {/* Schedule */}
              <div>
                <RowScheduleOption
                  mode={row.scheduleMode}
                  date={row.scheduleDate}
                  time={row.scheduleTime}
                  onModeChange={(m) => {
                    const updates = { scheduleMode: m };
                    // Default to tomorrow at 10 AM when switching to schedule mode
                    if (m === 'schedule' && !row.scheduleDate) {
                      updates.scheduleDate = dayjs().add(1, 'day');
                    }
                    if (m === 'schedule' && !row.scheduleTime) {
                      updates.scheduleTime = dayjs().hour(10).minute(0).second(0);
                    }
                    updateRow(row.id, updates);
                  }}
                  onDateChange={(d) => updateRow(row.id, { scheduleDate: d })}
                  onTimeChange={(t) => updateRow(row.id, { scheduleTime: t })}
                />
              </div>

              {/* Duplicate & Delete */}
              <div style={{ paddingTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Tooltip title="Duplicate post">
                  <Button type="text" icon={<CopyOutlined />} size="small"
                    onClick={() => duplicateRow(row.id)} />
                </Tooltip>
                <Button type="text" danger icon={<DeleteOutlined />} size="small"
                  onClick={() => removeRow(row.id)} disabled={rows.length <= 1} />
              </div>
            </div>

            {/* Collapsible preview */}
            {row.previewOpen && (
              <div style={{
                padding: '0 12px 16px',
                borderTop: '1px dashed #E2E8F0',
                marginTop: 0,
                background: '#FAFBFC',
              }}>
                <div style={{ maxWidth: 480, margin: '0 auto' }}>
                  <PreviewPanel
                    captions={row.captions}
                    mediaFiles={row.mediaFiles}
                    merchantName={row.merchant?.dbaName || row.merchant?.mid || 'Your Business'}
                    selectedPlatforms={row.platforms}
                    fbLayout="collage"
                    fbLayoutVariant={0}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 16, padding: '16px 0', borderTop: '1px solid #E2E8F0',
      }}>
        <Space>
          <Button icon={<PlusOutlined />} onClick={addRow}>Add post</Button>
          <Button icon={<TeamOutlined />} onClick={openMassPublish}>Mass Publish</Button>
        </Space>
        <Space>
          <Button size="large" onClick={() => { setRows([createEmptyRow()]); setPublished(false); }} disabled={publishing}>
            Cancel
          </Button>
          <Button type="primary" size="large"
            icon={published ? <CheckCircleFilled /> : <SendOutlined />}
            loading={publishing} disabled={published || validCount === 0}
            style={{ minWidth: 160, ...(published ? { background: '#52c41a', borderColor: '#52c41a' } : {}) }}
            onClick={() => {
              const msg = hasAnyScheduled
                ? `Publish and schedule ${validCount} post(s)? Posts set to "Publish now" will publish immediately. Scheduled posts will be queued.`
                : `Publish ${validCount} post(s) immediately?`;
              if (window.confirm(msg)) handlePublishAll();
            }}>
            {published ? 'Published!' : (hasAnyScheduled ? 'Publish and schedule' : 'Publish') + ` (${validCount})`}
          </Button>
        </Space>
      </div>

      {/* Mass Publish Modal */}
      <Modal
        title="Mass Publish — Select Stores"
        open={massModalOpen}
        onCancel={() => setMassModalOpen(false)}
        onOk={handleMassPublishConfirm}
        okText={`Create ${massSelected.size} Post(s)`}
        okButtonProps={{ disabled: massSelected.size === 0 }}
        width={520}
        destroyOnClose
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Select stores to create posts for. The first row's content (platforms, captions, media, schedule) will be copied to each store.
          </Text>
        </div>

        <Input
          prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
          placeholder="Search stores..."
          value={massSearch}
          onChange={(e) => setMassSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />

        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Checkbox
            checked={massSelected.size === allMerchants.length}
            indeterminate={massSelected.size > 0 && massSelected.size < allMerchants.length}
            onChange={(e) => {
              if (e.target.checked) {
                setMassSelected(new Set(allMerchants.map(m => m.mid || m.id)));
              } else {
                setMassSelected(new Set());
              }
            }}
          >
            <Text strong style={{ fontSize: 13 }}>Select All ({massSelected.size}/{allMerchants.length})</Text>
          </Checkbox>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, padding: '4px 0' }}>
          {allMerchants
            .filter(m => {
              if (!massSearch.trim()) return true;
              const q = massSearch.toLowerCase();
              return (m.dbaName || '').toLowerCase().includes(q)
                || (m.dba_name || '').toLowerCase().includes(q)
                || (m.mid || '').toLowerCase().includes(q)
                || (m.name || '').toLowerCase().includes(q);
            })
            .map(m => {
              const id = m.mid || m.id;
              return (
                <div key={id} style={{
                  padding: '6px 12px', display: 'flex', alignItems: 'center',
                  borderBottom: '1px solid #F1F5F9',
                }}>
                  <Checkbox
                    checked={massSelected.has(id)}
                    onChange={(e) => {
                      setMassSelected(prev => {
                        const next = new Set(prev);
                        e.target.checked ? next.add(id) : next.delete(id);
                        return next;
                      });
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{m.dbaName || m.dba_name || m.name || id}</Text>
                    {m.mid && <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{m.mid}</Text>}
                  </Checkbox>
                </div>
              );
            })
          }
        </div>

        <div style={{ marginTop: 12, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
          <Checkbox
            checked={massPersistExclude}
            onChange={(e) => setMassPersistExclude(e.target.checked)}
          >
            <Text style={{ fontSize: 12 }}>Remember excluded stores for next time</Text>
          </Checkbox>
        </div>
      </Modal>
    </div>
  );
}

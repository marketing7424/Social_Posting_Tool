import { useState } from 'react';
import { Avatar, Typography } from 'antd';
import {
  HeartOutlined,
  MessageOutlined,
  SendOutlined,
  BookOutlined,
  EllipsisOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';

function isVideoFile(file) {
  return file.mimetype?.startsWith('video/') || file.filename?.match(/\.(mp4|mov|avi)$/i);
}

export default function InstagramPreview({ caption = '', mediaFiles = [], merchantName = 'yourbusiness', profilePic }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const videoFile = mediaFiles.find(isVideoFile);
  const imageOnly = mediaFiles.filter(f => !isVideoFile(f));
  const images = imageOnly.map((f) => `${API_BASE}${f.url || `/uploads/${f.filename}`}`);
  const hasMultiple = images.length > 1;

  const displayName = merchantName.toLowerCase().replace(/\s+/g, '');

  const [expanded, setExpanded] = useState(false);

  const truncLimit = 150;
  const truncated = caption.length > truncLimit && !expanded;
  const displayCaption = truncated ? caption.slice(0, truncLimit) : caption;

  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      border: '1px solid #dbdbdb',
      overflow: 'hidden', maxWidth: 468, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {profilePic
            ? <Avatar size={32} src={profilePic} />
            : <Avatar size={32} style={{ backgroundColor: '#bdbdbd' }} />
          }
          <Text strong style={{ fontSize: 14 }}>{displayName}</Text>
        </div>
        <EllipsisOutlined style={{ fontSize: 16 }} />
      </div>

      {/* Media area */}
      {videoFile ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#000', overflow: 'hidden' }}>
          <video
            src={`${API_BASE}${videoFile.url || `/uploads/${videoFile.filename}`}`}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 4,
            padding: '2px 8px', fontSize: 12, fontWeight: 600,
          }}>
            REEL
          </div>
        </div>
      ) : images.length > 0 && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#efefef', overflow: 'hidden' }}>
          <img
            src={images[currentIndex] || images[0]}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />

          {/* Carousel left/right tap zones */}
          {hasMultiple && currentIndex > 0 && (
            <div
              onClick={() => setCurrentIndex((i) => i - 1)}
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#262626',
              }}
            >
              &#8249;
            </div>
          )}
          {hasMultiple && currentIndex < images.length - 1 && (
            <div
              onClick={() => setCurrentIndex((i) => i + 1)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#262626',
              }}
            >
              &#8250;
            </div>
          )}
        </div>
      )}

      {/* Carousel dots */}
      {!videoFile && hasMultiple && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '8px 0' }}>
          {images.map((_, i) => (
            <div
              key={i}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === currentIndex ? '#EAB308' : '#d4d4d4',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
      )}

      {/* Action icons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 22 }}>
          <HeartOutlined style={{ cursor: 'pointer' }} />
          <MessageOutlined style={{ cursor: 'pointer' }} />
          <SendOutlined style={{ cursor: 'pointer' }} />
        </div>
        <BookOutlined style={{ fontSize: 22, cursor: 'pointer' }} />
      </div>

      {/* Likes placeholder */}
      <div style={{ padding: '0 12px 4px' }}>
        <Text strong style={{ fontSize: 13 }}>Liked by others</Text>
      </div>

      {/* Caption */}
      {caption && (
        <div style={{ padding: '0 12px 12px' }}>
          <Text style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
            <Text strong>{displayName}</Text>{' '}
            {displayCaption}
            {truncated && (
              <span
                onClick={() => setExpanded(true)}
                style={{ color: '#8e8e8e', cursor: 'pointer', fontSize: 13 }}
              >... more</span>
            )}
          </Text>
        </div>
      )}
    </div>
  );
}

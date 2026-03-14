import { useState } from 'react';
import { Typography, Tag } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';

function isVideoFile(file) {
  return file.mimetype?.startsWith('video/') || file.filename?.match(/\.(mp4|mov|avi)$/i);
}

export default function GooglePreview({ caption = '', mediaFiles = [], merchantName = 'Your Business' }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const imageOnly = mediaFiles.filter(f => !isVideoFile(f));
  const images = imageOnly.map((f) => `${API_BASE}${f.url || `/uploads/${f.filename}`}`);
  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  const prev = () => setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0));

  const arrowStyle = (side) => ({
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: 8,
    width: 32, height: 32,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.85)',
    border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 14,
    color: '#3c4043',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      border: '1px solid #dadce0',
      overflow: 'hidden', maxWidth: 400, fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
    }}>
      {/* Business name + verified badge + date */}
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: '#EA580C',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>
          {merchantName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text strong style={{ fontSize: 14, color: '#202124' }}>{merchantName}</Text>
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path fill="#EA580C" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <Text style={{ fontSize: 12, color: '#70757a' }}>Just now</Text>
        </div>
      </div>

      {/* Image carousel */}
      {hasImages && (
        <div style={{ position: 'relative', width: '100%', height: 300, overflow: 'hidden', background: '#f8f9fa' }}>
          <img
            src={images[currentIndex]}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />

          {/* Image counter badge */}
          {hasMultiple && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              borderRadius: 12, padding: '2px 10px',
              fontSize: 13, fontWeight: 500,
            }}>
              {currentIndex + 1}/{images.length}
            </div>
          )}

          {/* Navigation arrows */}
          {hasMultiple && (
            <>
              <button onClick={prev} style={arrowStyle('left')}>
                <LeftOutlined />
              </button>
              <button onClick={next} style={arrowStyle('right')}>
                <RightOutlined />
              </button>
            </>
          )}

          {/* Peek of next image on the right edge */}
          {hasMultiple && currentIndex < images.length - 1 && (
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 30, height: '100%',
              overflow: 'hidden', opacity: 0.5,
              borderLeft: '2px solid #fff',
              pointerEvents: 'none',
            }}>
              <img
                src={images[currentIndex + 1]}
                alt=""
                style={{ width: 300, height: '100%', objectFit: 'cover', marginLeft: -135 }}
              />
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {caption && (
        <div style={{ padding: '12px 16px' }}>
          <Text style={{ fontSize: 14, whiteSpace: 'pre-wrap', color: '#3c4043', lineHeight: '22px' }}>
            {caption}
          </Text>
        </div>
      )}

      {/* Learn more button */}
      <div style={{ padding: '0 16px 12px' }}>
        <Tag color="orange" style={{ borderRadius: 16, fontSize: 13, padding: '2px 12px', cursor: 'pointer' }}>
          Learn more
        </Tag>
      </div>
    </div>
  );
}

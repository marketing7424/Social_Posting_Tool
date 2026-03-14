import { useState } from 'react';
import { Avatar, Typography, Button, Tooltip } from 'antd';
import {
  LikeOutlined, CommentOutlined, ShareAltOutlined,
  PictureOutlined, LayoutOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';

function isVideoFile(file) {
  return file.mimetype?.startsWith('video/') || file.filename?.match(/\.(mp4|mov|avi)$/i);
}

/**
 * Facebook layout is driven by the FIRST image's aspect ratio:
 * - Landscape first → hero on top, smaller below
 * - Portrait first → hero on left, smaller stacked right
 * - Square first → grid-style arrangement
 *
 * We let users pick a layout, then crop the hero image to match.
 */

/**
 * Facebook Image Layout Styles (based on official Facebook image size guide):
 *
 * 1 image:  900x900 (1:1 square)
 *
 * 2 images:
 *   Style 2 — Side by Side squares: 900x900 each (1:1)
 *   Style 3 — Side by Side portraits: 448x900 each (1:2)
 *   Style 4 — Stacked landscapes: 900x452 each (2:1)
 *
 * 3 images:
 *   Style 5 — Grid: top row 2 squares + bottom row 3 squares (all 900x900, 1:1)
 *   Style 6 — Hero Left: portrait hero 448x900 (1:2) + 2 squares 900x900 right
 *   Style 7 — Hero Top: landscape hero 900x452 (2:1) + 2 squares 900x900 bottom
 *
 * 4 images:
 *   Style 8  — 2x2 Grid: all 900x900 squares (1:1)
 *   Style 9  — Hero Left: portrait hero 598x900 (1:1.5) + 3 squares 900x900 right
 *   Style 10 — Hero Top: landscape hero 900x603 (3:2) + 3 squares 900x900 bottom
 */
const LAYOUTS = {
  1: [
    { name: 'Square', desc: 'Single square image (900×900, ratio 1:1)' },
  ],
  2: [
    { name: 'Side by Side', desc: 'Two square images side by side (900×900 each, 1:1)' },
    { name: 'Portraits', desc: 'Two tall portrait images side by side (448×900 each, 1:2)' },
    { name: 'Stacked', desc: 'Two landscape images stacked (900×452 each, 2:1)' },
  ],
  3: [
    { name: 'Hero Top', desc: 'Landscape hero on top (900×452, 2:1) + 2 squares below' },
    { name: 'Hero Left', desc: 'Portrait hero on left (448×900, 1:2) + 2 squares stacked right' },
    { name: 'Grid', desc: 'All square images in rows (900×900, 1:1)' },
  ],
  4: [
    { name: '2×2 Grid', desc: 'Four equal squares (900×900, 1:1)' },
    { name: 'Hero Left', desc: 'Portrait hero on left (598×900, 1:1.5) + 3 squares right' },
    { name: 'Hero Top', desc: 'Landscape hero on top (900×603, 3:2) + 3 squares below' },
  ],
  5: [
    { name: '2 + 3', desc: 'Two on top, three below (all square)' },
    { name: '3 + 2', desc: 'Three on top, two below (all square)' },
  ],
};

export default function FacebookPreview({
  caption = '', mediaFiles = [], merchantName = 'Your Business',
  profilePic, layout = 'collage', layoutVariant = 0, onLayoutVariantChange,
}) {
  const [expanded, setExpanded] = useState(false);

  const truncated = caption.length > 200 && !expanded;
  const displayCaption = truncated ? caption.slice(0, 200) + '...' : caption;

  const videoFile = mediaFiles.find(isVideoFile);
  const imageOnly = mediaFiles.filter(f => !isVideoFile(f));
  const images = imageOnly.map((f) => `${API_BASE}${f.url || `/uploads/${f.filename}`}`);

  const imgStyle = { width: '100%', height: '100%', objectFit: 'cover' };
  const cell = (src, extra) => (
    <div key={src} style={{ overflow: 'hidden', position: 'relative', ...extra }}>
      <img src={src} alt="" style={imgStyle} />
    </div>
  );
  const overlay = (count) => (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 28, fontWeight: 600, pointerEvents: 'none',
    }}>+{count}</div>
  );

  const imgCount = Math.min(images.length, 5);
  const variants = LAYOUTS[imgCount] || LAYOUTS[5];
  const currentVariant = variants ? layoutVariant % variants.length : 0;

  const cycleLayout = () => {
    if (!variants) return;
    const next = (currentVariant + 1) % variants.length;
    if (onLayoutVariantChange) onLayoutVariantChange(next);
  };

  const renderCollage = () => {
    if (images.length === 0) return null;

    // 1 image — Style 1: square (900×900, 1:1)
    if (images.length === 1) {
      return cell(images[0], { width: '100%', aspectRatio: '1 / 1' });
    }

    // 2 images
    if (images.length === 2) {
      if (currentVariant === 1) {
        // Style 3 — Portraits side by side (448×900 each, 1:2)
        return (
          <div style={{ display: 'flex', gap: 2 }}>
            {images.map((src) => cell(src, { flex: 1, aspectRatio: '1 / 2' }))}
          </div>
        );
      }
      if (currentVariant === 2) {
        // Style 4 — Stacked landscapes (900×452 each, 2:1)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {images.map((src) => cell(src, { width: '100%', aspectRatio: '2 / 1' }))}
          </div>
        );
      }
      // Style 2 — Side by side squares (900×900 each, 1:1) — default
      return (
        <div style={{ display: 'flex', gap: 2 }}>
          {images.map((src) => cell(src, { flex: 1, aspectRatio: '1 / 1' }))}
        </div>
      );
    }

    // 3 images
    if (images.length === 3) {
      if (currentVariant === 1) {
        // Style 6 — Hero Left: portrait hero (1:2) + 2 squares stacked right
        return (
          <div style={{ display: 'flex', gap: 2, height: 360 }}>
            {cell(images[0], { flex: 1, minWidth: 0 })}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {images.slice(1).map((src) => cell(src, { flex: 1 }))}
            </div>
          </div>
        );
      }
      if (currentVariant === 2) {
        // Style 5 — Grid: top row 2 squares + bottom row 3 squares
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {images.slice(0, 2).map((src) => cell(src, { flex: 1, aspectRatio: '1 / 1' }))}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {images.map((src) => cell(src, { flex: 1, aspectRatio: '1 / 1' }))}
            </div>
          </div>
        );
      }
      // Style 7 — Hero Top: landscape hero (2:1) + 2 squares below — default
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {cell(images[0], { width: '100%', aspectRatio: '2 / 1' })}
          <div style={{ display: 'flex', gap: 2 }}>
            {images.slice(1).map((src) => cell(src, { flex: 1, aspectRatio: '1 / 1' }))}
          </div>
        </div>
      );
    }

    // 4 images
    if (images.length === 4) {
      if (currentVariant === 1) {
        // Style 9 — Hero Left: portrait hero (1:1.5) + 3 squares stacked right
        return (
          <div style={{ display: 'flex', gap: 2, height: 400 }}>
            {cell(images[0], { flex: 2, minWidth: 0 })}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {images.slice(1).map((src) => cell(src, { flex: 1 }))}
            </div>
          </div>
        );
      }
      if (currentVariant === 2) {
        // Style 10 — Hero Top: landscape hero (3:2) + 3 squares below
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {cell(images[0], { width: '100%', aspectRatio: '3 / 2' })}
            <div style={{ display: 'flex', gap: 2 }}>
              {images.slice(1).map((src) => cell(src, { flex: 1, aspectRatio: '1 / 1' }))}
            </div>
          </div>
        );
      }
      // Style 8 — 2×2 Grid: four equal squares (900×900, 1:1) — default
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {images.map((src) => cell(src, { aspectRatio: '1 / 1' }))}
        </div>
      );
    }

    // 5+ images
    const extra = images.length - 5;
    if (currentVariant === 1) {
      // 3 + 2: three squares on top, two squares below
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {images.slice(0, 3).map((src) => cell(src, { flex: 1, aspectRatio: '1 / 1' }))}
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {images.slice(3, 5).map((src, i) => (
              <div key={src} style={{ flex: 1, overflow: 'hidden', position: 'relative', aspectRatio: '1 / 1' }}>
                <img src={src} alt="" style={imgStyle} />
                {i === 1 && extra > 0 && overlay(extra)}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 2 + 3 — default: two squares on top, three squares below
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {images.slice(0, 2).map((src) => cell(src, { flex: 1, aspectRatio: '1 / 1' }))}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {images.slice(2, 5).map((src, i) => (
            <div key={src} style={{ flex: 1, overflow: 'hidden', position: 'relative', aspectRatio: '1 / 1' }}>
              <img src={src} alt="" style={imgStyle} />
              {i === 2 && extra > 0 && overlay(extra)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAlbum = () => {
    if (images.length === 0) return null;
    return (
      <div>
        <div style={{
          padding: '8px 16px', background: '#f0f2f5',
          borderBottom: '1px solid #e4e6eb', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <PictureOutlined style={{ fontSize: 16, color: '#65676b' }} />
          <Text strong style={{ fontSize: 13, color: '#65676b' }}>
            Photo Album · {images.length} photos
          </Text>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: images.length <= 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: 2,
        }}>
          {images.slice(0, 9).map((src, i) => (
            <div key={i} style={{
              height: images.length <= 2 ? 200 : 120,
              overflow: 'hidden', position: 'relative',
            }}>
              <img src={src} alt="" style={imgStyle} />
              {i === 8 && images.length > 9 && overlay(images.length - 9)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasMultipleImages = images.length >= 2;
  const showLayoutButton = hasMultipleImages && layout === 'collage';

  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      overflow: 'hidden', maxWidth: 500, fontFamily: 'Helvetica, Arial, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10 }}>
        {profilePic
          ? <Avatar size={40} src={profilePic} />
          : <Avatar size={40} style={{ backgroundColor: '#bdbdbd' }} />
        }
        <div style={{ flex: 1 }}>
          <Text strong style={{ display: 'block', fontSize: 14, lineHeight: '18px' }}>{merchantName}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Just now · <span style={{ fontSize: 11 }}>🌐</span></Text>
        </div>
      </div>

      {/* Caption */}
      {caption && (
        <div style={{ padding: '0 16px 12px' }}>
          <Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {displayCaption}
            {truncated && (
              <span
                onClick={() => setExpanded(true)}
                style={{ color: '#65676b', cursor: 'pointer', fontWeight: 500 }}
              > See more</span>
            )}
          </Text>
        </div>
      )}

      {/* Layout selector */}
      {showLayoutButton && (
        <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title={variants?.[currentVariant]?.desc || ''}>
            <Button
              size="small"
              icon={<LayoutOutlined />}
              onClick={cycleLayout}
            >
              Layout: {variants?.[currentVariant]?.name || 'Auto'}
            </Button>
          </Tooltip>
        </div>
      )}

      {/* Media */}
      {videoFile ? (
        <div style={{ width: '100%', background: '#000' }}>
          <video
            src={`${API_BASE}${videoFile.url || `/uploads/${videoFile.filename}`}`}
            controls
            style={{ width: '100%', maxHeight: 400, display: 'block' }}
          />
        </div>
      ) : (
        layout === 'album' ? renderAlbum() : renderCollage()
      )}

      {/* Action bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-around',
        borderTop: '1px solid #e4e6eb', padding: '8px 0', margin: '0 16px',
      }}>
        {[
          { icon: <LikeOutlined />, label: 'Like' },
          { icon: <CommentOutlined />, label: 'Comment' },
          { icon: <ShareAltOutlined />, label: 'Share' },
        ].map(({ icon, label }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: '#65676b', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '6px 12px',
          }}>
            {icon} {label}
          </div>
        ))}
      </div>
    </div>
  );
}

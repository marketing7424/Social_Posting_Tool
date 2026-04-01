import { useState } from 'react';
import { Input, Button, Space, Typography, Popover, Tag } from 'antd';
import {
  FacebookOutlined,
  InstagramOutlined,
  GoogleOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  EditOutlined,
} from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

import { PLATFORM_COLORS, PLATFORM_LABELS } from '../../constants/platforms';

const PLATFORM_CONFIG = {
  facebook: { label: PLATFORM_LABELS.facebook, icon: <FacebookOutlined />, color: PLATFORM_COLORS.facebook },
  instagram: { label: PLATFORM_LABELS.instagram, icon: <InstagramOutlined />, color: PLATFORM_COLORS.instagram },
  google: { label: PLATFORM_LABELS.google, icon: <GoogleOutlined />, color: PLATFORM_COLORS.google },
};

const QUICK_SUGGESTIONS = [
  { label: 'More Professional', value: 'Make it more professional and formal' },
  { label: 'More Casual', value: 'Make it more casual and friendly' },
  { label: 'Holiday Post', value: 'Rewrite as a holiday/seasonal promotion post' },
  { label: 'Promo / Sale', value: 'Rewrite as a promotional sale or discount post' },
  { label: 'Shorter', value: 'Make it shorter and more concise' },
  { label: 'More Emojis', value: 'Add more emojis and make it fun' },
  { label: 'Funny / Witty', value: 'Rewrite with a funny, witty tone' },
  { label: 'Urgent CTA', value: 'Add urgency and a stronger call-to-action' },
];

export default function CaptionEditor({
  captions = {},
  platforms = [],
  onCaptionsChange,
  onGenerate,
  onRegenerate,
  generating,
  regeneratingPlatform,
}) {
  const [feedbackOpen, setFeedbackOpen] = useState({});
  const [feedbackText, setFeedbackText] = useState({});

  const handleChange = (platform, value) => {
    if (onCaptionsChange) {
      const updated = { ...captions, [platform]: value };
      // Sync Facebook and Instagram captions
      if (platform === 'facebook') updated.instagram = value;
      if (platform === 'instagram') updated.facebook = value;
      onCaptionsChange(updated);
    }
  };

  const handleRegenerate = (platform, feedback) => {
    if (onRegenerate) {
      onRegenerate(platform, feedback || '');
    }
    setFeedbackOpen((prev) => ({ ...prev, [platform]: false }));
    setFeedbackText((prev) => ({ ...prev, [platform]: '' }));
  };

  const handleQuickSuggestion = (platform, suggestion) => {
    setFeedbackText((prev) => ({ ...prev, [platform]: suggestion }));
  };

  const renderFeedbackPopover = (platform) => (
    <div style={{ width: 300 }}>
      <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
        How should AI change this caption?
      </Text>

      {/* Quick suggestion tags */}
      <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {QUICK_SUGGESTIONS.map((s) => (
          <Tag
            key={s.label}
            style={{ cursor: 'pointer', marginRight: 0, fontSize: 12 }}
            color={feedbackText[platform] === s.value ? 'blue' : undefined}
            onClick={() => handleQuickSuggestion(platform, s.value)}
          >
            {s.label}
          </Tag>
        ))}
      </div>

      {/* Custom feedback input */}
      <TextArea
        value={feedbackText[platform] || ''}
        onChange={(e) =>
          setFeedbackText((prev) => ({ ...prev, [platform]: e.target.value }))
        }
        placeholder="Or type custom instructions... e.g., 'Make it about our Valentine's Day special'"
        autoSize={{ minRows: 2, maxRows: 4 }}
        style={{ marginBottom: 8, fontSize: 13 }}
      />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          onClick={() => setFeedbackOpen((prev) => ({ ...prev, [platform]: false }))}
        >
          Cancel
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<ReloadOutlined />}
          onClick={() => handleRegenerate(platform, feedbackText[platform])}
        >
          Regenerate
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={onGenerate}
          loading={generating}
        >
          Generate with AI
        </Button>
      </div>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {platforms.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          if (!config) return null;

          const isRegenerating = regeneratingPlatform === platform;

          return (
            <div key={platform}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <Text strong style={{ color: config.color }}>
                  {config.icon}{' '}
                  {config.label}
                </Text>
                <Space size="small">
                  {/* Simple regenerate (no feedback) */}
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => handleRegenerate(platform)}
                    loading={isRegenerating}
                    disabled={platform !== 'google' && !captions[platform]?.trim()}
                  >
                    Regenerate
                  </Button>
                  {/* Regenerate with feedback */}
                  <Popover
                    content={renderFeedbackPopover(platform)}
                    title={null}
                    trigger="click"
                    open={feedbackOpen[platform] || false}
                    onOpenChange={(open) =>
                      setFeedbackOpen((prev) => ({ ...prev, [platform]: open }))
                    }
                    placement="bottomRight"
                  >
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      disabled={platform !== 'google' && !captions[platform]?.trim()}
                    >
                      Adjust Style
                    </Button>
                  </Popover>
                </Space>
              </div>
              <TextArea
                value={captions[platform] || ''}
                onChange={(e) => handleChange(platform, e.target.value)}
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder={`Write your ${config.label} caption...`}
              />
            </div>
          );
        })}
      </Space>
    </div>
  );
}

import { Tabs, Typography } from 'antd';
import {
  FacebookOutlined,
  InstagramOutlined,
  GoogleOutlined,
} from '@ant-design/icons';
import FacebookPreview from './FacebookPreview';
import InstagramPreview from './InstagramPreview';
import GooglePreview from './GooglePreview';

const { Text } = Typography;

export default function PreviewPanel({
  captions = {},
  mediaFiles = [],
  merchantName,
  profilePic,
  selectedPlatforms = [],
  fbLayout = 'collage',
  fbLayoutVariant = 0,
  onFbLayoutVariantChange,
}) {
  const activePlatforms = selectedPlatforms.filter((p) =>
    ['facebook', 'instagram', 'google'].includes(p)
  );

  if (!activePlatforms.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Text type="secondary">Select platforms to see previews</Text>
      </div>
    );
  }

  const componentMap = {
    facebook: { label: 'Facebook', icon: <FacebookOutlined /> },
    instagram: { label: 'Instagram', icon: <InstagramOutlined /> },
    google: { label: 'Google Business', icon: <GoogleOutlined /> },
  };

  const items = activePlatforms.map((platform) => {
    const { label, icon } = componentMap[platform];
    let preview;

    if (platform === 'facebook') {
      preview = (
        <FacebookPreview
          caption={captions.facebook || ''}
          mediaFiles={mediaFiles}
          merchantName={merchantName}
          profilePic={profilePic}
          layout={fbLayout}
          layoutVariant={fbLayoutVariant}
          onLayoutVariantChange={onFbLayoutVariantChange}
        />
      );
    } else if (platform === 'instagram') {
      preview = (
        <InstagramPreview
          caption={captions.instagram || ''}
          mediaFiles={mediaFiles}
          merchantName={merchantName}
          profilePic={profilePic}
        />
      );
    } else {
      preview = (
        <GooglePreview
          caption={captions.google || ''}
          mediaFiles={mediaFiles}
          merchantName={merchantName}
        />
      );
    }

    return {
      key: platform,
      label: <span>{icon} {label}</span>,
      children: (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          {preview}
        </div>
      ),
    };
  });

  return <Tabs items={items} defaultActiveKey={activePlatforms[0]} />;
}

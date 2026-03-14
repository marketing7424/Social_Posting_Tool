import { Radio, Tooltip } from 'antd';
import { AppstoreOutlined, PictureOutlined } from '@ant-design/icons';

/**
 * Facebook multi-image posting methods:
 * - "collage" (default): Uses attached_media — Facebook auto-arranges photos
 *   into its standard mosaic layout based on image count/orientation.
 *   This is the normal multi-photo post.
 * - "album": Creates a photo album — all images shown in album format
 *   with album title. Better for large sets (5+ images).
 */
export default function LayoutSelector({ value, onChange, imageCount = 0 }) {
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value)} size="small">
      <Tooltip title="Multi-photo post. Facebook auto-arranges the layout — reorder images to control which one appears largest.">
        <Radio.Button value="collage">
          <AppstoreOutlined /> Collage
        </Radio.Button>
      </Tooltip>
      <Tooltip title="Creates a photo album. Best for 5+ images. All photos visible without truncation.">
        <Radio.Button value="album">
          <PictureOutlined /> Album
        </Radio.Button>
      </Tooltip>
    </Radio.Group>
  );
}

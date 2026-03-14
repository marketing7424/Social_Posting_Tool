import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useState, useRef } from 'react';
import { uploadMedia } from '../../api/client';

const { Dragger } = Upload;

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
];

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.mp4';

export default function MediaUploader({ onUpload, loading }) {
  const [uploading, setUploading] = useState(false);
  const pendingFiles = useRef([]);
  const uploadTimer = useRef(null);

  // Ant Design calls beforeUpload once per file. We batch them with a short debounce
  // then upload all at once.
  const beforeUpload = (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      message.error(`${file.name} is not a supported file type`);
      return Upload.LIST_IGNORE;
    }

    pendingFiles.current.push(file);

    clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => {
      const files = pendingFiles.current.slice();
      pendingFiles.current = [];
      doUpload(files);
    }, 100);

    return false; // prevent default upload
  };

  const doUpload = async (files) => {
    if (files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));

    try {
      const result = await uploadMedia(formData);
      message.success(`${result.length} file(s) uploaded`);
      if (onUpload) onUpload(result);
    } catch (err) {
      message.error('Upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dragger
      name="files"
      multiple
      maxCount={10}
      accept={ACCEPT}
      beforeUpload={beforeUpload}
      fileList={[]}
      showUploadList={false}
      disabled={loading || uploading}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">
        {uploading ? 'Uploading...' : 'Click or drag files to upload'}
      </p>
      <p className="ant-upload-hint">
        Images (JPG, PNG, GIF, WebP) and videos (MP4). Max 10 files.
      </p>
    </Dragger>
  );
}

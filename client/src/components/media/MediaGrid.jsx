import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CloseOutlined, HolderOutlined, PlayCircleFilled } from '@ant-design/icons';

const MEDIA_BASE = (import.meta.env.VITE_API_BASE || '') + '/uploads/';

function isVideoFile(file) {
  return file.mimetype?.startsWith('video/') || file.filename?.match(/\.(mp4|mov|avi)$/i);
}

function SortableItem({ file, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.filename });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    display: 'inline-block',
  };

  const containerStyle = {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    border: '1px solid #d9d9d9',
    cursor: 'grab',
  };

  const imgStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  };

  const deleteStyle = {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    opacity: 0,
    transition: 'opacity 0.2s',
    zIndex: 2,
  };

  const handleStyle = {
    position: 'absolute',
    top: 4,
    left: 4,
    color: '#fff',
    fontSize: 14,
    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
    cursor: 'grab',
    zIndex: 2,
  };

  const url = file.url || `${MEDIA_BASE}${file.filename}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="media-grid-item"
    >
      <div
        style={containerStyle}
        onMouseEnter={(e) => {
          const btn = e.currentTarget.querySelector('.delete-btn');
          if (btn) btn.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          const btn = e.currentTarget.querySelector('.delete-btn');
          if (btn) btn.style.opacity = '0';
        }}
      >
        <div style={handleStyle} {...attributes} {...listeners}>
          <HolderOutlined />
        </div>
        {isVideoFile(file) ? (
          <div style={{
            width: '100%', height: '100%', background: '#1E293B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 4,
          }}>
            <PlayCircleFilled style={{ fontSize: 28, color: '#fff' }} />
            <span style={{ color: '#94A3B8', fontSize: 10, fontWeight: 600 }}>VIDEO</span>
          </div>
        ) : (
          <img
            src={url}
            alt={file.originalName || file.filename}
            style={imgStyle}
          />
        )}
        <button
          className="delete-btn"
          style={deleteStyle}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file.filename);
          }}
        >
          <CloseOutlined />
        </button>
      </div>
    </div>
  );
}

export default function MediaGrid({ files = [], onReorder, onDelete }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = files.findIndex((f) => f.filename === active.id);
    const newIndex = files.findIndex((f) => f.filename === over.id);
    const newFiles = arrayMove(files, oldIndex, newIndex);
    if (onReorder) onReorder(newFiles);
  };

  if (!files.length) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={files.map((f) => f.filename)} strategy={rectSortingStrategy}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {files.map((file) => (
            <SortableItem key={file.filename} file={file} onDelete={onDelete} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

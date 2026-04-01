import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ options, value, onChange, placeholder = 'Search...', style }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = search.trim()
    ? options.filter(o =>
        (o.label || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.value || '').toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const selected = value ? options.find(o => o.value === value) : null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
      <input
        type="text"
        value={open ? search : (selected?.label || '')}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        style={{
          width: '100%', height: 36, borderRadius: 8,
          border: '1px solid #d9d9d9', padding: '0 8px',
          fontSize: 14, color: '#1E293B', background: '#fff', outline: 'none',
        }}
      />
      {value && !open && (
        <span
          onClick={() => { onChange(undefined); setSearch(''); }}
          style={{
            position: 'absolute', right: 8, top: 8,
            cursor: 'pointer', color: '#bfbfbf', fontSize: 14, lineHeight: 1,
          }}
        >&times;</span>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: 38, left: 0, right: 0,
          maxHeight: 220, overflowY: 'auto', background: '#fff',
          border: '1px solid #d9d9d9', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 1050,
        }}>
          <div
            onClick={() => { onChange(undefined); setSearch(''); setOpen(false); }}
            style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 14, color: '#94A3B8' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F0F5FF'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
          >
            {placeholder}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '7px 12px', color: '#bfbfbf', fontSize: 14 }}>No results</div>
          ) : filtered.map(o => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setSearch(''); setOpen(false); }}
              style={{
                padding: '7px 12px', cursor: 'pointer', fontSize: 14,
                background: value === o.value ? '#F0F5FF' : '#fff',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F0F5FF'}
              onMouseLeave={(e) => e.currentTarget.style.background = value === o.value ? '#F0F5FF' : '#fff'}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

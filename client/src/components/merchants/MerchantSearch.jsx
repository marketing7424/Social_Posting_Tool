import { useState, useCallback, useRef } from 'react';
import { Select, Empty, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { searchMerchants } from '../../api/client';

export default function MerchantSearch({ value, onChange, onCreateNew }) {
  const [options, setOptions] = useState([]);
  const [fetching, setFetching] = useState(false);
  const merchantsRef = useRef([]);
  const timerRef = useRef(null);

  const handleSearch = useCallback((search) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const results = await searchMerchants(search);
        const merchants = Array.isArray(results) ? results : [];
        merchantsRef.current = merchants;
        setOptions(
          merchants.map((m) => ({
            value: m.mid,
            label: `${m.mid} — ${m.dbaName}`,
          }))
        );
      } catch {
        setOptions([]);
      } finally {
        setFetching(false);
      }
    }, 300);
  }, []);

  const handleChange = (mid) => {
    if (!mid) {
      onChange(null);
      return;
    }
    const merchant = merchantsRef.current.find(m => m.mid === mid);
    onChange(merchant || { mid });
  };

  // Load initial options on focus
  const handleFocus = () => {
    if (options.length === 0) handleSearch('');
  };

  return (
    <Select
      showSearch
      value={value?.mid || value}
      placeholder="Search by MID or name..."
      filterOption={false}
      onSearch={handleSearch}
      onChange={handleChange}
      onFocus={handleFocus}
      loading={fetching}
      options={options}
      notFoundContent={
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No clients found"
        >
          {onCreateNew && (
            <Button type="primary" icon={<PlusOutlined />} size="small" onClick={onCreateNew}>
              Create Your First Client
            </Button>
          )}
        </Empty>
      }
      dropdownRender={(menu) => (
        <>
          {menu}
          {onCreateNew && (
            <div
              style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid #f0f0f0', color: '#1677ff' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCreateNew}
            >
              <PlusOutlined /> Create New Client
            </div>
          )}
        </>
      )}
      style={{ width: '100%' }}
      allowClear
    />
  );
}

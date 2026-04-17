import { Radio, Input, DatePicker, TimePicker, Select, Space, Typography, Collapse } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const CTA_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'BOOK', label: 'Book' },
  { value: 'ORDER', label: 'Order online' },
  { value: 'SHOP', label: 'Buy' },
  { value: 'LEARN_MORE', label: 'Learn more' },
  { value: 'SIGN_UP', label: 'Sign up' },
  { value: 'CALL', label: 'Call now' },
];

export default function GooglePostTypeFields({ values, onChange, compact = false }) {
  const {
    googlePostType = 'STANDARD',
    googleTitle = '',
    googleStartDate = '',
    googleStartTime = '',
    googleEndDate = '',
    googleEndTime = '',
    googleCouponCode = '',
    googleRedeemUrl = '',
    googleTerms = '',
    googleCtaType = '',
    googleCtaUrl = '',
  } = values || {};

  const update = (field, value) => {
    onChange({ ...values, [field]: value });
  };

  const fontSize = compact ? 11 : 13;
  const inputSize = compact ? 'small' : 'middle';

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <GoogleOutlined style={{ color: '#EA580C', fontSize: 13 }} />
        <Text style={{ fontSize: 11, color: '#64748B' }}>Google Post Type</Text>
      </div>
      <Radio.Group
        value={googlePostType}
        onChange={(e) => update('googlePostType', e.target.value)}
        size="small"
        buttonStyle="solid"
        style={{ marginBottom: 10 }}
      >
        <Radio.Button value="STANDARD">Update</Radio.Button>
        <Radio.Button value="OFFER">Offer</Radio.Button>
        <Radio.Button value="EVENT">Event</Radio.Button>
      </Radio.Group>

      {(googlePostType === 'EVENT' || googlePostType === 'OFFER') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Title */}
          <div>
            <Text style={{ fontSize, color: '#475569' }}>Title *</Text>
            <Input
              value={googleTitle}
              onChange={(e) => update('googleTitle', e.target.value)}
              placeholder={googlePostType === 'OFFER' ? 'e.g. 20% Off Gel Manicures' : 'e.g. Grand Opening Event'}
              maxLength={58}
              size={inputSize}
              suffix={<Text type="secondary" style={{ fontSize: 10 }}>{googleTitle.length}/58</Text>}
              style={{ marginTop: 2 }}
            />
          </div>

          {/* Start date/time */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Text style={{ fontSize, color: '#475569' }}>Start date *</Text>
              <DatePicker
                value={googleStartDate ? dayjs(googleStartDate) : null}
                onChange={(d) => update('googleStartDate', d ? d.format('YYYY-MM-DD') : '')}
                size={inputSize}
                style={{ width: '100%', marginTop: 2 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Text style={{ fontSize, color: '#475569' }}>Start time</Text>
              <TimePicker
                value={googleStartTime ? dayjs(googleStartTime, 'HH:mm') : null}
                onChange={(t) => update('googleStartTime', t ? t.format('HH:mm') : '')}
                format="h:mm A"
                use12Hours
                minuteStep={15}
                size={inputSize}
                style={{ width: '100%', marginTop: 2 }}
              />
            </div>
          </div>

          {/* End date/time */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Text style={{ fontSize, color: '#475569' }}>End date *</Text>
              <DatePicker
                value={googleEndDate ? dayjs(googleEndDate) : null}
                onChange={(d) => update('googleEndDate', d ? d.format('YYYY-MM-DD') : '')}
                size={inputSize}
                style={{ width: '100%', marginTop: 2 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Text style={{ fontSize, color: '#475569' }}>End time</Text>
              <TimePicker
                value={googleEndTime ? dayjs(googleEndTime, 'HH:mm') : null}
                onChange={(t) => update('googleEndTime', t ? t.format('HH:mm') : '')}
                format="h:mm A"
                use12Hours
                minuteStep={15}
                size={inputSize}
                style={{ width: '100%', marginTop: 2 }}
              />
            </div>
          </div>

          {/* Offer-specific fields */}
          {googlePostType === 'OFFER' && (
            <Collapse
              size="small"
              ghost
              items={[{
                key: 'offer-details',
                label: <Text style={{ fontSize: 11, color: '#64748B' }}>+ Add more details (coupon, terms, link)</Text>,
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <Text style={{ fontSize, color: '#475569' }}>Coupon code</Text>
                      <Input
                        value={googleCouponCode}
                        onChange={(e) => update('googleCouponCode', e.target.value)}
                        placeholder="e.g. SPRING20"
                        size={inputSize}
                        style={{ marginTop: 2 }}
                      />
                    </div>
                    <div>
                      <Text style={{ fontSize, color: '#475569' }}>Link to redeem offer</Text>
                      <Input
                        value={googleRedeemUrl}
                        onChange={(e) => update('googleRedeemUrl', e.target.value)}
                        placeholder="https://..."
                        size={inputSize}
                        style={{ marginTop: 2 }}
                      />
                    </div>
                    <div>
                      <Text style={{ fontSize, color: '#475569' }}>Terms & conditions</Text>
                      <Input.TextArea
                        value={googleTerms}
                        onChange={(e) => update('googleTerms', e.target.value)}
                        placeholder="e.g. Limit one per customer. Valid in-store only."
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        style={{ fontSize: compact ? 11 : 13, marginTop: 2 }}
                      />
                    </div>
                  </div>
                ),
              }]}
            />
          )}

          {/* CTA Button — for Event posts */}
          {googlePostType === 'EVENT' && (
            <div>
              <Text style={{ fontSize, color: '#475569' }}>Button</Text>
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <Select
                  value={googleCtaType || ''}
                  onChange={(v) => update('googleCtaType', v)}
                  options={CTA_OPTIONS}
                  size={inputSize}
                  style={{ width: 140 }}
                />
                {googleCtaType && googleCtaType !== 'CALL' && (
                  <Input
                    value={googleCtaUrl}
                    onChange={(e) => update('googleCtaUrl', e.target.value)}
                    placeholder="https://..."
                    size={inputSize}
                    style={{ flex: 1 }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

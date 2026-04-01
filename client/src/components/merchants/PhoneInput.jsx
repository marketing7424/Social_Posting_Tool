import { Input } from 'antd';

function formatPhone(digits) {
  if (!digits) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function stripNonDigits(str) {
  const digits = (str || '').replace(/\D/g, '');
  // If more than 10 digits (has country code), take rightmost 10
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export default function PhoneInput({ value, onChange, ...rest }) {
  const digits = stripNonDigits(value);
  const display = formatPhone(digits);

  const handleChange = (e) => {
    const newDigits = stripNonDigits(e.target.value);
    if (onChange) onChange(newDigits);
  };

  return (
    <Input
      {...rest}
      value={display}
      onChange={handleChange}
      placeholder="(555) 123-4567"
      maxLength={18}
    />
  );
}

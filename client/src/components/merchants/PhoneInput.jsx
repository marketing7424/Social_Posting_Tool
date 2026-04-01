import { Input } from 'antd';

function formatPhone(digits) {
  if (!digits) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function stripNonDigits(str) {
  return (str || '').replace(/\D/g, '').slice(0, 10);
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

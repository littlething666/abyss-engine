import * as React from 'react';

interface NativeSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  value: string;
  options: NativeSelectOption[];
  placeholder: string;
  onValueChange: (value: string) => void;
}

export function NativeSelect({ value, options, placeholder, onValueChange, className = '', ...props }: NativeSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={`rounded bg-slate-900 border border-slate-700 px-2 py-1 w-full ${className}`}
      {...props}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}


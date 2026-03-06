import * as React from 'react';

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value' | 'defaultValue'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, onCheckedChange, className = '', ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-cyan-500' : 'bg-slate-600'} ${className}`}
      {...props}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`}
      />
    </button>
  );
}


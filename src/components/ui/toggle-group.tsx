import * as React from 'react';

interface ToggleContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const ToggleGroupContext = React.createContext<ToggleContextValue | null>(null);

interface ToggleGroupProps {
  type?: 'single' | 'multiple';
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function ToggleGroup({
  type = 'single',
  value,
  onValueChange,
  className = '',
  children,
}: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div
        role={type === 'single' ? 'radiogroup' : 'group'}
        className={`inline-flex rounded-md overflow-hidden border border-slate-700 ${className}`}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

interface ToggleGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function ToggleGroupItem({ value, className = '', children, ...props }: ToggleGroupItemProps) {
  const group = React.useContext(ToggleGroupContext);
  const isSelected = group?.value === value;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={`px-3 py-1 border-r border-slate-700 last:border-r-0 transition-colors ${isSelected ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-200'} ${className}`}
      onClick={() => group?.onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  );
}


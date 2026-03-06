import * as React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ className = '', variant = 'default', size = 'md', ...props }: ButtonProps) {
  const baseClass = 'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClass =
    variant === 'outline'
      ? 'bg-transparent border border-slate-600 text-slate-200 hover:bg-slate-700'
      : variant === 'ghost'
        ? 'bg-transparent text-slate-200 hover:bg-slate-700'
        : variant === 'destructive'
          ? 'bg-red-600 hover:bg-red-500 text-white'
          : 'bg-violet-500 hover:bg-violet-400 text-white';
  const sizeClass =
    size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm';

  return <button className={`${baseClass} ${variantClass} ${sizeClass} ${className}`} {...props} />;
}


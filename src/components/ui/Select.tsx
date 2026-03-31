import React, { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  className?: string;
}

export const Select: React.FC<SelectProps> = ({ label, error, options, className, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</label>}
    <select 
      className={cn(
        'w-full px-4 py-2 bg-white border border-gray-200 rounded-lg outline-none transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer',
        error && 'border-red-500 focus:ring-red-500',
        className
      )}
      {...props}
    >
      <option value="">Select an option</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

import React, { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</label>}
    <input 
      className={cn(
        'w-full px-4 py-2 bg-white border border-gray-200 rounded-lg outline-none transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
        error && 'border-red-500 focus:ring-red-500',
        className
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

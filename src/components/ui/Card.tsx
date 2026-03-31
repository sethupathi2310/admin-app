import React from 'react';
import { cn } from '../../lib/utils';

export const Card = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    className={cn('bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden', className)} 
    {...props}
  >
    {children}
  </div>
);

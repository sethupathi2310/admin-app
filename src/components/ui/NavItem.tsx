import React from 'react';
import { cn } from '../../lib/utils';

interface NavItemProps {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  collapsed: boolean;
}

const NavItem = ({ active, onClick, icon: Icon, label, collapsed }: NavItemProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all relative group',
        active 
          ? 'bg-indigo-50 text-indigo-600' 
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
        collapsed ? 'justify-center px-2' : 'justify-start'
      )}
    >
      <Icon size={18} className="flex-shrink-0" />
      {!collapsed && (
        <span className="truncate opacity-100 transition-opacity duration-300">
          {label}
        </span>
      )}
      
      {collapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-[100]">
          {label}
        </div>
      )}
    </button>
  );
};

export default NavItem;

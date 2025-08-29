'use client';

import React from 'react';

interface CapsuleSwitchOption {
  label: string;
  value: string;
}

interface CapsuleSwitchProps {
  options: CapsuleSwitchOption[];
  active: string;
  onChange: (value: string) => void;
}

const CapsuleSwitch: React.FC<CapsuleSwitchProps> = ({
  options,
  active,
  onChange,
}) => {
  return (
    <div className='flex items-center space-x-1 bg-gray-200/80 dark:bg-gray-700/80 p-1 rounded-full'>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-all duration-200 ${active === option.value
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
              : 'bg-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default CapsuleSwitch;

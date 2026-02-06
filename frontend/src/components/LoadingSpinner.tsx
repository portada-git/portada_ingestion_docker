/**
 * Loading spinner component
 * Reusable loading indicator with different sizes and accessibility features
 */

import React from 'react';
import clsx from 'clsx';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
  overlay?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className,
  label = 'Cargando...',
  overlay = false
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const spinner = (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-gray-300 border-t-primary-600',
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label={label}
    />
  );

  if (overlay) {
    return (
      <div 
        className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <div className="flex flex-col items-center space-y-4">
          {spinner}
          <span className="text-sm text-gray-600 font-medium">
            {label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center" role="status" aria-live="polite">
      {spinner}
      <span className="sr-only">{label}</span>
    </div>
  );
};

export default LoadingSpinner;

// Loading skeleton component for better UX
export const LoadingSkeleton: React.FC<{
  lines?: number;
  className?: string;
}> = ({ lines = 3, className }) => {
  return (
    <div className={clsx('animate-pulse space-y-3', className)} role="status" aria-label="Cargando contenido">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={clsx(
            'h-4 bg-gray-200 rounded',
            index === lines - 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
      <span className="sr-only">Cargando contenido...</span>
    </div>
  );
};

// Loading button component
export const LoadingButton: React.FC<{
  loading: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary';
}> = ({ 
  loading, 
  children, 
  className, 
  disabled, 
  onClick, 
  type = 'button',
  variant = 'primary'
}) => {
  const baseClasses = 'inline-flex items-center justify-center px-4 py-2 border text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'border-transparent text-white bg-primary-600 hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-primary-500'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(baseClasses, variantClasses[variant], className)}
      aria-disabled={disabled || loading}
    >
      {loading && (
        <LoadingSpinner 
          size="sm" 
          className="mr-2" 
          label="Procesando"
        />
      )}
      {children}
    </button>
  );
};
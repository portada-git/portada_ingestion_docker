/**
 * Modern Results Card Component
 * Provides consistent styling for displaying query results
 */

import React from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { clsx } from 'clsx';

interface ResultsCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

interface InfoMessageProps {
  message: string;
  type?: 'info' | 'success' | 'warning';
  className?: string;
}

interface EmptyStateProps {
  message: string;
  className?: string;
}

export const ResultsCard: React.FC<ResultsCardProps> = ({
  title,
  children,
  className
}) => {
  return (
    <div className={clsx(
      'bg-slate-100 border border-slate-200 rounded-2xl p-6',
      className
    )}>
      {title && (
        <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
};

export const InfoMessage: React.FC<InfoMessageProps> = ({
  message,
  type = 'info',
  className
}) => {
  const icons = {
    info: Info,
    success: CheckCircle,
    warning: AlertCircle
  };

  const colors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
  };

  const iconColors = {
    info: 'text-blue-500',
    success: 'text-green-500',
    warning: 'text-yellow-500'
  };

  const Icon = icons[type];

  return (
    <div className={clsx(
      'flex items-start p-4 border rounded-xl',
      colors[type],
      className
    )}>
      <Icon className={clsx('w-5 h-5 mr-3 mt-0.5 flex-shrink-0', iconColors[type])} />
      <p className="text-sm leading-relaxed">{message}</p>
    </div>
  );
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  className
}) => {
  return (
    <div className={clsx(
      'text-center py-12',
      className
    )}>
      <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
        <AlertCircle className="w-8 h-8 text-slate-400" />
      </div>
      <p className="text-slate-600 text-lg">{message}</p>
    </div>
  );
};

export default ResultsCard;
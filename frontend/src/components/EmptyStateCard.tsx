/**
 * Enhanced Empty State Card Component
 * Provides different types of empty states with appropriate messaging and actions
 */

import React from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  Database, 
  Search, 
  ArrowRight,
  Info
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';

export type EmptyStateType = 
  | 'no-data'        // No data has been processed yet
  | 'no-results'     // Query returned empty results
  | 'no-duplicates'  // Specifically no duplicates found (positive result)
  | 'search'         // Initial state, ready to search
  | 'error';         // Error state

interface EmptyStateCardProps {
  type: EmptyStateType;
  title?: string;
  description?: string;
  actionText?: string;
  actionPath?: string;
  onAction?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  showBackground?: boolean;
}

const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  type,
  title,
  description,
  actionText,
  actionPath,
  onAction,
  icon: CustomIcon,
  className,
  showBackground = true
}) => {
  const navigate = useNavigate();

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else if (actionPath) {
      navigate(actionPath);
    }
  };

  const getStateConfig = () => {
    switch (type) {
      case 'no-data':
        return {
          icon: Database,
          iconColor: 'text-blue-500',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          titleColor: 'text-blue-900',
          descriptionColor: 'text-blue-700',
          actionColor: 'btn-primary'
        };
      case 'no-results':
        return {
          icon: Search,
          iconColor: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          titleColor: 'text-gray-900',
          descriptionColor: 'text-gray-600',
          actionColor: 'btn-secondary'
        };
      case 'no-duplicates':
        return {
          icon: CheckCircle,
          iconColor: 'text-green-500',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          titleColor: 'text-green-900',
          descriptionColor: 'text-green-700',
          actionColor: 'btn-success'
        };
      case 'search':
        return {
          icon: Search,
          iconColor: 'text-indigo-500',
          bgColor: 'bg-indigo-50',
          borderColor: 'border-indigo-200',
          titleColor: 'text-indigo-900',
          descriptionColor: 'text-indigo-700',
          actionColor: 'btn-primary'
        };
      case 'error':
        return {
          icon: AlertCircle,
          iconColor: 'text-red-500',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          titleColor: 'text-red-900',
          descriptionColor: 'text-red-700',
          actionColor: 'btn-danger'
        };
      default:
        return {
          icon: Info,
          iconColor: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          titleColor: 'text-gray-900',
          descriptionColor: 'text-gray-600',
          actionColor: 'btn-secondary'
        };
    }
  };

  const config = getStateConfig();
  const Icon = CustomIcon || config.icon;

  return (
    <div className={clsx(
      'rounded-xl p-8 text-center',
      showBackground && [
        'border',
        config.bgColor,
        config.borderColor
      ],
      className
    )}>
      <div className={clsx(
        'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
        showBackground ? 'bg-white shadow-sm' : config.bgColor
      )}>
        <Icon className={clsx('w-8 h-8', config.iconColor)} />
      </div>
      
      {title && (
        <h3 className={clsx(
          'text-lg font-semibold mb-2',
          config.titleColor
        )}>
          {title}
        </h3>
      )}
      
      {description && (
        <p className={clsx(
          'text-sm leading-relaxed mb-6 max-w-md mx-auto',
          config.descriptionColor
        )}>
          {description}
        </p>
      )}
      
      {(actionText || actionPath) && (
        <button
          onClick={handleAction}
          className={clsx(
            'btn inline-flex items-center',
            config.actionColor
          )}
        >
          {actionText}
          {actionPath && <ArrowRight className="w-4 h-4 ml-2" />}
        </button>
      )}
    </div>
  );
};

// Specialized components for common use cases
export const NoDataState: React.FC<Omit<EmptyStateCardProps, 'type'>> = (props) => (
  <EmptyStateCard type="no-data" {...props} />
);

export const NoResultsState: React.FC<Omit<EmptyStateCardProps, 'type'>> = (props) => (
  <EmptyStateCard type="no-results" {...props} />
);

export const NoDuplicatesState: React.FC<Omit<EmptyStateCardProps, 'type'>> = (props) => (
  <EmptyStateCard type="no-duplicates" {...props} />
);

export const SearchState: React.FC<Omit<EmptyStateCardProps, 'type'>> = (props) => (
  <EmptyStateCard type="search" {...props} />
);

export const ErrorState: React.FC<Omit<EmptyStateCardProps, 'type'>> = (props) => (
  <EmptyStateCard type="error" {...props} />
);

export default EmptyStateCard;
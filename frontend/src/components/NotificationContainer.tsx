/**
 * Notification container component
 * Displays toast notifications with accessibility features and auto-dismiss
 */

import React, { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { useNotificationStore } from '../store/useStore';
import { ApiErrorHandler } from '../utils/apiErrorHandler';
import clsx from 'clsx';

interface NotificationItemProps {
  notification: {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    timestamp: Date;
  };
  onRemove: (id: string) => void;
  duration?: number;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ 
  notification, 
  onRemove,
  duration = 5000 
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    // Start progress bar animation
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
    }, 50);

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      setIsExiting(true);
      // Wait for exit animation before removing
      setTimeout(() => onRemove(notification.id), 300);
    }, duration);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [notification.id, onRemove, duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(notification.id), 300);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" aria-hidden="true" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" aria-hidden="true" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" aria-hidden="true" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-400" aria-hidden="true" />;
    }
  };

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getProgressColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-400';
      case 'error':
        return 'bg-red-400';
      case 'warning':
        return 'bg-yellow-400';
      case 'info':
      default:
        return 'bg-blue-400';
    }
  };

  return (
    <div
      className={clsx(
        'rounded-lg border shadow-lg transition-all duration-300 ease-in-out overflow-hidden',
        getBackgroundColor(notification.type),
        isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      )}
      role="alert"
      aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getIcon(notification.type)}
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-gray-900">
              {notification.title}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {notification.message}
            </p>
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={handleClose}
              className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500 focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 rounded transition-colors"
              aria-label={`Cerrar notificación: ${notification.title}`}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className={clsx(
            'h-full transition-all duration-100 ease-linear',
            getProgressColor(notification.type)
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotificationStore();

  // Set up the error handler callback
  useEffect(() => {
    ApiErrorHandler.setNotificationCallback((notification) => {
      useNotificationStore.getState().addNotification(notification);
    });
  }, []);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div 
      className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full"
      role="region"
      aria-label="Notificaciones"
      aria-live="polite"
    >
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
          duration={5000}
        />
      ))}
    </div>
  );
};

export default NotificationContainer;
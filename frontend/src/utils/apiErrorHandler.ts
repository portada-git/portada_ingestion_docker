/**
 * API Error Handler Utility
 * Provides centralized error handling and user-friendly error messages
 */

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export interface ErrorNotification {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  duration?: number;
}

export class ApiErrorHandler {
  private static notificationCallback?: (notification: ErrorNotification) => void;

  static setNotificationCallback(callback: (notification: ErrorNotification) => void) {
    this.notificationCallback = callback;
  }

  static handleError(error: ApiError): ErrorNotification {
    let notification: ErrorNotification;

    if (error.status) {
      switch (error.status) {
        case 400:
          notification = {
            title: 'Invalid Request',
            message: error.message || 'The request contains invalid data. Please check your input and try again.',
            type: 'error',
            duration: 5000
          };
          break;
        case 401:
          notification = {
            title: 'Authentication Required',
            message: 'Your session has expired. Please log in again.',
            type: 'warning',
            duration: 5000
          };
          break;
        case 403:
          notification = {
            title: 'Access Denied',
            message: 'You do not have permission to perform this action.',
            type: 'error',
            duration: 5000
          };
          break;
        case 404:
          notification = {
            title: 'Not Found',
            message: 'The requested resource could not be found.',
            type: 'error',
            duration: 5000
          };
          break;
        case 409:
          notification = {
            title: 'Conflict',
            message: error.message || 'A conflict occurred. Please try again.',
            type: 'warning',
            duration: 5000
          };
          break;
        case 422:
          notification = {
            title: 'Validation Error',
            message: this.formatValidationError(error),
            type: 'error',
            duration: 7000
          };
          break;
        case 429:
          notification = {
            title: 'Too Many Requests',
            message: 'You are making requests too quickly. Please wait a moment and try again.',
            type: 'warning',
            duration: 5000
          };
          break;
        case 500:
          notification = {
            title: 'Server Error',
            message: 'An internal server error occurred. Please try again later.',
            type: 'error',
            duration: 5000
          };
          break;
        case 502:
        case 503:
        case 504:
          notification = {
            title: 'Service Unavailable',
            message: 'The service is temporarily unavailable. Please try again later.',
            type: 'error',
            duration: 5000
          };
          break;
        default:
          notification = {
            title: 'Request Failed',
            message: error.message || `Request failed with status ${error.status}`,
            type: 'error',
            duration: 5000
          };
      }
    } else {
      // Network or other errors
      if (error.message.includes('Network error')) {
        notification = {
          title: 'Connection Error',
          message: 'Unable to connect to the server. Please check your internet connection and try again.',
          type: 'error',
          duration: 5000
        };
      } else if (error.message.includes('timeout')) {
        notification = {
          title: 'Request Timeout',
          message: 'The request took too long to complete. Please try again.',
          type: 'warning',
          duration: 5000
        };
      } else {
        notification = {
          title: 'Unexpected Error',
          message: error.message || 'An unexpected error occurred. Please try again.',
          type: 'error',
          duration: 5000
        };
      }
    }

    // Call notification callback if set
    if (this.notificationCallback) {
      this.notificationCallback(notification);
    }

    return notification;
  }

  private static formatValidationError(error: ApiError): string {
    // Handle new structured error format from backend
    if (error.details && error.details.errors && Array.isArray(error.details.errors)) {
      return error.details.errors.join('. ');
    }
    
    // Handle specific error codes from backend
    if (error.details && error.details.error_code) {
      switch (error.details.error_code) {
        case 'PUBLICATION_REQUIRED':
          return 'Please select a publication before uploading extraction data files.';
        case 'ENTITY_NAME_REQUIRED':
          return 'Please provide an entity name for known entities ingestion.';
        case 'FILE_REQUIRED':
          return 'Please select a file to upload.';
        case 'FILE_VALIDATION_ERROR':
          if (error.details.errors && Array.isArray(error.details.errors)) {
            return error.details.errors.join('. ');
          }
          return 'The selected file is invalid. Please check the file format and try again.';
        case 'VALIDATION_ERROR':
          if (error.details.errors && Array.isArray(error.details.errors)) {
            return error.details.errors.join('. ');
          }
          return 'Please check your input and try again.';
        default:
          break;
      }
    }
    
    // Handle FastAPI validation errors format
    if (error.details && Array.isArray(error.details)) {
      const messages = error.details.map((detail: any) => {
        const field = detail.loc ? detail.loc.join('.') : 'field';
        return `${field}: ${detail.msg}`;
      });
      return messages.join(', ');
    }
    
    // Handle simple error message
    if (error.details && error.details.message) {
      return error.details.message;
    }
    
    return error.message || 'Validation failed. Please check your input.';
  }

  static createSuccessNotification(message: string, title = 'Success'): ErrorNotification {
    const notification: ErrorNotification = {
      title,
      message,
      type: 'info',
      duration: 3000
    };

    if (this.notificationCallback) {
      this.notificationCallback(notification);
    }

    return notification;
  }

  static createInfoNotification(message: string, title = 'Information'): ErrorNotification {
    const notification: ErrorNotification = {
      title,
      message,
      type: 'info',
      duration: 4000
    };

    if (this.notificationCallback) {
      this.notificationCallback(notification);
    }

    return notification;
  }
}

// Utility function for async operations with error handling
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  customErrorHandler?: (error: ApiError) => void
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const apiError = error as ApiError;
    
    if (customErrorHandler) {
      customErrorHandler(apiError);
    } else {
      ApiErrorHandler.handleError(apiError);
    }
    
    return null;
  }
}
/**
 * Session management hook
 * Handles token refresh, session timeout, and automatic logout
 */

import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { useNotificationStore } from '../store/useStore';

interface UseSessionOptions {
  refreshThreshold?: number; // Minutes before expiry to refresh
  warningThreshold?: number; // Minutes before expiry to show warning
  checkInterval?: number; // Minutes between session checks
}

export const useSession = (options: UseSessionOptions = {}) => {
  const {
    refreshThreshold = 5,
    warningThreshold = 2,
    checkInterval = 5 // Increased to 5 minutes to reduce API calls
  } = options;

  const { user, isAuthenticated, logout, checkAuthStatus, validateTokenWithServer } = useAuth();
  const { addNotification } = useNotificationStore();
  const intervalRef = useRef<number | null>(null);
  const warningShownRef = useRef(false);
  const lastCheckRef = useRef<number>(0);

  const getTokenExpiryTime = useCallback(() => {
    if (!user?.access_token) return null;
    
    try {
      // Decode JWT token to get expiry time
      const payload = JSON.parse(atob(user.access_token.split('.')[1]));
      return payload.exp ? new Date(payload.exp * 1000) : null;
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }, [user?.access_token]);

  const getMinutesUntilExpiry = useCallback(() => {
    const expiryTime = getTokenExpiryTime();
    if (!expiryTime) return null;
    
    const now = new Date();
    const diffMs = expiryTime.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60));
  }, [getTokenExpiryTime]);

  const handleSessionExpiry = useCallback(async () => {
    addNotification({
      type: 'warning',
      title: 'Sesión expirada',
      message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
    });
    await logout();
  }, [addNotification, logout]);

  const showExpiryWarning = useCallback(() => {
    if (warningShownRef.current) return;
    
    warningShownRef.current = true;
    addNotification({
      type: 'warning',
      title: 'Sesión por expirar',
      message: `Tu sesión expirará en ${warningThreshold} minutos. Guarda tu trabajo.`,
    });
  }, [addNotification, warningThreshold]);

  const checkSession = useCallback(async () => {
    if (!isAuthenticated) return;

    // Prevent too frequent checks
    const now = Date.now();
    if (now - lastCheckRef.current < 60000) { // Minimum 1 minute between checks
      return;
    }
    lastCheckRef.current = now;

    const minutesLeft = getMinutesUntilExpiry();
    
    if (minutesLeft === null) {
      // Can't determine expiry, do a simple token check without API call
      const isValid = await checkAuthStatus();
      if (!isValid) {
        await handleSessionExpiry();
      }
      return;
    }

    if (minutesLeft <= 0) {
      // Token expired
      await handleSessionExpiry();
    } else if (minutesLeft <= warningThreshold) {
      // Show warning
      showExpiryWarning();
    } else if (minutesLeft <= refreshThreshold) {
      // Only validate with server if we're close to expiry and haven't checked recently
      try {
        const isValid = await validateTokenWithServer();
        if (!isValid) {
          await handleSessionExpiry();
        } else {
          // Reset warning flag if session was refreshed
          warningShownRef.current = false;
        }
      } catch (error) {
        console.error('Session refresh failed:', error);
        // Don't logout on network errors, just log the error
      }
    }
  }, [
    isAuthenticated,
    getMinutesUntilExpiry,
    checkAuthStatus,
    validateTokenWithServer,
    handleSessionExpiry,
    showExpiryWarning,
    refreshThreshold,
    warningThreshold
  ]);

  // Start session monitoring
  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      warningShownRef.current = false;
      lastCheckRef.current = 0;
      return;
    }

    // Initial check after a delay to avoid immediate API call
    const initialTimeout = setTimeout(() => {
      checkSession();
    }, 5000); // 5 second delay

    // Set up periodic checks
    intervalRef.current = setInterval(checkSession, checkInterval * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, checkInterval]); // Removed checkSession from dependencies to prevent recreation

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    minutesUntilExpiry: getMinutesUntilExpiry(),
    isSessionValid: isAuthenticated,
    checkSession,
  };
};
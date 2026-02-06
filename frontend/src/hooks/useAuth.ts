/**
 * Custom authentication hook
 * Provides authentication utilities and state management
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useStore';
import { apiService } from '../services/api';

export const useAuth = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, login, logout, setUser } = useAuthStore();

  const handleLogin = useCallback(async (username: string) => {
    try {
      await login(username);
      navigate('/dashboard');
    } catch (error) {
      throw error; // Re-throw to let the component handle the error
    }
  }, [login, navigate]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, redirect to login
      navigate('/login');
    }
  }, [logout, navigate]);

  const checkAuthStatus = useCallback(async () => {
    if (!isAuthenticated || !user) {
      return false;
    }

    try {
      // Only check if token exists and is not expired
      const token = localStorage.getItem('access_token');
      if (!token) {
        await handleLogout();
        return false;
      }

      // Check token expiry without making API call
      // SKIPPED: Token is an API Key (username), not a JWT.
      // We rely on validateTokenWithServer for actual validation.
      return true;

      /*
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiryTime = payload.exp ? new Date(payload.exp * 1000) : null;
        
        if (expiryTime && expiryTime.getTime() <= Date.now()) {
          // Token expired
          await handleLogout();
          return false;
        }
        
        return true;
      } catch (tokenError) {
        // Invalid token format
        await handleLogout();
        return false;
      }
      */
    } catch (error) {
      console.error('Auth check failed:', error);
      await handleLogout();
      return false;
    }
  }, [isAuthenticated, user, handleLogout]);

  const validateTokenWithServer = useCallback(async () => {
    if (!isAuthenticated || !user) {
      return false;
    }

    try {
      const currentUser = await apiService.getCurrentUser();
      if (currentUser) {
        setUser({ ...user, ...currentUser });
        return true;
      }
    } catch (error) {
      console.error('Server auth validation failed:', error);
      await handleLogout();
      return false;
    }

    return false;
  }, [isAuthenticated, user, setUser, handleLogout]);

  const hasPermission = useCallback((permission: string) => {
    return user?.permissions?.includes(permission) || false;
  }, [user]);

  const hasRole = useCallback((role: string) => {
    return user?.role === role;
  }, [user]);

  return {
    user,
    isAuthenticated,
    login: handleLogin,
    logout: handleLogout,
    checkAuthStatus,
    validateTokenWithServer,
    hasPermission,
    hasRole,
  };
};
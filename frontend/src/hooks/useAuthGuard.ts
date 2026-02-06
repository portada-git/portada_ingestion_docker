/**
 * Authentication guard hook
 * Handles route protection and authentication state validation
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

interface UseAuthGuardOptions {
  redirectTo?: string;
  requiredPermission?: string;
  requiredRole?: string;
}

export const useAuthGuard = (options: UseAuthGuardOptions = {}) => {
  const { redirectTo = '/login', requiredPermission, requiredRole } = options;
  const { isAuthenticated, checkAuthStatus, hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const hasValidatedRef = useRef(false);

  useEffect(() => {
    const validateAuth = async () => {
      // Prevent multiple validations
      if (hasValidatedRef.current) {
        return;
      }

      setIsLoading(true);

      try {
        // Check if user is authenticated
        if (!isAuthenticated) {
          navigate(redirectTo, { 
            state: { from: location.pathname },
            replace: true 
          });
          setIsLoading(false);
          return;
        }

        // Only verify authentication status if we haven't validated yet
        // and avoid making API calls on every render
        const isValid = await checkAuthStatus();
        if (!isValid) {
          navigate(redirectTo, { 
            state: { from: location.pathname },
            replace: true 
          });
          setIsLoading(false);
          return;
        }

        // Check permissions if required
        if (requiredPermission && !hasPermission(requiredPermission)) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        // Check role if required
        if (requiredRole && !hasRole(requiredRole)) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        hasValidatedRef.current = true;
        setIsAuthorized(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Auth validation error:', error);
        // On any error, redirect to login
        navigate(redirectTo, { 
          state: { from: location.pathname },
          replace: true 
        });
        setIsLoading(false);
      }
    };

    // Only validate if not already authenticated or if route changed
    if (!isAuthenticated || !hasValidatedRef.current) {
      validateAuth();
    } else {
      // If already authenticated and validated, just check permissions
      const hasRequiredPermission = !requiredPermission || hasPermission(requiredPermission);
      const hasRequiredRole = !requiredRole || hasRole(requiredRole);
      
      if (!hasRequiredPermission || !hasRequiredRole) {
        setIsAuthorized(false);
        setIsLoading(false);
        return;
      }
      
      setIsAuthorized(true);
      setIsLoading(false);
    }
  }, [
    isAuthenticated,
    requiredPermission,
    requiredRole,
    location.pathname // Only re-validate when route changes
  ]);

  // Reset validation when authentication state changes
  useEffect(() => {
    if (!isAuthenticated) {
      hasValidatedRef.current = false;
      setIsAuthorized(false);
    }
  }, [isAuthenticated]);

  return {
    isLoading,
    isAuthorized,
    isAuthenticated,
  };
};
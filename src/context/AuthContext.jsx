import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../utils/apiClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch current user from /api/users/me
  const fetchCurrentUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get('/api/users/me');
      if (response?.data) {
        setUser(response.data);
        localStorage.setItem('userRole', response.data.role);
        localStorage.setItem('userId', response.data._id);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.warn('Failed to fetch current user session:', err.message);
      setUser(null);
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // Sign In with Email & Password
  const login = async (email, password) => {
    const response = await apiClient.post('/api/users/login', { email, password });
    if (response?.data?.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.user?.id || response.data.user?._id);
      localStorage.setItem('userRole', response.data.user?.role || 'candidate');
      await fetchCurrentUser();
    }
    return response;
  };

  // Sign In with Google OAuth ID Token
  const loginWithGoogle = async (credential) => {
    const response = await apiClient.post('/api/users/google-login', { credential });
    if (response?.data?.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.user?.id || response.data.user?._id);
      localStorage.setItem('userRole', response.data.user?.role || 'candidate');
      await fetchCurrentUser();
    }
    return response;
  };

  // Register New Candidate Account
  const register = async (userData) => {
    const response = await apiClient.post('/api/users/register', userData);
    if (response?.data?.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.user?.id || response.data.user?._id);
      localStorage.setItem('userRole', response.data.user?.role || 'candidate');
      await fetchCurrentUser();
    }
    return response;
  };

  // Sign Out
  const logout = async () => {
    try {
      await apiClient.post('/api/users/logout', {});
    } catch (e) {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      setUser(null);
      window.location.href = '/login';
    }
  };

  const role = user?.role || 'guest';
  const isAuthenticated = Boolean(user);

  const value = {
    user,
    role,
    isAuthenticated,
    loading,
    login,
    loginWithGoogle,
    register,
    logout,
    refreshUser: fetchCurrentUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

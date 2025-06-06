// src/context/UserContext.tsx
'use client';

import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { usePrivy } from '@privy-io/react-auth';

// Define User type directly here to avoid import conflicts
interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  level: number;
  experience: number;
  balance: number;
  tier: number;
  joinedAt: string;
  badge?: string; // Added optional badge property
}

interface UserContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  userLevel: number;
  experience: number;
  crates: number;
  isLoggedIn: boolean;
  setUsername: (username: string) => void;
  hasCustomUsername: boolean;
}

const defaultContext: UserContextType = {
  currentUser: null,
  isAuthenticated: false,
  login: async () => false,
  logout: () => {},
  register: async () => false,
  userLevel: 2,
  experience: 67,
  crates: 4,
  isLoggedIn: false,
  setUsername: () => {},
  hasCustomUsername: false,
};

// Create and export the context
export const UserContext = createContext<UserContextType>(defaultContext);

// Export a hook to use the context
export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCustomUsername, setHasCustomUsername] = useState(false);
  const userLevel = 2;
  const experience = 67;
  const crates = 4;
  
  const { authenticated, user } = usePrivy();
  
  // Update isLoggedIn based on Privy authentication state
  const isLoggedIn = authenticated;
  
  // Initialize user when Privy authentication changes
  useEffect(() => {
    if (authenticated && user) {
      // Try to get saved username
      const savedUsername = localStorage.getItem(`username_${user.id}`);
      
      const defaultUsername = user.email?.address?.split('@')[0] || `user${Date.now().toString().slice(-4)}`;
      
      const demoUser: User = {
        id: user.id || 'demo-user',
        username: savedUsername || defaultUsername,
        email: user.email?.address || 'demo@example.com',
        avatar: '👑',
        level: 2,
        experience: 67,
        balance: 0,
        tier: 2,
        joinedAt: new Date().toISOString(),
        badge: 'verified', // Added badge property - you can set logic for different badge types
      };
      
      setCurrentUser(demoUser);
      setIsAuthenticated(true);
      setHasCustomUsername(!!savedUsername);
    } else {
      // Reset when logged out
      setCurrentUser(null);
      setIsAuthenticated(false);
      setHasCustomUsername(false);
    }
  }, [authenticated, user]);
  
  // Function to set username for users
  const setUsername = (username: string) => {
    if (!authenticated || !user) return;
    
    // Save username to localStorage
    localStorage.setItem(`username_${user.id}`, username);
    
    // Update current user with new username
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        username
      };
      setCurrentUser(updatedUser);
    }
    
    setHasCustomUsername(true);
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    // Mock login functionality - this is handled by Privy
    if (username && password) {
      const user: User = {
        id: 'user-1',
        username,
        email: `${username}@example.com`,
        avatar: '👑',
        level: 2,
        experience: 67,
        balance: 0,
        tier: 2,
        joinedAt: new Date().toISOString(),
        badge: 'verified', // Added badge property
      };
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      
      return true;
    }
    
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  const register = async (username: string, email: string, password: string): Promise<boolean> => {
    // Mock registration
    if (username && email && password) {
      const user: User = {
        id: `user-${Date.now()}`,
        username,
        email,
        avatar: '👤',
        level: 1,
        experience: 0,
        balance: 0,
        tier: 1,
        joinedAt: new Date().toISOString(),
        badge: 'new', // Added badge property - new users get 'new' badge
      };
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      
      return true;
    }
    
    return false;
  };

  return (
    <UserContext.Provider value={{
      currentUser,
      isAuthenticated: authenticated,
      login,
      logout,
      register,
      userLevel,
      experience,
      crates,
      isLoggedIn,
      setUsername,
      hasCustomUsername,
    }}>
      {children}
    </UserContext.Provider>
  );
};
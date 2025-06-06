// src/context/UserContext.tsx
'use client';

import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserAPI, UserData } from '../services/api';

// Use the UserData interface from your API that matches the database schema
interface UserContextType {
  currentUser: UserData | null;
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
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const defaultContext: UserContextType = {
  currentUser: null,
  isAuthenticated: false,
  login: async () => false,
  logout: () => {},
  register: async () => false,
  userLevel: 1,
  experience: 0,
  crates: 0,
  isLoggedIn: false,
  setUsername: () => {},
  hasCustomUsername: false,
  loading: false,
  refreshUser: async () => {},
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
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCustomUsername, setHasCustomUsername] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  
  // Get wallet address
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // Update isLoggedIn based on Privy authentication state
  const isLoggedIn = authenticated;
  
  // Get real user level and experience from database
  const userLevel = currentUser?.level || 1;
  const experience = currentUser?.experience_points || 0;
  const crates = 0; // Remove crates system or implement if needed
  
  // Function to fetch user data from database
  const fetchUserData = async (walletAddr: string) => {
    if (!walletAddr) return null;
    
    try {
      setLoading(true);
      console.log('🔄 Fetching user data from database for wallet:', walletAddr);
      
      // Use your UserAPI to get or create user
      const userData = await UserAPI.getUserOrCreate(walletAddr);
      
      if (userData) {
        console.log('✅ Fetched user data:', userData);
        setCurrentUser(userData);
        setHasCustomUsername(!!userData.username && userData.username !== `user_${userData.id.slice(-8)}`);
        return userData;
      }
    } catch (error) {
      console.error('❌ Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
    
    return null;
  };
  
  // Function to refresh user data
  const refreshUser = async () => {
    if (walletAddress) {
      await fetchUserData(walletAddress);
    }
  };
  
  // Initialize user when Privy authentication changes
  useEffect(() => {
    if (authenticated && user && walletAddress) {
      console.log('🔐 User authenticated, fetching data for wallet:', walletAddress);
      fetchUserData(walletAddress);
      setIsAuthenticated(true);
    } else {
      // Reset when logged out
      console.log('🔓 User logged out, clearing data');
      setCurrentUser(null);
      setIsAuthenticated(false);
      setHasCustomUsername(false);
    }
  }, [authenticated, user, walletAddress]);
  
  // Function to set username for users
  const setUsername = async (username: string) => {
    if (!authenticated || !currentUser) return;
    
    try {
      console.log('📝 Updating username to:', username);
      
      // Update user in database
      const success = await UserAPI.updateUser(currentUser.id, {
        username,
        updated_at: new Date().toISOString()
      });
      
      if (success) {
        // Update local state
        const updatedUser = {
          ...currentUser,
          username
        };
        setCurrentUser(updatedUser);
        setHasCustomUsername(true);
        console.log('✅ Username updated successfully');
      } else {
        console.error('❌ Failed to update username in database');
      }
    } catch (error) {
      console.error('❌ Error updating username:', error);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    // This is handled by Privy, but keeping for interface compatibility
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    setHasCustomUsername(false);
  };

  const register = async (username: string, email: string, password: string): Promise<boolean> => {
    // This is handled by Privy, but keeping for interface compatibility
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
      loading,
      refreshUser,
    }}>
      {children}
    </UserContext.Provider>
  );
};
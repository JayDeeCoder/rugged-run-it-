// src/context/TokenContext.tsx
'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { toast } from 'react-hot-toast';
import { isValidSolanaAddress, safeCreatePublicKey, isValidWallet, getValidWalletAddress } from '../utils/walletUtils';

// Import TokenType from types file
export enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

interface TokenContextType {
  // Current token selection
  currentToken: TokenType;
  setCurrentToken: (token: TokenType) => void;
  
  // Balances
  solBalance: number;
  ruggedBalance: number;
  
  // Airdrop functionality
  airdropToken: (token: TokenType, amount: number) => Promise<boolean>;
  isAirdropAvailable: boolean;
  lastAirdropTime: number | null;
  airdropCooldown: number;
  isProcessingAirdrop: boolean;
  
  // Balance refresh
  refreshBalances: () => Promise<void>;
}

const defaultValue: TokenContextType = {
  currentToken: TokenType.SOL,
  setCurrentToken: () => {},
  solBalance: 0,
  ruggedBalance: 0,
  airdropToken: async () => false,
  isAirdropAvailable: true,
  lastAirdropTime: null,
  airdropCooldown: 24 * 60 * 60 * 1000, // 24 hours
  isProcessingAirdrop: false,
  refreshBalances: async () => {},
};

const TokenContext = createContext<TokenContextType>(defaultValue);

export const TokenProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  
  // State
  const [currentToken, setCurrentToken] = useState<TokenType>(TokenType.SOL);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [ruggedBalance, setRuggedBalance] = useState<number>(0);
  const [isProcessingAirdrop, setIsProcessingAirdrop] = useState<boolean>(false);
  const [lastAirdropTime, setLastAirdropTime] = useState<number | null>(null);
  
  // Airdrop cooldown (24 hours)
  const airdropCooldown = 24 * 60 * 60 * 1000;
  
  // Get embedded wallet - with better filtering and validation
  const embeddedWallet = wallets.find(wallet => 
    wallet.walletClientType === 'privy' && 
    wallet.chainId === 'solana' &&
    isValidWallet(wallet)
  ) || wallets.find(wallet => 
    wallet.walletClientType === 'privy' &&
    isValidWallet(wallet)
  );
  
  // Solana connection
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3',
    {
      commitment: 'confirmed',
      httpHeaders: {
        'x-api-key': process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '6CqgIf5nqVF9rWeernULokib0PAr6yh3'
      }
    }
  );
  
  // Load airdrop timestamp from localStorage
  useEffect(() => {
    const walletAddress = getValidWalletAddress(embeddedWallet);
    if (walletAddress) {
      const saved = localStorage.getItem(`airdrop_${walletAddress}`);
      if (saved) {
        try {
          setLastAirdropTime(parseInt(saved));
        } catch (error) {
          console.error('Failed to parse airdrop timestamp:', error);
        }
      }
    }
  }, [embeddedWallet]);
  
  // Save airdrop timestamp to localStorage
  const saveAirdropTime = (timestamp: number) => {
    const walletAddress = getValidWalletAddress(embeddedWallet);
    if (walletAddress) {
      try {
        localStorage.setItem(`airdrop_${walletAddress}`, timestamp.toString());
        setLastAirdropTime(timestamp);
      } catch (error) {
        console.error('Failed to save airdrop timestamp:', error);
      }
    }
  };
  
  // Check if airdrop is available
  const isAirdropAvailable = !lastAirdropTime || (Date.now() - lastAirdropTime) >= airdropCooldown;
  
  // Refresh balances with proper error handling
  const refreshBalances = async () => {
    if (!authenticated || !embeddedWallet) {
      console.log('Not authenticated or no wallet available');
      return;
    }
    
    // Get valid wallet address
    const walletAddress = getValidWalletAddress(embeddedWallet);
    if (!walletAddress) {
      console.error('Invalid wallet address:', embeddedWallet.address);
      return;
    }
    
    try {
      // Create PublicKey safely
      const publicKey = safeCreatePublicKey(walletAddress);
      if (!publicKey) {
        console.error('Failed to create PublicKey for address:', walletAddress);
        return;
      }
      
      // Get SOL balance
      const lamports = await connection.getBalance(publicKey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);
      
      // For RUGGED tokens, we'll use a mock implementation
      // In a real app, you'd fetch the SPL token balance
      const savedRuggedBalance = localStorage.getItem(`rugged_balance_${walletAddress}`);
      if (savedRuggedBalance) {
        try {
          setRuggedBalance(parseFloat(savedRuggedBalance));
        } catch (error) {
          console.error('Failed to parse saved RUGGED balance:', error);
        }
      }
    } catch (error) {
      console.error('Failed to refresh balances:', error);
      // Don't update balances on error to preserve last known values
    }
  };
  
  // Initial balance fetch
  useEffect(() => {
    if (authenticated && isValidWallet(embeddedWallet)) {
      refreshBalances();
      
      // Set up interval to refresh balances
      const interval = setInterval(refreshBalances, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated, embeddedWallet]);
  
  // Airdrop function
  const airdropToken = async (token: TokenType, amount: number): Promise<boolean> => {
    if (!authenticated || !embeddedWallet) {
      toast.error('Please login first');
      return false;
    }
    
    const walletAddress = getValidWalletAddress(embeddedWallet);
    if (!walletAddress) {
      toast.error('Invalid wallet address');
      return false;
    }
    
    if (!isAirdropAvailable) {
      const timeRemaining = lastAirdropTime ? (lastAirdropTime + airdropCooldown - Date.now()) : 0;
      const hoursRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60));
      toast.error(`Airdrop not available yet. Try again in ${hoursRemaining} hours.`);
      return false;
    }
    
    if (amount <= 0) {
      toast.error('Invalid airdrop amount');
      return false;
    }
    
    setIsProcessingAirdrop(true);
    
    try {
      // Simulate airdrop delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (token === TokenType.SOL) {
        // For SOL, we'll simulate by just updating the local balance
        // In a real app, this would be a server-side operation
        setSolBalance(prev => Math.max(0, prev + amount));
        toast.success(`Received ${amount} SOL airdrop!`);
      } else if (token === TokenType.RUGGED) {
        // For RUGGED tokens, update localStorage and state
        const newBalance = Math.max(0, ruggedBalance + amount);
        setRuggedBalance(newBalance);
        try {
          localStorage.setItem(`rugged_balance_${walletAddress}`, newBalance.toString());
        } catch (error) {
          console.error('Failed to save RUGGED balance to localStorage:', error);
        }
        toast.success(`Received ${amount} RUGGED tokens!`);
      }
      
      // Save airdrop timestamp
      saveAirdropTime(Date.now());
      
      return true;
    } catch (error) {
      console.error('Airdrop failed:', error);
      toast.error('Airdrop failed. Please try again.');
      return false;
    } finally {
      setIsProcessingAirdrop(false);
    }
  };
  
  const value: TokenContextType = {
    currentToken,
    setCurrentToken,
    solBalance,
    ruggedBalance,
    airdropToken,
    isAirdropAvailable,
    lastAirdropTime,
    airdropCooldown,
    isProcessingAirdrop,
    refreshBalances,
  };
  
  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
};

// Custom hook to use token context
export const useTokenContext = (): TokenContextType => {
  const context = useContext(TokenContext);
  if (!context) {
    throw new Error('useTokenContext must be used within a TokenProvider');
  }
  return context;
};
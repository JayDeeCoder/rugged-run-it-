// src/context/TokenContext.tsx
'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { toast } from 'react-hot-toast';

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

// Helper function to validate Solana address
const isValidSolanaAddress = (address: string): boolean => {
  try {
    // Check if address exists and is a string
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    // Check length (Solana addresses are typically 32-44 characters)
    if (address.length < 32 || address.length > 44) {
      return false;
    }
    
    // Check if it contains only valid base58 characters
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    if (!base58Regex.test(address)) {
      return false;
    }
    
    // Try to create a PublicKey instance
    new PublicKey(address);
    return true;
  } catch (error) {
    console.warn('Invalid Solana address:', address, error);
    return false;
  }
};

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
  
  // Get embedded wallet - with better filtering
  const embeddedWallet = wallets.find(wallet => 
    wallet.walletClientType === 'privy' && 
    wallet.chainId === 'solana'
  ) || wallets.find(wallet => wallet.walletClientType === 'privy');
  
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
    if (embeddedWallet && isValidSolanaAddress(embeddedWallet.address)) {
      const saved = localStorage.getItem(`airdrop_${embeddedWallet.address}`);
      if (saved) {
        setLastAirdropTime(parseInt(saved));
      }
    }
  }, [embeddedWallet]);
  
  // Save airdrop timestamp to localStorage
  const saveAirdropTime = (timestamp: number) => {
    if (embeddedWallet && isValidSolanaAddress(embeddedWallet.address)) {
      localStorage.setItem(`airdrop_${embeddedWallet.address}`, timestamp.toString());
      setLastAirdropTime(timestamp);
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
    
    // Validate the wallet address before proceeding
    if (!isValidSolanaAddress(embeddedWallet.address)) {
      console.error('Invalid wallet address:', embeddedWallet.address);
      // Don't throw an error, just log and return
      return;
    }
    
    try {
      // Get SOL balance
      const publicKey = new PublicKey(embeddedWallet.address);
      const lamports = await connection.getBalance(publicKey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);
      
      // For RUGGED tokens, we'll use a mock implementation
      // In a real app, you'd fetch the SPL token balance
      const savedRuggedBalance = localStorage.getItem(`rugged_balance_${embeddedWallet.address}`);
      if (savedRuggedBalance) {
        setRuggedBalance(parseFloat(savedRuggedBalance));
      }
    } catch (error) {
      console.error('Failed to refresh balances:', error);
      // Don't update balances on error to preserve last known values
    }
  };
  
  // Initial balance fetch
  useEffect(() => {
    if (authenticated && embeddedWallet && isValidSolanaAddress(embeddedWallet.address)) {
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
    
    if (!isValidSolanaAddress(embeddedWallet.address)) {
      toast.error('Invalid wallet address');
      return false;
    }
    
    if (!isAirdropAvailable) {
      toast.error('Airdrop not available yet');
      return false;
    }
    
    setIsProcessingAirdrop(true);
    
    try {
      // Simulate airdrop delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (token === TokenType.SOL) {
        // For SOL, we'll simulate by just updating the local balance
        // In a real app, this would be a server-side operation
        setSolBalance(prev => prev + amount);
        toast.success(`Received ${amount} SOL airdrop!`);
      } else if (token === TokenType.RUGGED) {
        // For RUGGED tokens, update localStorage and state
        const newBalance = ruggedBalance + amount;
        setRuggedBalance(newBalance);
        localStorage.setItem(`rugged_balance_${embeddedWallet.address}`, newBalance.toString());
        toast.success(`Received ${amount} RUGGED tokens!`);
      }
      
      // Save airdrop timestamp
      saveAirdropTime(Date.now());
      
      return true;
    } catch (error) {
      console.error('Airdrop failed:', error);
      toast.error('Airdrop failed');
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
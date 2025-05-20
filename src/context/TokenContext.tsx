// src/context/TokenContext.tsx
'use client';

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { UserContext } from './UserContext';

// Define token types enum
export enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

// Define token interface
export interface Token {
  symbol: TokenType;
  name: string;
  balance: number;
  logoUrl?: string;
}

// Context type definition
interface TokenContextType {
  tokens: Token[];
  getTokenBalance: (symbol: TokenType) => number;
  airdropToken: (symbol: TokenType, amount: number) => Promise<boolean>;
  isAirdropAvailable: boolean;
  lastAirdropTime: number | null;
  airdropCooldown: number;
  isProcessingAirdrop: boolean;
  depositToken: (symbol: TokenType, amount: number) => Promise<boolean>;
  withdrawToken: (symbol: TokenType, amount: number) => Promise<boolean>;
  isProcessingTransaction: boolean;
  currentToken: TokenType;
  setCurrentToken: (token: TokenType) => void;
  solBalance: number;
  ruggedBalance: number;
}

const defaultContext: TokenContextType = {
  tokens: [],
  getTokenBalance: () => 0,
  airdropToken: async () => false,
  isAirdropAvailable: false,
  lastAirdropTime: null,
  airdropCooldown: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  isProcessingAirdrop: false,
  depositToken: async () => false,
  withdrawToken: async () => false,
  isProcessingTransaction: false,
  currentToken: TokenType.SOL,
  setCurrentToken: () => {},
  solBalance: 0,
  ruggedBalance: 0
};

export const TokenContext = createContext<TokenContextType>(defaultContext);

export const TokenProvider = ({ children }: { children: ReactNode }) => {
  const [tokens, setTokens] = useState<Token[]>([
    { symbol: TokenType.SOL, name: 'Solana', balance: 0 },
    { symbol: TokenType.RUGGED, name: 'Rugged Token', balance: 0 },
  ]);
  const [lastAirdropTime, setLastAirdropTime] = useState<number | null>(null);
  const [isProcessingAirdrop, setIsProcessingAirdrop] = useState(false);
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
  const [currentToken, setCurrentToken] = useState<TokenType>(TokenType.SOL);
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { currentUser } = useContext(UserContext);
  
  const airdropCooldown = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  // Initialize token balances from localStorage or default values
  useEffect(() => {
    if (connected && publicKey && currentUser) {
      // Load last airdrop time from localStorage
      const savedLastAirdropTime = localStorage.getItem(`lastAirdropTime_${publicKey.toString()}`);
      if (savedLastAirdropTime) {
        setLastAirdropTime(parseInt(savedLastAirdropTime));
      }
      
      // Load token balances from localStorage
      const savedTokens = localStorage.getItem(`tokens_${publicKey.toString()}`);
      if (savedTokens) {
        try {
          setTokens(JSON.parse(savedTokens));
        } catch (e) {
          console.error('Failed to parse saved tokens:', e);
        }
      } else {
        // If no saved tokens, initialize with default values
        setTokens([
          { symbol: TokenType.SOL, name: 'Solana', balance: 0 },
          { symbol: TokenType.RUGGED, name: 'Rugged Token', balance: 0 },
        ]);
      }
      
      // Fetch SOL balance from blockchain
      updateSolBalance();
    }
  }, [connected, publicKey, currentUser]);
  
  // Save tokens to localStorage when they change
  useEffect(() => {
    if (connected && publicKey && tokens.length > 0) {
      localStorage.setItem(`tokens_${publicKey.toString()}`, JSON.stringify(tokens));
    }
  }, [tokens, connected, publicKey]);
  
  // Update SOL balance from the blockchain
  const updateSolBalance = async () => {
    if (connected && publicKey && connection) {
      try {
        const balance = await connection.getBalance(publicKey);
        setTokens(prev => 
          prev.map(token => 
            token.symbol === TokenType.SOL 
              ? { ...token, balance: balance / LAMPORTS_PER_SOL } 
              : token
          )
        );
      } catch (error) {
        console.error('Failed to fetch SOL balance:', error);
      }
    }
  };
  
  // Check if an airdrop is available
  const isAirdropAvailable = lastAirdropTime === null || 
    (Date.now() - lastAirdropTime) > airdropCooldown;
  
  // Get token balance by symbol
  const getTokenBalance = (symbol: TokenType): number => {
    const token = tokens.find(t => t.symbol === symbol);
    return token ? token.balance : 0;
  };
  
  // Perform a token airdrop
  const airdropToken = async (symbol: TokenType, amount: number): Promise<boolean> => {
    if (!connected || !publicKey || !isAirdropAvailable || isProcessingAirdrop) {
      return false;
    }
    
    setIsProcessingAirdrop(true);
    
    try {
      // Handle SOL airdrops using devnet airdrop functionality
      if (symbol === TokenType.SOL && connection) {
        try {
          // Devnet only allows airdrops up to 2 SOL
          const airdropAmount = Math.min(amount, 2);
          const signature = await connection.requestAirdrop(
            publicKey,
            airdropAmount * LAMPORTS_PER_SOL
          );
          
          // Wait for confirmation
          await connection.confirmTransaction(signature);
          
          // Update SOL balance
          await updateSolBalance();
        } catch (error) {
          console.error('Failed to airdrop SOL:', error);
          setIsProcessingAirdrop(false);
          return false;
        }
      } else {
        // Handle other tokens (simulated for now)
        setTokens(prev => 
          prev.map(token => 
            token.symbol === symbol 
              ? { ...token, balance: token.balance + amount } 
              : token
          )
        );
      }
      
      // Update last airdrop time
      const now = Date.now();
      setLastAirdropTime(now);
      localStorage.setItem(`lastAirdropTime_${publicKey.toString()}`, now.toString());
      
      setIsProcessingAirdrop(false);
      return true;
    } catch (error) {
      console.error('Failed to airdrop token:', error);
      setIsProcessingAirdrop(false);
      return false;
    }
  };
  
  // Deposit tokens to the game
  const depositToken = async (symbol: TokenType, amount: number): Promise<boolean> => {
    if (!connected || !publicKey || amount <= 0 || isProcessingTransaction) {
      return false;
    }
    
    setIsProcessingTransaction(true);
    
    try {
      // Simulate a delay for processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // For now, just update the token balance (this would normally involve a blockchain transaction)
      setTokens(prev => 
        prev.map(token => 
          token.symbol === symbol 
            ? { ...token, balance: token.balance + amount } 
            : token
        )
      );
      
      setIsProcessingTransaction(false);
      return true;
    } catch (error) {
      console.error('Failed to deposit token:', error);
      setIsProcessingTransaction(false);
      return false;
    }
  };
  
  // Withdraw tokens from the game
  const withdrawToken = async (symbol: TokenType, amount: number): Promise<boolean> => {
    if (!connected || !publicKey || amount <= 0 || isProcessingTransaction) {
      return false;
    }
    
    // Check if user has enough tokens
    const tokenBalance = getTokenBalance(symbol);
    if (tokenBalance < amount) {
      return false;
    }
    
    setIsProcessingTransaction(true);
    
    try {
      // Simulate a delay for processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // For now, just update the token balance (this would normally involve a blockchain transaction)
      setTokens(prev => 
        prev.map(token => 
          token.symbol === symbol 
            ? { ...token, balance: token.balance - amount } 
            : token
        )
      );
      
      setIsProcessingTransaction(false);
      return true;
    } catch (error) {
      console.error('Failed to withdraw token:', error);
      setIsProcessingTransaction(false);
      return false;
    }
  };
  
  // Get specific balances
  const solBalance = getTokenBalance(TokenType.SOL);
  const ruggedBalance = getTokenBalance(TokenType.RUGGED);
  
  return (
    <TokenContext.Provider value={{
      tokens,
      getTokenBalance,
      airdropToken,
      isAirdropAvailable,
      lastAirdropTime,
      airdropCooldown,
      isProcessingAirdrop,
      depositToken,
      withdrawToken,
      isProcessingTransaction,
      currentToken,
      setCurrentToken,
      solBalance,
      ruggedBalance
    }}>
      {children}
    </TokenContext.Provider>
  );
};

// Custom hook for using the token context
export const useToken = () => useContext(TokenContext);

// Alias for backward compatibility
export const useTokenContext = useToken;
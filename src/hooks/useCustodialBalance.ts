// hooks/useCustodialBalance.ts - Corrected for your API structure
import { useState, useEffect, useCallback } from 'react';

// 🚩 CORRECTED: Interface matching your actual API response
interface CustodialBalanceResponse {
  userId: string;
  custodialBalance: number;
  totalDeposited: number;
  lastDeposit: number;
  hasWallet: boolean;
  message?: string;
  walletAddress?: string;
  canBet: boolean;
  canWithdraw: boolean;
  embeddedBalance: number;
  embeddedWalletId?: string;
  totalTransfersToEmbedded: number;
  totalTransfersToCustodial: number;
  lastActivity?: string;
  timestamp: number;
}

export function useCustodialBalance(userId: string) {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [embeddedBalance, setEmbeddedBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [hasWallet, setHasWallet] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const updateCustodialBalance = useCallback(async () => {
    if (!userId) {
      console.log('🔍 useCustodialBalance: No userId provided');
      return;
    }
    
    console.log('🚀 useCustodialBalance: Starting balance fetch for userId:', userId);
    setLoading(true);
    setError(null);
    
    try {
      // 🚩 CORRECTED: Use your actual API endpoint structure
      const response = await fetch(`/api/custodial/balance/${userId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Balance API error:', response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data: CustodialBalanceResponse = await response.json();
      
      // 🚩 CORRECTED: Use the correct field names from your API
      setCustodialBalance(data.custodialBalance || 0);
      setEmbeddedBalance(data.embeddedBalance || 0);
      setHasWallet(data.hasWallet);
      setLastUpdated(Date.now());
      
      console.log(`💎 useCustodialBalance: Balance updated:`, {
        custodial: data.custodialBalance?.toFixed(3) || '0',
        embedded: data.embeddedBalance?.toFixed(3) || '0',
        hasWallet: data.hasWallet
      });
      
    } catch (error) {
      console.error('❌ useCustodialBalance: Failed to fetch balance:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch balance');
      // Set default values on error
      setCustodialBalance(0);
      setEmbeddedBalance(0);
      setHasWallet(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      console.log('🔄 useCustodialBalance: useEffect triggered for userId:', userId);
      updateCustodialBalance();
      
      // Poll every 10 seconds
      const interval = setInterval(updateCustodialBalance, 10000);
      return () => clearInterval(interval);
    } else {
      // Reset state when no userId
      setCustodialBalance(0);
      setEmbeddedBalance(0);
      setHasWallet(false);
      setError(null);
    }
  }, [userId, updateCustodialBalance]);

  // 🔥 NEW: Listen for global balance update events from transfers
  useEffect(() => {
    const handleBalanceUpdate = (event: CustomEvent) => {
      if (event.detail.userId === userId) {
        console.log('🔄 useCustodialBalance: Received balance update event from transfer');
        updateCustodialBalance();
      }
    };
    
    window.addEventListener('custodialBalanceUpdate', handleBalanceUpdate as EventListener);
    return () => window.removeEventListener('custodialBalanceUpdate', handleBalanceUpdate as EventListener);
  }, [userId, updateCustodialBalance]);

  return { 
    custodialBalance, 
    embeddedBalance,
    loading, 
    lastUpdated, 
    hasWallet,
    error,
    updateCustodialBalance 
  };
}

// 🚩 UPDATED: Also update the WithdrawModal's custodial balance hook to use this corrected version
export const useCustodialBalanceInWithdrawModal = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const updateCustodialBalance = useCallback(async () => {
    if (!userId) {
      console.log('🔍 WithdrawModal useCustodialBalance: No userId provided');
      return;
    }
    
    console.log('🚀 WithdrawModal useCustodialBalance: Starting balance fetch for userId:', userId);
    setLoading(true);
    try {
      // 🚩 CORRECTED: Use your actual API endpoint
      const response = await fetch(`/api/custodial/balance/${userId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ WithdrawModal Balance API error:', response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data: CustodialBalanceResponse = await response.json();
      
      // 🚩 CORRECTED: Use custodialBalance from your API response
      setCustodialBalance(data.custodialBalance || 0);
      setLastUpdated(Date.now());
      console.log(`💎 WithdrawModal: Custodial SOL balance updated: ${(data.custodialBalance || 0).toFixed(3)} SOL`);
      
    } catch (error) {
      console.error('WithdrawModal: Failed to fetch custodial balance:', error);
      setCustodialBalance(0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      console.log('🔄 WithdrawModal useCustodialBalance: useEffect triggered for userId:', userId);
      updateCustodialBalance();
      const interval = setInterval(updateCustodialBalance, 10000);
      return () => clearInterval(interval);
    }
  }, [userId, updateCustodialBalance]);

  // 🔥 NEW: Listen for global balance update events from transfers (WithdrawModal version)
  useEffect(() => {
    const handleBalanceUpdate = (event: CustomEvent) => {
      if (event.detail.userId === userId) {
        console.log('🔄 WithdrawModal: Received balance update event from transfer');
        updateCustodialBalance();
      }
    };
    
    window.addEventListener('custodialBalanceUpdate', handleBalanceUpdate as EventListener);
    return () => window.removeEventListener('custodialBalanceUpdate', handleBalanceUpdate as EventListener);
  }, [userId, updateCustodialBalance]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance };
};
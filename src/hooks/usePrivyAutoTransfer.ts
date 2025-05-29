// src/hooks/usePrivyAutoTransfer.ts
import { useState, useCallback } from 'react';
import { Transaction } from '@solana/web3.js';
import { useSolanaWallets } from '@privy-io/react-auth';
import logger from '../utils/logger';

// Types
export interface TransferResult {
  success: boolean;
  transactionId?: string;
  newBalance?: number;
  dailyLimits?: {
    used: number;
    remaining: number;
    limit: number;
  };
  error?: string;
}

export interface TransferState {
  loading: boolean;
  error: string | null;
  lastTransfer: TransferResult | null;
}

export interface DailyLimits {
  used: number;
  remaining: number;
  limit: number;
}

/**
 * Hook for handling Privy auto-transfers with embedded wallet signing
 * Provides functions for transferring from Privy wallet to custodial balance
 * and direct withdrawals from Privy wallet
 */
export const usePrivyAutoTransfer = () => {
  const [state, setState] = useState<TransferState>({
    loading: false,
    error: null,
    lastTransfer: null
  });

  const { wallets } = useSolanaWallets();
  
  // Find embedded wallet specifically (we don't want external adapters)
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  // Update state helper
  const updateState = useCallback((updates: Partial<TransferState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Execute auto-transfer from Privy wallet to custodial balance
   * This handles the full flow: create transaction -> sign -> submit
   */
  const executeAutoTransfer = useCallback(async (
    userId: string, 
    amount: number
  ): Promise<TransferResult> => {
    if (!embeddedWallet) {
      const error = 'No embedded wallet found. Please create an embedded wallet first.';
      updateState({ error });
      return { success: false, error };
    }

    updateState({ loading: true, error: null });

    try {
      logger.info(`Starting auto-transfer: ${amount} SOL for user ${userId}`);

      // Step 1: Get unsigned transaction from backend
      const createResponse = await fetch('/api/transfer/privy-to-custodial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          amount, 
          autoSign: false // Request unsigned transaction
        })
      });

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(createData.error || 'Failed to create transfer transaction');
      }

      if (!createData.unsignedTransaction) {
        throw new Error('No unsigned transaction received from server');
      }

      logger.info('Unsigned transaction received, proceeding to sign...');

      // Step 2: Sign transaction with embedded wallet (this is automatic, no popup)
      const transaction = Transaction.from(Buffer.from(createData.unsignedTransaction, 'base64'));
      
      if (!embeddedWallet.signTransaction) {
        throw new Error('Embedded wallet does not support transaction signing');
      }

      // This signing happens automatically without user popup for embedded wallets
      const signedTransaction = await embeddedWallet.signTransaction(transaction);
      const signedBase64 = signedTransaction.serialize().toString('base64');

      logger.info('Transaction signed successfully, submitting to network...');

      // Step 3: Submit signed transaction to backend
      const submitResponse = await fetch('/api/transfer/privy-to-custodial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount,
          signedTransaction: signedBase64
        })
      });

      const submitData = await submitResponse.json();

      if (!submitResponse.ok) {
        throw new Error(submitData.error || 'Failed to submit transfer transaction');
      }

      if (!submitData.success) {
        throw new Error(submitData.error || 'Transfer transaction failed');
      }

      logger.info(`Auto-transfer completed successfully: ${submitData.transactionId}`);

      const result: TransferResult = {
        success: true,
        transactionId: submitData.transactionId,
        newBalance: submitData.transferDetails?.newBalance,
        dailyLimits: submitData.dailyLimits
      };

      updateState({ 
        loading: false, 
        error: null, 
        lastTransfer: result 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Auto-transfer failed';
      logger.error('Auto-transfer error:', error);
      
      const result: TransferResult = {
        success: false,
        error: errorMessage
      };

      updateState({ 
        loading: false, 
        error: errorMessage, 
        lastTransfer: result 
      });

      return result;
    }
  }, [embeddedWallet, updateState]);

  /**
   * Execute direct withdrawal from Privy wallet to external address
   * This handles the full flow: create transaction -> sign -> submit
   */
  const executeDirectWithdrawal = useCallback(async (
    userId: string,
    destinationAddress: string,
    amount: number
  ): Promise<TransferResult> => {
    if (!embeddedWallet) {
      const error = 'No embedded wallet found. Please create an embedded wallet first.';
      updateState({ error });
      return { success: false, error };
    }

    updateState({ loading: true, error: null });

    try {
      logger.info(`Starting direct withdrawal: ${amount} SOL to ${destinationAddress} for user ${userId}`);

      // Step 1: Get unsigned transaction from backend
      const createResponse = await fetch('/api/privy/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          walletAddress: embeddedWallet.address,
          amount,
          destinationAddress
          // No signedTransaction = will return unsigned transaction
        })
      });

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(createData.error || 'Failed to create withdrawal transaction');
      }

      if (createData.success === false && !createData.unsignedTransaction) {
        throw new Error(createData.error || 'Failed to create withdrawal transaction');
      }

      if (!createData.unsignedTransaction) {
        throw new Error('No unsigned transaction received from server');
      }

      logger.info('Unsigned withdrawal transaction received, proceeding to sign...');

      // Step 2: Sign transaction with embedded wallet
      const transaction = Transaction.from(Buffer.from(createData.unsignedTransaction, 'base64'));
      
      if (!embeddedWallet.signTransaction) {
        throw new Error('Embedded wallet does not support transaction signing');
      }

      // This signing happens automatically without user popup for embedded wallets
      const signedTransaction = await embeddedWallet.signTransaction(transaction);
      const signedBase64 = signedTransaction.serialize().toString('base64');

      logger.info('Withdrawal transaction signed successfully, submitting to network...');

      // Step 3: Submit signed transaction to backend
      const submitResponse = await fetch('/api/privy/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          walletAddress: embeddedWallet.address,
          amount,
          destinationAddress,
          signedTransaction: signedBase64
        })
      });

      const submitData = await submitResponse.json();

      if (!submitResponse.ok) {
        throw new Error(submitData.error || 'Failed to submit withdrawal transaction');
      }

      if (!submitData.success) {
        throw new Error(submitData.error || 'Withdrawal transaction failed');
      }

      logger.info(`Direct withdrawal completed successfully: ${submitData.transactionId}`);

      const result: TransferResult = {
        success: true,
        transactionId: submitData.transactionId,
        newBalance: submitData.newPrivyBalance,
        dailyLimits: submitData.dailyLimits
      };

      updateState({ 
        loading: false, 
        error: null, 
        lastTransfer: result 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Direct withdrawal failed';
      logger.error('Direct withdrawal error:', error);
      
      const result: TransferResult = {
        success: false,
        error: errorMessage
      };

      updateState({ 
        loading: false, 
        error: errorMessage, 
        lastTransfer: result 
      });

      return result;
    }
  }, [embeddedWallet, updateState]);

  /**
   * Check daily withdrawal limits for a user
   */
  const checkDailyLimits = useCallback(async (userId: string): Promise<DailyLimits | null> => {
    try {
      const response = await fetch('/api/privy/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check daily limits');
      }

      return data.dailyLimits;
    } catch (error) {
      logger.error('Error checking daily limits:', error);
      return null;
    }
  }, []);

  /**
   * Get current Privy wallet balance for a user
   */
  const getPrivyBalance = useCallback(async (userId: string): Promise<number | null> => {
    try {
      const response = await fetch('/api/privy/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get balance');
      }

      return data.balance;
    } catch (error) {
      logger.error('Error getting Privy balance:', error);
      return null;
    }
  }, []);

  /**
   * Register user's Privy wallet address
   */
  const registerPrivyWallet = useCallback(async (userId: string): Promise<boolean> => {
    if (!embeddedWallet) {
      updateState({ error: 'No embedded wallet found' });
      return false;
    }

    try {
      const response = await fetch('/api/privy/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          walletAddress: embeddedWallet.address 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register Privy wallet');
      }

      logger.info(`Privy wallet registered for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error registering Privy wallet:', error);
      updateState({ error: error instanceof Error ? error.message : 'Registration failed' });
      return false;
    }
  }, [embeddedWallet, updateState]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      lastTransfer: null
    });
  }, []);

  return {
    // State
    loading: state.loading,
    error: state.error,
    lastTransfer: state.lastTransfer,
    
    // Wallet info
    embeddedWallet,
    walletAddress: embeddedWallet?.address || null,
    
    // Main functions
    executeAutoTransfer,
    executeDirectWithdrawal,
    
    // Utility functions
    checkDailyLimits,
    getPrivyBalance,
    registerPrivyWallet,
    
    // State management
    clearError,
    reset
  };
};

export default usePrivyAutoTransfer;
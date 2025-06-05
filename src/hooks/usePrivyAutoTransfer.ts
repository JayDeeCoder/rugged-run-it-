// src/hooks/usePrivyAutoTransfer.ts - UPDATED FOR FIXED API
import { useState, useCallback } from 'react';
import { Transaction } from '@solana/web3.js';
import { useSolanaWallets } from '@privy-io/react-auth';

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
 * 🔥 UPDATED: Hook for handling Privy auto-transfers with the fixed API
 */
export const usePrivyAutoTransfer = () => {
  const [state, setState] = useState<TransferState>({
    loading: false,
    error: null,
    lastTransfer: null
  });

  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  const updateState = useCallback((updates: Partial<TransferState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * 🔥 UPDATED: Execute auto-transfer with the fixed two-step API process
   */
  const executeAutoTransfer = useCallback(async (
    userId: string,
    amount: number,
    onBalanceUpdate?: () => Promise<void> | void
  ): Promise<TransferResult> => {
    
    // 🚀 ENHANCED: Better validation with specific error messages
    if (!userId || userId.trim() === '') {
      const error = 'User ID is required and cannot be empty';
      console.error('❌ TRANSFER HOOK: Missing or empty userId:', { userId, amount });
      updateState({ error });
      return { success: false, error };
    }

    if (!embeddedWallet || !embeddedWallet.address) {
      const error = 'No embedded wallet found. Please create an embedded wallet first.';
      console.error('❌ TRANSFER HOOK: Missing embedded wallet');
      updateState({ error });
      return { success: false, error };
    }

    if (!amount || amount <= 0 || amount > 10) {
      const error = 'Invalid amount. Must be between 0.001 and 10 SOL';
      console.error('❌ TRANSFER HOOK: Invalid amount:', amount);
      updateState({ error });
      return { success: false, error };
    }

    updateState({ loading: true, error: null });

    try {
      console.log(`🚀 TRANSFER HOOK: Starting enhanced auto-transfer`);
      console.log(`👤 TRANSFER HOOK: User ID: ${userId}`);
      console.log(`💰 TRANSFER HOOK: Amount: ${amount} SOL`);
      console.log(`📍 TRANSFER HOOK: Wallet: ${embeddedWallet.address}`);

      // 🔥 UPDATED: Step 1 - Create unsigned transaction (no autoSign parameter)
      const step1Body = {
        userId: userId.trim(),
        amount: amount,
        walletAddress: embeddedWallet.address
        // NOTE: No signedTransaction field = Step 1
        // NOTE: No autoSign parameter = uses fixed API logic
      };

      console.log('🔍 TRANSFER HOOK: Step 1 request body:', step1Body);

      const createResponse = await fetch('/api/transfer/privy-to-custodial', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(step1Body)
      });

      // 🚀 ENHANCED: Better error handling for Step 1
      if (!createResponse.ok) {
        let errorData;
        try {
          errorData = await createResponse.json();
        } catch (parseError) {
          throw new Error(`HTTP ${createResponse.status}: ${createResponse.statusText}`);
        }
        
        console.error('❌ TRANSFER HOOK: Step 1 failed:', errorData);
        throw new Error(errorData.error || `HTTP ${createResponse.status}: Failed to create transfer transaction`);
      }

      const createData = await createResponse.json();
      console.log('📡 TRANSFER HOOK: Step 1 response received');

      if (!createData.success || !createData.unsignedTransaction) {
        console.error('❌ TRANSFER HOOK: No unsigned transaction in response:', createData);
        throw new Error(createData.error || 'No unsigned transaction received from server');
      }

      console.log('✅ TRANSFER HOOK: Unsigned transaction received, proceeding to sign...');

      // 🔥 ENHANCED: Step 2 - Better transaction signing with error handling
      let signedTransaction: Transaction;
      try {
        const transaction = Transaction.from(Buffer.from(createData.unsignedTransaction, 'base64'));
        
        if (!embeddedWallet.signTransaction) {
          throw new Error('Embedded wallet does not support transaction signing');
        }

        console.log('🖊️ TRANSFER HOOK: Signing transaction with embedded wallet...');
        signedTransaction = await embeddedWallet.signTransaction(transaction);
        console.log('✅ TRANSFER HOOK: Transaction signed successfully');

      } catch (signingError) {
        console.error('❌ TRANSFER HOOK: Transaction signing failed:', signingError);
        throw new Error(`Transaction signing failed: ${signingError instanceof Error ? signingError.message : 'Unknown signing error'}`);
      }

      const signedBase64 = signedTransaction.serialize().toString('base64');

      // 🔥 UPDATED: Step 2 - Submit with signedTransaction (triggers Step 2 logic)
      const step2Body = {
        userId: userId.trim(),
        amount: amount,
        walletAddress: embeddedWallet.address,
        signedTransaction: signedBase64
        // NOTE: Presence of signedTransaction = Step 2
      };

      console.log('🔍 TRANSFER HOOK: Step 2 request body (without signedTx):', {
        userId: step2Body.userId,
        amount: step2Body.amount,
        walletAddress: step2Body.walletAddress,
        hasSignedTransaction: !!step2Body.signedTransaction
      });

      const submitResponse = await fetch('/api/transfer/privy-to-custodial', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(step2Body)
      });

      // 🚀 ENHANCED: Better error handling for Step 2
      if (!submitResponse.ok) {
        let errorData;
        try {
          errorData = await submitResponse.json();
        } catch (parseError) {
          throw new Error(`HTTP ${submitResponse.status}: ${submitResponse.statusText}`);
        }
        
        console.error('❌ TRANSFER HOOK: Step 2 failed:', errorData);
        
        // Handle specific errors
        if (submitResponse.status === 408 || errorData.code === 'CONFIRMATION_TIMEOUT') {
          throw new Error('Transaction was sent but confirmation timed out. Please check your wallet balance and try again if needed.');
        }
        
        throw new Error(errorData.error || `HTTP ${submitResponse.status}: Failed to submit transfer transaction`);
      }

      const submitData = await submitResponse.json();
      console.log('📡 TRANSFER HOOK: Step 2 response received');

      if (!submitData.success) {
        console.error('❌ TRANSFER HOOK: Transfer failed:', submitData);
        throw new Error(submitData.error || 'Transfer transaction failed');
      }

      console.log(`✅ TRANSFER HOOK: Auto-transfer completed successfully!`);
      console.log(`📊 TRANSFER HOOK: Transaction ID: ${submitData.transactionId}`);
      console.log(`💰 TRANSFER HOOK: New balance: ${submitData.transferDetails?.newBalance || 'Unknown'}`);

      // 🔥 ENHANCED: Multiple balance refresh mechanisms
      if (onBalanceUpdate) {
        try {
          console.log('🔄 TRANSFER HOOK: Triggering immediate balance refresh callback...');
          await onBalanceUpdate();
          console.log('✅ TRANSFER HOOK: Balance refresh callback completed');
        } catch (refreshError) {
          console.warn('⚠️ TRANSFER HOOK: Balance refresh callback failed:', refreshError);
          // Don't fail the transfer if callback fails
        }
      }

      // 🔥 ENHANCED: Dispatch multiple custom events for different listeners
      console.log('📡 TRANSFER HOOK: Dispatching balance update events...');
      
      // Primary balance update event
      const balanceUpdateEvent = new CustomEvent('custodialBalanceUpdate', {
        detail: {
          userId: userId,
          newBalance: submitData.transferDetails?.newBalance,
          transferAmount: amount,
          transactionId: submitData.transactionId,
          updateType: 'transfer_completed',
          source: 'auto_transfer_hook',
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(balanceUpdateEvent);

      // Force refresh event for shared hooks
      const refreshEvent = new CustomEvent('forceBalanceRefresh', {
        detail: {
          userId: userId,
          newBalance: submitData.transferDetails?.newBalance,
          reason: 'auto_transfer_completed',
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(refreshEvent);

      // Transfer completion event
      const transferEvent = new CustomEvent('transferCompleted', {
        detail: {
          userId: userId,
          amount: amount,
          transactionId: submitData.transactionId,
          newBalance: submitData.transferDetails?.newBalance,
          transferType: 'privy_to_custodial',
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(transferEvent);

      console.log('✅ TRANSFER HOOK: All events dispatched successfully');

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
      console.error('❌ TRANSFER HOOK: Auto-transfer error:', error);

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
   */
  const executeDirectWithdrawal = useCallback(async (
    userId: string,
    destinationAddress: string,
    amount: number
  ): Promise<TransferResult> => {
    
    if (!userId || userId.trim() === '') {
      const error = 'User ID is required for withdrawal';
      updateState({ error });
      return { success: false, error };
    }

    if (!embeddedWallet || !embeddedWallet.address) {
      const error = 'No embedded wallet found. Please create an embedded wallet first.';
      updateState({ error });
      return { success: false, error };
    }

    updateState({ loading: true, error: null });

    try {
      console.log(`🏧 WITHDRAWAL HOOK: Starting direct withdrawal`);
      console.log(`👤 WITHDRAWAL HOOK: User ID: ${userId}`);
      console.log(`💰 WITHDRAWAL HOOK: Amount: ${amount} SOL`);
      console.log(`📍 WITHDRAWAL HOOK: Destination: ${destinationAddress}`);

      // Step 1: Get unsigned transaction from backend
      const createResponse = await fetch('/api/privy/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
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

      console.log('Unsigned withdrawal transaction received, proceeding to sign...');

      // Step 2: Sign transaction with embedded wallet
      const transaction = Transaction.from(Buffer.from(createData.unsignedTransaction, 'base64'));
      
      if (!embeddedWallet.signTransaction) {
        throw new Error('Embedded wallet does not support transaction signing');
      }

      // This signing happens automatically without user popup for embedded wallets
      const signedTransaction = await embeddedWallet.signTransaction(transaction);
      const signedBase64 = signedTransaction.serialize().toString('base64');

      console.log('Withdrawal transaction signed successfully, submitting to network...');

      // Step 3: Submit signed transaction to backend
      const submitResponse = await fetch('/api/privy/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
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

      console.log(`Direct withdrawal completed successfully: ${submitData.transactionId}`);

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
      console.error('Direct withdrawal error:', error);

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
    if (!userId) {
      console.error('❌ LIMITS: Missing userId');
      return null;
    }

    try {
      const response = await fetch('/api/privy/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check daily limits');
      }

      return data.dailyLimits;

    } catch (error) {
      console.error('Error checking daily limits:', error);
      return null;
    }
  }, []);

  /**
   * Get current Privy wallet balance for a user
   */
  const getPrivyBalance = useCallback(async (userId: string): Promise<number | null> => {
    if (!userId) {
      console.error('❌ BALANCE: Missing userId');
      return null;
    }

    try {
      const response = await fetch('/api/privy/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get balance');
      }

      return data.balance;

    } catch (error) {
      console.error('Error getting Privy balance:', error);
      return null;
    }
  }, []);

  /**
   * Register user's Privy wallet address
   */
  const registerPrivyWallet = useCallback(async (userId: string): Promise<boolean> => {
    if (!userId) {
      updateState({ error: 'User ID is required for registration' });
      return false;
    }

    if (!embeddedWallet) {
      updateState({ error: 'No embedded wallet found' });
      return false;
    }

    try {
      const response = await fetch('/api/privy/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          walletAddress: embeddedWallet.address
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register Privy wallet');
      }

      console.log(`Privy wallet registered for user ${userId}`);
      return true;

    } catch (error) {
      console.error('Error registering Privy wallet:', error);
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
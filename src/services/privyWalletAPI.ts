// src/services/privyWalletAPI.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { solanaWalletService } from './SolanaWalletService';
import { safeCreatePublicKey, isValidSolanaAddress } from '../utils/walletUtils';
import logger from '../utils/logger';

// Constants
const DAILY_WITHDRAWAL_LIMIT = 20.0; // 20 SOL per day
const MIN_WITHDRAWAL = 0.001;
const MAX_WITHDRAWAL = 20.0;

// Types
export interface PrivyWalletData {
  id: string;
  userId: string;
  privyWalletAddress: string;
  balance: number;
  dailyTransferUsed: number;
  lastDailyReset: string;
  lastBalanceUpdate: string;
  lastUsed: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLimitCheck {
  allowed: boolean;
  used: number;
  remaining: number;
}

export interface TransferResult {
  success: boolean;
  transactionId?: string;
  newBalance?: number;
  dailyLimits?: DailyLimitCheck;
  error?: string;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  transactionType: 'custodial_withdrawal' | 'privy_withdrawal' | 'privy_to_custodial' | 'custodial_to_privy' | 'deposit' | 'bet' | 'cashout';
  amount: number;
  sourceAddress?: string;
  destinationAddress?: string;
  transactionId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

/**
 * PrivyWalletAPI - Complete service for managing Privy wallet operations
 * Integrates with Supabase database and Solana blockchain
 * Uses lazy initialization to avoid build-time errors
 */
export class PrivyWalletAPI {
  private supabase: SupabaseClient | null = null;
  private connection: Connection | null = null;
  private initialized = false;

  /**
   * Initialize the service (lazy initialization)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize Supabase client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
      }

      if (!supabaseServiceKey) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
      }

      this.supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Initialize Solana connection
      const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      if (!rpcUrl) {
        throw new Error('Missing Solana RPC URL (SOLANA_RPC_URL or NEXT_PUBLIC_SOLANA_RPC_URL)');
      }

      this.connection = new Connection(rpcUrl, 'confirmed');
      this.initialized = true;

      logger.info('PrivyWalletAPI initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PrivyWalletAPI:', error);
      throw error;
    }
  }

  /**
   * Get initialized Supabase client
   */
  private async getSupabase(): Promise<SupabaseClient> {
    await this.initialize();
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    return this.supabase;
  }

  /**
   * Get initialized Solana connection
   */
  private async getConnection(): Promise<Connection> {
    await this.initialize();
    if (!this.connection) {
      throw new Error('Solana connection not initialized');
    }
    return this.connection;
  }

  /**
   * Register or update a Privy wallet for a user
   */
  async registerPrivyWallet(userId: string, walletAddress: string, initialBalance?: number): Promise<PrivyWalletData | null> {
    try {
      // Validate wallet address
      if (!isValidSolanaAddress(walletAddress)) {
        throw new Error('Invalid Solana wallet address');
      }

      // Get current balance from blockchain if not provided
      let currentBalance = initialBalance;
      if (currentBalance === undefined) {
        currentBalance = await this.getBlockchainBalance(walletAddress);
      }

      const supabase = await this.getSupabase();

      // Use the database function to upsert wallet
      const { data, error } = await supabase.rpc('upsert_privy_wallet', {
        p_user_id: userId,
        p_wallet_address: walletAddress,
        p_initial_balance: currentBalance
      });

      if (error) {
        logger.error('Error registering Privy wallet:', error);
        throw error;
      }

      logger.info(`Privy wallet registered: ${userId} -> ${walletAddress}`);
      
      // Fetch the updated wallet data
      return await this.getPrivyWallet(userId);
    } catch (error) {
      logger.error('Error in registerPrivyWallet:', error);
      return null;
    }
  }

  /**
   * Get Privy wallet data for a user
   */
  async getPrivyWallet(userId: string): Promise<PrivyWalletData | null> {
    try {
      const supabase = await this.getSupabase();

      const { data, error } = await supabase
        .from('privy_wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No wallet found
          return null;
        }
        logger.error('Error fetching Privy wallet:', error);
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        privyWalletAddress: data.privy_wallet_address,
        balance: parseFloat(data.balance),
        dailyTransferUsed: parseFloat(data.daily_transfer_used || 0),
        lastDailyReset: data.last_daily_reset,
        lastBalanceUpdate: data.last_balance_update,
        lastUsed: data.last_used,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error) {
      logger.error('Error in getPrivyWallet:', error);
      return null;
    }
  }

  /**
   * Get current balance from blockchain
   */
  async getBlockchainBalance(walletAddress: string): Promise<number> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        return 0;
      }

      const publicKey = safeCreatePublicKey(walletAddress);
      if (!publicKey) {
        return 0;
      }

      const connection = await this.getConnection();
      const lamports = await connection.getBalance(publicKey);
      return lamports / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.error('Error getting blockchain balance:', error);
      return 0;
    }
  }

  /**
   * Update wallet balance from blockchain and store in database
   */
  async updateWalletBalance(userId: string): Promise<number> {
    try {
      const wallet = await this.getPrivyWallet(userId);
      if (!wallet) {
        throw new Error('Privy wallet not found');
      }

      const currentBalance = await this.getBlockchainBalance(wallet.privyWalletAddress);
      const supabase = await this.getSupabase();

      // Update balance in database
      const { error } = await supabase.rpc('update_privy_wallet_balance', {
        p_user_id: userId,
        p_new_balance: currentBalance
      });

      if (error) {
        logger.error('Error updating wallet balance:', error);
        throw error;
      }

      logger.info(`Balance updated for ${userId}: ${currentBalance} SOL`);
      return currentBalance;
    } catch (error) {
      logger.error('Error in updateWalletBalance:', error);
      return 0;
    }
  }

  /**
   * Check daily withdrawal limit
   */
  async checkDailyWithdrawalLimit(userId: string, amount: number): Promise<DailyLimitCheck> {
    try {
      const supabase = await this.getSupabase();

      const { data, error } = await supabase.rpc('check_daily_withdrawal_limit', {
        p_user_id: userId,
        p_amount: amount,
        p_daily_limit: DAILY_WITHDRAWAL_LIMIT
      });

      if (error) {
        logger.error('Error checking daily limit:', error);
        throw error;
      }

      const result = data[0];
      return {
        allowed: result.allowed,
        used: parseFloat(result.used_today),
        remaining: parseFloat(result.remaining)
      };
    } catch (error) {
      logger.error('Error in checkDailyWithdrawalLimit:', error);
      return {
        allowed: false,
        used: DAILY_WITHDRAWAL_LIMIT,
        remaining: 0
      };
    }
  }

  /**
   * Log a transaction to the database
   */
  async logTransaction(
    userId: string,
    transactionType: TransactionRecord['transactionType'],
    amount: number,
    sourceAddress?: string,
    destinationAddress?: string,
    transactionId?: string,
    status: TransactionRecord['status'] = 'completed',
    metadata?: any
  ): Promise<string | null> {
    try {
      const supabase = await this.getSupabase();

      const { data, error } = await supabase.rpc('log_transaction', {
        p_user_id: userId,
        p_transaction_type: transactionType,
        p_amount: amount,
        p_source_address: sourceAddress,
        p_destination_address: destinationAddress,
        p_transaction_id: transactionId,
        p_status: status,
        p_metadata: metadata || {}
      });

      if (error) {
        logger.error('Error logging transaction:', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Error in logTransaction:', error);
      return null;
    }
  }

  /**
   * Get user's transaction history
   */
  async getTransactionHistory(userId: string, limit: number = 50): Promise<TransactionRecord[]> {
    try {
      const supabase = await this.getSupabase();

      const { data, error } = await supabase
        .from('user_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error fetching transaction history:', error);
        throw error;
      }

      return data?.map(tx => ({
        id: tx.id,
        userId: tx.user_id,
        transactionType: tx.transaction_type,
        amount: parseFloat(tx.amount),
        sourceAddress: tx.source_address,
        destinationAddress: tx.destination_address,
        transactionId: tx.transaction_id,
        status: tx.status,
        metadata: tx.metadata,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at
      })) || [];
    } catch (error) {
      logger.error('Error in getTransactionHistory:', error);
      return [];
    }
  }

  /**
   * Validate withdrawal parameters
   */
  validateWithdrawal(amount: number, currentBalance: number): { valid: boolean; error?: string } {
    if (amount < MIN_WITHDRAWAL) {
      return {
        valid: false,
        error: `Minimum withdrawal is ${MIN_WITHDRAWAL} SOL`
      };
    }

    if (amount > MAX_WITHDRAWAL) {
      return {
        valid: false,
        error: `Maximum withdrawal is ${MAX_WITHDRAWAL} SOL`
      };
    }

    if (amount > currentBalance - 0.001) { // Reserve for fees
      return {
        valid: false,
        error: `Insufficient balance. Available: ${currentBalance.toFixed(3)} SOL`
      };
    }

    return { valid: true };
  }

  /**
   * Validate transfer parameters
   */
  validateTransfer(amount: number, currentBalance: number, dailyCheck: DailyLimitCheck): { valid: boolean; error?: string } {
    const withdrawalValidation = this.validateWithdrawal(amount, currentBalance);
    if (!withdrawalValidation.valid) {
      return withdrawalValidation;
    }

    if (!dailyCheck.allowed) {
      return {
        valid: false,
        error: `Daily transfer limit exceeded. Used: ${dailyCheck.used.toFixed(3)} SOL, Remaining: ${dailyCheck.remaining.toFixed(3)} SOL`
      };
    }

    return { valid: true };
  }

  /**
   * Execute a transfer from Privy wallet to custodial balance
   */
  async executePrivyToCustodialTransfer(
    userId: string,
    amount: number,
    signedTransactionBase64?: string
  ): Promise<TransferResult> {
    try {
      // Get user's Privy wallet
      const wallet = await this.getPrivyWallet(userId);
      if (!wallet) {
        return {
          success: false,
          error: 'Privy wallet not found. Please register your wallet first.'
        };
      }

      // Update and check current balance
      const currentBalance = await this.updateWalletBalance(userId);

      // Check daily withdrawal limit
      const dailyCheck = await this.checkDailyWithdrawalLimit(userId, amount);

      // Validate transfer
      const validation = this.validateTransfer(amount, currentBalance, dailyCheck);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          dailyLimits: dailyCheck
        };
      }

      // If no signed transaction provided, this is just a validation call
      if (!signedTransactionBase64) {
        return {
          success: false,
          error: 'No signed transaction provided - validation successful',
          dailyLimits: dailyCheck
        };
      }

      // Process the signed transaction
      const transactionBuffer = Buffer.from(signedTransactionBase64, 'base64');
      const connection = await this.getConnection();

      // Submit to blockchain
      const signature = await connection.sendRawTransaction(
        transactionBuffer,
        { 
          skipPreflight: false, 
          preflightCommitment: 'confirmed' 
        }
      );

      logger.info(`Transfer transaction submitted: ${signature}`);

      // Wait for confirmation
      const confirmation = await Promise.race([
        connection.confirmTransaction(signature, 'confirmed'),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000)
        )
      ]);

      if (confirmation && confirmation.value && confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      logger.info(`Transfer transaction confirmed: ${signature}`);

      // Log the successful transaction
      await this.logTransaction(
        userId,
        'privy_to_custodial',
        amount,
        wallet.privyWalletAddress,
        process.env.HOUSE_WALLET_ADDRESS,
        signature,
        'completed',
        { transferType: 'privy_to_custodial' }
      );

      // Update wallet balance
      const newBalance = await this.updateWalletBalance(userId);

      // Get updated daily limits
      const updatedDailyCheck = await this.checkDailyWithdrawalLimit(userId, 0);

      return {
        success: true,
        transactionId: signature,
        newBalance: newBalance,
        dailyLimits: updatedDailyCheck
      };

    } catch (error) {
      logger.error('Error in executePrivyToCustodialTransfer:', error);
      
      // Log failed transaction
      await this.logTransaction(
        userId,
        'privy_to_custodial',
        amount,
        undefined,
        process.env.HOUSE_WALLET_ADDRESS,
        undefined,
        'failed',
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transfer failed'
      };
    }
  }

  /**
   * Get wallet summary with current balance and daily limits
   */
  async getWalletSummary(userId: string): Promise<{
    wallet: PrivyWalletData | null;
    currentBalance: number;
    dailyLimits: DailyLimitCheck;
  }> {
    try {
      const wallet = await this.getPrivyWallet(userId);
      let currentBalance = 0;
      let dailyLimits: DailyLimitCheck = {
        allowed: false,
        used: DAILY_WITHDRAWAL_LIMIT,
        remaining: 0
      };

      if (wallet) {
        currentBalance = await this.updateWalletBalance(userId);
        dailyLimits = await this.checkDailyWithdrawalLimit(userId, 0);
      }

      return {
        wallet,
        currentBalance,
        dailyLimits
      };
    } catch (error) {
      logger.error('Error in getWalletSummary:', error);
      return {
        wallet: null,
        currentBalance: 0,
        dailyLimits: {
          allowed: false,  
          used: DAILY_WITHDRAWAL_LIMIT,
          remaining: 0
        }
      };
    }
  }
}

// Create and export singleton instance
export const privyWalletAPI = new PrivyWalletAPI();
export default privyWalletAPI;
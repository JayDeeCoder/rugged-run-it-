import { 
    Connection, 
    PublicKey, 
    Transaction, 
    SystemProgram, 
    LAMPORTS_PER_SOL,
    Keypair,
    sendAndConfirmTransaction,
    TransactionInstruction,
    ComputeBudgetProgram
  } from '@solana/web3.js';
  import bs58 from 'bs58';
  import cron from 'node-cron';
  import { createClient } from '@supabase/supabase-js';
  
  interface PayoutRequest {
    id: string;
    userId: string;
    amount: number;
    walletAddress: string;
    rewards: Array<{
      id: string;
      amount: number;
      description: string;
    }>;
  }
  
  interface PayoutResult {
    success: boolean;
    signature?: string;
    error?: string;
    retryable: boolean;
  }
  
  interface PayoutStats {
    houseWalletBalance: number;
    totalPaidLast30Days: number;
    failedPayoutsLast30Days: number;
    pendingPayouts: number;
  }
  
  export class SolanaPayoutService {
    private connection: Connection;
    private houseWallet: Keypair;
    private supabase: any;
    
    constructor() {
      // Initialize Solana connection using your existing RPC
      this.connection = new Connection(
        process.env.SOLANA_RPC_URL!,
        {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 60000, // 60 seconds
        }
      );
      
      // Load house wallet from your existing private key
      const privateKeyString = process.env.HOUSE_WALLET_PRIVATE_KEY!;
      const privateKeyBuffer = bs58.decode(privateKeyString);
      this.houseWallet = Keypair.fromSecretKey(privateKeyBuffer);
      
      // Verify the wallet address matches
      const expectedAddress = process.env.HOUSE_WALLET_ADDRESS!;
      const actualAddress = this.houseWallet.publicKey.toBase58();
      
      if (expectedAddress !== actualAddress) {
        throw new Error(`❌ Wallet address mismatch! Expected: ${expectedAddress}, Got: ${actualAddress}`);
      }
      
      // Initialize Supabase with your existing service role key
      this.supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      console.log(`🏦 House wallet loaded: ${actualAddress}`);
      console.log(`💰 Using Alchemy RPC: ${process.env.SOLANA_RPC_URL}`);
      
      // Start automated payout scheduler
      this.startPayoutScheduler();
    }
  
    /**
     * Get house wallet balance
     */
    async getHouseWalletBalance(): Promise<number> {
      try {
        const balance = await this.connection.getBalance(this.houseWallet.publicKey);
        return balance / LAMPORTS_PER_SOL;
      } catch (error) {
        console.error('Error getting house wallet balance:', error);
        throw error;
      }
    }
  
    /**
     * Validate if house wallet has sufficient funds
     */
    async validateHouseFunds(totalPayoutAmount: number): Promise<boolean> {
      const balance = await this.getHouseWalletBalance();
      const requiredAmount = totalPayoutAmount + 0.01; // Add 0.01 SOL buffer for fees
      
      if (balance < requiredAmount) {
        console.error(`❌ Insufficient house wallet funds. Balance: ${balance}, Required: ${requiredAmount}`);
        await this.notifyLowBalance(balance, requiredAmount);
        return false;
      }
      
      return true;
    }
  
    /**
     * Process a single payout transaction
     */
    async processSinglePayout(payoutRequest: PayoutRequest): Promise<PayoutResult> {
      try {
        console.log(`💸 Processing payout: ${payoutRequest.amount} SOL to ${payoutRequest.walletAddress}`);
        
        // Validate recipient wallet address
        let recipientPubkey: PublicKey;
        try {
          recipientPubkey = new PublicKey(payoutRequest.walletAddress);
        } catch (error) {
          return {
            success: false,
            error: 'Invalid wallet address',
            retryable: false
          };
        }
  
        // Create transaction with priority fee for faster processing
        const transaction = new Transaction();
        
        // Add compute budget instruction for priority fee
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10000, // 0.00001 SOL per compute unit
          })
        );
  
        // Add transfer instruction
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: this.houseWallet.publicKey,
          toPubkey: recipientPubkey,
          lamports: Math.floor(payoutRequest.amount * LAMPORTS_PER_SOL),
        });
        
        transaction.add(transferInstruction);
  
        // Get recent blockhash
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = this.houseWallet.publicKey;
  
        // Send and confirm transaction
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.houseWallet],
          {
            commitment: 'confirmed',
            maxRetries: 3,
          }
        );
  
        console.log(`✅ Payout successful! Signature: ${signature}`);
        
        return {
          success: true,
          signature,
          retryable: false
        };
  
      } catch (error: any) {
        console.error(`❌ Payout failed for ${payoutRequest.walletAddress}:`, error);
        
        // Determine if error is retryable
        const retryableErrors = [
          'blockhash not found',
          'Transaction was not confirmed',
          'Network error',
          'RPC request failed'
        ];
        
        const isRetryable = retryableErrors.some(retryError => 
          error.message?.toLowerCase().includes(retryError.toLowerCase())
        );
  
        return {
          success: false,
          error: error.message || 'Unknown error',
          retryable: isRetryable
        };
      }
    }
  
    /**
     * Get all pending payout requests
     */
    async getPendingPayoutRequests(): Promise<PayoutRequest[]> {
      try {
        const { data: users, error } = await this.supabase
          .from('profiles')
          .select(`
            id,
            wallet_address,
            total_referral_rewards,
            referral_rewards!inner(
              id,
              amount,
              description,
              status
            )
          `)
          .gte('total_referral_rewards', parseFloat(process.env.MINIMUM_PAYOUT_SOL || '0.1'))
          .not('wallet_address', 'is', null)
          .eq('referral_rewards.status', 'pending');
  
        if (error) throw error;
  
        const payoutRequests: PayoutRequest[] = [];
  
        for (const user of users || []) {
          const pendingRewards = user.referral_rewards.filter((r: any) => r.status === 'pending');
          const totalAmount = pendingRewards.reduce((sum: number, reward: any) => sum + parseFloat(reward.amount), 0);
  
          if (totalAmount >= parseFloat(process.env.MINIMUM_PAYOUT_SOL || '0.1')) {
            payoutRequests.push({
              id: `payout_${user.id}_${Date.now()}`,
              userId: user.id,
              amount: totalAmount,
              walletAddress: user.wallet_address,
              rewards: pendingRewards.map((r: any) => ({
                id: r.id,
                amount: parseFloat(r.amount),
                description: r.description
              }))
            });
          }
        }
  
        return payoutRequests;
        
      } catch (error) {
        console.error('Error getting pending payout requests:', error);
        throw error;
      }
    }
  
    /**
     * Process batch payouts with retry logic
     */
    async processBatchPayouts(): Promise<void> {
      console.log('🚀 Starting batch payout processing...');
      
      try {
        const payoutRequests = await this.getPendingPayoutRequests();
        
        if (payoutRequests.length === 0) {
          console.log('📝 No pending payouts to process');
          return;
        }
  
        console.log(`📋 Found ${payoutRequests.length} pending payouts`);
  
        // Validate house wallet has sufficient funds
        const totalPayoutAmount = payoutRequests.reduce((sum, req) => sum + req.amount, 0);
        const hasEnoughFunds = await this.validateHouseFunds(totalPayoutAmount);
        
        if (!hasEnoughFunds) {
          throw new Error('Insufficient house wallet funds');
        }
  
        // Process payouts in batches
        const batchSize = parseInt(process.env.BATCH_SIZE || '10');
        const batches = this.chunkArray(payoutRequests, batchSize);
  
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} payouts)`);
  
          // Process batch with delay between transactions
          for (const payoutRequest of batch) {
            await this.processPayoutWithRetry(payoutRequest);
            
            // Add small delay to avoid overwhelming the network
            await this.sleep(1000); // 1 second delay
          }
  
          // Longer delay between batches
          if (i < batches.length - 1) {
            console.log('⏳ Waiting 5 seconds before next batch...');
            await this.sleep(5000);
          }
        }
  
        console.log('✅ Batch payout processing completed!');
        
      } catch (error) {
        console.error('❌ Batch payout processing failed:', error);
        await this.notifyPayoutError(error);
      }
    }
  
    /**
     * Process single payout with retry logic
     */
    async processPayoutWithRetry(payoutRequest: PayoutRequest): Promise<void> {
      const maxRetries = parseInt(process.env.TRANSACTION_RETRY_ATTEMPTS || '3');
      let lastError: string = '';
  
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.processSinglePayout(payoutRequest);
  
          if (result.success && result.signature) {
            // Mark rewards as paid in database
            await this.markRewardsAsPaid(payoutRequest, result.signature);
            return;
          } else if (!result.retryable) {
            // Mark rewards as failed (non-retryable error)
            await this.markRewardsAsFailed(payoutRequest, result.error || 'Unknown error');
            return;
          } else {
            lastError = result.error || 'Unknown error';
            console.log(`⚠️ Payout attempt ${attempt}/${maxRetries} failed: ${lastError}`);
            
            if (attempt < maxRetries) {
              await this.sleep(2000 * attempt); // Exponential backoff
            }
          }
        } catch (error: any) {
          lastError = error.message || 'Unknown error';
          console.log(`⚠️ Payout attempt ${attempt}/${maxRetries} failed: ${lastError}`);
          
          if (attempt < maxRetries) {
            await this.sleep(2000 * attempt);
          }
        }
      }
  
      // All retries failed
      console.error(`❌ All payout attempts failed for ${payoutRequest.walletAddress}: ${lastError}`);
      await this.markRewardsAsFailed(payoutRequest, lastError);
    }
  
    /**
     * Mark rewards as paid in database
     */
    async markRewardsAsPaid(payoutRequest: PayoutRequest, signature: string): Promise<void> {
      try {
        const rewardIds = payoutRequest.rewards.map(r => r.id);
        
        // Update rewards status
        const { error: rewardsError } = await this.supabase
          .from('referral_rewards')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            transaction_id: signature
          })
          .in('id', rewardIds);
  
        if (rewardsError) throw rewardsError;
  
        // Create payout history record
        const { error: historyError } = await this.supabase
          .from('payout_history')
          .insert({
            user_id: payoutRequest.userId,
            amount: payoutRequest.amount,
            wallet_address: payoutRequest.walletAddress,
            transaction_signature: signature,
            status: 'completed',
            completed_at: new Date().toISOString()
          });
  
        if (historyError) throw historyError;
  
        // Update user's total rewards (this will be handled by the referral service)
        // await this.supabase.rpc('update_user_total_rewards', {
        //   user_id: payoutRequest.userId
        // });
  
        console.log(`✅ Database updated for user ${payoutRequest.userId}, signature: ${signature}`);
        
      } catch (error) {
        console.error('Error updating database after successful payout:', error);
        // Note: Transaction was successful but database update failed
        // This needs manual intervention
      }
    }
  
    /**
     * Mark rewards as failed in database
     */
    async markRewardsAsFailed(payoutRequest: PayoutRequest, errorMessage: string): Promise<void> {
      try {
        const rewardIds = payoutRequest.rewards.map(r => r.id);
        
        const { error } = await this.supabase
          .from('referral_rewards')
          .update({
            status: 'failed',
            failed_reason: errorMessage,
            updated_at: new Date().toISOString()
          })
          .in('id', rewardIds);
  
        if (error) throw error;
  
        // Create failed payout history record
        await this.supabase
          .from('payout_history')
          .insert({
            user_id: payoutRequest.userId,
            amount: payoutRequest.amount,
            wallet_address: payoutRequest.walletAddress,
            status: 'failed',
            failed_reason: errorMessage
          });
  
        console.log(`❌ Marked rewards as failed for user ${payoutRequest.userId}: ${errorMessage}`);
        
      } catch (error) {
        console.error('Error marking rewards as failed:', error);
      }
    }
  
    /**
     * Start automated payout scheduler
     */
    startPayoutScheduler(): void {
      if (process.env.ENABLE_AUTOMATIC_PAYOUTS !== 'true') {
        console.log('🚫 Automatic payouts disabled');
        return;
      }
  
      const schedulePattern = process.env.PAYOUT_SCHEDULE_CRON || '0 2 * * *';
      
      cron.schedule(schedulePattern, async () => {
        console.log('⏰ Scheduled payout processing triggered');
        await this.processBatchPayouts();
      }, {
        timezone: 'UTC'
      });
  
      console.log(`⏰ Payout scheduler started with pattern: ${schedulePattern}`);
    }
  
    /**
     * Manual payout trigger (for admin use)
     */
    async triggerManualPayout(adminWalletAddress?: string): Promise<void> {
      // Verify admin privileges if wallet address provided
      if (adminWalletAddress) {
        const adminWallets = (process.env.ADMIN_WALLET_ADDRESSES || process.env.HOUSE_WALLET_ADDRESS || '').split(',');
        if (!adminWallets.includes(adminWalletAddress)) {
          throw new Error('Unauthorized: Not an admin wallet');
        }
      }
  
      console.log('🔧 Manual payout triggered');
      await this.processBatchPayouts();
    }
  
    /**
     * Utility functions
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
      const chunks: T[][] = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    }
  
    private sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  
    /**
     * Notification functions
     */
    private async notifyLowBalance(currentBalance: number, requiredAmount: number): Promise<void> {
      // TODO: Implement notification system (email, Slack, Discord webhook, etc.)
      console.error(`🚨 LOW BALANCE ALERT: House wallet has ${currentBalance} SOL but needs ${requiredAmount} SOL`);
    }
  
    private async notifyPayoutError(error: any): Promise<void> {
      // TODO: Implement error notification system
      console.error('🚨 PAYOUT ERROR ALERT:', error);
    }
  
    /**
     * Get payout statistics
     */
    async getPayoutStats(): Promise<PayoutStats> {
      try {
        const { data: stats } = await this.supabase
          .from('payout_history')
          .select('amount, status, created_at')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days
  
        const totalPaid = stats?.filter((s: any) => s.status === 'completed').reduce((sum: number, s: any) => sum + parseFloat(s.amount), 0) || 0;
        const totalFailed = stats?.filter((s: any) => s.status === 'failed').length || 0;
        const houseBalance = await this.getHouseWalletBalance();
  
        return {
          houseWalletBalance: houseBalance,
          totalPaidLast30Days: totalPaid,
          failedPayoutsLast30Days: totalFailed,
          pendingPayouts: (await this.getPendingPayoutRequests()).length
        };
      } catch (error) {
        console.error('Error getting payout stats:', error);
        throw error;
      }
    }
  }
  
  // Export singleton instance
  export const solanaPayoutService = new SolanaPayoutService();
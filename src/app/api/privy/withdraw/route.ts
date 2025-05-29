// app/api/privy/withdraw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';

// Daily withdrawal limits (same as custodial)
const DAILY_WITHDRAWAL_LIMIT = 20.0; // 20 SOL per day
const MIN_WITHDRAWAL = 0.001;

async function checkDailyWithdrawalLimit(supabase: any, userId: string, amount: number): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Get today's withdrawals (both custodial and privy count toward same limit)
  const { data: todayWithdrawals, error } = await supabase
    .from('user_transactions')
    .select('amount')
    .eq('user_id', userId)
    .in('transaction_type', ['custodial_withdrawal', 'privy_withdrawal'])
    .eq('status', 'completed')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);
  
  if (error) {
    console.error('Error checking daily limit:', error);
    throw new Error('Failed to check daily withdrawal limit');
  }
  
  const usedToday = todayWithdrawals?.reduce((sum: number, tx: any) => sum + parseFloat(tx.amount.toString()), 0) || 0;
  const remaining = DAILY_WITHDRAWAL_LIMIT - usedToday;
  
  return {
    allowed: (usedToday + amount) <= DAILY_WITHDRAWAL_LIMIT,
    used: usedToday,
    remaining: Math.max(0, remaining)
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Privy wallet withdrawal request received');
    
    // Initialize services inside the handler
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Validate environment variables
    if (!SOLANA_RPC_URL || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing environment variables:', {
        hasSolanaRpc: !!SOLANA_RPC_URL,
        hasSupabaseUrl: !!SUPABASE_URL,
        hasSupabaseKey: !!SUPABASE_SERVICE_KEY
      });
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const body = await request.json();
    const { userId, walletAddress, amount, destinationAddress, signedTransaction } = body;
    
    console.log('📋 Withdrawal details:', { userId, walletAddress, amount, destinationAddress, hasSignedTx: !!signedTransaction });
    
    // Validate inputs
    if (!userId || !walletAddress || !amount || !destinationAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, walletAddress, amount, destinationAddress' },
        { status: 400 }
      );
    }
    
    if (amount < MIN_WITHDRAWAL || amount > DAILY_WITHDRAWAL_LIMIT) {
      return NextResponse.json(
        { error: `Invalid amount. Must be between ${MIN_WITHDRAWAL} and ${DAILY_WITHDRAWAL_LIMIT} SOL` },
        { status: 400 }
      );
    }
    
    // Validate addresses
    let userPublicKey: PublicKey;
    let destinationPublicKey: PublicKey;
    
    try {
      userPublicKey = new PublicKey(walletAddress);
      destinationPublicKey = new PublicKey(destinationAddress);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid wallet or destination address' },
        { status: 400 }
      );
    }
    
    // Check daily withdrawal limit
    const dailyCheck = await checkDailyWithdrawalLimit(supabase, userId, amount);
    if (!dailyCheck.allowed) {
      return NextResponse.json(
        { 
          error: `Daily withdrawal limit exceeded. Used: ${dailyCheck.used.toFixed(3)} SOL, Remaining: ${dailyCheck.remaining.toFixed(3)} SOL, Limit: ${DAILY_WITHDRAWAL_LIMIT} SOL`,
          dailyLimits: {
            used: dailyCheck.used,
            remaining: dailyCheck.remaining,
            limit: DAILY_WITHDRAWAL_LIMIT
          }
        },
        { status: 400 }
      );
    }
    
    // Verify the wallet belongs to the user by checking Privy wallet registration
    const { data: privyWallet, error: privyError } = await supabase
      .from('privy_wallets')
      .select('privy_wallet_address, balance')
      .eq('user_id', userId)
      .single();
    
    if (privyError || !privyWallet || privyWallet.privy_wallet_address !== walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address does not match user\'s registered Privy wallet' },
        { status: 400 }
      );
    }
    
    // Check current balance on blockchain
    const balanceResponse = await solanaConnection.getBalance(userPublicKey);
    const currentBalance = balanceResponse / LAMPORTS_PER_SOL;
    
    if (currentBalance < amount + 0.001) { // Include fee buffer
      return NextResponse.json(
        { 
          error: `Insufficient Privy wallet balance. Available: ${currentBalance.toFixed(3)} SOL, Required: ${(amount + 0.001).toFixed(3)} SOL (including fees)` 
        },
        { status: 400 }
      );
    }
    
    if (!signedTransaction) {
      // Step 1: Create unsigned transaction for user to sign
      console.log('📝 Creating unsigned transaction for user to sign...');
      
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: userPublicKey,
          toPubkey: destinationPublicKey,
          lamports: lamports
        })
      );
      
      // Add memo for transaction identification
      const memo = `privy-withdrawal-${userId}-${Date.now()}`;
      transaction.add(
        new TransactionInstruction({
          keys: [],
          programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
          data: Buffer.from(memo, 'utf8')
        })
      );
      
      // Set recent blockhash and fee payer
      const { blockhash } = await solanaConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPublicKey;
      
      // Serialize transaction for user to sign
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const base64Transaction = serializedTransaction.toString('base64');
      
      return NextResponse.json({
        success: false,
        action: 'signature_required',
        unsignedTransaction: base64Transaction,
        message: 'Transaction created - please sign with your Privy wallet',
        withdrawalDetails: {
          from: walletAddress,
          to: destinationAddress,
          amount: amount,
          currentBalance: currentBalance,
          estimatedFee: 0.001
        },
        dailyLimits: {
          used: dailyCheck.used,
          remaining: dailyCheck.remaining,
          limit: DAILY_WITHDRAWAL_LIMIT
        },
        instructions: [
          'Use your Privy wallet to sign this transaction',
          'This will send SOL directly from your embedded wallet to the destination',
          'Send the signed transaction back to complete the withdrawal'
        ]
      });
    }
    
    // Step 2: Process signed transaction
    console.log('💸 Processing signed withdrawal transaction...');
    
    try {
      const transactionBuffer = Buffer.from(signedTransaction, 'base64');
      
      // Submit to blockchain
      const signature = await solanaConnection.sendRawTransaction(
        transactionBuffer,
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );
      
      console.log(`📡 Transaction submitted: ${signature}`);
      
      // Wait for confirmation
      const confirmation = await Promise.race([
        solanaConnection.confirmTransaction(signature, 'confirmed'),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000)
        )
      ]);
      
      if (confirmation && confirmation.value && confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log(`✅ Withdrawal transaction confirmed: ${signature}`);
      
      // Update Privy wallet balance in database
      const newBalance = currentBalance - amount - 0.001; // Approximate fee deduction
      
      try {
        await supabase
          .from('privy_wallets')
          .update({ 
            balance: Math.max(0, newBalance),
            last_balance_update: new Date().toISOString(),
            last_used: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
      } catch (updateError) {
        console.warn('⚠️ Failed to update Privy wallet balance in database:', updateError);
        // Non-critical error, withdrawal was successful
      }
      
      // Log withdrawal transaction
      try {
        await supabase
          .from('user_transactions')
          .insert({
            user_id: userId,
            transaction_type: 'privy_withdrawal',
            amount: amount,
            source_address: walletAddress,
            destination_address: destinationAddress,
            transaction_id: signature,
            status: 'completed',
            created_at: new Date().toISOString()
          });
      } catch (logError) {
        console.warn('⚠️ Failed to log withdrawal transaction:', logError);
        // Non-critical error, withdrawal was successful
      }
      
      // Get updated balance from blockchain for accuracy
      let finalBalance = currentBalance - amount;
      try {
        const updatedBalanceResponse = await solanaConnection.getBalance(userPublicKey);
        finalBalance = updatedBalanceResponse / LAMPORTS_PER_SOL;
      } catch (balanceError) {
        console.warn('⚠️ Failed to get updated balance:', balanceError);
      }
      
      // Get updated daily limit info
      const updatedDailyCheck = await checkDailyWithdrawalLimit(supabase, userId, 0);
      
      console.log(`✅ Privy withdrawal completed: ${amount} SOL to ${destinationAddress}, New balance: ${finalBalance.toFixed(3)} SOL`);
      
      return NextResponse.json({
        success: true,
        message: `Successfully withdrew ${amount} SOL from Privy wallet`,
        transactionId: signature,
        newPrivyBalance: finalBalance,
        dailyLimits: {
          used: updatedDailyCheck.used,
          remaining: updatedDailyCheck.remaining,
          limit: DAILY_WITHDRAWAL_LIMIT
        },
        withdrawalDetails: {
          amount,
          sourceAddress: walletAddress,
          destinationAddress,
          transactionId: signature,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (transactionError) {
      console.error('❌ Transaction processing failed:', transactionError);
      return NextResponse.json(
        { 
          error: 'Failed to process signed transaction',
          details: transactionError instanceof Error ? transactionError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('❌ Privy withdrawal error:', error);
    return NextResponse.json(
      { 
        error: 'Withdrawal failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Privy wallet withdrawal endpoint',
    methods: ['POST'],
    requiredFields: ['userId', 'walletAddress', 'amount', 'destinationAddress'],
    optionalFields: ['signedTransaction'],
    process: [
      '1. First call without signedTransaction to get unsigned transaction',
      '2. Sign transaction with Privy wallet',
      '3. Second call with signedTransaction to complete withdrawal'
    ],
    limits: {
      minAmount: MIN_WITHDRAWAL,
      dailyLimit: DAILY_WITHDRAWAL_LIMIT,
      note: 'Daily limit is shared with custodial withdrawals and resets at midnight UTC'
    },
    timestamp: new Date().toISOString()
  });
}
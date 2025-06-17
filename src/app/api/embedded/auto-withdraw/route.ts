// app/api/embedded/auto-withdraw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';

// Daily withdrawal limits (shared with custodial and privy withdrawals)
const DAILY_WITHDRAWAL_LIMIT = 10.0; // 10 SOL per day
const MIN_WITHDRAWAL = 0.05;
const MAX_WITHDRAWAL_PER_TRANSACTION = 5.0; // 5 SOL max per single transaction

async function checkDailyWithdrawalLimit(supabase: any, userId: string, amount: number): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Get today's withdrawals (custodial, privy, and embedded all count toward same limit)
  const { data: todayWithdrawals, error } = await supabase
    .from('user_transactions')
    .select('amount')
    .eq('user_id', userId)
    .in('transaction_type', ['custodial_withdrawal', 'privy_withdrawal', 'embedded_withdrawal'])
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

async function validateEmbeddedWallet(supabase: any, userId: string, walletAddress: string): Promise<boolean> {
  try {
    // Check if this wallet is registered as the user's embedded wallet
    const { data: user, error } = await supabase
      .from('users')
      .select('wallet_address')
      .eq('id', userId)
      .single();
    
    if (error || !user) {
      console.error('User not found:', error);
      return false;
    }
    
    // Check if wallet address matches (case-insensitive)
    const userWallet = user.wallet_address?.toLowerCase();
    const providedWallet = walletAddress.toLowerCase();
    
    if (userWallet !== providedWallet) {
      console.error('Wallet address mismatch:', { userWallet, providedWallet });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error validating embedded wallet:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Auto-withdrawal request received');
    
    // Initialize services
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
    const { userId, walletAddress, amount, destinationAddress } = body;
    
    console.log('📋 Auto-withdrawal details:', { userId, walletAddress, amount, destinationAddress });
    
    // Validate inputs
    if (!userId || !walletAddress || !amount || !destinationAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, walletAddress, amount, destinationAddress' },
        { status: 400 }
      );
    }
    
    // Validate amount
    if (typeof amount !== 'number' || amount < MIN_WITHDRAWAL || amount > MAX_WITHDRAWAL_PER_TRANSACTION) {
      return NextResponse.json(
        { error: `Invalid amount. Must be between ${MIN_WITHDRAWAL} and ${MAX_WITHDRAWAL_PER_TRANSACTION} SOL` },
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
    
    // Validate that this wallet belongs to the user
    const isValidWallet = await validateEmbeddedWallet(supabase, userId, walletAddress);
    if (!isValidWallet) {
      return NextResponse.json(
        { error: 'Wallet address does not belong to this user' },
        { status: 403 }
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
    
    // Check current balance on blockchain
    const balanceResponse = await solanaConnection.getBalance(userPublicKey);
    const currentBalance = balanceResponse / LAMPORTS_PER_SOL;
    
    const requiredAmount = amount + 0.001; // Include fee buffer
    if (currentBalance < requiredAmount) {
      return NextResponse.json(
        { 
          error: `Insufficient embedded wallet balance. Available: ${currentBalance.toFixed(6)} SOL, Required: ${requiredAmount.toFixed(6)} SOL (including fees)`,
          balanceInfo: {
            available: currentBalance,
            requested: amount,
            fees: 0.001,
            required: requiredAmount
          }
        },
        { status: 400 }
      );
    }
    
    // 🚀 STEP 1: Create unsigned transaction for client-side auto-signing
    console.log('📝 Creating unsigned transaction for client auto-signing...');
    
    try {
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash('confirmed');
      
      // Create transaction
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: userPublicKey
      });
      
      // Add transfer instruction
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userPublicKey,
          toPubkey: destinationPublicKey,
          lamports: lamports
        })
      );
      
      // Add memo for transaction identification
      const memo = `auto-withdrawal-${userId}-${Date.now()}`;
      try {
        transaction.add(
          new TransactionInstruction({
            keys: [],
            programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            data: Buffer.from(memo, 'utf8')
          })
        );
      } catch (memoError) {
        console.warn('⚠️ Failed to add memo instruction:', memoError);
        // Continue without memo if it fails
      }
      
      // Serialize transaction for client signing
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const base64Transaction = serializedTransaction.toString('base64');
      
      // Store pending withdrawal in database for tracking
      try {
        await supabase
          .from('user_transactions')
          .insert({
            user_id: userId,
            transaction_type: 'embedded_withdrawal',
            amount: amount,
            source_address: walletAddress,
            destination_address: destinationAddress,
            status: 'pending',
            transaction_data: {
              blockhash,
              lastValidBlockHeight,
              memo,
              unsignedTransaction: base64Transaction
            },
            created_at: new Date().toISOString()
          });
      } catch (dbError) {
        console.warn('⚠️ Failed to store pending withdrawal:', dbError);
        // Continue even if database logging fails
      }
      
      console.log('✅ Unsigned transaction created successfully');
      
      return NextResponse.json({
        success: true,
        action: 'auto_sign_required',
        unsignedTransaction: base64Transaction,
        message: 'Transaction created for auto-signing',
        withdrawalDetails: {
          from: walletAddress,
          to: destinationAddress,
          amount: amount,
          currentBalance: currentBalance,
          estimatedFee: 0.001,
          blockhash,
          lastValidBlockHeight
        },
        dailyLimits: {
          used: dailyCheck.used,
          remaining: dailyCheck.remaining,
          limit: DAILY_WITHDRAWAL_LIMIT
        },
        instructions: [
          'Use the embedded wallet to auto-sign this transaction',
          'The transaction will be automatically broadcast to the blockchain',
          'Confirmation will be handled by the client'
        ]
      });
      
    } catch (transactionError) {
      console.error('❌ Failed to create unsigned transaction:', transactionError);
      return NextResponse.json(
        { 
          error: 'Failed to create withdrawal transaction',
          details: transactionError instanceof Error ? transactionError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('❌ Auto-withdrawal error:', error);
    return NextResponse.json(
      { 
        error: 'Auto-withdrawal failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Embedded wallet auto-withdrawal endpoint',
    methods: ['POST'],
    requiredFields: ['userId', 'walletAddress', 'amount', 'destinationAddress'],
    process: [
      '1. Validates user and wallet ownership',
      '2. Checks daily withdrawal limits',
      '3. Verifies blockchain balance',
      '4. Creates unsigned transaction for client auto-signing',
      '5. Client auto-signs and broadcasts transaction',
      '6. Optional: Client calls confirm endpoint to update database'
    ],
    limits: {
      minAmount: MIN_WITHDRAWAL,
      maxPerTransaction: MAX_WITHDRAWAL_PER_TRANSACTION,
      dailyLimit: DAILY_WITHDRAWAL_LIMIT,
      note: 'Daily limit is shared across all withdrawal methods'
    },
    features: [
      'Auto-signing compatible',
      'Daily limit enforcement',
      'Real-time balance verification',
      'Transaction memo support',
      'Database transaction tracking'
    ],
    timestamp: new Date().toISOString()
  });
}
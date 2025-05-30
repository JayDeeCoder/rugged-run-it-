// app/api/custodial/simple-withdraw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import bs58 from 'bs58';

// Withdrawal limits for custodial-only mode
const DAILY_WITHDRAWAL_LIMIT = 20.0; // 20 SOL per day (higher than hybrid mode)
const MIN_WITHDRAWAL = 0.002;
const MAX_SINGLE_WITHDRAWAL = 5.0; // 50 SOL per transaction

async function checkDailyWithdrawalLimit(supabase: any, userId: string, amount: number): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Get today's withdrawals for custodial mode
  const { data: todayWithdrawals, error } = await supabase
    .from('user_transactions')
    .select('amount')
    .eq('user_id', userId)
    .in('transaction_type', ['custodial_withdrawal_simple', 'custodial_withdrawal'])
    .eq('status', 'completed')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);
  
  if (error) {
    console.error('Error checking daily withdrawal limit:', error);
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
    console.log('🏦 Simple custodial withdrawal request received');
    
    // Environment variables validation
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const HOUSE_WALLET_PRIVATE_KEY = process.env.HOUSE_WALLET_PRIVATE_KEY;
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    console.log('🔍 Environment check:', {
      hasSolanaRpc: !!SOLANA_RPC_URL,
      hasHouseWalletKey: !!HOUSE_WALLET_PRIVATE_KEY,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasSupabaseKey: !!SUPABASE_SERVICE_KEY
    });

    if (!SOLANA_RPC_URL || !HOUSE_WALLET_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing environment variables for custodial withdrawals');
      return NextResponse.json(
        { 
          error: 'Server configuration incomplete for custodial withdrawals',
          details: 'Missing required environment variables'
        },
        { status: 500 }
      );
    }

    const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const houseWallet = Keypair.fromSecretKey(bs58.decode(HOUSE_WALLET_PRIVATE_KEY));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const body = await request.json();
    const { userId, amount, destinationAddress } = body;
    
    console.log('📋 Withdrawal details:', { userId, amount, destinationAddress });
    
    // Validate inputs
    if (!userId || !amount || !destinationAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, amount, destinationAddress' },
        { status: 400 }
      );
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive number.' },
        { status: 400 }
      );
    }
    
    if (amount < MIN_WITHDRAWAL || amount > MAX_SINGLE_WITHDRAWAL) {
      return NextResponse.json(
        { 
          error: `Amount must be between ${MIN_WITHDRAWAL} and ${MAX_SINGLE_WITHDRAWAL} SOL`,
          limits: {
            min: MIN_WITHDRAWAL,
            max: MAX_SINGLE_WITHDRAWAL,
            dailyLimit: DAILY_WITHDRAWAL_LIMIT
          }
        },
        { status: 400 }
      );
    }
    
    // Validate destination address
    try {
      new PublicKey(destinationAddress);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid destination wallet address. Please check the address format.' },
        { status: 400 }
      );
    }
    
    // Check daily withdrawal limit
    try {
      const dailyCheck = await checkDailyWithdrawalLimit(supabase, userId, amount);
      if (!dailyCheck.allowed) {
        return NextResponse.json(
          { 
            error: `Daily withdrawal limit exceeded`,
            dailyLimits: {
              used: dailyCheck.used,
              remaining: dailyCheck.remaining,
              limit: DAILY_WITHDRAWAL_LIMIT,
              requestedAmount: amount
            }
          },
          { status: 400 }
        );
      }
    } catch (limitError) {
      console.error('❌ Daily limit check failed:', limitError);
      return NextResponse.json(
        { error: 'Failed to check withdrawal limits. Please try again.' },
        { status: 500 }
      );
    }
    
    // Get user's custodial balance
    const { data: userWallet, error: walletError } = await supabase
      .from('user_hybrid_wallets')
      .select('custodial_balance, user_id')
      .eq('user_id', userId)
      .single();
    
    if (walletError || !userWallet) {
      console.error('❌ User wallet not found:', walletError);
      return NextResponse.json(
        { error: 'User wallet not found. Please make a deposit first to create your account.' },
        { status: 404 }
      );
    }
    
    const custodialBalance = parseFloat(userWallet.custodial_balance) || 0;
    console.log(`💰 User balance: ${custodialBalance} SOL, Requested: ${amount} SOL`);
    
    // Check sufficient balance
    if (custodialBalance < amount) {
      return NextResponse.json(
        { 
          error: `Insufficient balance`,
          balanceInfo: {
            available: custodialBalance.toFixed(6),
            requested: amount.toFixed(6),
            shortage: (amount - custodialBalance).toFixed(6)
          }
        },
        { status: 400 }
      );
    }
    
    // Create and send transaction
    console.log('💸 Processing withdrawal from house wallet to user wallet...');
    
    try {
      const destinationPublicKey = new PublicKey(destinationAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: houseWallet.publicKey,
          toPubkey: destinationPublicKey,
          lamports: lamports
        })
      );
      
      const { blockhash } = await solanaConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = houseWallet.publicKey;
      
      // Sign and send transaction
      transaction.sign(houseWallet);
      const signature = await solanaConnection.sendRawTransaction(transaction.serialize());
      
      console.log(`📡 Transaction submitted: ${signature}`);
      
      // Wait for confirmation
      await solanaConnection.confirmTransaction(signature, 'confirmed');
      
      console.log(`✅ Withdrawal transaction confirmed: ${signature}`);
      
      // Update user balance in database
      const newBalance = custodialBalance - amount;
      
      const { error: updateError } = await supabase
        .from('user_hybrid_wallets')
        .update({ 
          custodial_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
      
      if (updateError) {
        console.error('❌ Failed to update user balance:', updateError);
        // This is critical - transaction succeeded but balance wasn't updated
        return NextResponse.json(
          { 
            error: 'Withdrawal completed but balance update failed. Please contact support immediately.',
            transactionId: signature,
            criticalError: true
          },
          { status: 500 }
        );
      }
      
      // Log the withdrawal transaction
      try {
        await supabase
          .from('user_transactions')
          .insert({
            user_id: userId,
            transaction_type: 'custodial_withdrawal_simple',
            amount: amount,
            destination_address: destinationAddress,
            transaction_id: signature,
            status: 'completed',
            created_at: new Date().toISOString()
          });
      } catch (logError) {
        console.warn('⚠️ Failed to log transaction (non-critical):', logError);
        // Non-critical error, withdrawal was successful
      }
      
      // Get updated daily limits
      const updatedDailyCheck = await checkDailyWithdrawalLimit(supabase, userId, 0);
      
      console.log(`✅ Simple custodial withdrawal completed successfully`);
      console.log(`   Amount: ${amount} SOL`);
      console.log(`   Destination: ${destinationAddress}`);
      console.log(`   Transaction: ${signature}`);
      console.log(`   New Balance: ${newBalance.toFixed(6)} SOL`);
      
      return NextResponse.json({
        success: true,
        message: `Successfully withdrew ${amount} SOL to your wallet`,
        withdrawal: {
          amount,
          destinationAddress,
          transactionId: signature,
          newBalance: parseFloat(newBalance.toFixed(6)),
          timestamp: new Date().toISOString()
        },
        transactionUrl: `https://solscan.io/tx/${signature}`,
        dailyLimits: {
          used: updatedDailyCheck.used,
          remaining: updatedDailyCheck.remaining,
          limit: DAILY_WITHDRAWAL_LIMIT
        }
      });
      
    } catch (transactionError) {
      console.error('❌ Blockchain transaction failed:', transactionError);
      return NextResponse.json(
        { 
          error: 'Withdrawal transaction failed',
          details: transactionError instanceof Error ? transactionError.message : 'Unknown blockchain error',
          suggestion: 'Please try again. If the problem persists, contact support.'
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('❌ Simple custodial withdrawal error:', error);
    return NextResponse.json(
      { 
        error: 'Withdrawal request failed',
        details: error instanceof Error ? error.message : 'Unknown server error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      message: 'Simple custodial withdrawal endpoint',
      description: 'Withdraw SOL directly from custodial balance to any Solana wallet',
      methods: ['POST'],
      requiredFields: ['userId', 'amount', 'destinationAddress'],
      limits: {
        minAmount: MIN_WITHDRAWAL,
        maxSingleWithdrawal: MAX_SINGLE_WITHDRAWAL,
        dailyLimit: DAILY_WITHDRAWAL_LIMIT,
        note: 'Daily limit resets at midnight UTC'
      },
      features: [
        'Instant processing from custodial balance',
        'Daily withdrawal limits for security',
        'Automatic transaction logging',
        'Real-time balance updates'
      ],
      exampleRequest: {
        userId: 'user123',
        amount: 1.5,
        destinationAddress: 'YourSolanaWalletAddressHere...'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get endpoint info' },
      { status: 500 }
    );
  }
}
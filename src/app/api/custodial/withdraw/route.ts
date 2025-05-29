// app/api/custodial/withdraw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import bs58 from 'bs58';

// Daily withdrawal limits
const DAILY_WITHDRAWAL_LIMIT = 20.0; // 20 SOL per day
const MIN_WITHDRAWAL = 0.001;

async function checkDailyWithdrawalLimit(supabase: any, userId: string, amount: number): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Get today's withdrawals
  const { data: todayWithdrawals, error } = await supabase
    .from('user_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('transaction_type', 'custodial_withdrawal')
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
    console.log('🔄 Custodial withdrawal request received');
    
    // Initialize services inside the handler
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const HOUSE_WALLET_PRIVATE_KEY = process.env.HOUSE_WALLET_PRIVATE_KEY;
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Validate environment variables
    if (!SOLANA_RPC_URL || !HOUSE_WALLET_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing environment variables:', {
        hasSolanaRpc: !!SOLANA_RPC_URL,
        hasHouseWallet: !!HOUSE_WALLET_PRIVATE_KEY,
        hasSupabaseUrl: !!SUPABASE_URL,
        hasSupabaseKey: !!SUPABASE_SERVICE_KEY
      });
      return NextResponse.json(
        { error: 'Server configuration error' },
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
    
    if (amount < MIN_WITHDRAWAL || amount > DAILY_WITHDRAWAL_LIMIT) {
      return NextResponse.json(
        { error: `Invalid amount. Must be between ${MIN_WITHDRAWAL} and ${DAILY_WITHDRAWAL_LIMIT} SOL` },
        { status: 400 }
      );
    }
    
    // Validate destination address
    try {
      new PublicKey(destinationAddress);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid destination address' },
        { status: 400 }
      );
    }
    
    // Check daily withdrawal limit
    const dailyCheck = await checkDailyWithdrawalLimit(supabase, userId, amount);
    if (!dailyCheck.allowed) {
      return NextResponse.json(
        { 
          error: `Daily withdrawal limit exceeded. Used: ${dailyCheck.used.toFixed(3)} SOL, Remaining: ${dailyCheck.remaining.toFixed(3)} SOL, Limit: ${DAILY_WITHDRAWAL_LIMIT} SOL` 
        },
        { status: 400 }
      );
    }
    
    // Get user's custodial balance from your hybrid wallet system
    const { data: userWallet, error: walletError } = await supabase
      .from('user_hybrid_wallets')
      .select('custodial_balance')
      .eq('user_id', userId)
      .single();
    
    if (walletError || !userWallet) {
      return NextResponse.json(
        { error: 'User wallet not found. Please make a deposit first.' },
        { status: 404 }
      );
    }
    
    const custodialBalance = parseFloat(userWallet.custodial_balance) || 0;
    
    // Check sufficient balance
    if (custodialBalance < amount) {
      return NextResponse.json(
        { 
          error: `Insufficient custodial balance. Available: ${custodialBalance.toFixed(3)} SOL, Required: ${amount} SOL` 
        },
        { status: 400 }
      );
    }
    
    // Create and send transaction using house wallet
    console.log('💸 Sending SOL from house wallet to destination...');
    
    const destinationPublicKey = new PublicKey(destinationAddress);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: houseWallet.publicKey,
        toPubkey: destinationPublicKey,
        lamports: lamports
      })
    );
    
    // Set recent blockhash and fee payer
    const { blockhash } = await solanaConnection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = houseWallet.publicKey;
    
    // Sign and send transaction
    transaction.sign(houseWallet);
    const signature = await solanaConnection.sendRawTransaction(transaction.serialize());
    
    // Wait for confirmation
    await solanaConnection.confirmTransaction(signature, 'confirmed');
    
    console.log(`✅ Withdrawal transaction confirmed: ${signature}`);
    
    // Update user's custodial balance in database
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
      // Transaction was sent but balance update failed - this is a critical issue
      return NextResponse.json(
        { 
          error: 'Withdrawal completed but balance update failed. Please contact support.',
          transactionId: signature 
        },
        { status: 500 }
      );
    }
    
    // Log withdrawal transaction
    try {
      await supabase
        .from('user_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'custodial_withdrawal',
          amount: amount,
          destination_address: destinationAddress,
          transaction_id: signature,
          status: 'completed',
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.warn('⚠️ Failed to log withdrawal transaction:', logError);
      // Non-critical error, withdrawal was successful
    }
    
    // Get updated daily limit info
    const updatedDailyCheck = await checkDailyWithdrawalLimit(supabase, userId, 0);
    
    console.log(`✅ Custodial withdrawal completed: ${amount} SOL to ${destinationAddress}, New balance: ${newBalance.toFixed(3)} SOL`);
    
    return NextResponse.json({
      success: true,
      message: `Successfully withdrew ${amount} SOL from custodial balance`,
      transactionId: signature,
      newCustodialBalance: newBalance,
      dailyLimits: {
        used: updatedDailyCheck.used,
        remaining: updatedDailyCheck.remaining,
        limit: DAILY_WITHDRAWAL_LIMIT
      },
      withdrawalDetails: {
        amount,
        destinationAddress,
        transactionId: signature,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Custodial withdrawal error:', error);
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
    message: 'Custodial withdrawal endpoint',
    methods: ['POST'],
    requiredFields: ['userId', 'amount', 'destinationAddress'],
    limits: {
      minAmount: MIN_WITHDRAWAL,
      dailyLimit: DAILY_WITHDRAWAL_LIMIT,
      note: 'Daily limit resets at midnight UTC'
    },
    timestamp: new Date().toISOString()
  });
}
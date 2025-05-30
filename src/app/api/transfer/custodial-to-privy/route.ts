// app/api/transfer/custodial-to-privy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair, TransactionInstruction } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import bs58 from 'bs58';

// Minimum transfer amount
const MIN_TRANSFER = 0.002;
// Daily transfer limits (optional - you can adjust or remove)
const DAILY_TRANSFER_LIMIT = 20.0; // 50 SOL per day

async function checkDailyTransferLimit(supabase: any, userId: string, amount: number): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Get today's custodial to privy transfers
  const { data: todayTransfers, error } = await supabase
    .from('user_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('transaction_type', 'custodial_to_privy_transfer')
    .eq('status', 'completed')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);
  
  if (error) {
    console.error('Error checking daily transfer limit:', error);
    throw new Error('Failed to check daily transfer limit');
  }
  
  const usedToday = todayTransfers?.reduce((sum: number, tx: any) => sum + parseFloat(tx.amount.toString()), 0) || 0;
  const remaining = DAILY_TRANSFER_LIMIT - usedToday;
  
  return {
    allowed: (usedToday + amount) <= DAILY_TRANSFER_LIMIT,
    used: usedToday,
    remaining: Math.max(0, remaining)
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Custodial to Privy transfer request received');
    
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
    const { userId, amount } = body;
    
    console.log('📋 Transfer details:', { userId, amount });
    
    // Validate inputs
    if (!userId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, amount' },
        { status: 400 }
      );
    }
    
    if (amount < MIN_TRANSFER || amount > DAILY_TRANSFER_LIMIT) {
      return NextResponse.json(
        { error: `Invalid amount. Must be between ${MIN_TRANSFER} and ${DAILY_TRANSFER_LIMIT} SOL` },
        { status: 400 }
      );
    }
    
    // Check daily transfer limit (optional - you can remove this if not needed)
    const dailyCheck = await checkDailyTransferLimit(supabase, userId, amount);
    if (!dailyCheck.allowed) {
      return NextResponse.json(
        { 
          error: `Daily transfer limit exceeded. Used: ${dailyCheck.used.toFixed(3)} SOL, Remaining: ${dailyCheck.remaining.toFixed(3)} SOL, Limit: ${DAILY_TRANSFER_LIMIT} SOL` 
        },
        { status: 400 }
      );
    }
    
    // Get user's custodial balance
    const { data: userWallet, error: walletError } = await supabase
      .from('user_hybrid_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (walletError || !userWallet) {
      return NextResponse.json(
        { error: 'User custodial wallet not found. Please make a deposit first.' },
        { status: 404 }
      );
    }
    
    const custodialBalance = parseFloat(userWallet.custodial_balance) || 0;
    
    // Check sufficient custodial balance
    if (custodialBalance < amount) {
      return NextResponse.json(
        { 
          error: `Insufficient custodial balance. Available: ${custodialBalance.toFixed(6)} SOL, Required: ${amount} SOL` 
        },
        { status: 400 }
      );
    }
    
    // Get user's Privy wallet info
    const { data: privyWallet, error: privyError } = await supabase
      .from('privy_wallets')
      .select('privy_wallet_address')
      .eq('user_id', userId)
      .single();
    
    if (privyError || !privyWallet) {
      return NextResponse.json(
        { error: 'Privy wallet not found for user' },
        { status: 404 }
      );
    }
    
    const userPublicKey = new PublicKey(privyWallet.privy_wallet_address);
    
    // Create and send transaction from house wallet to user's embedded wallet
    console.log('💸 Sending SOL from house wallet to embedded wallet...');
    
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: houseWallet.publicKey,
        toPubkey: userPublicKey,
        lamports: lamports
      })
    );
    
    // Add memo for transaction identification
    const memo = `custodial-to-privy-${userId}-${Date.now()}`;
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
    transaction.feePayer = houseWallet.publicKey;
    
    // Sign and send transaction
    transaction.sign(houseWallet);
    const signature = await solanaConnection.sendRawTransaction(transaction.serialize());
    
    // Wait for confirmation
    await solanaConnection.confirmTransaction(signature, 'confirmed');
    
    console.log(`✅ Transfer transaction confirmed: ${signature}`);
    
    // Update user's custodial balance in database
    const newCustodialBalance = custodialBalance - amount;
    const newTotalTransfersToEmbedded = parseFloat(userWallet.total_transfers_to_embedded || '0') + amount;
    
    const { error: updateError } = await supabase
      .from('user_hybrid_wallets')
      .update({ 
        custodial_balance: newCustodialBalance,
        total_transfers_to_embedded: newTotalTransfersToEmbedded,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('❌ Failed to update user custodial balance:', updateError);
      // Transaction was sent but balance update failed - this is a critical issue
      return NextResponse.json(
        { 
          error: 'Transfer completed but balance update failed. Please contact support.',
          transactionId: signature 
        },
        { status: 500 }
      );
    }
    
    // Get updated embedded wallet balance from blockchain
    let newEmbeddedBalance = 0;
    try {
      const balanceResponse = await solanaConnection.getBalance(userPublicKey);
      newEmbeddedBalance = balanceResponse / LAMPORTS_PER_SOL;
      
      // Update embedded balance in Privy wallet record
      await supabase
        .from('privy_wallets')
        .update({ 
          balance: newEmbeddedBalance,
          last_balance_update: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    } catch (balanceError) {
      console.warn('⚠️ Failed to update embedded wallet balance:', balanceError);
      // Non-critical error, transfer was successful
    }
    
    // Log transfer transaction
    try {
      await supabase
        .from('user_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'custodial_to_privy_transfer',
          amount: amount,
          source_address: houseWallet.publicKey.toString(),
          destination_address: privyWallet.privy_wallet_address,
          transaction_id: signature,
          status: 'completed',
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.warn('⚠️ Failed to log transfer transaction:', logError);
      // Non-critical error, transfer was successful
    }
    
    // Get updated daily limit info
    const updatedDailyCheck = await checkDailyTransferLimit(supabase, userId, 0);
    
    console.log(`✅ Custodial to Privy transfer completed: ${amount} SOL, New custodial balance: ${newCustodialBalance.toFixed(3)} SOL, New embedded balance: ${newEmbeddedBalance.toFixed(3)} SOL`);
    
    return NextResponse.json({
      success: true,
      message: `Successfully transferred ${amount} SOL from custodial balance to embedded wallet`,
      transactionId: signature,
      newCustodialBalance: newCustodialBalance,
      newEmbeddedBalance: newEmbeddedBalance,
      dailyLimits: {
        used: updatedDailyCheck.used,
        remaining: updatedDailyCheck.remaining,
        limit: DAILY_TRANSFER_LIMIT
      },
      transferDetails: {
        amount,
        sourceAddress: houseWallet.publicKey.toString(),
        destinationAddress: privyWallet.privy_wallet_address,
        transactionId: signature,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Custodial to Privy transfer error:', error);
    return NextResponse.json(
      { 
        error: 'Transfer failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Custodial to Privy transfer endpoint',
    methods: ['POST'],
    requiredFields: ['userId', 'amount'],
    description: 'Transfers SOL from custodial balance to embedded Privy wallet',
    limits: {
      minAmount: MIN_TRANSFER,
      dailyLimit: DAILY_TRANSFER_LIMIT,
      note: 'Daily limit resets at midnight UTC'
    },
    timestamp: new Date().toISOString()
  });
}
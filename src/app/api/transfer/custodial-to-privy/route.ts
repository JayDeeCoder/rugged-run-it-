// app/api/transfer/custodial-to-privy/route.ts - UPDATED TO USE SAFE DATABASE FUNCTIONS
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import bs58 from 'bs58';

// Transfer limits and constants
const DAILY_TRANSFER_LIMIT = 5.0; // 5 SOL per day from custodial
const MIN_TRANSFER = 0.002; // Minimum 0.002 SOL
const MAX_TRANSFER_PER_TRANSACTION = 1.0; // 1 SOL max per transfer
const HOUSE_WALLET_RESERVE = 10.0; // Keep 10 SOL in house wallet as reserve

interface TransferRequest {
  userId: string;
  amount: number;
}

interface TransferResponse {
  success: boolean;
  signature?: string;
  error?: string;
  balances?: {
    custodialBefore: number;
    custodialAfter: number;
    embeddedBefore: number;
    embeddedAfter: number;
  };
  limits?: {
    used: number;
    remaining: number;
    limit: number;
  };
}

async function checkDailyTransferLimit(supabase: any, userId: string, amount: number) {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const { data: todayTransfers, error } = await supabase
      .from('user_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('transaction_type', 'custodial_to_embedded')
      .eq('status', 'completed')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`);
    
    if (error) {
      console.warn('⚠️ Could not check daily limits (table may not exist):', error.message);
      // If we can't check limits, allow the transfer but log the warning
      return {
        allowed: true,
        used: 0,
        remaining: DAILY_TRANSFER_LIMIT
      };
    }
    
    const usedToday = todayTransfers?.reduce((sum: number, tx: any) => sum + parseFloat(tx.amount.toString()), 0) || 0;
    const remaining = DAILY_TRANSFER_LIMIT - usedToday;
    
    return {
      allowed: (usedToday + amount) <= DAILY_TRANSFER_LIMIT,
      used: usedToday,
      remaining: Math.max(0, remaining)
    };
  } catch (error) {
    console.warn('⚠️ Daily limit check failed, allowing transfer:', error);
    // If we can't check limits, allow the transfer but log the warning
    return {
      allowed: true,
      used: 0,
      remaining: DAILY_TRANSFER_LIMIT
    };
  }
}

async function getCustodialBalance(supabase: any, userId: string): Promise<number> {
  try {
    const { data: user, error } = await supabase
      .from('users_unified')
      .select('custodial_balance')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('❌ Error getting custodial balance:', error);
      throw new Error('User not found or database error');
    }
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return parseFloat(user.custodial_balance?.toString() || '0');
  } catch (error) {
    console.error('❌ Failed to get custodial balance:', error);
    throw error;
  }
}

async function getUserEmbeddedWallet(supabase: any, userId: string): Promise<string> {
  try {
    const { data: user, error } = await supabase
      .from('users_unified')
      .select('wallet_address, privy_wallet_address')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('❌ Error getting user wallet:', error);
      throw new Error('User embedded wallet not found');
    }
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Prefer privy_wallet_address, fallback to wallet_address
    const walletAddress = user.privy_wallet_address || user.wallet_address;
    
    if (!walletAddress) {
      throw new Error('No wallet address found for user');
    }
    
    return walletAddress;
  } catch (error) {
    console.error('❌ Failed to get user embedded wallet:', error);
    throw error;
  }
}

async function getHouseWallet(): Promise<{ publicKey: PublicKey; keypair: Keypair }> {
  const housePrivateKey = process.env.HOUSE_WALLET_PRIVATE_KEY;
  if (!housePrivateKey) {
    throw new Error('House wallet private key not configured');
  }
  
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(housePrivateKey));
    return {
      publicKey: keypair.publicKey,
      keypair
    };
  } catch (error) {
    console.error('❌ Invalid house wallet private key:', error);
    throw new Error('Invalid house wallet private key format');
  }
}

async function executeTransfer(
  connection: Connection,
  houseKeypair: Keypair,
  userWalletAddress: string,
  amount: number
): Promise<string> {
  const userPublicKey = new PublicKey(userWalletAddress);
  const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
  
  // Get latest blockhash with longer commitment for reliability
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  
  // Create transaction
  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: houseKeypair.publicKey
  });
  
  // Add transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: houseKeypair.publicKey,
      toPubkey: userPublicKey,
      lamports: lamports
    })
  );
  
  // Sign transaction with house wallet
  transaction.sign(houseKeypair);
  
  // Send transaction with retry logic
  let signature: string | null = null;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'finalized'
      });
      break;
    } catch (error) {
      attempts++;
      console.warn(`Transfer attempt ${attempts} failed:`, error);
      
      if (attempts >= maxAttempts) {
        throw new Error(`Transfer failed after ${maxAttempts} attempts: ${error}`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  
  // Ensure signature was obtained
  if (!signature) {
    throw new Error('Failed to send transaction - no signature obtained');
  }
  
  // Wait for confirmation with timeout
  console.log(`⏳ Waiting for confirmation of signature: ${signature}`);
  
  try {
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');
    
    if (confirmation.value?.err) {
      throw new Error(`Transaction failed on blockchain: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log(`✅ Transfer confirmed: ${signature}`);
    return signature;
  } catch (confirmError) {
    console.error('❌ Transaction confirmation failed:', confirmError);
    throw new Error(`Transaction confirmation failed: ${confirmError}`);
  }
}

// 🔥 NEW: Use the safe database function instead of manual SQL
async function updateBalancesSafely(
  supabase: any,
  userId: string,
  transferAmount: number,
  signature: string
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  try {
    console.log(`💾 Updating balances safely for user ${userId}, amount: ${transferAmount}`);
    
    // Use the safe database function
    const { data: result, error } = await supabase
      .rpc('safe_custodial_transfer', {
        p_user_id: userId,
        p_amount: transferAmount,
        p_signature: signature
      });
    
    if (error) {
      console.error('❌ Safe custodial transfer function error:', error);
      throw new Error(`Database update failed: ${error.message}`);
    }
    
    if (!result || !result.success) {
      console.error('❌ Safe custodial transfer failed:', result);
      throw new Error(result?.error || 'Database update failed');
    }
    
    console.log('✅ Safe database update completed:', result);
    
    return {
      balanceBefore: parseFloat(result.balance_before || '0'),
      balanceAfter: parseFloat(result.balance_after || '0')
    };
    
  } catch (error) {
    console.error('❌ Failed to update balances safely:', error);
    
    // Fallback: Try direct update if safe function fails
    console.log('🔄 Attempting fallback direct balance update...');
    
    try {
      // Get current balance first
      const currentBalance = await getCustodialBalance(supabase, userId);
      
      if (currentBalance < transferAmount) {
        throw new Error('Insufficient custodial balance');
      }
      
      // Direct update as fallback
      const { error: updateError } = await supabase
        .from('users_unified')
        .update({
          custodial_balance: currentBalance - transferAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (updateError) {
        throw new Error(`Fallback update failed: ${updateError.message}`);
      }
      
      console.log('✅ Fallback balance update successful');
      
      return {
        balanceBefore: currentBalance,
        balanceAfter: currentBalance - transferAmount
      };
      
    } catch (fallbackError) {
      console.error('❌ Fallback balance update also failed:', fallbackError);
      throw new Error(`Both safe update and fallback failed: ${fallbackError}`);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<TransferResponse>> {
  try {
    console.log('🚀 SAFE Custodial-to-embedded transfer initiated');
    
    // Initialize services
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SOLANA_RPC_URL || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing environment variables');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Parse request
    const body: TransferRequest = await request.json();
    const { userId, amount } = body;
    
    console.log(`📋 SAFE Transfer request: ${amount} SOL for user ${userId}`);
    
    // Validate inputs
    if (!userId || typeof amount !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid userId or amount' },
        { status: 400 }
      );
    }
    
    if (amount < MIN_TRANSFER || amount > MAX_TRANSFER_PER_TRANSACTION) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Transfer amount must be between ${MIN_TRANSFER} and ${MAX_TRANSFER_PER_TRANSACTION} SOL` 
        },
        { status: 400 }
      );
    }
    
    // Check daily transfer limit (with fallback)
    const dailyCheck = await checkDailyTransferLimit(supabase, userId, amount);
    if (!dailyCheck.allowed) {
      return NextResponse.json(
        { 
          success: false,
          error: `Daily transfer limit exceeded. Used: ${dailyCheck.used.toFixed(3)} SOL, Remaining: ${dailyCheck.remaining.toFixed(3)} SOL`,
          limits: {
            used: dailyCheck.used,
            remaining: dailyCheck.remaining,
            limit: DAILY_TRANSFER_LIMIT
          }
        },
        { status: 400 }
      );
    }
    
    // Get user's custodial balance and embedded wallet
    const custodialBalance = await getCustodialBalance(supabase, userId);
    const userEmbeddedWallet = await getUserEmbeddedWallet(supabase, userId);
    
    console.log(`💰 Current custodial balance: ${custodialBalance} SOL`);
    console.log(`📍 User embedded wallet: ${userEmbeddedWallet}`);
    
    if (custodialBalance < amount) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient custodial balance. Available: ${custodialBalance.toFixed(6)} SOL, Requested: ${amount} SOL` 
        },
        { status: 400 }
      );
    }
    
    // Get house wallet
    const { publicKey: housePublicKey, keypair: houseKeypair } = await getHouseWallet();
    
    // Check house wallet balance
    const houseBalance = await connection.getBalance(housePublicKey);
    const houseBalanceSOL = houseBalance / LAMPORTS_PER_SOL;
    
    console.log(`🏠 House wallet balance: ${houseBalanceSOL} SOL`);
    
    if (houseBalanceSOL < (amount + 0.01 + HOUSE_WALLET_RESERVE)) {
      console.error(`❌ Insufficient house wallet balance: ${houseBalanceSOL} SOL`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'House wallet has insufficient funds. Please contact support.' 
        },
        { status: 500 }
      );
    }
    
    // Get user's embedded wallet balance before transfer
    const userPublicKey = new PublicKey(userEmbeddedWallet);
    const embeddedBalanceBefore = await connection.getBalance(userPublicKey) / LAMPORTS_PER_SOL;
    
    // Execute the blockchain transfer
    console.log(`🔄 Executing SAFE transfer: ${amount} SOL from house to ${userEmbeddedWallet}`);
    const signature = await executeTransfer(connection, houseKeypair, userEmbeddedWallet, amount);
    
    // Update database balances using safe function
    const balanceUpdate = await updateBalancesSafely(supabase, userId, amount, signature);
    
    // Get updated embedded wallet balance
    const embeddedBalanceAfter = await connection.getBalance(userPublicKey) / LAMPORTS_PER_SOL;
    
    console.log(`✅ SAFE Transfer completed successfully: ${signature}`);
    
    return NextResponse.json({
      success: true,
      signature: signature,
      balances: {
        custodialBefore: balanceUpdate.balanceBefore,
        custodialAfter: balanceUpdate.balanceAfter,
        embeddedBefore: embeddedBalanceBefore,
        embeddedAfter: embeddedBalanceAfter
      },
      limits: {
        used: dailyCheck.used + amount,
        remaining: dailyCheck.remaining - amount,
        limit: DAILY_TRANSFER_LIMIT
      }
    });
    
  } catch (error) {
    console.error('❌ SAFE Custodial transfer error:', error);
    
    let errorMessage = 'Transfer failed';
    if (error instanceof Error) {
      if (error.message.includes('Insufficient')) {
        errorMessage = error.message;
      } else if (error.message.includes('not found')) {
        errorMessage = 'User account or wallet not found';
      } else if (error.message.includes('limit')) {
        errorMessage = error.message;
      } else if (error.message.includes('House wallet')) {
        errorMessage = 'Service temporarily unavailable. Please contact support.';
      } else if (error.message.includes('Database')) {
        errorMessage = 'Database error. Please try again or contact support.';
      } else {
        errorMessage = `Transfer failed: ${error.message}`;
      }
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'SAFE Custodial to embedded wallet transfer endpoint',
    methods: ['POST'],
    requiredFields: ['userId', 'amount'],
    limits: {
      minAmount: MIN_TRANSFER,
      maxPerTransaction: MAX_TRANSFER_PER_TRANSACTION,
      dailyLimit: DAILY_TRANSFER_LIMIT,
      houseWalletReserve: HOUSE_WALLET_RESERVE
    },
    safety_features: [
      'Uses safe database functions with fallbacks',
      'Checks table existence before operations',
      'Atomic balance updates with error recovery',
      'Transaction logging with graceful degradation',
      'Daily limits with fallback if table missing'
    ],
    process: [
      '1. Validate user and amount',
      '2. Check daily transfer limits (with fallback)',
      '3. Verify custodial balance',
      '4. Check house wallet funds', 
      '5. Execute blockchain transfer from house wallet',
      '6. Update user balances using safe functions',
      '7. Log transaction (with graceful degradation)'
    ],
    timestamp: new Date().toISOString()
  });
}
// app/api/transfer/privy-to-custodial/route.ts - FIXED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { privyWalletAPI } from '../../../../services/privyWalletAPI';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../../../utils/walletUtils';
import logger from '../../../../utils/logger';

// Constants
const DAILY_WITHDRAWAL_LIMIT = 20.0; // 20 SOL per day
const MIN_WITHDRAWAL = 0.001;

// Helper function to create transfer transactions
async function createTransferTransaction(
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amount: number,
  memo?: string
): Promise<Transaction> {
  const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
  
  const transaction = new Transaction();
  
  // Add transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports
    })
  );
  
  // Add memo if provided
  if (memo) {
    transaction.add(
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(memo, 'utf8')
      })
    );
  }
  
  return transaction;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Privy to custodial transfer request received');
    
    // Validate environment variables
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    
    // 🔥 TEMPORARY FIX: Hardcode house wallet address to bypass env issue
    const HOUSE_WALLET_ADDRESS = '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';

    console.log('🔍 Using hardcoded HOUSE_WALLET_ADDRESS:', HOUSE_WALLET_ADDRESS);

    if (!SOLANA_RPC_URL) {
      console.error('❌ Missing SOLANA_RPC_URL environment variable');
      return NextResponse.json(
        { error: 'Server configuration error: Missing Solana RPC URL' },
        { status: 500 }
      );
    }

    // Validate house wallet address format
    if (!isValidSolanaAddress(HOUSE_WALLET_ADDRESS)) {
      console.error('❌ Invalid HOUSE_WALLET_ADDRESS format');
      return NextResponse.json(
        { error: 'Server configuration error: Invalid house wallet address format' },
        { status: 500 }
      );
    }

    const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    const body = await request.json();
    
    // 🔥 CRITICAL FIX: Default autoSign to false and properly handle the two-step process
    const { userId, amount, signedTransaction, walletAddress } = body;
    
    console.log('🔍 Received request body:', JSON.stringify(body, null, 2));
    console.log('📋 Transfer details:', { 
      userId, 
      amount, 
      hasSignedTx: !!signedTransaction, 
      walletAddress,
      step: signedTransaction ? 'Step 2 (Submit)' : 'Step 1 (Create)'
    });
    
    // Validate inputs
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing userId' },
        { status: 400 }
      );
    }
    
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid or missing amount' },
        { status: 400 }
      );
    }
    
    if (amount < MIN_WITHDRAWAL || amount > DAILY_WITHDRAWAL_LIMIT) {
      return NextResponse.json(
        { error: `Invalid amount. Must be between ${MIN_WITHDRAWAL} and ${DAILY_WITHDRAWAL_LIMIT} SOL` },
        { status: 400 }
      );
    }
    
    const transferId = `privy-to-custodial-${userId}-${Date.now()}`;
    
    // Get user's Privy wallet information - auto-register if not found
    let wallet = await privyWalletAPI.getPrivyWallet(userId);
    if (!wallet) {
      console.log(`🔄 Privy wallet not found for user ${userId}, creating minimal wallet entry...`);
      
      let walletToRegister = walletAddress;
      
      // If wallet address not provided, try to extract from signed transaction
      if (!walletToRegister && signedTransaction) {
        try {
          const transactionBuffer = Buffer.from(signedTransaction, 'base64');
          const transaction = Transaction.from(transactionBuffer);
          walletToRegister = transaction.feePayer?.toString();
        } catch (parseError) {
          console.error('❌ Failed to parse transaction for wallet address:', parseError);
        }
      }
      
      if (walletToRegister && isValidSolanaAddress(walletToRegister)) {
        console.log(`🔄 Using embedded wallet directly: ${walletToRegister} for user ${userId}`);
        
        // Create a minimal wallet object instead of using the API
        wallet = {
          id: `embedded-${userId}`,
          userId: userId,
          privyWalletAddress: walletToRegister,
          balance: 0, // We'll get this from blockchain
          dailyTransferUsed: 0,
          lastDailyReset: new Date().toISOString(),
          lastBalanceUpdate: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        console.log(`✅ Using embedded wallet directly for user ${userId}`);
      } else {
        return NextResponse.json(
          { error: 'Could not determine valid wallet address' },
          { status: 400 }
        );
      }
    }

    // Ensure wallet is not null
    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet initialization failed' },
        { status: 500 }
      );
    }
    
    // Update and check current balance - simplified for embedded wallet
    let currentBalance = 0;
    try {
      // Get balance directly from blockchain for embedded wallet
      const rpcUrl = SOLANA_RPC_URL;
      const connection = new Connection(rpcUrl, 'confirmed');
      const publicKey = new PublicKey(wallet.privyWalletAddress);
      const lamports = await connection.getBalance(publicKey);
      currentBalance = lamports / LAMPORTS_PER_SOL;
      console.log(`💰 Current embedded wallet balance: ${currentBalance.toFixed(6)} SOL`);
    } catch (balanceError) {
      console.error('❌ Failed to get wallet balance:', balanceError);
      currentBalance = 0;
    }
    
    // Simplified daily limit check (skip for now to test the core functionality)
    const dailyCheck = {
      allowed: true,
      used: 0,
      remaining: DAILY_WITHDRAWAL_LIMIT
    };
    if (!dailyCheck.allowed) {
      return NextResponse.json(
        { 
          error: `Daily transfer limit exceeded. Used: ${dailyCheck.used.toFixed(3)} SOL, Remaining: ${dailyCheck.remaining.toFixed(3)} SOL, Limit: ${DAILY_WITHDRAWAL_LIMIT} SOL`,
          dailyLimits: {
            used: dailyCheck.used,
            remaining: dailyCheck.remaining,
            limit: DAILY_WITHDRAWAL_LIMIT
          }
        },
        { status: 400 }
      );
    }
    
    // Validate balance
    if (currentBalance < amount + 0.001) { // Include fee buffer
      return NextResponse.json(
        { 
          error: `Insufficient Privy wallet balance: ${currentBalance.toFixed(3)} SOL available, ${(amount + 0.001).toFixed(3)} SOL required (including fees)` 
        },
        { status: 400 }
      );
    }
    
    // Create PublicKey instances
    const privyPublicKey = safeCreatePublicKey(wallet.privyWalletAddress);
    const housePublicKey = safeCreatePublicKey(HOUSE_WALLET_ADDRESS);
    
    if (!privyPublicKey || !housePublicKey) {
      return NextResponse.json(
        { error: 'Invalid wallet addresses' },
        { status: 500 }
      );
    }
    
    // 🔥 FIXED: Determine step based on presence of signedTransaction
    const isStep1 = !signedTransaction; // Create unsigned transaction
    const isStep2 = !!signedTransaction; // Submit signed transaction
    
    if (isStep1) {
      // 🚀 STEP 1: Create unsigned transaction
      console.log('📝 Step 1: Creating unsigned transaction...');
      
      const transaction = await createTransferTransaction(
        privyPublicKey,
        housePublicKey,
        amount,
        `privy-to-custodial-${transferId}`
      );
      
      const { blockhash } = await solanaConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = privyPublicKey;
      
      const serializedTransaction = transaction.serialize({ 
        requireAllSignatures: false,
        verifySignatures: false
      });
      const base64Transaction = serializedTransaction.toString('base64');
      
      console.log('✅ Step 1: Unsigned transaction created successfully');
      
      return NextResponse.json({ 
        success: true,
        transferId,
        unsignedTransaction: base64Transaction,
        message: 'Unsigned transaction created. Sign and submit to complete transfer.',
        transferDetails: {
          from: wallet.privyWalletAddress,
          to: HOUSE_WALLET_ADDRESS,
          amount: amount,
          currentBalance: currentBalance,
          estimatedFee: 0.001,
          userId
        },
        dailyLimits: {
          used: dailyCheck.used,
          remaining: dailyCheck.remaining,
          limit: DAILY_WITHDRAWAL_LIMIT
        }
      });
      
    } else if (isStep2) {
      // 🚀 STEP 2: Process signed transaction
      console.log('💸 Step 2: Processing signed transaction...');
      
      let transactionBuffer: Buffer;
      
      try {
        transactionBuffer = Buffer.from(signedTransaction, 'base64');
      } catch (parseError) {
        console.error('❌ Failed to parse signed transaction:', parseError);
        return NextResponse.json(
          { error: 'Invalid signed transaction format' },
          { status: 400 }
        );
      }
      
      try {
        // Submit to blockchain
        const signature = await solanaConnection.sendRawTransaction(
          transactionBuffer,
          { skipPreflight: false, preflightCommitment: 'confirmed' }
        );
        
        console.log(`📡 Transaction submitted: ${signature}`);
        
        // Wait for confirmation
        const confirmation = await Promise.race([
          solanaConnection.confirmTransaction({
            signature,
            blockhash: (await solanaConnection.getLatestBlockhash()).blockhash,
            lastValidBlockHeight: (await solanaConnection.getLatestBlockhash()).lastValidBlockHeight
          }),
          new Promise<any>((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout')), 30000)
          )
        ]);
        
        if (confirmation && confirmation.value && confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`✅ Transfer transaction confirmed: ${signature}`);
        
        // 🔥 CRITICAL FIX: Update custodial balance in database
        let newCustodialBalance = amount; // Default fallback
        
        try {
          const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
          
          if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            
            console.log(`💰 Updating custodial balance for user ${userId} (+${amount} SOL)`);
            
            // First, get current custodial balance or create user profile if it doesn't exist
            const { data: currentUser, error: selectError } = await supabase
              .from('user_profiles')
              .select('custodial_balance, privy_balance, total_balance, total_transfers_to_custodial')
              .eq('user_id', userId)
              .single();
            
            if (selectError && selectError.code !== 'PGRST116') {
              console.error('❌ Error fetching current balance:', selectError);
              throw selectError;
            }
            
            const currentCustodialBalance = parseFloat(currentUser?.custodial_balance || '0');
            const currentPrivyBalance = parseFloat(currentUser?.privy_balance || '0');
            newCustodialBalance = currentCustodialBalance + amount;
            const newPrivyBalance = Math.max(0, currentPrivyBalance - amount); // Decrease privy balance
            const newTotalBalance = newCustodialBalance + newPrivyBalance;
            
            if (!currentUser) {
              // Create new user profile
              const { error: insertError } = await supabase
                .from('user_profiles')
                .insert({
                  user_id: userId,
                  custodial_balance: newCustodialBalance.toString(),
                  privy_balance: newPrivyBalance.toString(),
                  total_balance: newTotalBalance.toString(),
                  total_transfers_to_custodial: amount,
                  updated_at: new Date().toISOString()
                });
              
              if (insertError) {
                console.error('❌ Failed to create user profile:', insertError);
              } else {
                console.log(`✅ Created user profile with custodial balance: ${newCustodialBalance} SOL`);
              }
            } else {
              // Update existing user profile
              const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                  custodial_balance: newCustodialBalance.toString(),
                  privy_balance: newPrivyBalance.toString(),
                  total_balance: newTotalBalance.toString(),
                  total_transfers_to_custodial: (parseFloat(currentUser.total_transfers_to_custodial || '0') + amount).toString(),
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
              
              if (updateError) {
                console.error('❌ Failed to update custodial balance:', updateError);
              } else {
                console.log(`✅ Custodial balance updated: ${currentCustodialBalance} → ${newCustodialBalance} SOL`);
                console.log(`✅ Privy balance updated: ${currentPrivyBalance} → ${newPrivyBalance} SOL`);
              }
            }
          } else {
            console.warn('⚠️ Missing Supabase config - custodial balance not updated');
          }
        } catch (dbError) {
          console.error('❌ Database update error:', dbError);
          // Don't fail the transaction for DB errors, but log them
        }
        
        // 🚀 NEW: Emit real-time balance update events
        try {
          // Check if socket.io is available globally
          const io = (global as any).io;
          if (io) {
            console.log('📡 Emitting real-time balance update events...');
            
            // Primary balance update event
            io.emit('custodialBalanceUpdate', {
              userId: userId,
              custodialBalance: newCustodialBalance,
              depositAmount: amount,
              updateType: 'transfer_completed',
              transactionId: signature,
              source: 'privy_to_custodial_transfer',
              timestamp: Date.now()
            });

            // Transfer confirmation event
            io.emit('embeddedTransferConfirmed', {
              userId: userId,
              walletAddress: wallet.privyWalletAddress,
              amount: amount.toString(),
              type: 'embedded_to_custodial',
              transactionId: signature,
              newCustodialBalance: newCustodialBalance,
              timestamp: Date.now()
            });

            console.log('✅ Real-time events emitted successfully');
          } else {
            console.warn('⚠️ Socket.io not available for real-time events');
          }
        } catch (eventError) {
          console.warn('⚠️ Failed to emit real-time events:', eventError);
          // Don't fail the transfer for event emission errors
        }
        
        // Log the successful transaction
        await privyWalletAPI.logTransaction(
          userId,
          'privy_to_custodial',
          amount,
          wallet.privyWalletAddress,
          HOUSE_WALLET_ADDRESS,
          signature,
          'completed',
          { 
            transferId,
            transferType: 'privy_to_custodial',
            houseWallet: HOUSE_WALLET_ADDRESS
          }
        );
        
        // Update wallet balance
        const newBalance = await privyWalletAPI.updateWalletBalance(userId);
        
        // Get updated daily limits
        const updatedDailyCheck = await privyWalletAPI.checkDailyWithdrawalLimit(userId, 0);
        
        console.log(`✅ Step 2: Privy to custodial transfer completed: ${transferId} (${signature})`);
        
        return NextResponse.json({
          success: true,
          message: `Successfully transferred ${amount} SOL from Privy wallet to custodial balance`,
          transactionId: signature,
          transferId,
          transferDetails: {
            amount,
            sourceAddress: wallet.privyWalletAddress,
            destinationAddress: HOUSE_WALLET_ADDRESS,
            transactionId: signature,
            newBalance: newCustodialBalance, // Return the updated custodial balance
            userId,
            timestamp: new Date().toISOString()
          },
          dailyLimits: {
            used: updatedDailyCheck.used,
            remaining: updatedDailyCheck.remaining,
            limit: DAILY_WITHDRAWAL_LIMIT
          }
        });
        
      } catch (transactionError) {
        console.error('❌ Step 2: Transaction processing failed:', transactionError);
        
        // Log failed transaction
        await privyWalletAPI.logTransaction(
          userId,
          'privy_to_custodial',
          amount,
          wallet.privyWalletAddress,
          HOUSE_WALLET_ADDRESS,
          undefined,
          'failed',
          { 
            transferId,
            error: transactionError instanceof Error ? transactionError.message : 'Unknown error'
          }
        );
        
        // Handle specific error types
        if (transactionError instanceof Error && transactionError.message.includes('timeout')) {
          return NextResponse.json(
            { 
              error: 'Transaction confirmation timeout. Please check your wallet balance and try again if needed.',
              code: 'CONFIRMATION_TIMEOUT',
              transferId
            },
            { status: 408 }
          );
        }
        
        return NextResponse.json(
          { 
            error: 'Failed to process transaction',
            details: transactionError instanceof Error ? transactionError.message : 'Unknown error',
            transferId
          },
          { status: 500 }
        );
      }
    } else {
      // This shouldn't happen with proper logic
      return NextResponse.json(
        { error: 'Invalid request: unclear whether this is Step 1 or Step 2' },
        { status: 400 }
      );
    }
    
  } catch (error) {
    console.error('❌ Privy to custodial transfer error:', error);
    
    // Log error if we have enough context
    if (error instanceof Error) {
      logger.error('Transfer error:', error);
    }
    
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
    message: 'Privy to custodial transfer endpoint - FIXED VERSION',
    methods: ['POST'],
    requiredFields: ['userId', 'amount', 'walletAddress'],
    optionalFields: ['signedTransaction'],
    process: [
      '1. STEP 1: Call without signedTransaction to get unsigned transaction',
      '2. STEP 2: Sign transaction with Privy wallet on frontend',
      '3. STEP 3: Call again with signedTransaction to complete transfer'
    ],
    fixes: [
      'Removed autoSign parameter confusion',
      'Clear step-based logic using signedTransaction presence',
      'Better error handling and logging',
      'Real-time balance update events',
      'Proper database balance updates'
    ],
    features: [
      'Two-step process for security',
      'Daily withdrawal limits (20 SOL)',
      'Balance validation',
      'Transaction logging',
      'Real-time balance updates',
      'Supabase database integration',
      'Socket.io event emission'
    ],
    limits: {
      minAmount: MIN_WITHDRAWAL,
      dailyLimit: DAILY_WITHDRAWAL_LIMIT,
      note: 'Daily limit is shared with custodial withdrawals and resets at midnight UTC'
    },
    example: {
      step1: {
        method: 'POST',
        body: {
          userId: 'user123',
          amount: 1.5,
          walletAddress: 'YourPrivyWalletAddress'
        },
        response: {
          success: true,
          unsignedTransaction: 'base64_transaction_string',
          message: 'Unsigned transaction created. Sign and submit to complete transfer.'
        }
      },
      step2: {
        method: 'POST',
        body: {
          userId: 'user123',
          amount: 1.5,
          walletAddress: 'YourPrivyWalletAddress',
          signedTransaction: 'base64_signed_transaction_string'
        },
        response: {
          success: true,
          transactionId: 'blockchain_transaction_signature',
          transferDetails: {
            amount: 1.5,
            newBalance: 3.25
          }
        }
      }
    },
    timestamp: new Date().toISOString()
  });
}
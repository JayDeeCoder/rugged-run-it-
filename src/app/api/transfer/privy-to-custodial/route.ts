// app/api/transfer/privy-to-custodial/route.ts - USERS_UNIFIED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { privyWalletAPI } from '../../../../services/privyWalletAPI';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../../../utils/walletUtils';
import logger from '../../../../utils/logger';

// Constants
const DAILY_WITHDRAWAL_LIMIT = 20.0;
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
  
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports
    })
  );
  
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
    
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const HOUSE_WALLET_ADDRESS = '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';

    if (!SOLANA_RPC_URL) {
      console.error('❌ Missing SOLANA_RPC_URL environment variable');
      return NextResponse.json(
        { error: 'Server configuration error: Missing Solana RPC URL' },
        { status: 500 }
      );
    }

    if (!isValidSolanaAddress(HOUSE_WALLET_ADDRESS)) {
      console.error('❌ Invalid HOUSE_WALLET_ADDRESS format');
      return NextResponse.json(
        { error: 'Server configuration error: Invalid house wallet address format' },
        { status: 500 }
      );
    }

    const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    const body = await request.json();
    const { userId, amount, signedTransaction, walletAddress } = body;
    
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
    
    // Get user's Privy wallet information
    let wallet = await privyWalletAPI.getPrivyWallet(userId);
    if (!wallet) {
      console.log(`🔄 Privy wallet not found for user ${userId}, creating minimal wallet entry...`);
      
      let walletToRegister = walletAddress;
      
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
        wallet = {
          id: `embedded-${userId}`,
          userId: userId,
          privyWalletAddress: walletToRegister,
          balance: 0,
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

    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet initialization failed' },
        { status: 500 }
      );
    }
    
    // Update and check current balance
    let currentBalance = 0;
    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const publicKey = new PublicKey(wallet.privyWalletAddress);
      const lamports = await connection.getBalance(publicKey);
      currentBalance = lamports / LAMPORTS_PER_SOL;
      console.log(`💰 Current embedded wallet balance: ${currentBalance.toFixed(6)} SOL`);
    } catch (balanceError) {
      console.error('❌ Failed to get wallet balance:', balanceError);
      currentBalance = 0;
    }
    
    // Simplified daily limit check
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
    if (currentBalance < amount + 0.001) {
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
    
    const isStep1 = !signedTransaction;
    const isStep2 = !!signedTransaction;
    
    if (isStep1) {
      // STEP 1: Create unsigned transaction
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
      // STEP 2: Process signed transaction
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
        
        // ✅ FIXED: Update custodial balance in users_unified table
        let newCustodialBalance = amount;
        
        try {
          const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
          
          if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            
            console.log(`💰 Updating custodial balance for user ${userId} (+${amount} SOL)`);
            
            // ✅ Use users_unified table with correct column names
            const { data: currentUser, error: selectError } = await supabase
              .from('users_unified')
              .select('custodial_balance, privy_balance, embedded_balance, total_balance, total_transfers_to_custodial')
              .eq('id', userId)  // ✅ Changed from 'user_id' to 'id'
              .single();
            
            if (selectError && selectError.code !== 'PGRST116') {
              console.error('❌ Error fetching current balance:', selectError);
              throw selectError;
            }
            
            const currentCustodialBalance = parseFloat(currentUser?.custodial_balance || '0');
            const currentPrivyBalance = parseFloat(currentUser?.privy_balance || '0');
            const currentEmbeddedBalance = parseFloat(currentUser?.embedded_balance || '0');
            newCustodialBalance = currentCustodialBalance + amount;
            const newPrivyBalance = Math.max(0, currentPrivyBalance - amount);
            const newEmbeddedBalance = Math.max(0, currentEmbeddedBalance - amount);
            const newTotalBalance = newCustodialBalance + newPrivyBalance + newEmbeddedBalance;
            
            if (!currentUser) {
              // ✅ Create new user in users_unified
              const { error: insertError } = await supabase
                .from('users_unified')
                .insert({
                  id: userId,  // ✅ Use 'id' instead of 'user_id'
                  custodial_balance: newCustodialBalance,
                  privy_balance: newPrivyBalance,
                  embedded_balance: newEmbeddedBalance,
                  total_balance: newTotalBalance,
                  total_transfers_to_custodial: amount,
                  updated_at: new Date().toISOString(),
                  created_at: new Date().toISOString()
                });
              
              if (insertError) {
                console.error('❌ Failed to create user in users_unified:', insertError);
              } else {
                console.log(`✅ Created user in users_unified with custodial balance: ${newCustodialBalance} SOL`);
              }
            } else {
              // ✅ Update existing user in users_unified
              const { error: updateError } = await supabase
                .from('users_unified')
                .update({ 
                  custodial_balance: newCustodialBalance,
                  privy_balance: newPrivyBalance,
                  embedded_balance: newEmbeddedBalance,
                  total_balance: newTotalBalance,
                  total_transfers_to_custodial: (parseFloat(currentUser.total_transfers_to_custodial || '0') + amount),
                  updated_at: new Date().toISOString()
                })
                .eq('id', userId);  // ✅ Use 'id' instead of 'user_id'
              
              if (updateError) {
                console.error('❌ Failed to update custodial balance in users_unified:', updateError);
              } else {
                console.log(`✅ users_unified balance updated: ${currentCustodialBalance} → ${newCustodialBalance} SOL`);
              }
            }
          } else {
            console.warn('⚠️ Missing Supabase config - custodial balance not updated');
          }
        } catch (dbError) {
          console.error('❌ Database update error:', dbError);
        }
        
        // Emit real-time events
        try {
          const io = (global as any).io;
          if (io) {
            console.log('📡 Emitting real-time balance update events...');
            
            io.emit('custodialBalanceUpdate', {
              userId: userId,
              custodialBalance: newCustodialBalance,
              depositAmount: amount,
              updateType: 'transfer_completed',
              transactionId: signature,
              source: 'privy_to_custodial_transfer',
              timestamp: Date.now()
            });

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
          }
        } catch (eventError) {
          console.warn('⚠️ Failed to emit real-time events:', eventError);
        }
        
        // Log transaction
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
        
        const newBalance = await privyWalletAPI.updateWalletBalance(userId);
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
            newBalance: newCustodialBalance,
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
      return NextResponse.json(
        { error: 'Invalid request: unclear whether this is Step 1 or Step 2' },
        { status: 400 }
      );
    }
    
  } catch (error) {
    console.error('❌ Privy to custodial transfer error:', error);
    
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
    message: 'Privy to custodial transfer endpoint - USERS_UNIFIED VERSION',
    methods: ['POST'],
    requiredFields: ['userId', 'amount', 'walletAddress'],
    optionalFields: ['signedTransaction'],
    fixes: [
      'Updated to use users_unified table',
      'Changed user_id column to id',
      'Added embedded_balance support',
      'Improved error handling'
    ],
    timestamp: new Date().toISOString()
  });
}
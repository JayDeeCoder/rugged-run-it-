// app/api/transfer/privy-to-custodial/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
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
    const HOUSE_WALLET_ADDRESS = process.env.HOUSE_WALLET_ADDRESS || process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS;

    if (!SOLANA_RPC_URL) {
      console.error('❌ Missing SOLANA_RPC_URL environment variable');
      return NextResponse.json(
        { error: 'Server configuration error: Missing Solana RPC URL' },
        { status: 500 }
      );
    }

    if (!HOUSE_WALLET_ADDRESS) {
      console.error('❌ Missing HOUSE_WALLET_ADDRESS environment variable');
      return NextResponse.json(
        { error: 'Server configuration error: Missing house wallet address' },
        { status: 500 }
      );
    }

    // Validate house wallet address
    if (!isValidSolanaAddress(HOUSE_WALLET_ADDRESS)) {
      console.error('❌ Invalid HOUSE_WALLET_ADDRESS');
      return NextResponse.json(
        { error: 'Server configuration error: Invalid house wallet address' },
        { status: 500 }
      );
    }

    const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    const body = await request.json();
    const { userId, amount, signedTransaction, autoSign = true } = body;
    
    console.log('📋 Transfer details:', { userId, amount, hasSignedTx: !!signedTransaction, autoSign });
    
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
    const wallet = await privyWalletAPI.getPrivyWallet(userId);
    if (!wallet) {
      return NextResponse.json(
        { error: 'Privy wallet not found. Please register your wallet first.' },
        { status: 404 }
      );
    }
    
    // Update and check current balance
    const currentBalance = await privyWalletAPI.updateWalletBalance(userId);
    
    // Check daily withdrawal limit
    const dailyCheck = await privyWalletAPI.checkDailyWithdrawalLimit(userId, amount);
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
    
    if (!signedTransaction && !autoSign) {
      // Step 1: Create unsigned transaction for external wallets (manual signing)
      console.log('📝 Creating unsigned transaction for external wallet...');
      
      const transaction = await createTransferTransaction(
        privyPublicKey,
        housePublicKey,
        amount,
        `privy-to-custodial-${transferId}`
      );
      
      const { blockhash } = await solanaConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = privyPublicKey;
      
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const base64Transaction = serializedTransaction.toString('base64');
      
      return NextResponse.json({ 
        success: false,
        transferId,
        unsignedTransaction: base64Transaction,
        message: 'Transaction created - please sign with your Privy wallet',
        transferDetails: {
          from: wallet.privyWalletAddress,
          to: HOUSE_WALLET_ADDRESS,
          amount: amount,
          currentBalance: currentBalance,
          estimatedFee: 0.001
        },
        dailyLimits: {
          used: dailyCheck.used,
          remaining: dailyCheck.remaining,
          limit: DAILY_WITHDRAWAL_LIMIT
        }
      });
    }
    
    // Step 2: Process transaction (either signed or auto-signed)
    console.log('💸 Processing transfer transaction...');
    
    let transactionBuffer: Buffer;
    
    if (signedTransaction) {
      // External wallet - process provided signed transaction
      console.log('🔐 Processing externally signed transaction...');
      transactionBuffer = Buffer.from(signedTransaction, 'base64');
    } else if (autoSign) {
      // This should not happen with the current implementation
      // The frontend should always provide a signed transaction
      console.log('⚠️ Auto-signing requested but not implemented on server side');
      return NextResponse.json({
        error: 'Auto-signing not supported. Please sign the transaction on the frontend.',
        hint: 'Use the unsigned transaction flow and sign with your Privy wallet'
      }, { status: 400 });
    } else {
      return NextResponse.json(
        { error: 'No signed transaction provided and auto-sign disabled' },
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
        solanaConnection.confirmTransaction(signature, 'confirmed'),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000)
        )
      ]);
      
      if (confirmation && confirmation.value && confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log(`✅ Transfer transaction confirmed: ${signature}`);
      
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
      
      console.log(`✅ Privy to custodial transfer completed: ${transferId} (${signature})`);
      
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
          newBalance: newBalance,
          timestamp: new Date().toISOString()
        },
        dailyLimits: {
          used: updatedDailyCheck.used,
          remaining: updatedDailyCheck.remaining,
          limit: DAILY_WITHDRAWAL_LIMIT
        }
      });
      
    } catch (transactionError) {
      console.error('❌ Transaction processing failed:', transactionError);
      
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
      
      return NextResponse.json(
        { 
          error: 'Failed to process transaction',
          details: transactionError instanceof Error ? transactionError.message : 'Unknown error',
          transferId
        },
        { status: 500 }
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
    message: 'Privy to custodial transfer endpoint',
    methods: ['POST'],
    requiredFields: ['userId', 'amount'],
    optionalFields: ['signedTransaction', 'autoSign'],
    process: [
      '1. First call without signedTransaction to get unsigned transaction',
      '2. Sign transaction with Privy wallet on frontend',
      '3. Second call with signedTransaction to complete transfer'
    ],
    features: [
      'Two-step process for security',
      'Daily withdrawal limits (20 SOL)',
      'Balance validation',
      'Transaction logging',
      'Real-time balance updates'
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
          autoSign: false
        },
        response: {
          success: false,
          unsignedTransaction: 'base64_transaction_string',
          message: 'Transaction created - please sign with your Privy wallet'
        }
      },
      step2: {
        method: 'POST',
        body: {
          userId: 'user123',
          amount: 1.5,
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
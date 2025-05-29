// app/api/transfer/privy-to-custodial/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction, Keypair } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import bs58 from 'bs58';

// Minimum transfer amount
const MIN_TRANSFER = 0.001;

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Privy to custodial transfer request received');
    
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
    const { userId, amount, signedTransaction } = body;
    
    console.log('📋 Transfer details:', { userId, amount, hasSignedTx: !!signedTransaction });
    
    // Validate inputs
    if (!userId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, amount' },
        { status: 400 }
      );
    }
    
    if (amount < MIN_TRANSFER) {
      return NextResponse.json(
        { error: `Invalid amount. Must be at least ${MIN_TRANSFER} SOL` },
        { status: 400 }
      );
    }
    
    // Get user's Privy wallet info
    const { data: privyWallet, error: privyError } = await supabase
      .from('privy_wallets')
      .select('privy_wallet_address, balance')
      .eq('user_id', userId)
      .single();
    
    if (privyError || !privyWallet) {
      return NextResponse.json(
        { error: 'Privy wallet not found for user' },
        { status: 404 }
      );
    }
    
    const userPublicKey = new PublicKey(privyWallet.privy_wallet_address);
    
    // Check current balance on blockchain
    const balanceResponse = await solanaConnection.getBalance(userPublicKey);
    const currentBalance = balanceResponse / LAMPORTS_PER_SOL;
    
    if (currentBalance < amount + 0.001) { // Include fee buffer
      return NextResponse.json(
        { 
          error: `Insufficient Privy wallet balance. Available: ${currentBalance.toFixed(6)} SOL, Required: ${(amount + 0.001).toFixed(6)} SOL (including fees)` 
        },
        { status: 400 }
      );
    }
    
    if (!signedTransaction) {
      // Step 1: Create unsigned transaction for user to sign
      console.log('📝 Creating unsigned transaction for transfer...');
      
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: userPublicKey,
          toPubkey: houseWallet.publicKey,
          lamports: lamports
        })
      );
      
      // Add memo for transaction identification
      const memo = `privy-to-custodial-${userId}-${Date.now()}`;
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
        transferDetails: {
          from: privyWallet.privy_wallet_address,
          to: houseWallet.publicKey.toString(),
          amount: amount,
          currentBalance: currentBalance,
          estimatedFee: 0.001
        },
        instructions: [
          'Use your Privy wallet to sign this transaction',
          'This will transfer SOL from your embedded wallet to custodial balance',
          'Send the signed transaction back to complete the transfer'
        ]
      });
    }
    
    // Step 2: Process signed transaction
    console.log('💸 Processing signed transfer transaction...');
    
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
      
      console.log(`✅ Transfer transaction confirmed: ${signature}`);
      
      // Get or create user's hybrid wallet record
      let { data: userWallet, error: walletError } = await supabase
        .from('user_hybrid_wallets')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (walletError && walletError.code === 'PGRST116') {
        // Create new hybrid wallet record
        const { data: newWallet, error: createError } = await supabase
          .from('user_hybrid_wallets')
          .insert({
            user_id: userId,
            external_wallet_address: null,
            embedded_wallet_id: privyWallet.privy_wallet_address,
            custodial_balance: amount,
            embedded_balance: Math.max(0, currentBalance - amount - 0.001),
            custodial_total_deposited: amount,
            total_transfers_to_custodial: amount,
            last_custodial_deposit: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (createError) {
          console.error('❌ Failed to create hybrid wallet record:', createError);
          return NextResponse.json(
            { 
              error: 'Transfer completed but failed to update balance. Please contact support.',
              transactionId: signature 
            },
            { status: 500 }
          );
        }
        
        userWallet = newWallet;
      } else if (walletError) {
        console.error('❌ Failed to get hybrid wallet:', walletError);
        return NextResponse.json(
          { 
            error: 'Transfer completed but failed to update balance. Please contact support.',
            transactionId: signature 
          },
          { status: 500 }
        );
      } else {
        // Update existing wallet record
        const newCustodialBalance = parseFloat(userWallet.custodial_balance) + amount;
        const newEmbeddedBalance = Math.max(0, currentBalance - amount - 0.001);
        const newTotalTransfers = parseFloat(userWallet.total_transfers_to_custodial || '0') + amount;
        
        const { error: updateError } = await supabase
          .from('user_hybrid_wallets')
          .update({ 
            custodial_balance: newCustodialBalance,
            embedded_balance: newEmbeddedBalance,
            total_transfers_to_custodial: newTotalTransfers,
            last_custodial_deposit: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
        
        if (updateError) {
          console.error('❌ Failed to update hybrid wallet balance:', updateError);
          return NextResponse.json(
            { 
              error: 'Transfer completed but failed to update balance. Please contact support.',
              transactionId: signature 
            },
            { status: 500 }
          );
        }
        
        userWallet.custodial_balance = newCustodialBalance;
        userWallet.embedded_balance = newEmbeddedBalance;
      }
      
      // Update Privy wallet balance in database
      try {
        await supabase
          .from('privy_wallets')
          .update({ 
            balance: Math.max(0, currentBalance - amount - 0.001),
            last_balance_update: new Date().toISOString(),
            last_used: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
      } catch (updateError) {
        console.warn('⚠️ Failed to update Privy wallet balance in database:', updateError);
        // Non-critical error, transfer was successful
      }
      
      // Log transfer transaction
      try {
        await supabase
          .from('user_transactions')
          .insert({
            user_id: userId,
            transaction_type: 'privy_to_custodial_transfer',
            amount: amount,
            source_address: privyWallet.privy_wallet_address,
            destination_address: houseWallet.publicKey.toString(),
            transaction_id: signature,
            status: 'completed',
            created_at: new Date().toISOString()
          });
      } catch (logError) {
        console.warn('⚠️ Failed to log transfer transaction:', logError);
        // Non-critical error, transfer was successful
      }
      
      console.log(`✅ Privy to custodial transfer completed: ${amount} SOL, New custodial balance: ${userWallet.custodial_balance} SOL`);
      
      return NextResponse.json({
        success: true,
        message: `Successfully transferred ${amount} SOL from Privy wallet to custodial balance`,
        transactionId: signature,
        newCustodialBalance: parseFloat(userWallet.custodial_balance),
        newEmbeddedBalance: parseFloat(userWallet.embedded_balance || '0'),
        transferDetails: {
          amount,
          sourceAddress: privyWallet.privy_wallet_address,
          destinationAddress: houseWallet.publicKey.toString(),
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
    console.error('❌ Privy to custodial transfer error:', error);
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
    optionalFields: ['signedTransaction'],
    process: [
      '1. First call without signedTransaction to get unsigned transaction',
      '2. Sign transaction with Privy wallet',
      '3. Second call with signedTransaction to complete transfer'
    ],
    limits: {
      minAmount: MIN_TRANSFER,
      note: 'Transfers SOL from embedded Privy wallet to custodial balance'
    },
    timestamp: new Date().toISOString()
  });
}
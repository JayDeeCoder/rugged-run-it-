// app/api/custodial/balance/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    console.log('🔍 Getting custodial balance for user:', userId);
    
    // Get user's hybrid wallet data
    const { data: userWallet, error: walletError } = await supabase
      .from('user_hybrid_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (walletError || !userWallet) {
      // User doesn't have a custodial wallet yet
      return NextResponse.json({
        userId,
        custodialBalance: 0,
        totalDeposited: 0,
        lastDeposit: 0,
        hasWallet: false,
        message: 'No custodial wallet found. User needs to make a deposit first.',
        timestamp: Date.now()
      });
    }
    
    const custodialBalance = parseFloat(userWallet.custodial_balance) || 0;
    const totalDeposited = parseFloat(userWallet.custodial_total_deposited) || 0;
    const lastDeposit = userWallet.last_custodial_deposit ? 
      new Date(userWallet.last_custodial_deposit).getTime() : 0;
    
    console.log(`💰 Custodial balance for ${userId}: ${custodialBalance.toFixed(6)} SOL`);
    
    return NextResponse.json({
      userId,
      custodialBalance,
      totalDeposited,
      lastDeposit,
      hasWallet: true,
      walletAddress: userWallet.external_wallet_address,
      canBet: custodialBalance >= 0.001,
      canWithdraw: custodialBalance > 0,
      embeddedBalance: parseFloat(userWallet.embedded_balance) || 0,
      embeddedWalletId: userWallet.embedded_wallet_id,
      totalTransfersToEmbedded: parseFloat(userWallet.total_transfers_to_embedded) || 0,
      totalTransfersToCustodial: parseFloat(userWallet.total_transfers_to_custodial) || 0,
      lastActivity: userWallet.updated_at,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('❌ Error getting custodial balance:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get custodial balance',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Optional: Handle other HTTP methods
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET to retrieve balance.' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET to retrieve balance.' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET to retrieve balance.' },
    { status: 405 }
  );
}
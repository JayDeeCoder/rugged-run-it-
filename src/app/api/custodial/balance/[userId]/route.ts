// app/api/custodial/balance/[userId]/route.ts - FIXED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Initialize Supabase client
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing Supabase environment variables:', {
        hasUrl: !!SUPABASE_URL,
        hasServiceKey: !!SUPABASE_SERVICE_KEY
      });
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      );
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const { userId } = params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    console.log('🔍 Getting FRESH custodial balance for user:', userId);
    
    // 🔧 CRITICAL FIX: Read from the SAME table the game server writes to
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles') // ← This is the key change!
      .select(`
        user_id,
        username,
        custodial_balance,
        privy_balance,
        total_balance,
        external_wallet_address,
        custodial_total_deposited,
        last_custodial_deposit,
        embedded_wallet_id,
        total_transfers_to_embedded,
        total_transfers_to_custodial,
        updated_at,
        created_at
      `)
      .eq('user_id', userId)
      .single();
    
    if (profileError || !userProfile) {
      console.log(`❌ User profile not found for ${userId}:`, profileError);
      
      // User doesn't exist - return default values
      return NextResponse.json({
        userId,
        custodialBalance: 0,
        totalDeposited: 0,
        lastDeposit: 0,
        hasWallet: false,
        message: 'User not found. Please register first.',
        timestamp: Date.now()
      });
    }
    
    // 🔧 FIXED: Use the same balance fields as the game server
    const custodialBalance = parseFloat(userProfile.custodial_balance) || 0;
    const privyBalance = parseFloat(userProfile.privy_balance) || 0;
    const totalBalance = parseFloat(userProfile.total_balance) || 0;
    const totalDeposited = parseFloat(userProfile.custodial_total_deposited) || 0;
    const lastDeposit = userProfile.last_custodial_deposit ? 
      new Date(userProfile.last_custodial_deposit).getTime() : 0;
    
    console.log(`💰 FRESH custodial balance for ${userId}: ${custodialBalance.toFixed(6)} SOL (from user_profiles table)`);
    
    return NextResponse.json({
      userId,
      custodialBalance,           // ← This will now match the game server
      totalBalance,
      privyBalance,
      embeddedBalance: privyBalance, // Alias for compatibility
      totalDeposited,
      lastDeposit,
      hasWallet: true,
      walletAddress: userProfile.external_wallet_address,
      canBet: custodialBalance >= 0.001,
      canWithdraw: custodialBalance > 0,
      embeddedWalletId: userProfile.embedded_wallet_id,
      totalTransfersToEmbedded: parseFloat(userProfile.total_transfers_to_embedded) || 0,
      totalTransfersToCustodial: parseFloat(userProfile.total_transfers_to_custodial) || 0,
      lastActivity: userProfile.updated_at,
      source: 'user_profiles_table', // 🔧 NEW: Indicate the data source
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

// 🔧 ENHANCED: Add POST method for force refresh
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await request.json();
    
    // Handle force refresh requests
    if (body.action === 'refresh') {
      console.log(`🔄 Force refresh requested for user: ${userId}`);
      
      // Simply return fresh data (same as GET)
      return GET(request, { params });
    }
    
    return NextResponse.json(
      { error: 'Unsupported POST action. Use action: "refresh" to force refresh.' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('❌ Error in POST handler:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process POST request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Keep the other methods as-is
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
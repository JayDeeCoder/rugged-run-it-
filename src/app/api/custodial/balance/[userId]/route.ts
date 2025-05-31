// app/api/custodial/balance/[userId]/route.ts - COLUMN FIXED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { userId } = params;
  
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    console.log('🔍 Getting balance from user_profiles for user:', userId);
    
    // 🔧 FIXED: Only select columns that actually exist in user_profiles
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        user_id,
        username,
        custodial_balance,
        privy_balance,
        total_balance,
        external_wallet_address,
        updated_at,
        created_at
      `)
      .eq('user_id', userId)
      .single();
    
    if (profileError || !userProfile) {
      console.log(`❌ User ${userId} not found in user_profiles:`, profileError?.message);
      
      return NextResponse.json({
        userId,
        custodialBalance: 0,
        totalBalance: 0,
        privyBalance: 0,
        embeddedBalance: 0,
        totalDeposited: 0,
        lastDeposit: 0,
        hasWallet: false,
        message: 'User not found in user_profiles table',
        source: 'user_profiles_not_found',
        error: profileError?.message,
        timestamp: Date.now()
      });
    }
    
    // 🔧 PARSE: Extract the balances from the found user
    const custodialBalance = parseFloat(userProfile.custodial_balance) || 0;
    const privyBalance = parseFloat(userProfile.privy_balance) || 0;
    const totalBalance = parseFloat(userProfile.total_balance) || 0;
    
    console.log(`💰 Found user ${userId} with balance: ${custodialBalance.toFixed(9)} SOL`);
    
    return NextResponse.json({
      userId,
      custodialBalance,           // Should be 0.086269835
      totalBalance,
      privyBalance,
      embeddedBalance: privyBalance,
      totalDeposited: 0,          // 🔧 DEFAULT: Not available in user_profiles
      lastDeposit: 0,             // 🔧 DEFAULT: Not available in user_profiles
      hasWallet: true,
      walletAddress: userProfile.external_wallet_address,
      canBet: custodialBalance >= 0.001,
      canWithdraw: custodialBalance > 0,
      embeddedWalletId: undefined, // 🔧 DEFAULT: Not available in user_profiles
      totalTransfersToEmbedded: 0, // 🔧 DEFAULT: Not available in user_profiles
      totalTransfersToCustodial: 0, // 🔧 DEFAULT: Not available in user_profiles
      lastActivity: userProfile.updated_at,
      source: 'user_profiles_fixed',
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

// Keep the POST method for consistency
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await request.json();
    
    if (body.action === 'refresh') {
      console.log(`🔄 Force refresh requested for user: ${userId}`);
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
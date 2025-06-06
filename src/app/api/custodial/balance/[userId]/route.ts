// app/api/custodial/balance/[userId]/route.ts - ENHANCED WITH PRIVY SUPPORT
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
    
    console.log('🔍 Getting balance from users_unified for user:', userId);
    
    // ✅ FIXED: Handle UUID vs Privy DID format properly
    let userProfile, profileError;
    
    if (userId.startsWith('did:privy:')) {
      // Search by Privy DID only
      console.log('🔍 Searching by Privy DID:', userId);
      const result = await supabase
        .from('users_unified')
        .select(`
          id,
          username,
          custodial_balance,
          privy_balance,
          embedded_balance,
          external_wallet_address,
          wallet_address,
          custodial_total_deposited,
          last_custodial_deposit,
          embedded_wallet_id,
          total_transfers_to_embedded,
          total_transfers_to_custodial,
          total_deposited,
          privy_user_id,
          updated_at,
          created_at
        `)
        .eq('privy_user_id', userId)
        .single();
      
      userProfile = result.data;
      profileError = result.error;
    } else {
      // Search by UUID only
      console.log('🔍 Searching by UUID:', userId);
      const result = await supabase
        .from('users_unified')
        .select(`
          id,
          username,
          custodial_balance,
          privy_balance,
          embedded_balance,
          external_wallet_address,
          wallet_address,
          custodial_total_deposited,
          last_custodial_deposit,
          embedded_wallet_id,
          total_transfers_to_embedded,
          total_transfers_to_custodial,
          total_deposited,
          privy_user_id,
          updated_at,
          created_at
        `)
        .eq('id', userId)
        .single();
      
      userProfile = result.data;
      profileError = result.error;
    }
    
    if (profileError || !userProfile) {
      console.log(`❌ User ${userId} not found in users_unified:`, profileError?.message);
      
      // ✅ ENHANCED: Better error handling for Privy DIDs
      const userType = userId.startsWith('did:privy:') ? 'Privy DID' : 'UUID';
      
      return NextResponse.json({
        userId,
        custodialBalance: 0,
        totalBalance: 0,
        privyBalance: 0,
        embeddedBalance: 0,
        totalDeposited: 0,
        lastDeposit: 0,
        hasWallet: false,
        message: `User not found in users_unified table (searched by ${userType})`,
        source: 'users_unified_not_found',
        userType,
        error: profileError?.message,
        timestamp: Date.now()
      });
    }
    
    // ✅ Parse balances and calculate total manually
    const custodialBalance = parseFloat(userProfile.custodial_balance || '0') || 0;
    const privyBalance = parseFloat(userProfile.privy_balance || '0') || 0;
    const embeddedBalance = parseFloat(userProfile.embedded_balance || '0') || 0;
    const totalBalance = custodialBalance + privyBalance + embeddedBalance;
    const totalDeposited = parseFloat(userProfile.total_deposited || userProfile.custodial_total_deposited || '0') || 0;
    
    console.log(`💰 Found user ${userProfile.id} (searched by ${userId}) with balance: ${custodialBalance.toFixed(9)} SOL`);
    
    return NextResponse.json({
      userId: userProfile.id, // ✅ Always return the database UUID
      searchedUserId: userId, // ✅ Include what was searched for
      custodialBalance,
      totalBalance,
      privyBalance,
      embeddedBalance,
      totalDeposited,
      lastDeposit: userProfile.last_custodial_deposit || 0,
      hasWallet: true,
      walletAddress: userProfile.external_wallet_address || userProfile.wallet_address,
      canBet: custodialBalance >= 0.001,
      canWithdraw: custodialBalance > 0,
      embeddedWalletId: userProfile.embedded_wallet_id,
      totalTransfersToEmbedded: parseFloat(userProfile.total_transfers_to_embedded || '0') || 0,
      totalTransfersToCustodial: parseFloat(userProfile.total_transfers_to_custodial || '0') || 0,
      lastActivity: userProfile.updated_at,
      privyUserId: userProfile.privy_user_id, // ✅ Include Privy ID if available
      source: 'users_unified_enhanced',
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
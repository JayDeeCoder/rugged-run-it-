// app/api/custodial/balance/[userId]/route.ts - DEBUG VERSION
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { userId } = params;
  
  // 🔧 IMMEDIATE DEBUG: Log that we're hitting the right route
  console.log('🚨 DEBUG: [userId]/route.ts called with userId:', userId);
  console.log('🚨 DEBUG: Timestamp:', new Date().toISOString());
  
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    console.log('🚨 DEBUG: Environment variables:', {
      hasUrl: !!SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_KEY,
      urlPreview: SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'missing'
    });
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({ 
        error: 'Missing Supabase configuration',
        debug: 'Environment variables missing'
      }, { status: 500 });
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    console.log('🚨 DEBUG: About to query user_profiles for userId:', userId);
    
    // 🔧 ENHANCED DEBUG: Try the query with detailed logging
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        user_id, username, custodial_balance, privy_balance, total_balance,
        external_wallet_address, custodial_total_deposited, last_custodial_deposit,
        embedded_wallet_id, total_transfers_to_embedded, total_transfers_to_custodial,
        updated_at, created_at
      `)
      .eq('user_id', userId)
      .single();
    
    console.log('🚨 DEBUG: Query result:', {
      hasData: !!userProfile,
      hasError: !!profileError,
      errorMessage: profileError?.message,
      errorDetails: profileError?.details,
      errorHint: profileError?.hint,
      userProfileKeys: userProfile ? Object.keys(userProfile) : 'no data'
    });
    
    if (profileError) {
      console.log('🚨 DEBUG: Profile error details:', profileError);
    }
    
    if (userProfile) {
      console.log('🚨 DEBUG: Found user profile:', {
        userId: userProfile.user_id,
        custodialBalance: userProfile.custodial_balance,
        rawBalance: typeof userProfile.custodial_balance,
        updatedAt: userProfile.updated_at
      });
    }
    
    if (profileError || !userProfile) {
      console.log(`🚨 DEBUG: User ${userId} not found in user_profiles, returning not found`);
      
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
        debug: {
          error: profileError?.message,
          searchedTable: 'user_profiles',
          searchedUserId: userId
        },
        timestamp: Date.now()
      });
    }
    
    const custodialBalance = parseFloat(userProfile.custodial_balance) || 0;
    const privyBalance = parseFloat(userProfile.privy_balance) || 0;
    const totalBalance = parseFloat(userProfile.total_balance) || 0;
    const totalDeposited = parseFloat(userProfile.custodial_total_deposited) || 0;
    const lastDeposit = userProfile.last_custodial_deposit ? 
      new Date(userProfile.last_custodial_deposit).getTime() : 0;
    
    console.log(`🚨 DEBUG: Parsed balances:`, {
      raw: userProfile.custodial_balance,
      parsed: custodialBalance,
      privyRaw: userProfile.privy_balance,
      privyParsed: privyBalance
    });
    
    const response = {
      userId,
      custodialBalance,
      totalBalance,
      privyBalance,
      embeddedBalance: privyBalance,
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
      source: 'user_profiles_debug_success',
      debug: {
        foundInTable: 'user_profiles',
        rawCustodialBalance: userProfile.custodial_balance,
        parsedCustodialBalance: custodialBalance
      },
      timestamp: Date.now()
    };
    
    console.log('🚨 DEBUG: Returning response:', response);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('🚨 DEBUG: Catch block error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get custodial balance',
        details: error instanceof Error ? error.message : 'Unknown error',
        debug: 'Caught in try-catch block'
      },
      { status: 500 }
    );
  }
}
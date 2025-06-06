// app/api/custodial/balance/route.ts - FIXED FOR USERS_UNIFIED
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Database configuration missing');
      return NextResponse.json(
        { error: 'Database service not available' },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    console.log('💰 Getting custodial balance for user:', userId);
    
    // 🔧 FIXED: Only select columns that exist, calculate total manually
    const { data: userProfile, error: profileError } = await supabase
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
        total_deposited,
        last_custodial_deposit,
        embedded_wallet_id,
        total_transfers_to_embedded,
        total_transfers_to_custodial,
        updated_at,
        created_at
      `)
      .eq('id', userId)
      .single();
    
    if (profileError || !userProfile) {
      console.log('📭 No user found in users_unified table:', profileError?.message);
      return NextResponse.json({
        success: true,
        balance: '0.000000',
        balanceSOL: 0,
        privyBalance: 0,
        embeddedBalance: 0,
        totalBalance: 0,
        message: 'No wallet found - make a deposit to create your account',
        walletExists: false,
        mode: 'custodial',
        source: 'not_found'
      });
    }

    // ✅ Calculate balances manually since total_balance column doesn't exist
    const custodialBalance = parseFloat(userProfile.custodial_balance || '0') || 0;
    const privyBalance = parseFloat(userProfile.privy_balance || '0') || 0;
    const embeddedBalance = parseFloat(userProfile.embedded_balance || '0') || 0;
    const totalBalance = custodialBalance + privyBalance + embeddedBalance; // Calculate manually
    
    console.log(`💰 User ${userId} balance from users_unified: ${custodialBalance} SOL (custodial), ${privyBalance} SOL (privy), ${embeddedBalance} SOL (embedded). Total: ${totalBalance} SOL`);

    return NextResponse.json({
      success: true,
      balance: custodialBalance.toFixed(6),
      balanceSOL: custodialBalance,
      privyBalance: privyBalance,
      embeddedBalance: embeddedBalance,
      totalBalance: totalBalance, // Now calculated correctly
      lastUpdated: userProfile.updated_at,
      walletCreated: userProfile.created_at,
      walletExists: true,
      mode: 'custodial',
      source: 'users_unified',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Balance check error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get balance',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId in request body' },
        { status: 400 }
      );
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return NextResponse.json(
        { error: 'Database service not available' },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    console.log('💰 POST: Getting custodial balance for user:', userId);
    
    // 🔧 FIXED: Only select existing columns
    const { data: userProfile, error: profileError } = await supabase
      .from('users_unified')
      .select(`
        id,
        username,
        custodial_balance,
        privy_balance,
        embedded_balance,
        external_wallet_address,
        wallet_address,
        updated_at,
        created_at
      `)
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      console.log('📭 POST: No user found in users_unified table:', profileError?.message);
      return NextResponse.json({
        success: true,
        balance: '0.000000',
        balanceSOL: 0,
        privyBalance: 0,
        embeddedBalance: 0,
        totalBalance: 0,
        message: 'No wallet found - make a deposit to create your account',
        walletExists: false,
        mode: 'custodial',
        source: 'not_found'
      });
    }

    // ✅ Calculate balances manually
    const custodialBalance = parseFloat(userProfile.custodial_balance || '0') || 0;
    const privyBalance = parseFloat(userProfile.privy_balance || '0') || 0;
    const embeddedBalance = parseFloat(userProfile.embedded_balance || '0') || 0;
    const totalBalance = custodialBalance + privyBalance + embeddedBalance;
    
    console.log(`💰 POST: User ${userId} balance from users_unified: ${custodialBalance} SOL (total: ${totalBalance} SOL)`);

    return NextResponse.json({
      success: true,
      balance: custodialBalance.toFixed(6),
      balanceSOL: custodialBalance,
      privyBalance: privyBalance,
      embeddedBalance: embeddedBalance,
      totalBalance: totalBalance, // Now calculated correctly
      lastUpdated: userProfile.updated_at,
      walletExists: true,
      mode: 'custodial',
      source: 'users_unified',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ POST balance check error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get balance',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
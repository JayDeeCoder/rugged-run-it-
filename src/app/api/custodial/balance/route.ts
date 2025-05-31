// app/api/custodial/balance/route.ts - FIXED VERSION
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
    
    // 🔧 CRITICAL FIX: Read from user_profiles table (same as game server)
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('custodial_balance, privy_balance, total_balance, updated_at, created_at, external_wallet_address')
      .eq('user_id', userId)
      .single();
    
    // 🔧 FALLBACK: If not in user_profiles, try user_hybrid_wallets
    if (profileError || !userProfile) {
      console.log('📭 No user_profiles entry, checking user_hybrid_wallets...');
      
      const { data: userWallet, error: walletError } = await supabase
        .from('user_hybrid_wallets')
        .select('custodial_balance, updated_at, created_at, external_wallet_address')
        .eq('user_id', userId)
        .single();
      
      if (walletError || !userWallet) {
        console.log('📭 No wallet found in either table, returning zero balance');
        return NextResponse.json({
          success: true,
          balance: '0.000000',
          balanceSOL: 0,
          message: 'No wallet found - make a deposit to create your account',
          walletExists: false,
          mode: 'custodial',
          source: 'not_found'
        });
      }

      // Return data from user_hybrid_wallets as fallback
      const balance = parseFloat(userWallet.custodial_balance || '0');
      
      console.log(`💰 User ${userId} balance from user_hybrid_wallets: ${balance} SOL`);

      return NextResponse.json({
        success: true,
        balance: balance.toFixed(6),
        balanceSOL: balance,
        lastUpdated: userWallet.updated_at,
        walletCreated: userWallet.created_at,
        walletExists: true,
        mode: 'custodial',
        source: 'user_hybrid_wallets',
        timestamp: new Date().toISOString()
      });
    }

    // 🔧 PRIMARY: Return data from user_profiles table
    const custodialBalance = parseFloat(userProfile.custodial_balance || '0');
    const privyBalance = parseFloat(userProfile.privy_balance || '0');
    const totalBalance = parseFloat(userProfile.total_balance || '0');
    
    console.log(`💰 User ${userId} balance from user_profiles: ${custodialBalance} SOL (custodial), ${privyBalance} SOL (privy)`);

    return NextResponse.json({
      success: true,
      balance: custodialBalance.toFixed(6),
      balanceSOL: custodialBalance,
      privyBalance: privyBalance,
      totalBalance: totalBalance,
      lastUpdated: userProfile.updated_at,
      walletCreated: userProfile.created_at,
      walletExists: true,
      mode: 'custodial',
      source: 'user_profiles', // 🔧 NEW: Indicate data source
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
    
    // 🔧 SAME FIX: Read from user_profiles first
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('custodial_balance, privy_balance, total_balance, updated_at')
      .eq('user_id', userId)
      .single();
    
    if (profileError || !userProfile) {
      console.log('📭 POST: No user_profiles entry, checking user_hybrid_wallets...');
      
      const { data: userWallet, error: walletError } = await supabase
        .from('user_hybrid_wallets')
        .select('custodial_balance, updated_at')
        .eq('user_id', userId)
        .single();
      
      if (walletError || !userWallet) {
        return NextResponse.json({
          success: true,
          balance: '0.000000',
          balanceSOL: 0,
          message: 'No wallet found - make a deposit to create your account',
          walletExists: false,
          mode: 'custodial',
          source: 'not_found'
        });
      }

      const balance = parseFloat(userWallet.custodial_balance || '0');
      return NextResponse.json({
        success: true,
        balance: balance.toFixed(6),
        balanceSOL: balance,
        lastUpdated: userWallet.updated_at,
        walletExists: true,
        mode: 'custodial',
        source: 'user_hybrid_wallets',
        timestamp: new Date().toISOString()
      });
    }

    const custodialBalance = parseFloat(userProfile.custodial_balance || '0');
    
    console.log(`💰 POST: User ${userId} balance from user_profiles: ${custodialBalance} SOL`);

    return NextResponse.json({
      success: true,
      balance: custodialBalance.toFixed(6),
      balanceSOL: custodialBalance,
      privyBalance: parseFloat(userProfile.privy_balance || '0'),
      totalBalance: parseFloat(userProfile.total_balance || '0'),
      lastUpdated: userProfile.updated_at,
      walletExists: true,
      mode: 'custodial',
      source: 'user_profiles',
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
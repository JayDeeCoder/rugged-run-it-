// app/api/custodial/balance/route.ts
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
    
    const { data: userWallet, error } = await supabase
      .from('user_hybrid_wallets')
      .select('custodial_balance, updated_at, created_at')
      .eq('user_id', userId)
      .single();
    
    if (error || !userWallet) {
      console.log('📭 No wallet found for user, returning zero balance');
      return NextResponse.json({
        success: true,
        balance: '0.000000',
        balanceSOL: 0,
        message: 'No wallet found - make a deposit to create your account',
        walletExists: false,
        mode: 'custodial'
      });
    }

    const balance = parseFloat(userWallet.custodial_balance || '0');
    
    console.log(`💰 User ${userId} balance: ${balance} SOL`);

    return NextResponse.json({
      success: true,
      balance: balance.toFixed(6),
      balanceSOL: balance,
      lastUpdated: userWallet.updated_at,
      walletCreated: userWallet.created_at,
      walletExists: true,
      mode: 'custodial',
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

    // Same logic as GET but with POST for consistency with other endpoints
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return NextResponse.json(
        { error: 'Database service not available' },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const { data: userWallet, error } = await supabase
      .from('user_hybrid_wallets')
      .select('custodial_balance, updated_at')
      .eq('user_id', userId)
      .single();
    
    if (error || !userWallet) {
      return NextResponse.json({
        success: true,
        balance: '0.000000',
        balanceSOL: 0,
        message: 'No wallet found - make a deposit to create your account',
        walletExists: false,
        mode: 'custodial'
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
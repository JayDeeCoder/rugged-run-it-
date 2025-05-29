// app/api/users/get-or-create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Please add it to your .env.local file.');
}

// Use SERVICE ROLE KEY to bypass RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json();
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    console.log('🔍 API: Getting/creating user for wallet:', walletAddress);

    // Try to get existing user with service role (bypasses RLS)
    let { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create new one with service role
      console.log('👤 API: Creating new user for wallet:', walletAddress);
      
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          wallet_address: walletAddress,
          username: `user${walletAddress.slice(-4)}`,
          avatar: '👤',
          level: 1,
          experience: 0
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ API: Error creating user:', createError);
        return NextResponse.json(
          { error: 'Failed to create user', details: createError },
          { status: 500 }
        );
      }
      
      user = newUser;
      console.log('✅ API: Created new user:', user.id);
    } else if (error) {
      console.error('❌ API: Error fetching user:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user', details: error },
        { status: 500 }
      );
    } else {
      console.log('✅ API: Found existing user:', user.id);
    }

    return NextResponse.json({ user });
    
  } catch (error) {
    console.error('❌ API: Unexpected error in getUserOrCreate:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
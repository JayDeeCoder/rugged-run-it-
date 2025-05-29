// app/api/users/get-or-create/route.ts - Step 2: With Supabase (use after simple version works)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    console.log('🟢 API route called - Step 2 with Supabase');
    
    // Step 1: Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    console.log('🔍 Environment check:', {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    });
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({
        error: 'Missing Supabase environment variables',
        debug: {
          hasUrl: !!supabaseUrl,
          hasAnonKey: !!supabaseAnonKey,
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
        }
      }, { status: 500 });
    }
    
    // Step 2: Parse request
    const body = await request.json();
    const { walletAddress } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    console.log('🔍 Processing wallet with anon key:', walletAddress);
    
    // Step 3: Create Supabase client (using anon key - RLS MUST be disabled)
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Step 4: Try to get existing user
    console.log('🔍 Attempting to fetch user...');
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();
    
    console.log('🔍 Fetch result:', { user: !!user, error: error?.code });
    
    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create new one
      console.log('👤 Creating new user...');
      
      const { data: newUser, error: createError } = await supabase
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
        console.error('❌ Error creating user:', createError);
        
        // If RLS error, give specific instructions
        if (createError.code === '42501') {
          return NextResponse.json({
            error: 'Row Level Security is blocking user creation',
            instructions: 'Run this SQL in Supabase: ALTER TABLE users DISABLE ROW LEVEL SECURITY;',
            details: createError
          }, { status: 500 });
        }
        
        return NextResponse.json({
          error: 'Failed to create user',
          details: createError
        }, { status: 500 });
      }
      
      user = newUser;
      console.log('✅ Created new user:', user.id);
    } else if (error) {
      console.error('❌ Error fetching user:', error);
      
      // If RLS error on select, give instructions
      if (error.code === '42501') {
        return NextResponse.json({
          error: 'Row Level Security is blocking user access',
          instructions: 'Run this SQL in Supabase: ALTER TABLE users DISABLE ROW LEVEL SECURITY;',
          details: error
        }, { status: 500 });
      }
      
      return NextResponse.json({
        error: 'Failed to fetch user',
        details: error
      }, { status: 500 });
    } else {
      console.log('✅ Found existing user:', user.id);
    }

    return NextResponse.json({ 
      user,
      debug: { 
        usingAnonKey: true, 
        note: 'RLS must be disabled for this to work' 
      }
    });
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Step 2 endpoint working - with Supabase',
    timestamp: new Date().toISOString()
  });
}
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getServerSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing server-side Supabase configuration');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, username, walletAddress, referralCode } = body;
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Find referrer if referral code provided
    let referrerId: string | null = null;
    if (referralCode && referralCode.trim()) {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('id')
        .eq('referral_code', referralCode.trim())
        .single();
      
      if (referrer) {
        referrerId = referrer.id;
      }
    }

    // Create/update profile using RPC function
    const { error } = await supabase.rpc('upsert_user_profile', {
      p_user_id: userId,
      p_username: username || null,
      p_wallet_address: walletAddress || null,
      p_referred_by: referrerId
    });

    if (error) {
      throw error;
    }

    // Create pending referral if applicable
    if (referrerId && referralCode) {
      await supabase
        .from('referrals')
        .insert({
          referrer_id: referrerId,
          referred_user_id: userId,
          referral_code: referralCode.trim(),
          status: 'pending',
          activation_status: 'pending',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
    }

    // Get the generated referral code
    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .single();

    return NextResponse.json({ 
      success: true, 
      referralCode: profile?.referral_code || null 
    });
  } catch (error) {
    console.error('API Error - create-profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

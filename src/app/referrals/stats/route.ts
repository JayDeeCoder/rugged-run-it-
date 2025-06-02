// src/app/api/referrals/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role key
const getServerSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing server-side Supabase configuration');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('referral_code, total_referrals, total_referral_rewards')
      .eq('id', userId)
      .single();

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
      }
      throw profileError;
    }

    // Get recent referrals
    const { data: recentReferrals } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get pending rewards
    const { data: pendingRewards } = await supabase
      .from('referral_rewards')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const stats = {
      referralCode: profile.referral_code || '',
      totalReferrals: profile.total_referrals || 0,
      totalRewards: profile.total_referral_rewards || 0,
      pendingRewards: pendingRewards?.reduce((sum, reward) => sum + parseFloat(reward.amount), 0) || 0,
      recentReferrals: recentReferrals || [],
      pendingReferralRewards: pendingRewards || []
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('API Error - referrals/stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
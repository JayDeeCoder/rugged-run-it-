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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    
    if (!code) {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('referral_code', code)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (profile) {
      return NextResponse.json({
        valid: true,
        referrer: {
          username: profile.username || 'Anonymous'
        }
      });
    } else {
      return NextResponse.json({ valid: false });
    }
  } catch (error) {
    console.error('API Error - validate-code:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
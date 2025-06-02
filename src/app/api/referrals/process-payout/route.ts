// src/app/api/referrals/process-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '../../../../utils/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userAgent } = body;
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();

    console.log(`🔄 API: Processing login for user ${userId}...`);

    // Check if user exists and if it's first login
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_activated, referred_by, username')
      .eq('id', userId)
      .single();

    // If profile doesn't exist, this is definitely a first login
    let isFirstLogin = true;
    let referralActivated = false;
    let referrerUsername = undefined;

    if (profileError && profileError.code === 'PGRST116') {
      // Profile doesn't exist - this is a new user
      console.log(`👤 API: New user detected: ${userId}`);
      
      // Create basic profile
      const { error: createError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          is_activated: true,
          first_login_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (createError) {
        console.error('❌ API: Error creating profile:', createError);
        // Don't throw - continue with defaults
      } else {
        console.log(`✅ API: Profile created for ${userId}`);
      }

    } else if (profile) {
      // Profile exists - check if already activated
      isFirstLogin = !profile.is_activated;
      
      if (isFirstLogin) {
        console.log(`🔄 API: First login for existing user ${userId}`);
        
        // Mark user as activated
        await supabase
          .from('profiles')
          .update({
            is_activated: true,
            first_login_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        // Check for pending referrals
        const { data: pendingReferral } = await supabase
          .from('referrals')
          .select(`
            *,
            referrer_profile:profiles!referrals_referrer_id_fkey(username)
          `)
          .eq('referred_user_id', userId)
          .eq('activation_status', 'pending')
          .single();

        if (pendingReferral) {
          // Check if not expired
          if (new Date(pendingReferral.expires_at) > new Date()) {
            // Activate the referral
            await supabase
              .from('referrals')
              .update({
                activation_status: 'activated',
                activated_at: new Date().toISOString(),
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', pendingReferral.id);

            referralActivated = true;
            referrerUsername = pendingReferral.referrer_profile?.username;

            console.log(`✅ API: Referral activated for ${userId}`);
          } else {
            // Expire the referral
            await supabase
              .from('referrals')
              .update({ activation_status: 'expired' })
              .eq('id', pendingReferral.id);

            console.log(`⏰ API: Referral expired for ${userId}`);
          }
        }
      } else {
        console.log(`✅ API: Returning user ${userId}`);
      }
    }

    // Log the login event (optional - you can integrate with your existing logging)
    try {
      // This would integrate with your existing transaction logging system
      // For now, just log to console
      console.log(`📝 API: Login event for ${userId}:`, {
        isFirstLogin,
        referralActivated,
        userAgent,
        timestamp: new Date().toISOString()
      });
    } catch (logError) {
      console.warn('⚠️ API: Failed to log login event:', logError);
    }

    const result = {
      isFirstLogin,
      referralActivated,
      referrerUsername
    };

    console.log(`✅ API: Login processed for ${userId}:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ API Error - process-login:', error);
    
    // Return safe defaults on error
    return NextResponse.json({
      isFirstLogin: false,
      referralActivated: false
    });
  }
}
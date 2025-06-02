import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '../../../../utils/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();

    console.log(`🔄 API: Processing payout for user ${userId}...`);

    // Get pending referral rewards
    const { data: pendingRewards, error: rewardsError } = await supabase
      .from('referral_rewards')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (rewardsError) {
      throw rewardsError;
    }

    if (!pendingRewards || pendingRewards.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No pending referral rewards found'
      }, { status: 404 });
    }

    const totalAmount = pendingRewards.reduce((sum, reward) => sum + parseFloat(reward.amount.toString()), 0);

    // For now, we'll mark rewards as paid without actual blockchain transaction
    // You can integrate this with your existing wallet/transaction system
    const transactionId = `ref_payout_${userId}_${Date.now()}`;

    // Mark rewards as paid
    const rewardIds = pendingRewards.map(r => r.id);
    const { error: updateError } = await supabase
      .from('referral_rewards')
      .update({
        status: 'paid',
        transaction_id: transactionId,
        paid_at: new Date().toISOString()
      })
      .in('id', rewardIds);

    if (updateError) {
      throw updateError;
    }

    // Update user's total rewards
    const { data: updatedRewards } = await supabase
      .from('referral_rewards')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'pending');

    const remainingRewards = updatedRewards?.reduce((sum, reward) => sum + parseFloat(reward.amount.toString()), 0) || 0;

    await supabase
      .from('profiles')
      .update({ 
        total_referral_rewards: remainingRewards,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    console.log(`✅ API: Payout processed for ${userId}: ${totalAmount} SOL`);

    return NextResponse.json({
      success: true,
      totalPaid: totalAmount,
      transactionIds: [transactionId]
    });

  } catch (error) {
    console.error('❌ API Error - process-payout:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Payout failed'
    }, { status: 500 });
  }
}
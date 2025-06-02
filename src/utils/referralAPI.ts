// src/services/ReferralService.ts - Clean frontend-safe version
import { SupabaseClient } from '@supabase/supabase-js';
import { getFrontendSupabaseClient } from '../utils/supabase';

export interface ReferralData {
  id: string;
  referrerId: string;
  referredUserId: string;
  referralCode: string;
  rewardAmount: number;
  status: 'pending' | 'completed' | 'expired';
  activationStatus: 'pending' | 'activated' | 'expired';
  activatedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ReferralReward {
  id: string;
  userId: string;
  referralId?: string;
  rewardType: 'referral_bonus' | 'milestone_bonus';
  amount: number;
  description: string;
  status: 'pending' | 'paid' | 'failed';
  transactionId?: string;
  createdAt: string;
  paidAt?: string;
}

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  totalRewards: number;
  pendingRewards: number;
  recentReferrals: ReferralData[];
  pendingReferralRewards: ReferralReward[];
  nextMilestone?: {
    threshold: number;
    reward: number;
    remaining: number;
  };
}

const REWARD_TIERS = [
  { threshold: 1, reward: 0.05, description: 'First referral bonus' },
  { threshold: 5, reward: 0.25, description: '5 referrals milestone' },
  { threshold: 10, reward: 0.50, description: '10 referrals milestone' },
  { threshold: 25, reward: 1.00, description: '25 referrals milestone' },
  { threshold: 50, reward: 2.50, description: '50 referrals milestone' },
  { threshold: 100, reward: 5.00, description: '100 referrals milestone' }
];

export class ReferralService {
  private supabase: SupabaseClient | null = null;
  private initialized = false;

  /**
   * Initialize the service with frontend-safe Supabase client
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('🔧 ReferralService: Initializing...');
      
      this.supabase = getFrontendSupabaseClient();
      this.initialized = true;

      console.log('✅ ReferralService: Initialized successfully (frontend-safe)');
      
      // Test connection in background (don't await)
      this.performConnectionTest();

    } catch (error) {
      console.error('❌ ReferralService: Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Get initialized Supabase client
   */
  private async getSupabase(): Promise<SupabaseClient> {
    await this.initialize();
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    return this.supabase;
  }

  /**
   * Perform connection test (fire and forget)
   */
  private performConnectionTest(): void {
    if (!this.supabase) {
      console.warn('⚠️ ReferralService: No client available for connection test');
      return;
    }

    // Use setTimeout to run async test without blocking
    setTimeout(async () => {
      try {
        await this.supabase!.from('player_bets').select('count').limit(1);
        console.log('✅ ReferralService: Connection test passed');
      } catch (error) {
        console.warn('⚠️ ReferralService: Connection test failed:', error);
      }
    }, 100);
  }

  /**
   * Get referral stats for user (READ-ONLY operations safe for frontend)
   */
  async getReferralStats(userId: string): Promise<ReferralStats | null> {
    try {
      console.log(`🔄 ReferralService: Fetching stats for user ${userId}...`);
      const supabase = await this.getSupabase();

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('referral_code, total_referrals, total_referral_rewards')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('❌ ReferralService: Profile query error:', profileError);
        if (profileError.code === 'PGRST116') {
          // No rows returned - user doesn't exist yet
          console.log(`📝 ReferralService: No profile found for user ${userId}`);
          return null;
        }
        throw profileError;
      }

      if (!profile) {
        console.log(`❌ ReferralService: No stats found for user ${userId}`);
        return null;
      }

      console.log(`📊 ReferralService: Found profile for ${userId}:`, {
        code: profile.referral_code,
        referrals: profile.total_referrals,
        rewards: profile.total_referral_rewards
      });

      // Get recent referrals
      const { data: recentReferrals, error: referralsError } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (referralsError) {
        console.warn('⚠️ ReferralService: Error fetching recent referrals:', referralsError);
      }

      // Get pending rewards
      const { data: pendingRewards, error: rewardsError } = await supabase
        .from('referral_rewards')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (rewardsError) {
        console.warn('⚠️ ReferralService: Error fetching pending rewards:', rewardsError);
      }

      // Calculate next milestone
      const nextMilestone = REWARD_TIERS.find(
        tier => tier.threshold > (profile.total_referrals || 0)
      );

      const stats: ReferralStats = {
        referralCode: profile.referral_code || '',
        totalReferrals: profile.total_referrals || 0,
        totalRewards: profile.total_referral_rewards || 0,
        pendingRewards: pendingRewards?.reduce((sum, reward) => sum + parseFloat(reward.amount), 0) || 0,
        recentReferrals: recentReferrals || [],
        pendingReferralRewards: pendingRewards || [],
        nextMilestone: nextMilestone ? {
          threshold: nextMilestone.threshold,
          reward: nextMilestone.reward,
          remaining: nextMilestone.threshold - (profile.total_referrals || 0)
        } : undefined
      };

      console.log(`✅ ReferralService: Stats retrieved for ${userId}`);
      return stats;

    } catch (error) {
      console.error('❌ ReferralService: Error getting referral stats:', error);
      return null;
    }
  }

  /**
   * Validate referral code (READ-ONLY, safe for frontend)
   */
  async validateReferralCode(code: string): Promise<{
    valid: boolean;
    referrer?: { username: string };
  }> {
    try {
      const supabase = await this.getSupabase();

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('referral_code', code)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return { valid: false };
        }
        throw error;
      }

      if (profile) {
        return {
          valid: true,
          referrer: {
            username: profile.username || 'Anonymous'
          }
        };
      }

      return { valid: false };
    } catch (error) {
      console.error('❌ ReferralService: Error validating referral code:', error);
      return { valid: false };
    }
  }

  /**
   * Get basic user referral info (READ-ONLY, safe for frontend)
   */
  async getUserReferralCode(userId: string): Promise<string | null> {
    try {
      const supabase = await this.getSupabase();

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log(`📝 ReferralService: No referral code found for user ${userId}`);
          return null;
        }
        throw error;
      }

      return profile?.referral_code || null;
    } catch (error) {
      console.error('❌ ReferralService: Error getting user referral code:', error);
      return null;
    }
  }

  /*
  ⚠️ WRITE OPERATIONS DISABLED FOR FRONTEND SAFETY
  
  The following operations require server-side execution with service role key:
  - createUserProfile()
  - processUserLogin() 
  - processReferralPayout()
  - activateReferralAndReward()
  
  These should be implemented as API routes in /app/api/referrals/
  */
}

// Create and export singleton instance
export const referralService = new ReferralService();
export default referralService;
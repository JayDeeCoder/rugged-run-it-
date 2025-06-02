// src/services/ReferralService.ts - Clean, error-free version
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Hardcoded fallback values for frontend use
const FALLBACK_SUPABASE_URL = 'https://ineaxxqjkryoobobxrsw.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZWF4eHFqa3J5b29ib2J4cnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzMxMzIsImV4cCI6MjA2MzM0OTEzMn0.DiFLCCe5-UnzsGpG7dsqJWoUbxmaJxc_v89pxxsa1aA';

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
   * Initialize the Supabase client with proper error handling
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

      console.log('🔧 ReferralService Config:', {
        hasEnvUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasEnvKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        usingFallback: !process.env.NEXT_PUBLIC_SUPABASE_URL,
        url: supabaseUrl.substring(0, 30) + '...'
      });

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase configuration');
      }

      this.supabase = createClient(supabaseUrl, supabaseAnonKey);
      this.initialized = true;

      console.log('✅ ReferralService initialized successfully (frontend-safe)');
      
      // Test connection in background without blocking
      this.testConnectionInBackground();

    } catch (error) {
      console.error('❌ Failed to initialize ReferralService:', error);
      throw error;
    }
  }

  /**
   * Test Supabase connection in background
   */
  private testConnectionInBackground(): void {
    // Use setTimeout to avoid blocking initialization
    setTimeout(() => {
      this.performConnectionTest();
    }, 100);
  }

  /**
   * Perform the actual connection test
   */
  private async performConnectionTest(): Promise<void> {
    if (!this.supabase) {
      console.warn('⚠️ ReferralService: No Supabase client for connection test');
      return;
    }

    try {
      await this.supabase.from('profiles').select('count').limit(1);
      console.log('✅ ReferralService connection test passed');
    } catch (error) {
      console.warn('⚠️ ReferralService connection test failed:', error);
    }
  }

  /**
   * Get the initialized Supabase client
   */
  private async getSupabase(): Promise<SupabaseClient> {
    await this.initialize();
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    return this.supabase;
  }

  /**
   * Get referral stats for user
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
        pendingRewards: pendingRewards?.reduce((sum, reward) => sum + parseFloat(reward.amount.toString()), 0) || 0,
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
   * Validate referral code
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
   * Get user referral code
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

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && this.supabase !== null;
  }

  /**
   * Process user login (frontend-safe version that calls API)
   */
  async processUserLogin(userId: string, userAgent?: string): Promise<{
    isFirstLogin: boolean;
    referralActivated: boolean;
    referrerUsername?: string;
  }> {
    try {
      console.log(`🔄 ReferralService: Processing login for user ${userId}...`);

      // Call API route for server-side processing
      const response = await fetch('/api/referrals/process-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          userAgent
        })
      });

      if (!response.ok) {
        if (response.status === 404) {
          // API route not implemented yet, return default values
          console.warn('⚠️ ReferralService: Login processing API not available, using defaults');
          return {
            isFirstLogin: false,
            referralActivated: false
          };
        }
        throw new Error(`Login processing failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ ReferralService: Login processed for ${userId}:`, result);
      return result;

    } catch (error) {
      console.error('❌ ReferralService: Error processing user login:', error);
      // Return safe defaults on error
      return {
        isFirstLogin: false,
        referralActivated: false
      };
    }
  }

  /**
   * Create user profile (frontend-safe version that calls API)
   */
  async createUserProfile(
    userId: string, 
    username?: string, 
    walletAddress?: string, 
    referralCode?: string
  ): Promise<string | null> {
    try {
      console.log(`🔄 ReferralService: Creating profile for user ${userId}...`);

      const response = await fetch('/api/referrals/create-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          username,
          walletAddress,
          referralCode
        })
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn('⚠️ ReferralService: Create profile API not available');
          return null;
        }
        throw new Error(`Profile creation failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ ReferralService: Profile created for ${userId}`);
      return result.referralCode || null;

    } catch (error) {
      console.error('❌ ReferralService: Error creating user profile:', error);
      return null;
    }
  }

  /**
   * Process referral payout (frontend-safe version that calls API)
   */
  async processReferralPayout(userId: string): Promise<{
    success: boolean;
    totalPaid?: number;
    transactionIds?: string[];
    error?: string;
  }> {
    try {
      console.log(`🔄 ReferralService: Processing payout for user ${userId}...`);

      const response = await fetch('/api/referrals/process-payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: 'Payout API not available'
          };
        }
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || 'Payout failed'
        };
      }

      const result = await response.json();
      console.log(`✅ ReferralService: Payout processed for ${userId}`);
      return result;

    } catch (error) {
      console.error('❌ ReferralService: Error processing payout:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payout failed'
      };
    }
  }

  /**
   * Get service status for debugging
   */
  getStatus(): {
    initialized: boolean;
    hasClient: boolean;
    config: {
      hasEnvUrl: boolean;
      hasEnvKey: boolean;
      usingFallback: boolean;
    };
  } {
    return {
      initialized: this.initialized,
      hasClient: this.supabase !== null,
      config: {
        hasEnvUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasEnvKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        usingFallback: !process.env.NEXT_PUBLIC_SUPABASE_URL
      }
    };
  }
}

// Create and export singleton instance
export const referralService = new ReferralService();
export default referralService;
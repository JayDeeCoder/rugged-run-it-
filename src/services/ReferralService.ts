// src/services/ReferralService.ts
import { privyWalletAPI, PrivyWalletAPI } from './privyWalletAPI';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../utils/logger';

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

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase configuration');
      }

      this.supabase = createClient(supabaseUrl, supabaseServiceKey);
      this.initialized = true;

      logger.info('ReferralService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ReferralService:', error);
      throw error;
    }
  }

  private async getSupabase(): Promise<SupabaseClient> {
    await this.initialize();
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    return this.supabase;
  }

  /**
   * Create or update user profile with referral code
   */
  async createUserProfile(
    userId: string, 
    username?: string, 
    walletAddress?: string, 
    referralCode?: string
  ): Promise<string | null> {
    try {
      const supabase = await this.getSupabase();

      // Find referrer if referral code provided
      let referrerId: string | null = null;
      if (referralCode && referralCode.trim()) {
        const { data: referrer, error: referrerError } = await supabase
          .from('profiles')
          .select('id')
          .eq('referral_code', referralCode.trim())
          .single();
        
        if (referrer && !referrerError) {
          referrerId = referrer.id;
        } else if (referrerError && referrerError.code !== 'PGRST116') {
          logger.error('Error finding referrer:', referrerError);
        }
      }

      // Create/update profile
      const { error } = await supabase.rpc('upsert_user_profile', {
        p_user_id: userId,
        p_username: username || null,
        p_wallet_address: walletAddress || null,
        p_referred_by: referrerId
      });

      if (error) {
        logger.error('Error creating user profile:', error);
        throw error;
      }

      // Create pending referral if applicable
      if (referrerId && referralCode && referralCode.trim()) {
        await this.createPendingReferral(referrerId, userId, referralCode.trim());
      }

      // Get the generated referral code
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', userId)
        .single();

      if (profileError) {
        logger.error('Error fetching user profile:', profileError);
        return null;
      }

      return profile?.referral_code || null;
    } catch (error) {
      logger.error('Error in createUserProfile:', error);
      return null;
    }
  }

  /**
   * Create pending referral
   */
  private async createPendingReferral(
    referrerId: string, 
    referredUserId: string, 
    referralCode: string
  ): Promise<void> {
    try {
      const supabase = await this.getSupabase();

      const { error } = await supabase
        .from('referrals')
        .insert({
          referrer_id: referrerId,
          referred_user_id: referredUserId,
          referral_code: referralCode,
          status: 'pending',
          activation_status: 'pending',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        });

      if (error) {
        logger.error('Error inserting pending referral:', error);
        throw error;
      }

      logger.info(`Pending referral created: ${referredUserId} referred by ${referrerId}`);
    } catch (error) {
      logger.error('Error creating pending referral:', error);
      throw error;
    }
  }

  /**
   * Process user login and activate referrals
   */
  async processUserLogin(userId: string, userAgent?: string): Promise<{
    isFirstLogin: boolean;
    referralActivated: boolean;
    referrerUsername?: string;
  }> {
    try {
      const supabase = await this.getSupabase();

      // Check if user exists and if it's first login
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_activated, referred_by')
        .eq('id', userId)
        .single();

      const isFirstLogin = !profile?.is_activated;

      // Record login (using your existing transaction logging pattern)
      await privyWalletAPI.logTransaction(
        userId,
        'deposit', // Use existing transaction type
        0, // No amount for login
        undefined,
        undefined,
        undefined,
        'completed',
        { 
          type: 'user_login',
          is_first_login: isFirstLogin,
          user_agent: userAgent,
          timestamp: new Date().toISOString()
        }
      );

      let referralActivated = false;
      let referrerUsername = undefined;

      // If first login, activate user and process referrals
      if (isFirstLogin) {
        const result = await this.activateUserAndReferrals(userId);
        referralActivated = result.referralActivated;
        referrerUsername = result.referrerUsername;
      }

      return {
        isFirstLogin,
        referralActivated,
        referrerUsername
      };
    } catch (error) {
      logger.error('Error processing user login:', error);
      return {
        isFirstLogin: false,
        referralActivated: false
      };
    }
  }

  /**
   * Activate user and process referrals
   */
  private async activateUserAndReferrals(userId: string): Promise<{
    referralActivated: boolean;
    referrerUsername?: string;
  }> {
    try {
      const supabase = await this.getSupabase();

      // Mark user as activated
      await supabase
        .from('profiles')
        .update({
          is_activated: true,
          first_login_at: new Date().toISOString()
        })
        .eq('id', userId);

      // Find pending referral
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
          await this.activateReferralAndReward(pendingReferral);
          
          return {
            referralActivated: true,
            referrerUsername: pendingReferral.referrer_profile?.username
          };
        } else {
          // Expire the referral
          await supabase
            .from('referrals')
            .update({ activation_status: 'expired' })
            .eq('id', pendingReferral.id);
        }
      }

      return {
        referralActivated: false
      };
    } catch (error) {
      logger.error('Error activating user and referrals:', error);
      return {
        referralActivated: false
      };
    }
  }

  /**
   * Activate referral and create rewards
   */
  private async activateReferralAndReward(referral: any): Promise<void> {
    const baseReward = 0.02; // 0.02 SOL base reward

    try {
      const supabase = await this.getSupabase();

      // Update referral status
      await supabase
        .from('referrals')
        .update({
          activation_status: 'activated',
          activated_at: new Date().toISOString(),
          status: 'completed',
          completed_at: new Date().toISOString(),
          reward_amount: baseReward
        })
        .eq('id', referral.id);

      // Increment referrer's total count
      await supabase.rpc('increment_referral_count', {
        p_user_id: referral.referrer_id
      });

      // Create base referral reward
      await supabase
        .from('referral_rewards')
        .insert({
          user_id: referral.referrer_id,
          referral_id: referral.id,
          reward_type: 'referral_bonus',
          amount: baseReward,
          description: `Referral bonus - ${baseReward} SOL`,
          status: 'pending'
        });

      // Check for milestone bonuses
      const { data: profileData } = await supabase
        .from('profiles')
        .select('total_referrals')
        .eq('id', referral.referrer_id)
        .single();

      const totalReferrals = profileData?.total_referrals || 0;

      // Award milestone bonus if applicable
      for (const tier of REWARD_TIERS) {
        if (totalReferrals === tier.threshold) {
          await supabase
            .from('referral_rewards')
            .insert({
              user_id: referral.referrer_id,
              reward_type: 'milestone_bonus',
              amount: tier.reward,
              description: `${tier.description} - ${tier.reward} SOL`,
              status: 'pending'
            });
          break;
        }
      }

      // Update user's total referral rewards
      await this.updateUserTotalRewards(referral.referrer_id);

      logger.info(`Referral activated and rewards created for ${referral.referrer_id}`);
    } catch (error) {
      logger.error('Error activating referral and reward:', error);
    }
  }

  /**
   * Update user's total referral rewards
   */
  private async updateUserTotalRewards(userId: string): Promise<void> {
    try {
      const supabase = await this.getSupabase();

      const { data: rewards } = await supabase
        .from('referral_rewards')
        .select('amount')
        .eq('user_id', userId)
        .eq('status', 'pending');

      const totalRewards = rewards?.reduce((sum, reward) => sum + parseFloat(reward.amount), 0) || 0;

      await supabase
        .from('profiles')
        .update({ 
          total_referral_rewards: totalRewards,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    } catch (error) {
      logger.error('Error updating total rewards:', error);
    }
  }

  /**
   * Get referral stats for user
   */
  async getReferralStats(userId: string): Promise<ReferralStats | null> {
    try {
      const supabase = await this.getSupabase();

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_code, total_referrals, total_referral_rewards')
        .eq('id', userId)
        .single();

      if (!profile) {
        return null;
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

      // Calculate next milestone
      const nextMilestone = REWARD_TIERS.find(
        tier => tier.threshold > (profile.total_referrals || 0)
      );

      return {
        referralCode: profile.referral_code,
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
    } catch (error) {
      logger.error('Error getting referral stats:', error);
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('referral_code', code)
        .single();

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
      logger.error('Error validating referral code:', error);
      return { valid: false };
    }
  }

  /**
   * Process referral reward payout using existing wallet system
   */
  async processReferralPayout(userId: string): Promise<{
    success: boolean;
    totalPaid?: number;
    transactionIds?: string[];
    error?: string;
  }> {
    try {
      const supabase = await this.getSupabase();

      // Get pending referral rewards
      const { data: pendingRewards } = await supabase
        .from('referral_rewards')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending');

      if (!pendingRewards || pendingRewards.length === 0) {
        return {
          success: false,
          error: 'No pending referral rewards found'
        };
      }

      const totalAmount = pendingRewards.reduce((sum, reward) => sum + parseFloat(reward.amount), 0);

      // Log the payout transaction using your existing system
      const transactionId = await privyWalletAPI.logTransaction(
        userId,
        'deposit', // Use existing transaction type
        totalAmount,
        process.env.HOUSE_WALLET_ADDRESS, // From house wallet
        undefined, // To user (will be handled by custodial system)
        undefined, // No blockchain transaction yet
        'completed',
        {
          type: 'referral_payout',
          reward_count: pendingRewards.length,
          reward_details: pendingRewards.map(r => ({
            id: r.id,
            type: r.reward_type,
            amount: r.amount,
            description: r.description
          }))
        }
      );

      if (!transactionId) {
        throw new Error('Failed to log referral payout transaction');
      }

      // Mark rewards as paid
      const rewardIds = pendingRewards.map(r => r.id);
      await supabase
        .from('referral_rewards')
        .update({
          status: 'paid',
          transaction_id: transactionId,
          paid_at: new Date().toISOString()
        })
        .in('id', rewardIds);

      // Update user's total rewards
      await this.updateUserTotalRewards(userId);

      logger.info(`Referral payout processed for ${userId}: ${totalAmount} SOL`);

      return {
        success: true,
        totalPaid: totalAmount,
        transactionIds: [transactionId]
      };
    } catch (error) {
      logger.error('Error processing referral payout:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payout failed'
      };
    }
  }
}

// Create and export singleton instance
export const referralService = new ReferralService();
export default referralService;
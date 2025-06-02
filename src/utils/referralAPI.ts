// utils/referralAPI.ts - Enhanced client-side wrapper for referral API calls

export interface ReferralStats {
    referralCode: string;
    totalReferrals: number;
    totalRewards: number;
    pendingRewards: number;
    recentReferrals: any[];
    pendingReferralRewards: any[];
    nextMilestone?: {
      threshold: number;
      reward: number;
      remaining: number;
    };
  }
  
  export class ReferralAPIClient {
    // Base URL for API calls (can be configured)
    private static baseUrl = '';
  
    /**
     * Set base URL for API calls (useful for different environments)
     */
    static setBaseUrl(url: string) {
      this.baseUrl = url;
    }
  
    /**
     * Helper method for making API requests with better error handling
     */
    private static async makeRequest(
      url: string, 
      options: RequestInit = {}
    ): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
      try {
        const response = await fetch(`${this.baseUrl}${url}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
  
        const data = await response.json();
  
        if (!response.ok) {
          return { 
            success: false, 
            error: data.error || `HTTP ${response.status}: ${response.statusText}`,
            status: response.status 
          };
        }
  
        return { success: true, data, status: response.status };
      } catch (error) {
        console.error('API Request Error:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Network error' 
        };
      }
    }
  
    /**
     * Create user profile via API route
     */
    static async createUserProfile(
      userId: string,
      username?: string,
      walletAddress?: string,
      referralCode?: string
    ): Promise<{ success: boolean; referralCode?: string; error?: string }> {
      const result = await this.makeRequest('/api/referrals/create-profile', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          username,
          walletAddress,
          referralCode
        })
      });
  
      if (result.success) {
        return { 
          success: true, 
          referralCode: result.data?.referralCode 
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Failed to create profile' 
      };
    }
  
    /**
     * Process user login via API route - MISSING FROM YOUR VERSION
     */
    static async processUserLogin(
      userId: string,
      userAgent?: string
    ): Promise<{
      success: boolean;
      isFirstLogin?: boolean;
      referralActivated?: boolean;
      referrerUsername?: string;
      error?: string;
    }> {
      const result = await this.makeRequest('/api/referrals/process-login', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          userAgent
        })
      });
  
      if (result.success) {
        return {
          success: true,
          isFirstLogin: result.data?.isFirstLogin || false,
          referralActivated: result.data?.referralActivated || false,
          referrerUsername: result.data?.referrerUsername
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Failed to process login' 
      };
    }
  
    /**
     * Validate referral code via API route
     */
    static async validateReferralCode(code: string): Promise<{
      valid: boolean;
      referrer?: { username: string };
      error?: string;
    }> {
      if (!code || !code.trim()) {
        return { valid: false, error: 'Referral code is required' };
      }
  
      const result = await this.makeRequest(
        `/api/referrals/validate-code?code=${encodeURIComponent(code.trim())}`
      );
  
      if (result.success) {
        return {
          valid: result.data?.valid || false,
          referrer: result.data?.referrer
        };
      }
  
      return { 
        valid: false, 
        error: result.error || 'Validation failed' 
      };
    }
  
    /**
     * Get referral stats via API route
     */
    static async getReferralStats(userId: string): Promise<{
      success: boolean;
      stats?: ReferralStats;
      error?: string;
    }> {
      if (!userId) {
        return { success: false, error: 'User ID is required' };
      }
  
      const result = await this.makeRequest(
        `/api/referrals/stats?userId=${encodeURIComponent(userId)}`
      );
  
      if (result.success) {
        return { 
          success: true, 
          stats: result.data 
        };
      }
  
      // Handle specific 404 case
      if (result.status === 404) {
        return { 
          success: false, 
          error: 'User profile not found' 
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Failed to fetch stats' 
      };
    }
  
    /**
     * Process referral payout via API route
     */
    static async processReferralPayout(userId: string): Promise<{
      success: boolean;
      totalPaid?: number;
      transactionIds?: string[];
      error?: string;
    }> {
      if (!userId) {
        return { success: false, error: 'User ID is required' };
      }
  
      const result = await this.makeRequest('/api/referrals/process-payout', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
  
      if (result.success) {
        return {
          success: true,
          totalPaid: result.data?.totalPaid,
          transactionIds: result.data?.transactionIds
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Payout failed' 
      };
    }
  
    /**
     * Get user's referral code via API route
     */
    static async getUserReferralCode(userId: string): Promise<{
      success: boolean;
      referralCode?: string;
      error?: string;
    }> {
      if (!userId) {
        return { success: false, error: 'User ID is required' };
      }
  
      const result = await this.makeRequest(
        `/api/referrals/user-code?userId=${encodeURIComponent(userId)}`
      );
  
      if (result.success) {
        return {
          success: true,
          referralCode: result.data?.referralCode
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Failed to get referral code' 
      };
    }
  
    /**
     * Batch validate multiple referral codes
     */
    static async validateMultipleCodes(codes: string[]): Promise<{
      success: boolean;
      results?: Array<{ code: string; valid: boolean; referrer?: { username: string } }>;
      error?: string;
    }> {
      if (!codes || codes.length === 0) {
        return { success: false, error: 'At least one referral code is required' };
      }
  
      const result = await this.makeRequest('/api/referrals/validate-multiple', {
        method: 'POST',
        body: JSON.stringify({ codes })
      });
  
      if (result.success) {
        return {
          success: true,
          results: result.data?.results || []
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Batch validation failed' 
      };
    }
  
    /**
     * Get referral leaderboard
     */
    static async getReferralLeaderboard(limit: number = 10): Promise<{
      success: boolean;
      leaderboard?: Array<{
        userId: string;
        username?: string;
        totalReferrals: number;
        totalRewards: number;
        rank: number;
      }>;
      error?: string;
    }> {
      const result = await this.makeRequest(
        `/api/referrals/leaderboard?limit=${limit}`
      );
  
      if (result.success) {
        return {
          success: true,
          leaderboard: result.data?.leaderboard || []
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Failed to fetch leaderboard' 
      };
    }
  
    /**
     * Check API health
     */
    static async checkHealth(): Promise<{
      success: boolean;
      status?: string;
      version?: string;
      error?: string;
    }> {
      const result = await this.makeRequest('/api/referrals/health');
  
      if (result.success) {
        return {
          success: true,
          status: result.data?.status || 'ok',
          version: result.data?.version
        };
      }
  
      return { 
        success: false, 
        error: result.error || 'Health check failed' 
      };
    }
  }
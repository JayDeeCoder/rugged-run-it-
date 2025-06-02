// src/components/ReferralSection.tsx
'use client';

import React, { FC, useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Gift, Users, TrendingUp, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { referralService, ReferralStats } from '../services/ReferralService';

interface ReferralSectionProps {
  userId: string;
  walletAddress: string;
  isValidWallet: boolean;
}

const ReferralSection: FC<ReferralSectionProps> = ({ 
  userId, 
  walletAddress, 
  isValidWallet 
}) => {
  // State management
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [claiming, setClaiming] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [showRecentReferrals, setShowRecentReferrals] = useState<boolean>(false);
  
  // Refs for tracking
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🚀 OPTIMIZED: Fetch referral stats with debouncing
  const fetchReferralStats = useCallback(async (skipDebounce = false) => {
    if (!userId || loading) return;
    
    // Skip if updated recently (unless forced)
    const timeSinceLastUpdate = Date.now() - lastUpdated;
    if (!skipDebounce && timeSinceLastUpdate < 10000) { // 10 second minimum between updates
      console.log(`⏭️ ReferralSection: Skipping update, last updated ${timeSinceLastUpdate}ms ago`);
      return;
    }
    
    setLoading(true);
    try {
      console.log(`🔄 ReferralSection: Fetching stats for user ${userId}...`);
      
      const stats = await referralService.getReferralStats(userId);
      
      if (stats) {
        setReferralStats(stats);
        setLastUpdated(Date.now());
        console.log(`📊 ReferralSection: Stats updated:`, {
          totalReferrals: stats.totalReferrals,
          totalRewards: stats.totalRewards.toFixed(4),
          pendingRewards: stats.pendingRewards.toFixed(4)
        });
      } else {
        console.log(`❌ ReferralSection: No stats found for user ${userId}`);
      }
    } catch (error) {
      console.error('❌ ReferralSection: Failed to fetch stats:', error);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  }, [userId, loading, lastUpdated]);

  // Force refresh function
  const forceRefresh = useCallback(async () => {
    if (!userId) return;
    console.log(`🔄 ReferralSection: Force refreshing stats for ${userId}...`);
    
    // Clear any existing debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    await fetchReferralStats(true); // Skip debounce for manual refresh
    toast.success('Referral data refreshed!');
  }, [userId, fetchReferralStats]);

  // Copy referral code to clipboard
  const copyReferralCode = useCallback(async () => {
    if (!referralStats?.referralCode) return;
    
    try {
      const referralUrl = `${window.location.origin}?ref=${referralStats.referralCode}`;
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(referralUrl);
        toast.success('Referral link copied to clipboard!');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = referralUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success('Referral link copied!');
      }
    } catch (error) {
      console.error('Failed to copy referral code:', error);
      toast.error('Failed to copy referral link');
    }
  }, [referralStats?.referralCode]);

  // Claim referral rewards
  const claimRewards = useCallback(async () => {
    if (!userId || !referralStats?.pendingRewards || claiming) return;
    
    setClaiming(true);
    try {
      console.log(`💰 ReferralSection: Claiming rewards for user ${userId}...`);
      toast.loading('Processing referral payout...', { id: 'claim-rewards' });
      
      const result = await referralService.processReferralPayout(userId);
      
      if (result.success) {
        console.log(`✅ ReferralSection: Rewards claimed successfully:`, result);
        toast.success(
          `🎉 Claimed ${result.totalPaid?.toFixed(4)} SOL in referral rewards!`,
          { id: 'claim-rewards', duration: 5000 }
        );
        
        // Refresh stats after successful claim
        setTimeout(() => {
          fetchReferralStats();
        }, 1000);
        
        // Trigger balance refresh event for other components
        window.dispatchEvent(new CustomEvent('custodialBalanceUpdate', {
          detail: { 
            userId, 
            updateType: 'referral_payout',
            amount: result.totalPaid
          }
        }));
        
      } else {
        console.error(`❌ ReferralSection: Claim failed:`, result.error);
        toast.error(result.error || 'Failed to claim rewards', { id: 'claim-rewards' });
      }
    } catch (error) {
      console.error('❌ ReferralSection: Claim error:', error);
      toast.error('Failed to claim rewards', { id: 'claim-rewards' });
    } finally {
      setClaiming(false);
    }
  }, [userId, referralStats?.pendingRewards, claiming, fetchReferralStats]);

  // Initialize data when component mounts or userId changes
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 ReferralSection: Setting up for user: ${userId}`);
      lastUserIdRef.current = userId;
      
      // Clear existing interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      // Initial fetch
      fetchReferralStats();
      
      // 🚀 OPTIMIZED: Set up periodic updates every 60 seconds (matching Dashboard)
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          fetchReferralStats();
        }
      }, 60000); // 60 seconds - consistent with Dashboard
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [userId, fetchReferralStats]);

  // 🚀 OPTIMIZED: Real-time socket listeners with debouncing
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 ReferralSection: Setting up optimized real-time listeners for user: ${userId}`);
      socketListenersRef.current = true;
      
      // 🚀 OPTIMIZED: Debounced refresh function
      const debouncedRefresh = () => {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
        
        debounceTimeoutRef.current = setTimeout(() => {
          console.log(`🔄 ReferralSection: Debounced refresh triggered`);
          fetchReferralStats(true);
        }, 2000); // 2 second debounce
      };
      
      const handleReferralUpdate = (data: any) => {
        if (data.userId === userId || data.referrerId === userId) {
          console.log(`💰 ReferralSection REAL-TIME: Referral update`, data);
          
          // Debounced refresh instead of immediate
          debouncedRefresh();
          
          // Show appropriate toast
          if (data.type === 'referral_activated' && data.referrerId === userId) {
            toast.success(`🎉 New referral activated! Reward pending.`);
          } else if (data.type === 'milestone_reached' && data.userId === userId) {
            toast.success(`🏆 Milestone reached: ${data.milestone} referrals!`);
          }
        }
      };

      const handleReferralRewardUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💎 ReferralSection REAL-TIME: Reward update`, data);
          
          // Debounced refresh
          debouncedRefresh();
          
          if (data.type === 'reward_added') {
            toast.success(`💰 New referral reward: +${data.amount?.toFixed(4)} SOL`);
          }
        }
      };

      // Register socket event listeners
      socket.on('referralUpdate', handleReferralUpdate);
      socket.on('referralRewardUpdate', handleReferralRewardUpdate);
      
      return () => {
        console.log(`🔌 ReferralSection: Cleaning up optimized real-time listeners for user: ${userId}`);
        socket.off('referralUpdate', handleReferralUpdate);
        socket.off('referralRewardUpdate', handleReferralRewardUpdate);
        socketListenersRef.current = false;
        
        // Clear any pending debounce
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [userId, fetchReferralStats]);

  // Don't render if wallet not valid
  if (!isValidWallet || !userId) {
    return null;
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center">
          <Gift size={18} className="mr-2 text-purple-400 sm:w-5 sm:h-5" />
          <span className="hidden sm:inline">Referral Program</span>
          <span className="sm:hidden">Referrals</span>
        </h2>
        <button
          onClick={forceRefresh}
          className="text-gray-400 hover:text-white transition-colors p-1"
          disabled={loading}
          title="Refresh referral data"
        >
          <RefreshCw size={14} className={`sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !referralStats ? (
        <div className="flex items-center justify-center py-6 sm:py-8">
          <div className="animate-spin h-5 w-5 sm:h-6 sm:w-6 border-2 border-purple-400 border-t-transparent rounded-full mr-3"></div>
          <span className="text-gray-400 text-sm sm:text-base">Loading...</span>
        </div>
      ) : referralStats ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Referral Code Section - Mobile Optimized */}
          <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
            <div className="mb-3">
              <h3 className="text-base sm:text-lg font-semibold text-purple-400">Your Referral Code</h3>
              <p className="text-xs sm:text-sm text-gray-400">Share this link to earn rewards</p>
            </div>
            
            {/* Mobile-first layout */}
            <div className="space-y-3">
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-white font-mono text-xs sm:text-sm break-all leading-relaxed">
                  {`${window.location.origin}?ref=${referralStats.referralCode}`}
                </div>
              </div>
              <button
                onClick={copyReferralCode}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center text-sm sm:text-base font-medium"
              >
                <Copy size={16} className="mr-2" />
                Copy Referral Link
              </button>
            </div>
          </div>

          {/* Stats Grid - Mobile Responsive */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
              <div className="flex items-center mb-2">
                <Users size={14} className="mr-2 text-blue-400 sm:w-4 sm:h-4" />
                <span className="text-gray-400 text-xs sm:text-sm">Total Referrals</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-blue-400">
                {referralStats.totalReferrals}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
              <div className="flex items-center mb-2">
                <TrendingUp size={14} className="mr-2 text-green-400 sm:w-4 sm:h-4" />
                <span className="text-gray-400 text-xs sm:text-sm">Total Earned</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-green-400">
                {referralStats.totalRewards.toFixed(3)} SOL
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-3 sm:p-4 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center mb-2">
                <Gift size={14} className="mr-2 text-yellow-400 sm:w-4 sm:h-4" />
                <span className="text-gray-400 text-xs sm:text-sm">Pending Rewards</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-yellow-400">
                {referralStats.pendingRewards.toFixed(3)} SOL
              </div>
              {referralStats.pendingRewards > 0 && (
                <button
                  onClick={claimRewards}
                  disabled={claiming}
                  className="mt-3 w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white py-2.5 px-3 rounded-lg text-sm transition-colors flex items-center justify-center font-medium"
                >
                  {claiming ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Claiming...
                    </>
                  ) : (
                    <>
                      <Gift size={14} className="mr-2" />
                      Claim Rewards
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Next Milestone - Mobile Optimized */}
          {referralStats.nextMilestone && (
            <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 space-y-1 sm:space-y-0">
                <h3 className="text-base sm:text-lg font-semibold text-orange-400">Next Milestone</h3>
                <span className="text-xs sm:text-sm text-gray-400">
                  {referralStats.nextMilestone.remaining} more to go
                </span>
              </div>
              
              <div className="mb-3">
                <div className="flex justify-between text-xs sm:text-sm text-gray-400 mb-2">
                  <span>{referralStats.totalReferrals}</span>
                  <span>{referralStats.nextMilestone.threshold} referrals</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 sm:h-2.5">
                  <div 
                    className="bg-orange-500 h-2 sm:h-2.5 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(100, (referralStats.totalReferrals / referralStats.nextMilestone.threshold) * 100)}%` 
                    }}
                  ></div>
                </div>
              </div>
              
              <div className="text-center">
                <span className="text-orange-400 font-bold text-sm sm:text-base">
                  +{referralStats.nextMilestone.reward} SOL
                </span>
                <span className="text-gray-400 ml-2 text-xs sm:text-sm">
                  milestone bonus
                </span>
              </div>
            </div>
          )}

          {/* Recent Referrals - Mobile Optimized */}
          {referralStats.recentReferrals.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base sm:text-lg font-semibold text-gray-300">Recent Referrals</h3>
                <button
                  onClick={() => setShowRecentReferrals(!showRecentReferrals)}
                  className="text-gray-400 hover:text-white text-xs sm:text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  {showRecentReferrals ? 'Hide' : `Show (${referralStats.recentReferrals.length})`}
                </button>
              </div>
              
              {showRecentReferrals && (
                <div className="space-y-2">
                  {referralStats.recentReferrals.slice(0, 5).map((referral, index) => (
                    <div key={referral.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-700 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-green-400 mr-3 flex-shrink-0"></div>
                        <span className="text-xs sm:text-sm text-gray-300">
                          Referral #{referralStats.totalReferrals - index}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="text-xs sm:text-sm text-green-400 font-medium">
                          +{referral.rewardAmount?.toFixed(3) || '0.020'} SOL
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(referral.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How it Works - Mobile Optimized */}
          <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-semibold text-gray-300 mb-3">How it Works</h3>
            <div className="space-y-3 text-xs sm:text-sm text-gray-400">
              <div className="flex items-start">
                <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5 flex-shrink-0">1</span>
                <span className="leading-relaxed">Share your referral link with friends</span>
              </div>
              <div className="flex items-start">
                <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5 flex-shrink-0">2</span>
                <span className="leading-relaxed">They sign up and start playing</span>
              </div>
              <div className="flex items-start">
                <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5 flex-shrink-0">3</span>
                <span className="leading-relaxed">You earn 0.02 SOL per referral + milestone bonuses</span>
              </div>
              <div className="flex items-start">
                <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5 flex-shrink-0">4</span>
                <span className="leading-relaxed">Claim your rewards anytime</span>
              </div>
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-center text-xs text-gray-500">
            Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 sm:py-8">
          <div className="text-gray-400 mb-4 text-sm sm:text-base">Failed to load referral data</div>
          <button
            onClick={forceRefresh}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default ReferralSection;
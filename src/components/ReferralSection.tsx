// components/ReferralSection.tsx - Updated to use new frontend-safe service

import { useState, useEffect } from 'react';
import { referralService, ReferralStats } from '../services/ReferralService';
import { Copy, Gift, Users, TrendingUp } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ReferralSectionProps {
  userId: string;
  walletAddress: string;
  isValidWallet: boolean;
}

const ReferralSection: React.FC<ReferralSectionProps> = ({ 
  userId, 
  walletAddress, 
  isValidWallet 
}) => {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch referral stats
  useEffect(() => {
    if (!userId || !isValidWallet) {
      console.log('🔄 ReferralSection: Waiting for userId and valid wallet...', {
        userId: userId ? 'SET' : 'MISSING',
        wallet: isValidWallet ? 'VALID' : 'INVALID'
      });
      return;
    }

    const fetchReferralStats = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`🔄 ReferralSection: Fetching stats for user ${userId}...`);
        
        // Try the frontend service (now with auto-creation)
        const referralStats = await referralService.getReferralStats(userId);
        
        if (referralStats) {
          setStats(referralStats);
          console.log(`✅ ReferralSection: Stats loaded for user ${userId}`);
        } else {
          // If still no stats, user profile creation might have failed
          console.log(`⚠️ ReferralSection: Unable to create/load profile for user ${userId}`);
          setStats(null);
        }
        
      } catch (err) {
        console.error(`❌ ReferralSection: Error fetching stats for ${userId}:`, err);
        setError(err instanceof Error ? err.message : 'Failed to load referral data');
      } finally {
        setLoading(false);
      }
    };

    fetchReferralStats();
  }, [userId, isValidWallet]);

  // Copy referral link to clipboard
  const copyReferralLink = () => {
    if (!stats?.referralCode) return;
    
    const referralLink = `${window.location.origin}/?ref=${stats.referralCode}`;
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied to clipboard!');
  };

  // Render error state
  if (error) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <Gift size={20} className="mr-2" />
          Referral Program
        </h2>
        <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg p-4">
          <div className="text-red-400 text-sm">
            ⚠️ Referral system temporarily unavailable
          </div>
          <div className="text-gray-400 text-xs mt-1">
            {error}
          </div>
        </div>
      </div>
    );
  }

  // Render loading state
  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <Gift size={20} className="mr-2" />
          Referral Program
        </h2>
        <div className="flex items-center text-gray-400">
          <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full mr-2"></div>
          Loading referral stats...
        </div>
      </div>
    );
  }

  // Render no profile state
  if (!stats) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <Gift size={20} className="mr-2" />
          Referral Program
        </h2>
        <div className="bg-blue-900 bg-opacity-30 border border-blue-800 rounded-lg p-4">
          <div className="text-blue-400 text-sm">
            🔄 Setting up your referral profile...
          </div>
          <div className="text-gray-400 text-xs mt-1">
            Your unique referral code will be generated automatically. Try refreshing in a moment!
          </div>
        </div>
      </div>
    );
  }

  // Main referral section
  return (
    <div className="bg-gray-900 rounded-lg p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center">
        <Gift size={20} className="mr-2" />
        Referral Program
      </h2>

      {/* Referral Code Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Your Referral Code</h3>
          <div className="flex items-center justify-between bg-gray-700 rounded-lg p-3">
            <span className="text-green-400 font-mono text-lg">
              {stats.referralCode}
            </span>
            <button
              onClick={copyReferralLink}
              className="flex items-center text-blue-400 hover:text-blue-300 transition-colors"
              title="Copy referral link"
            >
              <Copy size={16} />
            </button>
          </div>
          <p className="text-gray-400 text-xs mt-2">
            Share this code to earn rewards when friends join and play!
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Quick Stats</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-blue-400">
                {stats.totalReferrals}
              </div>
              <div className="text-gray-400 text-sm">Total Referrals</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">
                {stats.totalRewards.toFixed(3)} SOL
              </div>
              <div className="text-gray-400 text-sm">Total Earned</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Rewards */}
      {stats.pendingRewards > 0 && (
        <div className="bg-green-900 bg-opacity-20 border border-green-800 rounded-lg p-4 mb-4">
          <h3 className="text-green-400 font-semibold mb-2 flex items-center">
            <TrendingUp size={16} className="mr-2" />
            Pending Rewards
          </h3>
          <div className="text-green-300">
            {stats.pendingRewards.toFixed(3)} SOL ready to claim
          </div>
          <div className="text-gray-400 text-sm mt-1">
            {stats.pendingReferralRewards.length} reward(s) pending
          </div>
        </div>
      )}

      {/* Next Milestone */}
      {stats.nextMilestone && (
        <div className="bg-purple-900 bg-opacity-20 border border-purple-800 rounded-lg p-4 mb-4">
          <h3 className="text-purple-400 font-semibold mb-2">Next Milestone</h3>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-white">
                {stats.nextMilestone.threshold} referrals
              </div>
              <div className="text-gray-400 text-sm">
                {stats.nextMilestone.remaining} more needed
              </div>
            </div>
            <div className="text-purple-400 font-bold">
              +{stats.nextMilestone.reward} SOL
            </div>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
            <div 
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${Math.min(100, (stats.totalReferrals / stats.nextMilestone.threshold) * 100)}%` 
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Recent Referrals */}
      {stats.recentReferrals.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3 flex items-center">
            <Users size={16} className="mr-2" />
            Recent Referrals
          </h3>
          <div className="space-y-2">
            {stats.recentReferrals.slice(0, 5).map((referral) => (
              <div key={referral.id} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                <div>
                  <div className="text-white text-sm">
                    User referred
                  </div>
                  <div className="text-gray-400 text-xs">
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className={`text-sm ${
                  referral.activationStatus === 'activated' ? 'text-green-400' :
                  referral.activationStatus === 'pending' ? 'text-yellow-400' :
                  'text-gray-400'
                }`}>
                  {referral.activationStatus === 'activated' ? '✅ Active' :
                   referral.activationStatus === 'pending' ? '⏳ Pending' :
                   '❌ Expired'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it Works */}
      <div className="bg-gray-800 rounded-lg p-4 mt-6">
        <h3 className="text-white font-semibold mb-3">How It Works</h3>
        <div className="text-gray-400 text-sm space-y-2">
          <div>• Share your referral code with friends</div>
          <div>• Earn 0.02 SOL when they join and make their first bet</div>
          <div>• Unlock milestone bonuses for multiple referrals</div>
          <div>• Rewards are automatically added to your game balance</div>
        </div>
      </div>
    </div>
  );
};

export default ReferralSection;
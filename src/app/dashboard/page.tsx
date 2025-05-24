'use client';

import { FC, useState, useEffect, useContext } from 'react';
import { useSolanaWallets, usePrivy } from '@privy-io/react-auth';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import Layout from '../../components/layout/Layout';
import Link from 'next/link';
import { UserContext } from '../../context/UserContext';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';
import { Wallet, TrendingUp, GamepadIcon, RefreshCw } from 'lucide-react';

const Dashboard: FC = () => {
  // Privy hooks
  const { wallets } = useSolanaWallets();
  const { authenticated, ready, user } = usePrivy();
  
  // User context
  const { currentUser, experience, userLevel, crates } = useContext(UserContext);
  
  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  // State
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [userStats, setUserStats] = useState({
    totalWagered: 0,
    totalPayouts: 0,
    gamesPlayed: 0,
    profitLoss: 0
  });
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  
  // Get the embedded wallet (most reliable for Privy)
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const activeWallet = embeddedWallet || wallets[0] || null;
  const isConnected = authenticated && activeWallet !== null;
  const walletAddress = activeWallet?.address || '';
  
  // Validate wallet address
  const isValidWallet = isConnected && isValidSolanaAddress(walletAddress);

  // Fetch wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!isValidWallet) {
        setWalletBalance(0);
        return;
      }

      try {
        setIsLoadingBalance(true);
        
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        
        if (!rpcUrl) {
          console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL');
          return;
        }
        
        const connectionConfig: any = { commitment: 'confirmed' };
        if (apiKey) {
          connectionConfig.httpHeaders = { 'x-api-key': apiKey };
        }
        
        const connection = new Connection(rpcUrl, connectionConfig);
        const publicKey = safeCreatePublicKey(walletAddress);
        
        if (!publicKey) {
          console.error('Invalid wallet address');
          return;
        }
        
        const lamports = await connection.getBalance(publicKey);
        const solBalance = lamports / LAMPORTS_PER_SOL;
        setWalletBalance(solBalance);
        
      } catch (error) {
        console.error('Failed to fetch balance:', error);
        setWalletBalance(0);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [isValidWallet, walletAddress]);

  // Fetch user stats from Supabase
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!isValidWallet || !walletAddress) {
        setUserStats({
          totalWagered: 0,
          totalPayouts: 0,
          gamesPlayed: 0,
          profitLoss: 0
        });
        return;
      }

      try {
        setIsLoadingStats(true);
        
        // Query player_bets table for this wallet
        const { data: bets, error } = await supabase
          .from('player_bets')
          .select('bet_amount, profit_loss, cashout_amount, cashout_multiplier, status')
          .eq('wallet_address', walletAddress);

        if (error) {
          console.error('Supabase query error:', error);
          throw error;
        }

        // Calculate statistics from bet data
        let totalWagered = 0;
        let totalPayouts = 0;
        let gamesPlayed = 0;
        let profitLoss = 0;

        if (bets && bets.length > 0) {
          bets.forEach(bet => {
            // Count all bets as games played
            gamesPlayed++;
            
            // Sum all bet amounts
            totalWagered += bet.bet_amount || 0;
            
            // Sum payouts (only for cashed out bets)
            if (bet.status === 'cashed_out' && bet.cashout_amount) {
              totalPayouts += bet.cashout_amount;
            }
            
            // Sum profit/loss (negative for losses, positive for wins)
            profitLoss += bet.profit_loss || 0;
          });
        }

        setUserStats({
          totalWagered: Number(totalWagered.toFixed(6)),
          totalPayouts: Number(totalPayouts.toFixed(6)),
          gamesPlayed,
          profitLoss: Number(profitLoss.toFixed(6))
        });
        
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
        // Set zeros on error
        setUserStats({
          totalWagered: 0,
          totalPayouts: 0,
          gamesPlayed: 0,
          profitLoss: 0
        });
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchUserStats();
  }, [isValidWallet, walletAddress, supabase]);

  // Refresh data function
  const refreshData = async () => {
    if (!isValidWallet) return;
    
    setIsLoadingBalance(true);
    setIsLoadingStats(true);
    
    // Force re-fetch by updating timestamps
    const now = Date.now();
    
    // Trigger balance refresh
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (rpcUrl) {
        const connectionConfig: any = { commitment: 'confirmed' };
        if (apiKey) connectionConfig.httpHeaders = { 'x-api-key': apiKey };
        
        const connection = new Connection(rpcUrl, connectionConfig);
        const publicKey = safeCreatePublicKey(walletAddress);
        
        if (publicKey) {
          const lamports = await connection.getBalance(publicKey);
          setWalletBalance(lamports / LAMPORTS_PER_SOL);
        }
      }
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    } finally {
      setIsLoadingBalance(false);
    }
    
    // Trigger stats refresh
    try {
      const { data: bets, error } = await supabase
        .from('player_bets')
        .select('bet_amount, profit_loss, cashout_amount, status')
        .eq('wallet_address', walletAddress);

      if (!error && bets) {
        let totalWagered = 0, totalPayouts = 0, gamesPlayed = 0, profitLoss = 0;
        
        bets.forEach(bet => {
          gamesPlayed++;
          totalWagered += bet.bet_amount || 0;
          if (bet.status === 'cashed_out' && bet.cashout_amount) {
            totalPayouts += bet.cashout_amount;
          }
          profitLoss += bet.profit_loss || 0;
        });

        setUserStats({
          totalWagered: Number(totalWagered.toFixed(6)),
          totalPayouts: Number(totalPayouts.toFixed(6)),
          gamesPlayed,
          profitLoss: Number(profitLoss.toFixed(6))
        });
      }
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Loading state while Privy initializes
  if (!ready) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-48 mb-6"></div>
            <div className="bg-gray-800 rounded-lg p-6 mb-8">
              <div className="h-6 bg-gray-700 rounded w-32 mb-4"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <div className="h-4 bg-gray-700 rounded w-24 mb-2"></div>
                    <div className="h-8 bg-gray-700 rounded w-20"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          {isValidWallet && (
            <button
              onClick={refreshData}
              className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-md transition-colors"
              disabled={isLoadingBalance || isLoadingStats}
            >
              <RefreshCw size={16} className={`mr-2 ${(isLoadingBalance || isLoadingStats) ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>

        {/* User Level and Experience */}
        {isValidWallet && currentUser && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Player Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-gray-400 mb-1">Level</div>
                <div className="text-2xl font-bold text-purple-400">
                  {userLevel || 1}
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Experience</div>
                <div className="flex items-center">
                  <div className="w-32 h-3 bg-gray-800 rounded-full mr-3">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(experience || 0, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-sm text-white">{experience || 0}%</span>
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Crates</div>
                <div className="text-2xl font-bold text-yellow-400">
                  {crates || 0} 🎁
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Status */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center">
            <Wallet size={20} className="mr-2" />
            Wallet Status
          </h2>
          
          {!authenticated ? (
            <div className="text-center py-6">
              <p className="text-gray-400 mb-4">Please log in to view your wallet and stats</p>
              <button 
                onClick={() => window.location.href = '/'}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md transition-colors"
              >
                Login
              </button>
            </div>
          ) : isValidWallet ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-gray-400 mb-1">Wallet Address</div>
                <div className="text-white font-mono text-sm">
                  {walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 8)}
                </div>
                <div className="text-green-400 text-sm mt-1">✓ Connected</div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Balance</div>
                <div className="text-2xl font-bold text-blue-400">
                  {isLoadingBalance ? (
                    <div className="flex items-center">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full mr-2"></div>
                      Loading...
                    </div>
                  ) : (
                    `${walletBalance.toFixed(4)} SOL`
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-yellow-400 mb-2">Wallet connection issue</p>
              <p className="text-gray-400 text-sm">Please reconnect your wallet</p>
            </div>
          )}
        </div>

        {/* Game Stats */}
        {isValidWallet && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <TrendingUp size={20} className="mr-2" />
              Game Statistics
            </h2>
            
            {isLoadingStats ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-gray-700 rounded w-24 mb-2"></div>
                    <div className="h-8 bg-gray-700 rounded w-20"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-gray-400 mb-1">Total Wagered</div>
                  <div className="text-2xl font-bold text-white">
                    {userStats.totalWagered.toFixed(2)} SOL
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Total Payouts</div>
                  <div className="text-2xl font-bold text-white">
                    {userStats.totalPayouts.toFixed(2)} SOL
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Games Played</div>
                  <div className="text-2xl font-bold text-white">
                    {userStats.gamesPlayed}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Profit/Loss</div>
                  <div className={`text-2xl font-bold ${userStats.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {userStats.profitLoss >= 0 ? '+' : ''}{userStats.profitLoss.toFixed(2)} SOL
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-900 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link 
                href="/" 
                className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-center"
              >
                <GamepadIcon size={20} className="inline mr-2" />
                Play Crash Game
              </Link>
              <Link 
                href="/leaderboard" 
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-center"
              >
                View Leaderboard
              </Link>
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
            <div className="text-gray-400 text-center py-6">
              {isValidWallet ? (
                <p>No recent activity</p>
              ) : (
                <p>Connect wallet to view activity</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
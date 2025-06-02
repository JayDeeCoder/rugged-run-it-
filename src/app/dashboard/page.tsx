'use client';

import { FC, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useSolanaWallets, usePrivy } from '@privy-io/react-auth';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import Layout from '../../components/layout/Layout';
import Link from 'next/link';
import { UserContext } from '../../context/UserContext';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';
import { Wallet, TrendingUp, GamepadIcon, RefreshCw } from 'lucide-react';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
// import ReferralSection from '../components/ReferralSection'; // Commented out - component doesn't exist

// 🚀 ENHANCED: Custodial balance hook with real-time socket listeners (from TradingControls)
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  // Create stable update function with useCallback
  const updateCustodialBalance = useCallback(async () => {
    if (!userId) return;
    
    // Prevent multiple simultaneous requests
    if (loading) return;
    
    setLoading(true);
    try {
      console.log(`🔄 Dashboard: Fetching custodial balance for user ${userId}...`);
      
      const response = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`👤 Dashboard: User ${userId} not found - balance remains 0`);
          setCustodialBalance(0);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 Dashboard: Custodial balance updated: ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
      } else {
        console.warn('Dashboard: Invalid response format:', data);
      }
    } catch (error) {
      console.error('❌ Dashboard: Failed to fetch custodial balance:', error);
      // Don't reset balance on error, keep previous value
    } finally {
      setLoading(false);
    }
  }, [userId, loading]);

  // Enhanced force refresh with cache busting
  const forceRefresh = useCallback(async () => {
    if (!userId) return;
    console.log(`🔄 Dashboard: Force refreshing custodial balance for ${userId}...`);
    setLoading(true);

    try {
      // Try POST with refresh action first
      const postResponse = await fetch(`/api/custodial/balance/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', timestamp: Date.now() })
      });
      
      if (postResponse.ok) {
        const data = await postResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          console.log(`💰 Dashboard: Force refresh (POST): ${newBalance.toFixed(6)} SOL`);
          setCustodialBalance(newBalance);
          setLastUpdated(Date.now());
          return;
        }
      }
      
      // Fallback to GET with cache busting
      const getResponse = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}&refresh=true`);
      
      if (getResponse.ok) {
        const data = await getResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          console.log(`💰 Dashboard: Force refresh (GET): ${newBalance.toFixed(6)} SOL`);
          setCustodialBalance(newBalance);
          setLastUpdated(Date.now());
        }
      } else {
        console.error('❌ Dashboard: Force refresh failed:', getResponse.status);
      }
      
    } catch (error) {
      console.error('❌ Dashboard: Force refresh error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);
  
  // Polling setup
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 Dashboard: Setting up custodial balance polling for user: ${userId}`);
      lastUserIdRef.current = userId;
      
      // Clear existing interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      // Initial fetch
      updateCustodialBalance();
      
      // Set interval for periodic updates
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateCustodialBalance();
        }
      }, 15000); // 15 seconds
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [userId, updateCustodialBalance]);
   
  // 🚀 ENHANCED REAL-TIME SOCKET LISTENERS
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Dashboard: Setting up REAL-TIME custodial balance listeners for user: ${userId}`);
      socketListenersRef.current = true;
      
      // Primary custodial balance update event
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 Dashboard REAL-TIME: Custodial balance update - ${data.custodialBalance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.custodialBalance) || 0);
          setLastUpdated(Date.now());
          
          // Show toast for significant changes
          if (data.updateType === 'deposit_processed') {
            toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL`);
          } else if (data.updateType === 'bet_placed') {
            toast(`Bet placed: -${data.change?.toFixed(3)} SOL`, { icon: '🎯' });
          } else if (data.updateType === 'cashout_processed') {
            toast.success(`Cashout: +${data.change?.toFixed(3)} SOL`);
          }
        }
      };

      // User balance update event (broader scope)
      const handleUserBalanceUpdate = (data: any) => {
        if (data.userId === userId && data.balanceType === 'custodial') {
          console.log(`💰 Dashboard REAL-TIME: User balance update - ${data.newBalance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.newBalance) || 0);
          setLastUpdated(Date.now());
        }
      };

      // Deposit confirmation event
      const handleDepositConfirmation = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 Dashboard REAL-TIME: Deposit confirmed for ${userId}, amount: ${data.depositAmount}`);
          
          // Update balance immediately
          setCustodialBalance(prev => prev + (parseFloat(data.depositAmount) || 0));
          setLastUpdated(Date.now());
          
          // Force refresh after short delay to ensure accuracy
          setTimeout(forceRefresh, 1500);
          
          toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL!`);
        }
      };

      // Register all event listeners
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('userBalanceUpdate', handleUserBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      
      return () => {
        console.log(`🔌 Dashboard: Cleaning up REAL-TIME custodial balance listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('userBalanceUpdate', handleUserBalanceUpdate);
        socket.off('depositConfirmed', handleDepositConfirmation);
        socketListenersRef.current = false;
      };
    }
  }, [userId, forceRefresh]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance, forceRefresh };
};

const Dashboard: FC = () => {
  // Privy hooks
  const { wallets } = useSolanaWallets();
  const { authenticated, ready, user } = usePrivy();
  
  // User context
  const { currentUser, experience, userLevel, crates } = useContext(UserContext);
  
  // User ID state for custodial operations
  const [userId, setUserId] = useState<string | null>(null);
  
  // Get the embedded wallet (most reliable for Privy)
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const activeWallet = embeddedWallet || wallets[0] || null;
  const isConnected = authenticated && activeWallet !== null;
  const walletAddress = activeWallet?.address || '';
  
  // Validate wallet address
  const isValidWallet = isConnected && isValidSolanaAddress(walletAddress);

  // 🚀 ENHANCED: Use custodial balance hook with real-time updates
  const { 
    custodialBalance, 
    loading: custodialBalanceLoading, 
    updateCustodialBalance, 
    forceRefresh: refreshCustodialBalance,
    lastUpdated: custodialLastUpdated
  } = useCustodialBalance(userId || '');
  
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
  
  // Initialization ref for user setup
  const initializationRef = useRef<{ 
    attempted: boolean; 
    completed: boolean; 
    lastWallet: string;
    lastUserId: string;
  }>({ 
    attempted: false, 
    completed: false, 
    lastWallet: '',
    lastUserId: ''
  });

  // 🚀 ENHANCED: User initialization effect (from TradingControls)
  useEffect(() => {
    if (!authenticated || !walletAddress) {
      return;
    }
    
    if (initializationRef.current.completed && 
        initializationRef.current.lastWallet === walletAddress &&
        initializationRef.current.lastUserId === (userId || '')) {
      return;
    }
    
    if (initializationRef.current.attempted && 
        initializationRef.current.lastWallet === walletAddress) {
      return;
    }
    
    console.log(`🔗 Dashboard: Starting user initialization for wallet: ${walletAddress}`);
    initializationRef.current.attempted = true;
    initializationRef.current.lastWallet = walletAddress;
    
    let initTimeout: NodeJS.Timeout | null = null;
    
    const initUser = async () => {
      try {
        if (userId && initializationRef.current.lastUserId === userId) {
          console.log(`✅ Dashboard: User ${userId} already initialized for this wallet`);
          initializationRef.current.completed = true;
          return;
        }
        
        console.log(`📡 Dashboard: Getting user data for wallet: ${walletAddress}`);
        const userData = await UserAPI.getUserOrCreate(walletAddress);
        
        if (userData) {
          setUserId(userData.id);
          initializationRef.current.lastUserId = userData.id;
          console.log(`👤 Dashboard: User ID set: ${userData.id}`);
          
          initTimeout = setTimeout(() => {
            console.log(`📡 Dashboard: Initializing user via socket...`);
            
            const socket = (window as any).gameSocket;
            if (socket) {
              socket.emit('initializeUser', {
                userId: userData.id,
                walletAddress: walletAddress
              });
              
              socket.once('userInitializeResult', (result: any) => {
                console.log('📡 Dashboard: User initialization result:', result);
                
                if (result.success) {
                  console.log(`✅ Dashboard: User ${result.userId} initialized successfully`);
                  
                  initializationRef.current.completed = true;
                  initializationRef.current.lastUserId = result.userId;
                  
                  // Trigger balance and stats refresh after initialization
                  setTimeout(() => {
                    try {
                      updateCustodialBalance();
                    } catch (error) {
                      console.warn('⚠️ Dashboard: Balance update failed during initialization:', error);
                    }
                  }, 500);
                } else {
                  console.error('❌ Dashboard: User initialization failed:', result.error);
                  toast.error('Failed to initialize wallet');
                  initializationRef.current.attempted = false;
                  initializationRef.current.completed = false;
                }
              });
            } else {
              console.error('❌ Dashboard: Socket not available for user initialization');
              initializationRef.current.attempted = false;
              initializationRef.current.completed = false;
            }
          }, 1000);
        }
      } catch (error) {
        console.error('❌ Dashboard: Could not initialize user:', error);
        toast.error('Failed to initialize wallet');
        initializationRef.current.attempted = false;
        initializationRef.current.completed = false;
      }
    };
    
    initUser();
    
    return () => {
      if (initTimeout) clearTimeout(initTimeout);
    };
  }, [authenticated, walletAddress, userId, updateCustodialBalance]);

  // Reset initialization tracking when wallet changes
  useEffect(() => {
    if (walletAddress !== initializationRef.current.lastWallet) {
      console.log(`🔄 Dashboard: Wallet changed: ${initializationRef.current.lastWallet} → ${walletAddress}`);
      initializationRef.current = { 
        attempted: false, 
        completed: false, 
        lastWallet: walletAddress,
        lastUserId: ''
      };
    }
  }, [walletAddress]);

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

  // 🚀 ENHANCED: Fetch user stats from Supabase using userId instead of walletAddress
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!userId) {
        console.log('🔍 Dashboard: No userId available for stats fetch');
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
        console.log(`📊 Dashboard: Fetching user stats for userId: ${userId}`);
        
        // 🚀 ENHANCED: Query player_bets table using userId instead of walletAddress
        const { data: bets, error } = await supabase
          .from('player_bets')
          .select('bet_amount, profit_loss, cashout_amount, cashout_multiplier, status, bet_type')
          .eq('user_id', userId); // Use user_id instead of wallet_address

        if (error) {
          console.error('❌ Dashboard: Supabase query error:', error);
          throw error;
        }

        console.log(`📊 Dashboard: Retrieved ${bets?.length || 0} bets for user ${userId}`);

        // Calculate statistics from bet data
        let totalWagered = 0;
        let totalPayouts = 0;
        let gamesPlayed = 0;
        let profitLoss = 0;

        if (bets && bets.length > 0) {
          bets.forEach(bet => {
            // Count all custodial bets as games played
            if (bet.bet_type === 'custodial' || !bet.bet_type) { // Include legacy bets without bet_type
              gamesPlayed++;
              
              // Sum all bet amounts
              totalWagered += bet.bet_amount || 0;
              
              // Sum payouts (only for cashed out bets)
              if (bet.status === 'cashed_out' && bet.cashout_amount) {
                totalPayouts += bet.cashout_amount;
              }
              
              // Sum profit/loss (negative for losses, positive for wins)
              profitLoss += bet.profit_loss || 0;
            }
          });
        }

        const newStats = {
          totalWagered: Number(totalWagered.toFixed(6)),
          totalPayouts: Number(totalPayouts.toFixed(6)),
          gamesPlayed,
          profitLoss: Number(profitLoss.toFixed(6))
        };

        setUserStats(newStats);
        
        console.log(`📊 Dashboard: Stats updated for ${userId}:`, {
          totalWagered: newStats.totalWagered.toFixed(3),
          totalPayouts: newStats.totalPayouts.toFixed(3),
          gamesPlayed: newStats.gamesPlayed,
          profitLoss: newStats.profitLoss.toFixed(3)
        });
        
      } catch (error) {
        console.error('❌ Dashboard: Failed to fetch user stats:', error);
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
  }, [userId, supabase]); // Use userId instead of walletAddress

  // 🚀 ENHANCED: Refresh data function using custodial methods
  const refreshData = useCallback(async () => {
    if (!isValidWallet || !userId) {
      console.log('🔄 Dashboard: Cannot refresh - wallet or user not ready');
      return;
    }
    
    console.log('🔄 Dashboard: Manual refresh triggered by user');
    setIsLoadingBalance(true);
    setIsLoadingStats(true);
    
    try {
      // Show loading toast
      toast.loading('Refreshing dashboard data...', { id: 'dashboard-refresh' });
      
      // Refresh custodial balance using the enhanced method
      await refreshCustodialBalance();
      
      // Refresh embedded wallet balance
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
            console.log(`💼 Dashboard: Embedded wallet balance updated: ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
          }
        }
      } catch (error) {
        console.error('❌ Dashboard: Failed to refresh embedded wallet balance:', error);
      }
      
      // Refresh user stats
      try {
        const { data: bets, error } = await supabase
          .from('player_bets')
          .select('bet_amount, profit_loss, cashout_amount, status, bet_type')
          .eq('user_id', userId); // Use user_id instead of wallet_address

        if (!error && bets) {
          let totalWagered = 0, totalPayouts = 0, gamesPlayed = 0, profitLoss = 0;
          
          bets.forEach(bet => {
            // Only count custodial bets
            if (bet.bet_type === 'custodial' || !bet.bet_type) {
              gamesPlayed++;
              totalWagered += bet.bet_amount || 0;
              if (bet.status === 'cashed_out' && bet.cashout_amount) {
                totalPayouts += bet.cashout_amount;
              }
              profitLoss += bet.profit_loss || 0;
            }
          });

          setUserStats({
            totalWagered: Number(totalWagered.toFixed(6)),
            totalPayouts: Number(totalPayouts.toFixed(6)),
            gamesPlayed,
            profitLoss: Number(profitLoss.toFixed(6))
          });
          
          console.log(`📊 Dashboard: Stats refreshed for ${userId}`);
        }
      } catch (error) {
        console.error('❌ Dashboard: Failed to refresh stats:', error);
      }
      
      // Success toast
      toast.success('Dashboard data refreshed!', { id: 'dashboard-refresh' });
      
    } catch (error) {
      console.error('❌ Dashboard: Refresh failed:', error);
      toast.error('Failed to refresh dashboard data', { id: 'dashboard-refresh' });
    } finally {
      setIsLoadingBalance(false);
      setIsLoadingStats(false);
    }
  }, [isValidWallet, userId, walletAddress, refreshCustodialBalance, supabase]);

  // 🚀 ENHANCED: Real-time socket listeners for dashboard updates
  useEffect(() => {
    if (!userId || !walletAddress) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Dashboard: Setting up real-time listeners for user: ${userId}`);
      
      const handleCustodialBetPlaced = (data: any) => {
        if (data.userId === userId) {
          console.log(`🎯 Dashboard REAL-TIME: Bet placed - refreshing stats`);
          // Refresh stats after a bet is placed
          setTimeout(() => {
            setIsLoadingStats(true);
            // Re-fetch stats
            const refreshStats = async () => {
              try {
                const { data: bets, error } = await supabase
                  .from('player_bets')
                  .select('bet_amount, profit_loss, cashout_amount, status, bet_type')
                  .eq('user_id', userId);

                if (!error && bets) {
                  let totalWagered = 0, totalPayouts = 0, gamesPlayed = 0, profitLoss = 0;
                  
                  bets.forEach(bet => {
                    if (bet.bet_type === 'custodial' || !bet.bet_type) {
                      gamesPlayed++;
                      totalWagered += bet.bet_amount || 0;
                      if (bet.status === 'cashed_out' && bet.cashout_amount) {
                        totalPayouts += bet.cashout_amount;
                      }
                      profitLoss += bet.profit_loss || 0;
                    }
                  });

                  setUserStats({
                    totalWagered: Number(totalWagered.toFixed(6)),
                    totalPayouts: Number(totalPayouts.toFixed(6)),
                    gamesPlayed,
                    profitLoss: Number(profitLoss.toFixed(6))
                  });
                }
              } catch (error) {
                console.error('❌ Dashboard: Failed to refresh stats after bet:', error);
              } finally {
                setIsLoadingStats(false);
              }
            };
            refreshStats();
          }, 1000);
        }
      };

      const handleCustodialCashout = (data: any) => {
        if (data.userId === userId) {
          console.log(`💸 Dashboard REAL-TIME: Cashout processed - refreshing stats`);
          // Refresh stats after cashout
          setTimeout(() => {
            setIsLoadingStats(true);
            const refreshStats = async () => {
              try {
                const { data: bets, error } = await supabase
                  .from('player_bets')
                  .select('bet_amount, profit_loss, cashout_amount, status, bet_type')
                  .eq('user_id', userId);

                if (!error && bets) {
                  let totalWagered = 0, totalPayouts = 0, gamesPlayed = 0, profitLoss = 0;
                  
                  bets.forEach(bet => {
                    if (bet.bet_type === 'custodial' || !bet.bet_type) {
                      gamesPlayed++;
                      totalWagered += bet.bet_amount || 0;
                      if (bet.status === 'cashed_out' && bet.cashout_amount) {
                        totalPayouts += bet.cashout_amount;
                      }
                      profitLoss += bet.profit_loss || 0;
                    }
                  });

                  setUserStats({
                    totalWagered: Number(totalWagered.toFixed(6)),
                    totalPayouts: Number(totalPayouts.toFixed(6)),
                    gamesPlayed,
                    profitLoss: Number(profitLoss.toFixed(6))
                  });
                }
              } catch (error) {
                console.error('❌ Dashboard: Failed to refresh stats after cashout:', error);
              } finally {
                setIsLoadingStats(false);
              }
            };
            refreshStats();
          }, 1000);
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.userId === userId || data.walletAddress === walletAddress) {
          console.log(`🔗 Dashboard REAL-TIME: Transaction confirmed - refreshing wallet balance`);
          // Refresh embedded wallet balance after transaction
          setTimeout(async () => {
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
              console.error('❌ Dashboard: Failed to refresh wallet balance:', error);
            }
          }, 2000);
        }
      };

      // Register socket event listeners
      socket.on('custodialBetPlaced', handleCustodialBetPlaced);
      socket.on('custodialCashout', handleCustodialCashout);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 Dashboard: Cleaning up real-time listeners for user: ${userId}`);
        socket.off('custodialBetPlaced', handleCustodialBetPlaced);
        socket.off('custodialCashout', handleCustodialCashout);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
      };
    }
  }, [userId, walletAddress, supabase]);

  // Loading state while Privy initializes
  if (!ready) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
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
          {(isValidWallet && userId) && (
            <button
              onClick={refreshData}
              className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-md transition-colors"
              disabled={isLoadingBalance || isLoadingStats || custodialBalanceLoading}
            >
              <RefreshCw size={16} className={`mr-2 ${(isLoadingBalance || isLoadingStats || custodialBalanceLoading) ? 'animate-spin' : ''}`} />
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
            <div className="space-y-4">
              {/* Wallet Address */}
              <div>
                <div className="text-gray-400 mb-1">Wallet Address</div>
                <div className="text-white font-mono text-sm">
                  {walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 8)}
                </div>
                <div className="text-green-400 text-sm mt-1">✓ Connected</div>
              </div>
              
              {/* 🚀 ENHANCED: Primary balance is now custodial game balance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-green-400 mb-2 flex items-center">
                    <span className="mr-2">🎮</span>
                    Game Balance
                  </div>
                  <div className="text-2xl font-bold text-green-400">
                    {custodialBalanceLoading ? (
                      <div className="flex items-center">
                        <div className="animate-spin h-5 w-5 border-2 border-green-400 border-t-transparent rounded-full mr-2"></div>
                        Loading...
                      </div>
                    ) : (
                      `${custodialBalance.toFixed(4)} SOL`
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    For gaming • Last updated: {custodialLastUpdated ? new Date(custodialLastUpdated).toLocaleTimeString() : 'Never'}
                  </div>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-blue-400 mb-2 flex items-center">
                    <span className="mr-2">💼</span>
                    Wallet Balance
                  </div>
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
                  <div className="text-xs text-gray-400 mt-1">
                    For deposits • Embedded wallet
                  </div>
                </div>
              </div>
              
              {/* Balance transfer hint */}
              {walletBalance > 0.001 && (
                <div className="bg-yellow-900 bg-opacity-30 border border-yellow-800 rounded-lg p-3">
                  <div className="text-yellow-400 text-sm flex items-center">
                    <span className="mr-2">💡</span>
                    Transfer SOL from wallet to game balance to start playing
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-yellow-400 mb-2">Wallet connection issue</p>
              <p className="text-gray-400 text-sm">Please reconnect your wallet</p>
            </div>
          )}
        </div>

        {/* Referral Section Placeholder - Add ReferralSection component when available */}
        {isValidWallet && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Referral Program</h2>
            <div className="text-center py-6">
              <p className="text-gray-400">Referral system coming soon!</p>
            </div>
          </div>
        )}

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
                Play RUGGED 
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
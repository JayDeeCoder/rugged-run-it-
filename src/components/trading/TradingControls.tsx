// src/components/trading/TradingControls.tsx - FIXED VERSION
import React, { FC, useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon, Timer, Users, Settings, Wallet, TrendingUp } from 'lucide-react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../common/Button';
import { useGameSocket, initializeUser } from '../../hooks/useGameSocket';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Import from barrel file instead of direct imports
import { AirdropModal, DepositModal, WithdrawModal } from './index';

// TokenType: SOL = custodial game balance, RUGGED = SPL token
export enum TokenType {
  SOL = 'SOL',      // Custodial game balance (primary)
  RUGGED = 'RUGGED' // SPL token (secondary)
}

// Enhanced bet tracking interface
interface ActiveBet {
  id: string;
  amount: number;
  entryMultiplier: number;
  timestamp: number;
  gameId: string;
  transactionId?: string;
  tokenType?: TokenType;
}

interface TradingControlsProps {
  onBuy?: (amount: number) => void;
  onSell?: (percentage: number) => void;
  isPlacingBet?: boolean;
  isCashingOut?: boolean;
  hasActiveGame?: boolean;
  walletBalance?: number;
  holdings?: number;
  currentMultiplier?: number;
  isGameActive?: boolean;
  isMobile?: boolean;
}

// 🔧 FIXED: Optimized wallet balance hook with stable update function  
// 🔧 FIXED: Enhanced custodial balance hook with socket events and force refresh
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
      console.log(`🔄 Fetching custodial balance for user ${userId}...`);
      
      const response = await fetch(`/api/custodial/balance/${userId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`👤 User ${userId} not found - balance remains 0`);
          setCustodialBalance(0);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 Custodial balance updated: ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
      } else {
        console.warn('Invalid response format:', data);
      }
    } catch (error) {
      console.error('❌ Failed to fetch custodial balance:', error);
      // Don't reset balance on error, keep previous value
    } finally {
      setLoading(false);
    }
  }, [userId, loading]); // Stable dependencies

  // 🔧 NEW: Force refresh function for immediate updates
  // 🔧 NEW: Enhanced force refresh with cache busting and POST method
const forceRefresh = useCallback(async () => {
  if (!userId) return;
  
  console.log(`🔄 Force refreshing balance for ${userId}...`);
  setLoading(true);
  
  try {
    // Method 1: Try POST with refresh action first
    const postResponse = await fetch(`/api/custodial/balance/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh' })
    });
    
    if (postResponse.ok) {
      const data = await postResponse.json();
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 Force refresh (POST): ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
        return;
      }
    }
    
    // Method 2: Fallback to GET with cache busting
    const getResponse = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}&refresh=true`);
    
    if (getResponse.ok) {
      const data = await getResponse.json();
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 Force refresh (GET): ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
      }
    } else {
      console.error('❌ Force refresh failed:', getResponse.status);
    }
    
  } catch (error) {
    console.error('❌ Force refresh error:', error);
  } finally {
    setLoading(false);
  }
}, [userId]);

  useEffect(() => {
    // Only set up polling if userId changes
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 Setting up custodial balance polling for user: ${userId}`);
      lastUserIdRef.current = userId;
      
      // Clear existing interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      // Initial fetch
      updateCustodialBalance();
      
      // Set interval for periodic updates
      updateIntervalRef.current = setInterval(() => {
        if (!loading) { // Only update if not currently loading
          updateCustodialBalance();
        }
      }, 15000); // Reduced to 15 seconds for faster updates
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [userId, updateCustodialBalance]);

  // 🔧 NEW: Socket event listeners for real-time updates
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;

    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up real-time balance listeners for user: ${userId}`);
      socketListenersRef.current = true;
      
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 Real-time custodial balance update: ${data.custodialBalance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.custodialBalance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleBalanceUpdate = (data: any) => {
        if (data.userId === userId && data.type === 'custodial') {
          console.log(`💰 Real-time balance update: ${data.balance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleDepositConfirmation = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 Deposit confirmed, refreshing balance...`);
          // Force refresh after deposit
          setTimeout(forceRefresh, 1000);
        }
      };
  
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('balanceUpdate', handleBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      
      return () => {
        console.log(`🔌 Cleaning up balance listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('balanceUpdate', handleBalanceUpdate);
        socket.off('depositConfirmed', handleDepositConfirmation);
        socketListenersRef.current = false;
      };
    }
  }, [userId, forceRefresh]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance, forceRefresh };
};

// 🔧 ENHANCED: Better embedded wallet balance hook with socket events
const useWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  // Create stable update function with useCallback
  const updateBalance = useCallback(async () => {
    if (!walletAddress) return;
    
    // Prevent multiple simultaneous updates
    if (loading) return;
    
    setLoading(true);
    
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (!rpcUrl) {
        console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
        setBalance(0);
        return;
      }
      
      const connectionConfig: any = { commitment: 'confirmed' };
      if (apiKey) {
        connectionConfig.httpHeaders = { 'x-api-key': apiKey };
      }
      
      const connection = new Connection(rpcUrl, connectionConfig);
      const publicKey = new PublicKey(walletAddress);
      const balanceResponse = await connection.getBalance(publicKey);
      const solBalance = balanceResponse / LAMPORTS_PER_SOL;
      
      setBalance(solBalance);
      setLastUpdated(Date.now());
      
    } catch (error) {
      console.error('❌ useWalletBalance: Failed to fetch balance:', error);
      // Don't reset balance on error
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading]);

  // 🔧 NEW: Force refresh for immediate updates
  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    
    console.log(`🔄 Force refreshing wallet balance for: ${walletAddress}`);
    await updateBalance();
  }, [walletAddress, updateBalance]);

  useEffect(() => {
    // Only set up polling if walletAddress changes
    if (walletAddress && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 Setting up wallet balance polling for: ${walletAddress}`);
      lastWalletRef.current = walletAddress;
      
      // Clear existing interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      // Initial fetch
      updateBalance();
      
      // Set new interval with shorter delay for better responsiveness
      updateIntervalRef.current = setInterval(() => {
        if (!loading) { // Only update if not currently loading
          updateBalance();
        }
      }, 30000); // 30 seconds
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [walletAddress, updateBalance]);

  // 🔧 NEW: Socket listeners for wallet balance updates
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current) return;

    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up wallet balance listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      const handleWalletBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 Real-time wallet balance update: ${data.balance?.toFixed(6)} SOL`);
          setBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`🔗 Transaction confirmed for ${walletAddress}, refreshing balance...`);
          setTimeout(forceRefresh, 2000); // Wait 2 seconds for blockchain confirmation
        }
      };
  
      socket.on('walletBalanceUpdate', handleWalletBalanceUpdate);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 Cleaning up wallet balance listeners for: ${walletAddress}`);
        socket.off('walletBalanceUpdate', handleWalletBalanceUpdate);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress, forceRefresh]);

  return { balance, loading, lastUpdated, updateBalance, forceRefresh };
};

// 🔧 FIXED: Simplified RUGGED balance hook with stable update function
const useRuggedBalance = (walletAddress: string) => {
  const [ruggedBalance, setRuggedBalance] = useState<number>(1000);
  const [loading, setLoading] = useState<boolean>(false);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  // Create stable update function with useCallback
  const updateRuggedBalance = useCallback(async () => {
    if (!walletAddress || loading) return;
    
    setLoading(true);
    try {
      // TODO: Implement actual SPL token balance fetching
      console.log(`🎯 RUGGED balance check for: ${walletAddress}`);
      // For now, keep the static 1000 balance
    } catch (error) {
      console.error('Failed to fetch RUGGED balance:', error);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading]);

  // 🔧 NEW: Force refresh for immediate updates
  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    
    console.log(`🔄 Force refreshing RUGGED balance for: ${walletAddress}`);
    await updateRuggedBalance();
  }, [walletAddress, updateRuggedBalance]);

  useEffect(() => {
    // Only run once per wallet address
    if (walletAddress && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 Setting up RUGGED balance for: ${walletAddress}`);
      lastWalletRef.current = walletAddress;
      updateRuggedBalance();
    }
  }, [walletAddress, updateRuggedBalance]);

  // 🔧 NEW: Socket listeners for RUGGED balance updates  
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current) return;

    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up RUGGED balance listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      const handleRuggedBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 Real-time RUGGED balance update: ${data.balance?.toFixed(0)} RUGGED`);
          setRuggedBalance(parseFloat(data.balance) || 1000);
        }
      };

      socket.on('ruggedBalanceUpdate', handleRuggedBalanceUpdate);
      
      return () => {
        console.log(`🔌 Cleaning up RUGGED balance listeners for: ${walletAddress}`);
        socket.off('ruggedBalanceUpdate', handleRuggedBalanceUpdate);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress]);

  return { ruggedBalance, loading, updateRuggedBalance, forceRefresh };
};

// 🔧 NEW: Add manual refresh button to BalanceDisplay component
const BalanceDisplay: FC<{
  currentToken: TokenType;
  custodialBalance: number;
  embeddedWalletBalance: number;
  ruggedBalance: number;
  onTokenChange: (token: TokenType) => void;
  onDepositClick: () => void;
  onWithdrawClick: () => void;
  onAirdropClick: () => void;
  isMobile: boolean;
  showExpanded: boolean;
  onToggleExpanded: () => void;
  isLoading: boolean;
  onRefresh?: () => void; // 🔧 NEW: Manual refresh callback
}> = React.memo(({ 
  currentToken, 
  custodialBalance,
  embeddedWalletBalance,
  ruggedBalance,
  onTokenChange, 
  onDepositClick, 
  onWithdrawClick, 
  onAirdropClick, 
  isMobile, 
  showExpanded, 
  onToggleExpanded,
  isLoading,
  onRefresh
}) => {
  const activeBalance = currentToken === TokenType.SOL ? custodialBalance : ruggedBalance;
  
  const formatBalance = (balance: number, token: TokenType) => {
    if (token === TokenType.SOL) {
      return balance.toFixed(3);
    } else {
      return balance.toFixed(0);
    }
  };

  if (isMobile) {
    return (
      <div className="mb-2">
        <div 
          className="flex items-center justify-between bg-gray-800 rounded-lg p-2 cursor-pointer"
          onClick={onToggleExpanded}
        >
          <div className="flex items-center space-x-2">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
              currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
            }`}>
              <span className="text-white font-bold text-xs">
                {currentToken === TokenType.SOL ? 'S' : 'R'}
              </span>
            </div>
            <div>
              {currentToken === TokenType.SOL ? (
                <div>
                  <div className="text-sm font-bold text-blue-400">
                    {formatBalance(custodialBalance, currentToken)} SOL
                    {isLoading && <span className="ml-1 text-xs text-gray-400">↻</span>}
                  </div>
                  <div className="text-xs text-gray-400">Game Balance</div>
                </div>
              ) : (
                <div className="text-sm font-bold text-green-400">
                  {formatBalance(activeBalance, currentToken)} {currentToken}
                  {isLoading && <span className="ml-1 text-xs text-gray-400">↻</span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* 🔧 NEW: Manual refresh button */}
            {onRefresh && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                className="text-gray-400 hover:text-white transition-colors"
                disabled={isLoading}
              >
                <span className={`text-xs ${isLoading ? 'animate-spin' : ''}`}>↻</span>
              </button>
            )}
            <Wallet className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400 text-sm">{showExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {showExpanded && (
          <div className="bg-gray-800 rounded-lg p-2 mt-1">
            {currentToken === TokenType.SOL && (
              <div className="mb-2 p-2 bg-gray-900 rounded text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-green-400">🎮 Game Balance:</span>
                  <span className="text-white font-bold">{custodialBalance.toFixed(3)} SOL</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400">💼 Wallet Balance:</span>
                  <span className="text-white font-bold">{embeddedWalletBalance.toFixed(3)} SOL</span>
                </div>
              </div>
            )}
            
            <div className="flex space-x-2 mb-2">
              <button
                onClick={() => onTokenChange(TokenType.SOL)}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                SOL
              </button>
              <button
                onClick={() => {
                  onTokenChange(TokenType.RUGGED);
                  if (ruggedBalance < 10) {
                    onAirdropClick();
                  }
                }}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  currentToken === TokenType.RUGGED 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                RUGGED
              </button>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={onDepositClick}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded text-xs flex items-center justify-center"
              >
                <ArrowDownLeft className="w-3 h-3 mr-1" />
                Deposit
              </button>
              <button
                onClick={onWithdrawClick}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1 px-2 rounded text-xs flex items-center justify-center"
              >
                <ArrowUpRight className="w-3 h-3 mr-1" />
                Withdraw
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop version with refresh button (similar pattern)
  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
          }`}>
            <span className="text-white font-bold text-sm">
              {currentToken === TokenType.SOL ? 'SOL' : 'RUG'}
            </span>
          </div>
          
          <div>
            <div className="text-xs text-gray-400">
              {currentToken === TokenType.SOL ? 'Game Balance' : 'Balance'}
            </div>
            <div className={`text-lg font-bold ${
              currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
            }`}>
              {formatBalance(activeBalance, currentToken)} {currentToken}
              {isLoading && <span className="ml-2 text-xs text-gray-400">Updating...</span>}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* 🔧 NEW: Manual refresh button for desktop */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-gray-400 hover:text-white transition-colors p-1"
              disabled={isLoading}
              title="Refresh balance"
            >
              <span className={`text-sm ${isLoading ? 'animate-spin' : ''}`}>↻</span>
            </button>
          )}
          
          <button
            onClick={() => onTokenChange(TokenType.SOL)}
            className={`px-3 py-1 text-xs rounded ${
              currentToken === TokenType.SOL 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            SOL
          </button>
          <button
            onClick={() => {
              onTokenChange(TokenType.RUGGED);
              if (ruggedBalance < 10) {
                onAirdropClick();
              }
            }}
            className={`px-3 py-1 text-xs rounded ${
              currentToken === TokenType.RUGGED 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            RUGGED
          </button>
        </div>
      </div>

      {currentToken === TokenType.SOL && (
        <div className="mb-3 p-2 bg-gray-900 rounded-md">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-green-400 text-xs mb-1">🎮 Game Balance</div>
              <div className="text-white font-bold">{custodialBalance.toFixed(3)} SOL</div>
              <div className="text-xs text-gray-500">For gaming</div>
            </div>
            <div>
              <div className="text-blue-400 text-xs mb-1">💼 Wallet Balance</div>
              <div className="text-white font-bold">{embeddedWalletBalance.toFixed(3)} SOL</div>
              <div className="text-xs text-gray-500">For deposits</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onDepositClick}
          className="bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center"
        >
          <ArrowDownLeft className="w-4 h-4 mr-2" />
          Deposit
        </button>
        <button
          onClick={onWithdrawClick}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center"
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Withdraw
        </button>
      </div>
    </div>
  );
});

// 🔧 OPTIMIZED: Memoized components to prevent unnecessary re-renders
const CompactGameInfo: FC<{
  game: any;
  countdown: number;
  showCountdown: boolean;
  isConnected: boolean;
  isMobile: boolean;
}> = React.memo(({ game, countdown, showCountdown, isConnected, isMobile }) => {
  const getStatusDisplay = () => {
    if (!game) return { text: 'Connecting...', color: 'text-gray-400', bg: 'bg-gray-600' };
    switch (game.status) {
      case 'waiting':
        return { text: 'Next Round', color: 'text-blue-400', bg: 'bg-blue-600' };
      case 'active':
        return { text: 'Active', color: 'text-green-400', bg: 'bg-green-600' };
      case 'crashed':
        return { text: 'Ended', color: 'text-red-400', bg: 'bg-red-600' };
      default:
        return { text: 'Connecting...', color: 'text-gray-400', bg: 'bg-gray-600' };
    }
  };

  const status = getStatusDisplay();

  if (isMobile) {
    return (
      <div className="bg-gray-800 rounded-lg p-2 mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.bg}`}>
              {status.text}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
              {isConnected ? '●' : '○'}
            </span>
          </div>
          {game && (
            <span className="text-yellow-400 font-bold text-lg">
              {game.multiplier?.toFixed(2) || '1.00'}x
            </span>
          )}
        </div>

        {game && (
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>#{game.gameNumber}</span>
            <div className="flex space-x-3">
              <span>{game.totalPlayers || 0} RUGGERS</span>
              <span>{(game.totalBets || 0).toFixed(2)} LIQ</span>
            </div>
          </div>
        )}

        {showCountdown && countdown > 0 && (
          <div className="text-center mt-1 p-1 bg-blue-900 bg-opacity-30 rounded">
            <div className="text-blue-400 text-xs">Starting in {Math.ceil(countdown / 1000)}s</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded text-xs ${status.bg}`}>
            {status.text}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {game && (
          <span className="text-yellow-400 font-bold text-xl">
            {game.multiplier?.toFixed(2) || '1.00'}x
          </span>
        )}
      </div>

      {game && (
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
          <div>
            <span className="block text-gray-500">Game</span>
            <span className="text-white">#{game.gameNumber}</span>
          </div>
          <div>
            <span className="block text-gray-500">RUGGERS</span>
            <span className="text-white">{game.totalPlayers || 0}</span>
          </div>
          <div>
            <span className="block text-gray-500">Total</span>
            <span className="text-white">{(game.totalBets || 0).toFixed(2)} liq</span>
          </div>
        </div>
      )}

      {showCountdown && countdown > 0 && (
        <div className="text-center mt-2 p-2 bg-blue-900 bg-opacity-30 rounded">
          <div className="text-blue-400 text-sm">Starting in {Math.ceil(countdown / 1000)}s</div>
          <div className="text-xs text-gray-400">Snipe Now!</div>
        </div>
      )}
    </div>
  );
});

// 🔧 FIXED: Better button state management
const BettingSection: FC<{
  activeBet: ActiveBet | null;
  amount: string;
  onAmountChange: (amount: string) => void;
  onQuickAmount: (amount: number) => void;
  onPlaceBet: () => void;
  onCashout: () => void;
  quickAmounts: number[];
  currentToken: TokenType;
  activeBalance: number;
  isPlacingBet: boolean;
  isCashingOut: boolean;
  isWalletReady: boolean;
  canBet: boolean;
  isWaitingPeriod: boolean;
  gameStatus: string;
  isConnected: boolean;
  currentMultiplier: number;
  isMobile: boolean;
  betValidationError?: string;
}> = React.memo(({
  activeBet,
  amount,
  onAmountChange,
  onQuickAmount,
  onPlaceBet,
  onCashout,
  quickAmounts,
  currentToken,
  activeBalance,
  isPlacingBet,
  isCashingOut,
  isWalletReady,
  canBet,
  isWaitingPeriod,
  gameStatus,
  isConnected,
  currentMultiplier,
  isMobile,
  betValidationError
}) => {

  // 🔧 FIXED: Memoize complex calculations
  const { amountValid, amountInRange, minBetAmount, maxBetAmount } = useMemo(() => {
    const amountNum = parseFloat(amount);
    const minBet = currentToken === TokenType.SOL ? 0.001 : 1;
    const maxBet = currentToken === TokenType.SOL ? 10.0 : 10000;
    
    return {
      amountValid: !isNaN(amountNum) && amountNum > 0 && amountNum <= activeBalance,
      amountInRange: amountNum >= minBet && amountNum <= maxBet,
      minBetAmount: minBet,
      maxBetAmount: maxBet
    };
  }, [amount, activeBalance, currentToken]);

  // 🔧 FIXED: Memoize button states with debug logging
  const buttonStates = useMemo(() => {
    const buyDisabled = isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet;
    const rugDisabled = isCashingOut || !isConnected || gameStatus !== 'active' || !activeBet;
    
    // Debug logging for button states
    if (activeBet) {
      console.log('🎯 Button states (with active bet):', {
        activeBet: !!activeBet,
        isCashingOut,
        isConnected,
        gameStatus,
        rugDisabled,
        showBuyButton: false,
        showRugButton: true
      });
    }
    
    return { buyDisabled, rugDisabled };
  }, [isPlacingBet, isWalletReady, amountValid, amountInRange, canBet, isCashingOut, isConnected, gameStatus, activeBet]);

  if (isMobile) {
    return (
      <div>
        {!activeBet ? (
          <>
            <div className="mb-2">
              <div className="flex gap-1 mb-1">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className="flex-1 bg-gray-700 text-white px-2 py-1.5 rounded text-sm focus:outline-none"
                  placeholder={`Min: ${minBetAmount}`}
                  disabled={!canBet}
                />
                <button
                  onClick={() => onQuickAmount(activeBalance * 0.5)}
                  className="bg-gray-600 text-gray-300 px-2 text-xs rounded hover:bg-gray-500"
                  disabled={!canBet}
                >
                  ½
                </button>
                <button
                  onClick={() => onQuickAmount(Math.min(activeBalance, maxBetAmount))}
                  className="bg-gray-600 text-gray-300 px-2 text-xs rounded hover:bg-gray-500"
                  disabled={!canBet}
                >
                  Max
                </button>
              </div>
              
              <div className="grid grid-cols-4 gap-1">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => onQuickAmount(amt)}
                    className={`py-1 text-xs rounded transition-colors ${
                      parseFloat(amount) === amt
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                    disabled={!canBet}
                  >
                    {amt}
                  </button>
                ))}
              </div>

              {betValidationError && (
                <div className="text-red-400 text-xs mt-1">{betValidationError}</div>
              )}
            </div>
          </>
        ) : null}
        
        <div className="grid grid-cols-2 gap-2">
          {!activeBet ? (
            <>
              <button
                onClick={onPlaceBet}
                disabled={buttonStates.buyDisabled}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  buttonStates.buyDisabled
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isPlacingBet ? (
                  <>
                    <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></div>
                    Placing
                  </>
                ) : (
                  <>
                    <Coins className="mr-1 h-4 w-4" />
                    {isWaitingPeriod ? 'SNIPE' : 'BUY'}
                  </>
                )}
              </button>
              <button
                disabled
                className="py-2.5 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
              >
                <Sparkles className="mr-1 h-4 w-4" />
                RUG
              </button>
            </>
          ) : (
            <>
              <button
                disabled
                className="py-2.5 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
              >
                <Coins className="mr-1 h-4 w-4" />
                Buy Active
              </button>
              <button
                onClick={onCashout}
                disabled={buttonStates.rugDisabled}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  buttonStates.rugDisabled
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                }`}
              >
                {isCashingOut ? (
                  <>
                    <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></div>
                    Cashing
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 h-4 w-4" />
                    RUG
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Desktop layout (similar optimizations)
  return (
    <div className="border-t border-gray-800 pt-3">
      <h3 className="text-sm font-bold text-gray-400 mb-3">
        {activeBet ? 'ACTIVE BET' : 'PLACE BUY'}
      </h3>
      
      {!activeBet && (
        <>
          <div className="mb-3">
            <label className="block text-gray-400 text-xs mb-1">
              Buy Amount ({currentToken}) - Min: {minBetAmount}, Max: {maxBetAmount}
            </label>
            <div className="flex">
              <input
                type="text"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-l-md focus:outline-none"
                placeholder={`Min: ${minBetAmount}`}
                disabled={!canBet}
              />
              <button
                onClick={() => onQuickAmount(activeBalance * 0.5)}
                className="bg-gray-600 text-gray-300 px-2 text-xs border-l border-gray-900 hover:bg-gray-500"
                disabled={!canBet}
              >
                Half
              </button>
              <button
                onClick={() => onQuickAmount(Math.min(activeBalance, maxBetAmount))}
                className="bg-gray-600 text-gray-300 px-2 text-xs rounded-r-md hover:bg-gray-500"
                disabled={!canBet}
              >
                Max
              </button>
            </div>
            
            {betValidationError && (
              <div className="text-red-400 text-xs mt-1">{betValidationError}</div>
            )}
          </div>
          
          <div className="grid grid-cols-4 gap-2 mb-3">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                onClick={() => onQuickAmount(amt)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  parseFloat(amount) === amt
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={!canBet}
              >
                {amt.toString()} {currentToken}
              </button>
            ))}
          </div>
        </>
      )}
      
      <div className="grid grid-cols-2 gap-3">
        {!activeBet ? (
          <>
            <button
              onClick={onPlaceBet}
              disabled={buttonStates.buyDisabled}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                buttonStates.buyDisabled
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isPlacingBet ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Placing...
                </>
              ) : (
                <>
                  <Coins className="mr-2 h-4 w-4" />
                  {isWaitingPeriod ? 'SNIPE' : 'BUY'}
                </>
              )}
            </button>
            <button
              disabled
              className="py-3 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              RUG
            </button>
          </>
        ) : (
          <>
            <button
              disabled
              className="py-3 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
            >
              <Coins className="mr-2 h-4 w-4" />
              Buy Placed
            </button>
            <button
              onClick={onCashout}
              disabled={buttonStates.rugDisabled}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                buttonStates.rugDisabled
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }`}
            >
              {isCashingOut ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Cashing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  RUG ({currentMultiplier.toFixed(2)}x)
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
});

// 🔧 MAIN COMPONENT - Fixed critical performance issues
const TradingControls: FC<TradingControlsProps> = ({ 
  onBuy, 
  onSell, 
  isPlacingBet: propIsPlacingBet = false, 
  isCashingOut: propIsCashingOut = false,
  hasActiveGame: propHasActiveGame = false,
  walletBalance: propWalletBalance = 0,
  holdings: propHoldings = 0,
  currentMultiplier: propCurrentMultiplier = 1.0,
  isGameActive: propIsGameActive = true,
  isMobile = false
}) => {
  // Authentication and wallet setup
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // House wallet for auto-transfers
  const HOUSE_WALLET = '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';
  
  // State for user ID
  const [userId, setUserId] = useState<string | null>(null);
  
  // Enhanced game server connection
  const { 
    currentGame, 
    isConnected, 
    placeBet, 
    cashOut, 
    countdown, 
    isWaitingPeriod, 
    canBet,
    connectionError,
    connectionAttempts,
    placeCustodialBet,
    custodialCashOut,
    getCustodialBalance
  } = useGameSocket(walletAddress, userId || undefined);
  
  // 🔧 UPDATED: Enhanced balance hooks with force refresh capability
  const { 
    balance: embeddedWalletBalance, 
    loading: embeddedWalletLoading, 
    forceRefresh: refreshEmbeddedBalance 
  } = useWalletBalance(walletAddress);
  
  const { 
    custodialBalance, 
    loading: custodialBalanceLoading, 
    updateCustodialBalance, 
    forceRefresh: refreshCustodialBalance 
  } = useCustodialBalance(userId || '');
  
  const { 
    ruggedBalance, 
    loading: ruggedBalanceLoading, 
    updateRuggedBalance, 
    forceRefresh: refreshRuggedBalance 
  } = useRuggedBalance(walletAddress);

  // 🔧 NEW: Manual refresh function for all balances
  const refreshAllBalances = useCallback(async () => {
    console.log('🔄 Manually refreshing all balances...');
    
    try {
      // Refresh all balances concurrently
      await Promise.all([
        refreshEmbeddedBalance(),
        refreshCustodialBalance(),
        refreshRuggedBalance()
      ]);
      
      console.log('✅ All balances refreshed successfully');
      toast.success('Balances updated!');
    } catch (error) {
      console.error('❌ Failed to refresh balances:', error);
      toast.error('Failed to refresh balances');
    }
  }, [refreshEmbeddedBalance, refreshCustodialBalance, refreshRuggedBalance]);

  // 🔧 NEW: Socket listener for deposit confirmations
  useEffect(() => {
    const socket = (window as any).gameSocket;
    if (socket && userId) {
      console.log(`🔌 Setting up deposit confirmation listeners for user: ${userId}`);
      
      const handleDepositConfirmed = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 Deposit confirmed for ${userId}, refreshing all balances...`);
          // Refresh all balances after deposit confirmation
          setTimeout(refreshAllBalances, 1000);
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress || data.userId === userId) {
          console.log(`🔗 Transaction confirmed, refreshing balances...`);
          setTimeout(refreshAllBalances, 2000);
        }
      };

      socket.on('depositConfirmed', handleDepositConfirmed);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 Cleaning up deposit confirmation listeners for user: ${userId}`);
        socket.off('depositConfirmed', handleDepositConfirmed);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
      };
    }
  }, [userId, walletAddress, refreshAllBalances]);
  // 🔧 FIXED: Memoize expensive calculations
  const gameState = useMemo(() => {
    const countdownSeconds = countdown ? Math.ceil(countdown / 1000) : 0;
    const showCountdown = Boolean(countdown && countdown > 0 && currentGame?.status === 'waiting');
    const activeCurrentGame = currentGame;
    const activeIsGameActive = activeCurrentGame?.status === 'active' || activeCurrentGame?.status === 'waiting';
    const activeCurrentMultiplier = activeCurrentGame?.multiplier || propCurrentMultiplier;
    const gameStatus = activeCurrentGame?.status || 'waiting';
    
    return {
      countdownSeconds,
      showCountdown,
      activeCurrentGame,
      activeIsGameActive,
      activeCurrentMultiplier,
      gameStatus
    };
  }, [countdown, currentGame, propCurrentMultiplier]);
  
  // Enhanced bet tracking
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
  
  // Token context - Default to SOL (custodial balance) as primary
  const [currentToken, setCurrentToken] = useState<TokenType>(TokenType.SOL);
  
  // Check if wallet is ready
  const isWalletReady = authenticated && walletAddress !== '';

  // Use localStorage to remember user's preferred amount
  const [savedAmount, setSavedAmount] = useLocalStorage<string>('default-bet-amount', '0.01');
  const [amount, setAmount] = useState<string>(savedAmount);
  
  // Modal states
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  
  // Auto cashout settings
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  
  // 🔧 FIXED: Better loading state management
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  const [operationTimeouts, setOperationTimeouts] = useState<Set<string>>(new Set());
  
  // State for expanded sections
  const [showBalanceExpanded, setShowBalanceExpanded] = useState<boolean>(false);
  
  // Error state
  const [serverError, setServerError] = useState<string>('');
  
  // 🔧 FIXED: Memoize active balance
  const activeBalance = useMemo(() => {
    return currentToken === TokenType.SOL ? custodialBalance : ruggedBalance;
  }, [currentToken, custodialBalance, ruggedBalance]);
  
  const effectiveCanBet = gameState.gameStatus === 'active' ? true : canBet;

  // 🔧 FIXED: Memoize validation
  const betValidationError = useMemo(() => {
    const amountNum = parseFloat(amount);
    const minBetAmount = currentToken === TokenType.SOL ? 0.002 : 1;
    const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
    
    if (isNaN(amountNum) || amountNum <= 0) return 'Enter valid amount';
    if (amountNum < minBetAmount) return `Minimum: ${minBetAmount} ${currentToken}`;
    if (amountNum > maxBetAmount) return `Maximum: ${maxBetAmount} ${currentToken}`;
    if (amountNum > activeBalance) return 'Insufficient balance';
    return '';
  }, [amount, currentToken, activeBalance]);

  // Enhanced responsive container
  const containerClasses = `
    bg-[#0d0d0f] text-white border border-gray-800 rounded-lg
    ${isMobile 
      ? 'p-3 max-w-sm mx-auto' 
      : 'p-4 min-w-[320px] max-w-md'
    }
  `;

  // 🔧 FIXED: User initialization with stable dependencies and robust tracking
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
  
  useEffect(() => {
    // Only run initialization if conditions are met and we haven't already done it for this wallet
    if (!authenticated || !walletAddress) {
      return;
    }
    
    // Check if we've already completed initialization for this exact wallet
    if (initializationRef.current.completed && 
        initializationRef.current.lastWallet === walletAddress &&
        initializationRef.current.lastUserId === (userId || '')) {
      return;
    }
    
    // Check if we're already in progress for this wallet
    if (initializationRef.current.attempted && 
        initializationRef.current.lastWallet === walletAddress) {
      return;
    }
    
    console.log(`🔗 Starting user initialization for wallet: ${walletAddress}`);
    initializationRef.current.attempted = true;
    initializationRef.current.lastWallet = walletAddress;
    
    let initTimeout: NodeJS.Timeout | null = null;
    
    const initUser = async () => {
      try {
        // If we already have a userId for this wallet, we might just need socket initialization
        if (userId && initializationRef.current.lastUserId === userId) {
          console.log(`✅ User ${userId} already initialized for this wallet`);
          initializationRef.current.completed = true;
          return;
        }
        
        console.log(`📡 Getting user data for wallet: ${walletAddress}`);
        const userData = await UserAPI.getUserOrCreate(walletAddress);
        
        if (userData) {
          setUserId(userData.id);
          initializationRef.current.lastUserId = userData.id;
          console.log(`👤 User ID set: ${userData.id}`);
          
          // Use timeout to ensure initialization doesn't block
          initTimeout = setTimeout(() => {
            console.log(`📡 Initializing user via socket (one-time)...`);
            
            const socket = (window as any).gameSocket;
            if (socket) {
              socket.emit('initializeUser', {
                userId: userData.id,
                walletAddress: walletAddress
              });
              
              // Listen for initialization result (one-time)
              socket.once('userInitializeResult', (result: any) => {
                console.log('📡 User initialization result:', result);
                
                if (result.success) {
                  console.log(`✅ User ${result.userId} initialized successfully`);
                  console.log(`💰 Custodial balance: ${result.custodialBalance?.toFixed(6)} SOL`);
                  console.log(`💼 Embedded balance: ${result.embeddedBalance?.toFixed(6)} SOL`);
                  
                  // Mark as completed
                  initializationRef.current.completed = true;
                  initializationRef.current.lastUserId = result.userId;
                  
                  // Trigger balance updates without dependencies - use refs to call latest functions
                  setTimeout(() => {
                    // Call the functions directly without dependencies
                    try {
                      updateCustodialBalance();
                      updateRuggedBalance();
                    } catch (error) {
                      console.warn('⚠️ Balance update failed during initialization:', error);
                    }
                  }, 500);
                } else {
                  console.error('❌ User initialization failed:', result.error);
                  toast.error('Failed to initialize wallet');
                  // Reset flags on failure so it can retry
                  initializationRef.current.attempted = false;
                  initializationRef.current.completed = false;
                }
              });
            } else {
              console.error('❌ Socket not available for user initialization');
              // Reset flags so it can retry when socket is available
              initializationRef.current.attempted = false;
              initializationRef.current.completed = false;
            }
          }, 1000);
        }
      } catch (error) {
        console.error('❌ Could not initialize user:', error);
        toast.error('Failed to initialize wallet');
        // Reset flags on error so it can retry
        initializationRef.current.attempted = false;
        initializationRef.current.completed = false;
      }
    };
    
    initUser();
    
    return () => {
      if (initTimeout) clearTimeout(initTimeout);
    };
  }, [authenticated, walletAddress, userId]); // Only essential dependencies
  
  // Reset initialization tracking when wallet actually changes (not on every render)
  useEffect(() => {
    if (walletAddress !== initializationRef.current.lastWallet) {
      console.log(`🔄 Wallet changed: ${initializationRef.current.lastWallet} → ${walletAddress}`);
      initializationRef.current = { 
        attempted: false, 
        completed: false, 
        lastWallet: walletAddress,
        lastUserId: ''
      };
    }
  }, [walletAddress]);

  // Update local amount state when saved amount changes
  useEffect(() => {
    setAmount(savedAmount);
  }, [savedAmount]);

  // 🔧 FIXED: Socket listeners with stable dependencies and better cleanup
  useEffect(() => {
    const socket = (window as any).gameSocket;
    if (socket && userId) {
      console.log(`🔌 Setting up enhanced socket listeners for user: ${userId}`);
      
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 Real-time custodial balance update: ${data.custodialBalance?.toFixed(6)} SOL`);
          updateCustodialBalance();
        }
      };
  
      const handleCustodialCashout = (data: any) => {
        if (data.userId === userId) {
          console.log(`💸 Real-time custodial cashout: ${data.amount?.toFixed(6)} SOL`);
          
          setActiveBet(null);
          
          if (data.payout && data.betAmount) {
            const winAmount = data.payout - data.betAmount;
            toast.success(`Cashout confirmed! Win: +${winAmount.toFixed(3)} SOL`);
          }
          
          updateCustodialBalance();
        }
      };
  
      const handleGameCrashed = (data: any) => {
        console.log(`💥 Game crashed at ${data.crashMultiplier?.toFixed(2)}x`);
        
        if (activeBet) {
          console.log('🗑️ Clearing active bet due to game crash');
          setActiveBet(null);
          
          toast.error(`Game crashed at ${data.crashMultiplier?.toFixed(2)}x - Bet lost`);
          
          if (activeBet.tokenType === TokenType.SOL) {
            updateCustodialBalance();
          } else {
            updateRuggedBalance();
          }
        }
      };
  
      const handleGameEnded = (data: any) => {
        console.log(`🏁 Game ended:`, data);
        
        if (activeBet) {
          console.log('🗑️ Clearing active bet - game ended, ready for new round');
          setActiveBet(null);
        }
      };
  
      const handleGameWaiting = (data: any) => {
        console.log(`⏳ New game waiting period started:`, data);
        
        if (activeBet) {
          console.log('🗑️ Clearing stuck active bet - new game starting');
          setActiveBet(null);
        }
      };
  
      const handleCustodialBetPlaced = (data: any) => {
        if (data.userId === userId) {
          console.log(`🎯 Custodial bet placed via socket: ${data.betAmount} SOL at ${data.entryMultiplier}x`);
          updateCustodialBalance();
        }
      };
  
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('custodialCashout', handleCustodialCashout);
      socket.on('gameCrashed', handleGameCrashed);
      socket.on('gameEnded', handleGameEnded);
      socket.on('gameWaiting', handleGameWaiting);
      socket.on('custodialBetPlaced', handleCustodialBetPlaced);
  
      return () => {
        console.log(`🔌 Cleaning up enhanced socket listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('custodialCashout', handleCustodialCashout);
        socket.off('gameCrashed', handleGameCrashed);
        socket.off('gameEnded', handleGameEnded);
        socket.off('gameWaiting', handleGameWaiting);
        socket.off('custodialBetPlaced', handleCustodialBetPlaced);
      };
    }
  }, [userId, activeBet, updateCustodialBalance, updateRuggedBalance]);
  // Handle token switch
  const handleTokenChange = useCallback((token: TokenType) => {
    setCurrentToken(token);
  }, []);

  // 🔧 FIXED: Optimized cashout with stable dependencies
  const handleCashout = useCallback(async () => {
    if (!authenticated || !walletAddress || !isConnected || !activeBet) {
      console.log('❌ Cannot cashout: missing requirements');
      return;
    }
  
    if (!userId) {
      setServerError('User not initialized');
      toast.error('User not initialized');
      return;
    }
  
    if (isCashingOut || operationTimeouts.has('cashout')) {
      console.log('❌ Cashout already in progress');
      return;
    }
  
    setIsCashingOut(true);
    setOperationTimeouts(prev => new Set(prev).add('cashout'));
    
    const operationTimeout = setTimeout(() => {
      setIsCashingOut(false);
      setOperationTimeouts(prev => {
        const newSet = new Set(prev);
        newSet.delete('cashout');
        return newSet;
      });
      setServerError('Cashout timed out');
      toast.error('Cashout timed out - please try again');
    }, 15000);
  
    try {
      let success = false;
      let payout = 0;
  
      if (activeBet.tokenType === TokenType.SOL) {
        console.log('💸 Using custodialCashOut hook method...');
        
        const result = await custodialCashOut(userId, walletAddress);
        success = result.success;
        payout = result.payout || 0;
        
        if (success) {
          console.log('✅ Custodial cashout successful:', result);
          
          const winAmount = payout - activeBet.amount;
          const currentMultiplier = gameState.activeCurrentMultiplier;
          
          toast.success(`Cashed out at ${currentMultiplier.toFixed(2)}x! Win: +${winAmount.toFixed(3)} SOL`);
          
          setActiveBet(null);
          
          setTimeout(() => {
            updateCustodialBalance();
          }, 100);
          
        } else {
          console.error('❌ Custodial cashout failed:', result.reason);
          setServerError(result.reason || 'Cashout failed');
          toast.error(result.reason || 'Cashout failed');
          setActiveBet(null);
        }
      } else {
        try {
          const cashoutResult = await Promise.race([
            cashOut(walletAddress),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('timeout')), 10000);
            })
          ]);
          
          success = cashoutResult.success || false;
          payout = cashoutResult.payout || 0;
          
          if (success) {
            const winAmount = payout - activeBet.amount;
            const currentMultiplier = gameState.activeCurrentMultiplier;
            
            toast.success(`Cashed out at ${currentMultiplier.toFixed(2)}x! Win: +${winAmount.toFixed(0)} RUGGED`);
            
            setActiveBet(null);
            
            setTimeout(() => {
              updateRuggedBalance();
            }, 100);
          }
        } catch (error) {
          console.error('❌ RUGGED cashout error:', error);
          success = false;
          setActiveBet(null);
        }
      }
  
      if (!success && activeBet) {
        console.log('⚠️ Cashout failed but clearing active bet to prevent stuck state');
        setActiveBet(null);
      }
  
      if (success && onSell) {
        onSell(100);
      }
  
    } catch (error) {
      console.error('❌ Error cashing out:', error);
      setServerError('Failed to RUG');
      toast.error('Failed to RUG');
      setActiveBet(null);
    } finally {
      clearTimeout(operationTimeout);
      setIsCashingOut(false);
      setOperationTimeouts(prev => {
        const newSet = new Set(prev);
        newSet.delete('cashout');
        return newSet;
      });
    }
  }, [authenticated, walletAddress, isConnected, activeBet, userId, isCashingOut, operationTimeouts, custodialCashOut, cashOut, gameState.activeCurrentMultiplier, onSell, updateCustodialBalance, updateRuggedBalance]);
  
  // Auto transfer function with stable dependencies
  const autoTransferToGameBalance = useCallback(async (amount: number) => {
    if (!embeddedWallet || !walletAddress || !userId) {
      toast.error('Wallet not ready for transfer');
      return false;
    }

    if (amount <= 0 || amount > embeddedWalletBalance) {
      toast.error(`Invalid amount. Available: ${embeddedWalletBalance.toFixed(3)} SOL`);
      return false;
    }

    console.log('🚀 Starting auto-transfer:', { amount, from: walletAddress, to: HOUSE_WALLET });
    
    try {
      toast.loading('Transferring SOL to game balance...', { id: 'transfer' });
      
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVzzNb_M2I0WQ0b85sYoNEYx'
      );
      
      const fromPubkey = new PublicKey(walletAddress);
      const toPubkey = new PublicKey(HOUSE_WALLET);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      const { blockhash } = await connection.getLatestBlockhash();
      
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey
      }).add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports
        })
      );
      
      const signature = await embeddedWallet.sendTransaction(transaction, connection); 
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      toast.success(`Transferred ${amount} SOL to game balance!`, { id: 'transfer' });
      
      // Manual credit trigger
      try {
        const manualCredit = await fetch('/api/custodial/balance/' + userId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'credit',
            amount: amount,
            source: 'embedded_wallet_transfer',
            transactionId: signature
          })
        });
      } catch (error) {
        console.log('⚠️ Manual credit failed:', error);
      }
      
      // Refresh balances
      setTimeout(() => {
        try {
          updateCustodialBalance();
        } catch (error) {
          console.warn('⚠️ Balance update failed:', error);
        }
      }, 2000);
      
      return true;
      
    } catch (error) {
      console.error('❌ Auto-transfer failed:', error);
      
      let errorMessage = 'Transfer failed';
      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = 'Transfer cancelled by user';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient SOL for transfer + fees';
        } else {
          errorMessage = `Transfer failed: ${error.message}`;
        }
      }
      
      toast.error(errorMessage, { id: 'transfer' });
      return false;
    }
  }, [embeddedWallet, walletAddress, userId, embeddedWalletBalance]); // Removed function dependency

  // 🔧 FIXED: Better connection recovery
  useEffect(() => {
    if (!isConnected && isCashingOut) {
      setIsCashingOut(false);
      setServerError('Connection lost during cashout');
      toast.error('Connection lost - please try cashing out again');
    }
  }, [isConnected, isCashingOut]);

  // 🔧 DEBUG: Log active bet state changes
  useEffect(() => {
    if (activeBet) {
      console.log('🎯 Active bet state changed:', {
        id: activeBet.id,
        amount: activeBet.amount,
        entryMultiplier: activeBet.entryMultiplier,
        tokenType: activeBet.tokenType,
        timestamp: new Date(activeBet.timestamp).toISOString()
      });
    } else {
      console.log('🗑️ Active bet cleared - buttons should show BUY state');
    }
  }, [activeBet]);

  // 🔧 FIXED: Auto cashout effect with better condition checking
  useEffect(() => {
    if (
      activeBet && 
      gameState.activeIsGameActive && 
      autoCashoutEnabled && 
      parseFloat(autoCashoutValue) > 0 &&
      gameState.activeCurrentMultiplier >= parseFloat(autoCashoutValue) &&
      gameState.gameStatus === 'active' &&
      !isCashingOut // Prevent multiple triggers
    ) {
      console.log('Auto cashout triggered at', gameState.activeCurrentMultiplier, 'x');
      handleCashout();
    }
  }, [gameState.activeCurrentMultiplier, autoCashoutEnabled, autoCashoutValue, activeBet, gameState.activeIsGameActive, gameState.gameStatus, handleCashout, isCashingOut]);
  
  useEffect(() => {
    // Clear active bet if game is not active and we have a bet
    if (activeBet && gameState.gameStatus !== 'active') {
      console.log(`🔄 Game status changed to ${gameState.gameStatus}, clearing active bet`);
      setActiveBet(null);
    }
  }, [gameState.gameStatus, activeBet]);

  useEffect(() => {
    if (activeBet) {
      // Clear bet after 5 minutes if it's still active (safety net for stuck states)
      const timeout = setTimeout(() => {
        console.log('⏰ Clearing stuck active bet after timeout');
        setActiveBet(null);
      }, 5 * 60 * 1000); // 5 minutes
  
      return () => clearTimeout(timeout);
    }
  }, [activeBet]);


  // Handle amount change
  const handleAmountChange = useCallback((value: string) => {
    const pattern = currentToken === TokenType.SOL 
      ? /^(\d+)?(\.\d{0,6})?$/ 
      : /^\d*$/;
    
    if (pattern.test(value) || value === '') {
      setAmount(value);
      if (value !== '') {
        setSavedAmount(value);
      }
    }
  }, [currentToken, setSavedAmount]);

  // Quick amount buttons based on token type
  const quickAmounts = useMemo(() => {
    return currentToken === TokenType.SOL 
      ? [0.01, 0.05, 0.1, 0.5] 
      : [10, 50, 100, 500];
  }, [currentToken]);

  const setQuickAmount = useCallback((amt: number) => {
    const amtStr = amt.toString();
    setAmount(amtStr);
    setSavedAmount(amtStr);
  }, [setSavedAmount]);

  // Handle auto cashout value change
  const handleAutoCashoutValueChange = useCallback((value: string) => {
    if (/^(\d+)?(\.\d{0,2})?$/.test(value) || value === '') {
      setAutoCashoutValue(value);
    }
  }, [setAutoCashoutValue]);

  const setQuickAutoCashoutValue = useCallback((value: number) => {
    setAutoCashoutValue(value.toString());
  }, [setAutoCashoutValue]);

  // 🔧 FIXED: Enhanced bet placement with stable dependencies
  const handleBuy = useCallback(async () => {
    const amountNum = parseFloat(amount);
    
    // Prevent multiple simultaneous attempts
    if (isPlacingBet || operationTimeouts.has('bet')) {
      console.log('⚠️ Bet placement already in progress');
      return;
    }
    
    // Clear previous errors
    setServerError('');
    
    console.log('🎯 Attempting to place buy:', {
      amount: amountNum,
      walletAddress,
      userId,
      gameStatus: gameState.gameStatus,
      isConnected,
      canBet: effectiveCanBet,
      isWaitingPeriod,
      activeBalance,
      currentToken
    });
    
    // Enhanced validation
    if (isNaN(amountNum) || amountNum <= 0) {
      setServerError('Invalid amount');
      toast.error('Invalid amount');
      return;
    }
    
    const minBetAmount = currentToken === TokenType.SOL ? 0.001 : 1;
    const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
    
    if (amountNum < minBetAmount) {
      setServerError(`Minimum bet: ${minBetAmount} ${currentToken}`);
      toast.error(`Minimum bet: ${minBetAmount} ${currentToken}`);
      return;
    }
    
    if (amountNum > maxBetAmount) {
      setServerError(`Maximum bet: ${maxBetAmount} ${currentToken}`);
      toast.error(`Maximum bet: ${maxBetAmount} ${currentToken}`);
      return;
    }
    
    if (!isWalletReady || !isConnected) {
      setServerError('Please login to play');
      toast.error('Please login to play');
      return;
    }
    
    if (!gameState.activeIsGameActive) {
      setServerError('Game is not available');
      toast.error('Game is not available');
      return;
    }
    
    if (isWaitingPeriod && !effectiveCanBet) {
      setServerError('Game starting now!');
      toast.error('Game starting now!');
      return;
    }

    if (amountNum > activeBalance) {
      setServerError('Insufficient balance');
      toast.error('Insufficient balance');
      return;
    }

    console.log('✅ All validations passed, placing bet...');
    
    setIsPlacingBet(true);
    setOperationTimeouts(prev => new Set(prev).add('bet'));
    
    // Add operation timeout
    const operationTimeout = setTimeout(() => {
      console.log('⏰ Bet placement timeout reached');
      setIsPlacingBet(false);
      setOperationTimeouts(prev => {
        const newSet = new Set(prev);
        newSet.delete('bet');
        return newSet;
      });
      setServerError('Bet placement timed out');
      toast.error('Bet placement timed out - please try again');
    }, 15000);
    // 🔧 FIXED: Add null check for userId before calling placeCustodialBet
// 🔧 FIXED: Add null check for userId before calling placeCustodialBet
try {
  let success = false;
  let entryMultiplier = gameState.gameStatus === 'waiting' ? 1.0 : gameState.activeCurrentMultiplier;

  if (currentToken === TokenType.SOL) {
    console.log('📡 Using placeCustodialBet hook method...');
    
    // ✅ FIXED: Add null check for userId
    if (!userId) {
      throw new Error('User ID not available');
    }
    
    // ✅ FIXED: Use the hook method with confirmed non-null userId
    success = await placeCustodialBet(userId, amountNum);
    
    if (success) {
      console.log('✅ Custodial bet placed successfully via hook');
      
      // FIXED: Create and set active bet immediately
      const newBet: ActiveBet = {
        id: `custodial_bet_${Date.now()}`,
        amount: amountNum,
        entryMultiplier,
        timestamp: Date.now(),
        gameId: gameState.activeCurrentGame?.id || 'unknown',
        tokenType: currentToken
      };
      
      setActiveBet(newBet);
      console.log('✅ Active bet set:', newBet);
      
      // Update balance immediately
      try {
        updateCustodialBalance();
      } catch (error) {
        console.warn('⚠️ Balance update failed:', error);
      }
    } else {
      console.error('❌ Custodial bet failed');
      setServerError('Failed to place custodial bet');
      toast.error('Failed to place bet');
    }
  } else {
    // Use existing RUGGED token betting
    console.log('📡 Using RUGGED token betting system...');
    success = await placeBet(walletAddress, amountNum, userId || undefined);
    
    if (success) {
      // Create and set active bet for RUGGED tokens
      const newBet: ActiveBet = {
        id: `rugged_bet_${Date.now()}`,
        amount: amountNum,
        entryMultiplier,
        timestamp: Date.now(),
        gameId: gameState.activeCurrentGame?.id || 'unknown',
        tokenType: currentToken
      };
      
      setActiveBet(newBet);
      try {
        updateRuggedBalance();
      } catch (error) {
        console.warn('⚠️ Balance update failed:', error);
      }
    }
  }
  
  if (success) {
    console.log('✅ Bet placed successfully - Entry:', entryMultiplier.toFixed(2) + 'x');
    
    const betType = gameState.gameStatus === 'waiting' ? 'Pre-game bet' : 'Bet';
    const tokenDisplay = currentToken === TokenType.SOL ? 'SOL (game balance)' : 'RUGGED tokens';
    toast.success(`${betType} placed: ${amountNum} ${tokenDisplay} (Entry: ${entryMultiplier.toFixed(2)}x)`);
    
    if (onBuy) onBuy(amountNum);
  } else if (!serverError) {
    const errorMsg = 'Failed to place buy - server returned false';
    setServerError(errorMsg);
    toast.error(errorMsg);
  }
} catch (error) {
  console.error('❌ Error placing bet:', error);
  const errorMsg = `Failed to place buy: ${error instanceof Error ? error.message : 'Unknown error'}`;
  setServerError(errorMsg);
  toast.error(errorMsg);
} finally {
  // ✅ FIXED: Remove the extra closing brace - finally belongs to the same try-catch
  clearTimeout(operationTimeout);
  setIsPlacingBet(false);
  setOperationTimeouts(prev => {
    const newSet = new Set(prev);
    newSet.delete('bet');
    return newSet;
  });
  
  console.log('🏁 Bet placement process completed');
}
}, [
amount, 
currentToken, 
activeBalance, 
isWalletReady, 
isConnected, 
gameState,
isWaitingPeriod, 
effectiveCanBet, 
userId, 
walletAddress, 
placeBet,
placeCustodialBet, // ✅ ADD THIS LINE
onBuy,
isPlacingBet,
operationTimeouts,
serverError
]); // Now includes placeCustodialBet dependency

  // Quick transfer amounts
  const quickTransferAmounts = [0.001, 0.01, 0.05, 0.1];

  const handleQuickTransfer = useCallback(async (amount: number) => {
    const success = await autoTransferToGameBalance(amount);
    if (success) {
      console.log(`✅ Quick transfer of ${amount} SOL completed`);
    }
  }, [autoTransferToGameBalance]); // Now autoTransferToGameBalance is stable

  // Render the component with optimized structure
  if (isMobile) {
    return (
      <div className={containerClasses}>
        <CompactGameInfo
          game={gameState.activeCurrentGame}
          countdown={countdown || 0}
          showCountdown={gameState.showCountdown}
          isConnected={isConnected}
          isMobile={isMobile}
        />

        {activeBet && (
          <div className="bg-blue-900 bg-opacity-30 p-3 rounded-lg mb-3">
            <div className="text-center">
              <div className="text-sm text-blue-400 mb-1">Active Buy</div>
              <div className="text-lg font-bold text-blue-300">
                {activeBet.amount} {activeBet.tokenType || 'SOL'} @ {activeBet.entryMultiplier.toFixed(2)}x
              </div>
              <div className="text-sm mt-1 text-green-400">
                Current: {gameState.activeCurrentMultiplier.toFixed(2)}x
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-900 bg-opacity-50 rounded-lg p-3 mb-3">
          <BettingSection
            activeBet={activeBet}
            amount={amount}
            onAmountChange={handleAmountChange}
            onQuickAmount={setQuickAmount}
            onPlaceBet={handleBuy}
            onCashout={handleCashout}
            quickAmounts={quickAmounts}
            currentToken={currentToken}
            activeBalance={activeBalance}
            isPlacingBet={isPlacingBet}
            isCashingOut={isCashingOut}
            isWalletReady={isWalletReady}
            canBet={effectiveCanBet}
            isWaitingPeriod={isWaitingPeriod}
            gameStatus={gameState.gameStatus}
            isConnected={isConnected}
            currentMultiplier={gameState.activeCurrentMultiplier}
            isMobile={isMobile}
            betValidationError={betValidationError}
          />
        </div>

        <BalanceDisplay
  currentToken={currentToken}
  custodialBalance={custodialBalance}
  embeddedWalletBalance={embeddedWalletBalance}
  ruggedBalance={ruggedBalance}
  onTokenChange={handleTokenChange}
  onDepositClick={() => setShowDepositModal(true)}
  onWithdrawClick={() => setShowWithdrawModal(true)}
  onAirdropClick={() => setShowAirdropModal(true)}
  isMobile={isMobile}
  showExpanded={showBalanceExpanded}
  onToggleExpanded={() => setShowBalanceExpanded(!showBalanceExpanded)}
  isLoading={custodialBalanceLoading || embeddedWalletLoading || ruggedBalanceLoading}
  onRefresh={refreshAllBalances} // 🔧 ADD THIS LINE
/>

        {/* Quick Transfer Section */}
        {currentToken === TokenType.SOL && embeddedWalletBalance > 0.001 && (
          <div className="bg-purple-900 bg-opacity-30 border border-purple-800 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-purple-400 text-sm font-medium">💰 Quick Transfer</div>
                <div className="text-xs text-gray-400">Move SOL from wallet to game balance</div>
              </div>
              <div className="text-xs text-purple-300">
                Available: {embeddedWalletBalance.toFixed(3)} SOL
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-1">
              {quickTransferAmounts.map((transferAmount) => (
                <button
                  key={transferAmount}
                  onClick={() => handleQuickTransfer(transferAmount)}
                  disabled={transferAmount > embeddedWalletBalance}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    transferAmount > embeddedWalletBalance
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {transferAmount} SOL
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status Messages */}
        {(serverError || !isWalletReady || !isConnected) && (
          <div className="mt-2">
            <div className="text-red-400 text-xs flex items-center">
              <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
              <span>
                {serverError || (!isWalletReady ? 'Login to play' : 'Connecting...')}
              </span>
            </div>
          </div>
        )}

        {/* Modals */}
        <AirdropModal 
          isOpen={showAirdropModal}
          onClose={() => setShowAirdropModal(false)}
        />
        
        <DepositModal 
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          currentToken={currentToken}
          walletAddress={walletAddress}
          userId={userId}
        />
        
        <WithdrawModal 
          isOpen={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          currentToken={currentToken}
          balance={activeBalance}
          walletAddress={walletAddress}
          userId={userId}
        />
      </div>
    );
  }

  // Desktop layout (similar optimizations applied)
  return (
    <div className={containerClasses}>
      <CompactGameInfo
        game={gameState.activeCurrentGame}
        countdown={countdown || 0}
        showCountdown={gameState.showCountdown}
        isConnected={isConnected}
        isMobile={isMobile}
      />

<BalanceDisplay
  currentToken={currentToken}
  custodialBalance={custodialBalance}
  embeddedWalletBalance={embeddedWalletBalance}
  ruggedBalance={ruggedBalance}
  onTokenChange={handleTokenChange}
  onDepositClick={() => setShowDepositModal(true)}
  onWithdrawClick={() => setShowWithdrawModal(true)}
  onAirdropClick={() => setShowAirdropModal(true)}
  isMobile={isMobile}
  showExpanded={showBalanceExpanded}
  onToggleExpanded={() => setShowBalanceExpanded(!showBalanceExpanded)}
  isLoading={custodialBalanceLoading || embeddedWalletLoading || ruggedBalanceLoading}
  onRefresh={refreshAllBalances} // 🔧 ADD THIS LINE
/>

      {/* Quick Transfer Section - Desktop */}
      {currentToken === TokenType.SOL && embeddedWalletBalance > 0.001 && (
        <div className="bg-purple-900 bg-opacity-30 border border-purple-800 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-purple-400 text-sm font-medium">💰 Quick Transfer</div>
              <div className="text-xs text-gray-400">Move SOL from wallet to game balance</div>
            </div>
            <div className="text-xs text-purple-300">
              Available: {embeddedWalletBalance.toFixed(3)} SOL
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {quickTransferAmounts.map((transferAmount) => (
              <button
                key={transferAmount}
                onClick={() => handleQuickTransfer(transferAmount)}
                disabled={transferAmount > embeddedWalletBalance}
                className={`px-3 py-2 text-sm rounded transition-colors flex items-center justify-center ${
                  transferAmount > embeddedWalletBalance
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 mr-1" />
                Transfer {transferAmount} SOL
              </button>
            ))}
          </div>
        </div>
      )}

      {activeBet && (
        <div className="bg-blue-900 bg-opacity-30 p-3 rounded-lg mb-3">
          <div className="text-center">
            <div className="text-sm text-blue-400 mb-1">Active Buy</div>
            <div className="text-lg font-bold text-blue-300">
              {activeBet.amount} {activeBet.tokenType || 'SOL'} @ {activeBet.entryMultiplier.toFixed(2)}x
            </div>
            <div className="text-sm mt-1 text-green-400">
              Current: {gameState.activeCurrentMultiplier.toFixed(2)}x
            </div>
          </div>
        </div>
      )}

      <BettingSection
        activeBet={activeBet}
        amount={amount}
        onAmountChange={handleAmountChange}
        onQuickAmount={setQuickAmount}
        onPlaceBet={handleBuy}
        onCashout={handleCashout}
        quickAmounts={quickAmounts}
        currentToken={currentToken}
        activeBalance={activeBalance}
        isPlacingBet={isPlacingBet}
        isCashingOut={isCashingOut}
        isWalletReady={isWalletReady}
        canBet={effectiveCanBet}
        isWaitingPeriod={isWaitingPeriod}
        gameStatus={gameState.gameStatus}
        isConnected={isConnected}
        currentMultiplier={gameState.activeCurrentMultiplier}
        isMobile={isMobile}
        betValidationError={betValidationError}
      />

      {/* Status Messages */}
      {(serverError || !isWalletReady || !isConnected) && (
        <div className="mt-2">
          <div className="text-red-400 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>
              {serverError || (!isWalletReady ? 'Login to play' : 'Connecting...')}
            </span>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAirdropModal && (
        <AirdropModal 
          isOpen={showAirdropModal}
          onClose={() => setShowAirdropModal(false)}
        />
      )}
      
      {showDepositModal && (
        <DepositModal 
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          currentToken={currentToken}
          walletAddress={walletAddress}
          userId={userId}
        />
      )}
      
      {showWithdrawModal && (
        <WithdrawModal 
          isOpen={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          currentToken={currentToken}
          balance={activeBalance}
          walletAddress={walletAddress}
          userId={userId}
        />
      )}
    </div>
  );
};

export default TradingControls;
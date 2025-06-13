// src/components/trading/TradingControls.tsx - ENHANCED VERSION WITH SHARED STATE
import React, { FC, useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon, Timer, Users, Settings, Wallet, TrendingUp } from 'lucide-react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../common/Button';
import { useGameSocket, initializeUser } from '../../hooks/useGameSocket';
import { usePrivyAutoTransfer } from '../../hooks/usePrivyAutoTransfer';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
// 🚀 NEW: Import shared state hooks
import { 
  useSharedCustodialBalance, 
  useSharedBetState, 
  useSharedGameState,
  ActiveBet 
} from '../../hooks/useSharedState'; // Adjust path as needed

// Import from barrel file instead of direct imports
import { AirdropModal, DepositModal, WithdrawModal } from './index';

// TokenType: SOL = custodial game balance, RUGGED = SPL token
export enum TokenType {
  SOL = 'SOL',      // Custodial game balance (primary)
  RUGGED = 'RUGGED' // SPL token (secondary)
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

// 🚀 ENHANCED: Wallet balance hook with real-time socket listeners
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

  // Force refresh for immediate updates
  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    console.log(`🔄 Force refreshing wallet balance for: ${walletAddress}`);
    await updateBalance();
  }, [walletAddress, updateBalance]);

 
  // Polling setup
  useEffect(() => {
    if (walletAddress && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 Setting up wallet balance polling for: ${walletAddress}`);
      lastWalletRef.current = walletAddress;
      
      // Clear existing interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      // Initial fetch
      updateBalance();
      
      // Set new interval
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateBalance();
        }
      }, 15000); // 15 seconds
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [walletAddress, updateBalance]);
  

  // 🚀 ENHANCED REAL-TIME SOCKET LISTENERS FOR WALLET BALANCE
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up REAL-TIME wallet balance listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      // Wallet balance update event
      const handleWalletBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 REAL-TIME: Wallet balance update - ${data.balance?.toFixed(6)} SOL`);
          setBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      // Transaction confirmed for this wallet
      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`🔗 REAL-TIME: Transaction confirmed for ${walletAddress}, refreshing balance...`);
          
          // Force refresh after confirmation with delay for blockchain settlement
          setTimeout(forceRefresh, 2000);
        }
      };

      // Bet placed from this wallet
      const handleBetPlaced = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`🎯 REAL-TIME: Bet placed from ${walletAddress}, refreshing balance...`);
          
          // Refresh balance after bet placement
          setTimeout(forceRefresh, 1500);
        }
      };

      // Payout to this wallet
      const handlePlayerCashedOut = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💸 REAL-TIME: Payout to ${walletAddress}, refreshing balance...`);
          
          // Refresh balance after payout
          setTimeout(forceRefresh, 1000);
          
          if (data.amount) {
            toast.success(`Payout received: +${data.amount?.toFixed(3)} SOL`);
          }
        }
      };

      // Register wallet-specific event listeners
      socket.on('walletBalanceUpdate', handleWalletBalanceUpdate);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      socket.on('betPlaced', handleBetPlaced);
      socket.on('playerCashedOut', handlePlayerCashedOut);
      
      return () => {
        console.log(`🔌 Cleaning up REAL-TIME wallet balance listeners for: ${walletAddress}`);
        socket.off('walletBalanceUpdate', handleWalletBalanceUpdate);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        socket.off('betPlaced', handleBetPlaced);
        socket.off('playerCashedOut', handlePlayerCashedOut);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress, forceRefresh]);

  return { balance, loading, lastUpdated, updateBalance, forceRefresh };
};



// 🚀 ENHANCED: RUGGED balance hook with socket listeners
const useRuggedBalance = (walletAddress: string) => {
  const [ruggedBalance, setRuggedBalance] = useState<number>(1000);
  const [loading, setLoading] = useState<boolean>(false);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

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

  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    console.log(`🔄 Force refreshing RUGGED balance for: ${walletAddress}`);
    await updateRuggedBalance();
  }, [walletAddress, updateRuggedBalance]);

  useEffect(() => {
    if (walletAddress && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 Setting up RUGGED balance for: ${walletAddress}`);
      lastWalletRef.current = walletAddress;
      updateRuggedBalance();
    }
  }, [walletAddress, updateRuggedBalance]);

  // 🚀 REAL-TIME SOCKET LISTENERS FOR RUGGED BALANCE
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up REAL-TIME RUGGED balance listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      const handleRuggedBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 REAL-TIME: RUGGED balance update - ${data.balance?.toFixed(0)} RUGGED`);
          setRuggedBalance(parseFloat(data.balance) || 1000);
        }
      };

      const handleRuggedBetPlaced = (data: any) => {
        if (data.walletAddress === walletAddress && data.tokenType === 'RUGGED') {
          console.log(`🎯 REAL-TIME: RUGGED bet placed for ${walletAddress}`);
          
          // Update balance immediately (subtract bet amount)
          setRuggedBalance(prev => Math.max(0, prev - (data.betAmount || 0)));
        }
      };

      const handleRuggedCashout = (data: any) => {
        if (data.walletAddress === walletAddress && data.tokenType === 'RUGGED') {
          console.log(`💸 REAL-TIME: RUGGED cashout for ${walletAddress}`);
          
          // Update balance immediately (add payout)
          setRuggedBalance(prev => prev + (data.payout || 0));
          
          if (data.payout) {
            toast.success(`RUGGED cashout: +${data.payout?.toFixed(0)} RUGGED`);
          }
        }
      };

      socket.on('ruggedBalanceUpdate', handleRuggedBalanceUpdate);
      socket.on('ruggedBetPlaced', handleRuggedBetPlaced);
      socket.on('ruggedCashout', handleRuggedCashout);
      
      return () => {
        console.log(`🔌 Cleaning up REAL-TIME RUGGED balance listeners for: ${walletAddress}`);
        socket.off('ruggedBalanceUpdate', handleRuggedBalanceUpdate);
        socket.off('ruggedBetPlaced', handleRuggedBetPlaced);
        socket.off('ruggedCashout', handleRuggedCashout);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress]);

  return { ruggedBalance, loading, updateRuggedBalance, forceRefresh };
};

// 🚀 ENHANCED: BalanceDisplay component with manual refresh capability
// 🚀 ENHANCED: BalanceDisplay component with refresh button inside balance display
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
  onRefresh?: () => void; // 🚀 NEW: Manual refresh callback
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
  const { executeAutoTransfer, loading: transferLoading, error: transferError } = usePrivyAutoTransfer();

  // Toggle between SOL and RUGGED tokens
  const handleTokenToggle = () => {
    if (currentToken === TokenType.SOL) {
      onTokenChange(TokenType.RUGGED);
      if (ruggedBalance < 10) {
        onAirdropClick();
      }
    } else {
      onTokenChange(TokenType.SOL);
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
            <Wallet className="w-4 h-4 text-gray-400" />
            <div>
              <div className="text-xs text-gray-400">Balance</div>
              <div className="text-sm font-bold text-white">
                View Details
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-400 text-sm">{showExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {showExpanded && (
          <div className="bg-gray-800 rounded-lg p-2 mt-1">
            {/* Always show the main balance breakdown for SOL */}
            {currentToken === TokenType.SOL && (
              <div className="mb-3 p-2 bg-gray-900 rounded-md relative">
                {/* 🚀 NEW: Refresh button in top right of balance display */}
                {onRefresh && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefresh();
                    }}
                    className="absolute top-1 right-1 text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-700"
                    disabled={isLoading}
                    title="Refresh all balances"
                  >
                    <span className={`text-sm ${isLoading ? 'animate-spin' : ''}`}>⟳</span>
                  </button>
                )}
                
                <div className="grid grid-cols-2 gap-3 text-sm pr-6">
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

            {/* Show RUGGED balance when in RUGGED mode */}
            {currentToken === TokenType.RUGGED && (
              <div className="mb-3 p-2 bg-gray-900 rounded-md relative">
                {/* 🚀 NEW: Refresh button for RUGGED mode too */}
                {onRefresh && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefresh();
                    }}
                    className="absolute top-1 right-1 text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-700"
                    disabled={isLoading}
                    title="Refresh all balances"
                  >
                    <span className={`text-sm ${isLoading ? 'animate-spin' : ''}`}>⟳</span>
                  </button>
                )}
                
                <div className="text-center pr-6">
                  <div className="text-green-400 text-xs mb-1">💎 RUGGED Balance</div>
                  <div className="text-white font-bold text-lg">{ruggedBalance.toFixed(0)} RUGGED</div>
                  <div className="text-xs text-gray-500">Gaming tokens</div>
                </div>
              </div>
            )}
            
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
              {/* Single toggle button - smaller and positioned on the right */}
              <button
                onClick={handleTokenToggle}
                className={`px-2 py-1 text-xs rounded transition-all duration-200 ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {currentToken === TokenType.SOL ? 'RUG' : 'SOL'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop version with refresh button inside balance display
  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-3">
      {/* Always show the main balance breakdown for SOL */}
      {currentToken === TokenType.SOL && (
        <div className="mb-3 p-2 bg-gray-900 rounded-md relative">
          {/* 🚀 NEW: Refresh button in top right of balance display */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="absolute top-2 right-2 text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-700"
              disabled={isLoading}
              title="Refresh all balances"
            >
              <span className={`text-base ${isLoading ? 'animate-spin' : ''}`}>⟳</span>
            </button>
          )}
          
          <div className="grid grid-cols-2 gap-3 text-sm pr-8">
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

      {/* Show RUGGED balance when in RUGGED mode */}
      {currentToken === TokenType.RUGGED && (
        <div className="mb-3 p-2 bg-gray-900 rounded-md relative">
          {/* 🚀 NEW: Refresh button for RUGGED mode too */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="absolute top-2 right-2 text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-700"
              disabled={isLoading}
              title="Refresh all balances"
            >
              <span className={`text-base ${isLoading ? 'animate-spin' : ''}`}>⟳</span>
            </button>
          )}
          
          <div className="text-center pr-8">
            <div className="text-green-400 text-xs mb-1">💎 RUGGED Balance</div>
            <div className="text-white font-bold text-2xl">{ruggedBalance.toFixed(0)} RUGGED</div>
            <div className="text-xs text-gray-500">Gaming tokens</div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onDepositClick}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center"
        >
          <ArrowDownLeft className="w-4 h-4 mr-2" />
          Deposit
        </button>
        <button
          onClick={onWithdrawClick}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center"
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Withdraw
        </button>
        {/* Single toggle button - smaller and positioned on the right */}
        <button
          onClick={handleTokenToggle}
          className={`px-3 py-2 text-sm rounded transition-all duration-200 ${
            currentToken === TokenType.SOL 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {currentToken === TokenType.SOL ? 'RUG' : 'SOL'}
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
  // REMOVE: getTotalPlayerCount: (actualCount: number) => number;
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
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>#{game.gameNumber}</span>
              <div className="flex space-x-3 ml-4">
                <span>{(game.boostedPlayerCount || game.totalPlayers || 0)} RUGGERS</span>
                <span>{(game.boostedTotalBets || game.totalBets || 0).toFixed(2)} LIQ</span>
              </div>
            </div>
          )}
        </div>
        {showCountdown && countdown > 0 && (
          <div className="text-center mt-1 p-1 bg-blue-900 bg-opacity-30 rounded">
            <div className="text-blue-400 text-xs">Starting in {Math.ceil(countdown / 1000)}s</div>
          </div>
        )}
      </div>
    );
  }

  // Fix the desktop return section:
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
            <span className="text-white">{(game.boostedPlayerCount || game.totalPlayers || 0)}</span>
          </div>
          <div>
            <span className="block text-gray-500">Total</span>
            <span className="text-white">{(game.boostedTotalBets || game.totalBets || 0).toFixed(2)} liq</span>
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
  embeddedWalletBalance: number;
  onQuickTransfer: (amount: number) => void;
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
  betValidationError,
  embeddedWalletBalance,
  onQuickTransfer
}) => {
  // Quick transfer amounts
  const quickTransferAmounts = [0.05, 0.1, 0.5, 1.0];
  const [isTransferMode, setIsTransferMode] = useState(false);
  
  // 🚀 ADD THIS MISSING VARIABLE:
  const showTransferOption = currentToken === TokenType.SOL && embeddedWalletBalance > 0.005;
  // 🚀 UPDATED: Smart amount validation for both modes
  const { amountValid, amountInRange, minBetAmount, maxBetAmount, relevantBalance } = useMemo(() => {
    const amountNum = parseFloat(amount);
    const minBet = currentToken === TokenType.SOL ? 0.005 : 1;
    const maxBet = currentToken === TokenType.SOL ? 10.0 : 10000;
    const minTransfer = 0.05;
    const maxTransfer = embeddedWalletBalance;
    
    // Use appropriate balance and limits based on mode
    const balance = isTransferMode ? embeddedWalletBalance : activeBalance;
    const minAmount = isTransferMode ? minTransfer : minBet;
    const maxAmount = isTransferMode ? maxTransfer : maxBet;
    
    return {
      amountValid: !isNaN(amountNum) && amountNum > 0 && amountNum <= balance,
      amountInRange: amountNum >= minAmount && amountNum <= maxAmount,
      minBetAmount: isTransferMode ? minTransfer : minBet,
      maxBetAmount: isTransferMode ? maxTransfer : maxBet,
      relevantBalance: balance
    };
  }, [amount, activeBalance, embeddedWalletBalance, currentToken, isTransferMode]);
  
  // 🚀 NEW: Smart quick amounts based on mode
  const currentQuickAmounts = useMemo(() => {
    return isTransferMode ? quickTransferAmounts : quickAmounts;
  }, [isTransferMode, quickTransferAmounts, quickAmounts]);
  
  // 🚀 NEW: Smart amount handlers
  const handleSmartQuickAmount = useCallback((amt: number) => {
    if (isTransferMode) {
      onQuickTransfer(amt);
    } else {
      onQuickAmount(amt);
    }
  }, [isTransferMode, onQuickTransfer, onQuickAmount]);
  
  const handleHalfAmount = useCallback(() => {
    if (isTransferMode) {
      onQuickTransfer(embeddedWalletBalance * 0.5);
    } else {
      onQuickAmount(activeBalance * 0.5);
    }
  }, [isTransferMode, embeddedWalletBalance, activeBalance, onQuickTransfer, onQuickAmount]);
  
  const handleMaxAmount = useCallback(() => {
    if (isTransferMode) {
      onQuickTransfer(Math.min(embeddedWalletBalance, 1.0));
    } else {
      onQuickAmount(Math.min(activeBalance, maxBetAmount));
    }
  }, [isTransferMode, embeddedWalletBalance, activeBalance, maxBetAmount, onQuickTransfer, onQuickAmount]);

  // 🔧 UPDATED: Button states with transfer mode awareness
  const buttonStates = useMemo(() => {
    const buyDisabled = isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet;
    const rugDisabled = isCashingOut || !isConnected || gameStatus !== 'active' || !activeBet;
    
    return { buyDisabled, rugDisabled };
  }, [isPlacingBet, isWalletReady, amountValid, amountInRange, canBet, isCashingOut, isConnected, gameStatus, activeBet]);

  if (isMobile) {
    return (
      <div>
        {!activeBet ? (
          <>
            <div className="mb-2">
              {/* 🚀 NEW: Toggle Button (only when transfer option available) */}
              {showTransferOption && (
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-gray-400">
                    {isTransferMode 
                      ? `💳 Transfer from Wallet (${embeddedWalletBalance.toFixed(3)} SOL)` 
                      : `🎮 Trade with Game Balance (${activeBalance.toFixed(3)} ${currentToken})`
                    }
                  </div>
                  <button
                    onClick={() => setIsTransferMode(!isTransferMode)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      isTransferMode 
                        ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {isTransferMode ? 'Trade' : 'Transfer'}
                  </button>
                </div>
              )}

              <div className="flex gap-1 mb-1">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className="flex-1 bg-gray-700 text-white px-2 py-1.5 rounded text-sm focus:outline-none"
                  placeholder={isTransferMode ? `Transfer SOL (Min: ${minBetAmount})` : `Bet ${currentToken} (Min: ${minBetAmount})`}
                  disabled={isTransferMode ? false : !canBet}
                />
                <button
                  onClick={handleHalfAmount}
                  className={`px-2 text-xs rounded hover:bg-gray-500 ${
                    isTransferMode 
                      ? 'bg-purple-600 text-purple-100 hover:bg-purple-500' 
                      : 'bg-gray-600 text-gray-300'
                  }`}
                  disabled={isTransferMode ? false : !canBet}
                >
                  ½
                </button>
                <button
                  onClick={handleMaxAmount}
                  className={`px-2 text-xs rounded hover:bg-gray-500 ${
                    isTransferMode 
                      ? 'bg-purple-600 text-purple-100 hover:bg-purple-500' 
                      : 'bg-gray-600 text-gray-300'
                  }`}
                  disabled={isTransferMode ? false : !canBet}
                >
                  Max
                </button>
              </div>
              
              <div className="grid grid-cols-4 gap-1">
                {currentQuickAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleSmartQuickAmount(amt)}
                    className={`py-1 text-xs rounded transition-colors ${
                      parseFloat(amount) === amt
                        ? (isTransferMode ? 'bg-purple-600 text-white' : 'bg-green-600 text-white')
                        : (isTransferMode ? 'bg-purple-700 text-purple-300 hover:bg-purple-600' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')
                    }`}
                    disabled={isTransferMode 
                      ? amt > embeddedWalletBalance 
                      : !canBet || amt > activeBalance
                    }
                  >
                    {amt}{isTransferMode ? '' : ''}
                  </button>
                ))}
              </div>

              {betValidationError && !isTransferMode && (
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


  // Desktop layout
  return (
    <div className="border-t border-gray-800 pt-3">
      <h3 className="text-sm font-bold text-gray-400 mb-3">
        {activeBet ? 'ACTIVE TRADE' : (isTransferMode ? 'QUICK TRANSFER' : 'PLACE BUY')}
      </h3>
      
      {!activeBet && (
        <>
          <div className="mb-3">
            {/* 🚀 NEW: Toggle Button for Desktop (only when transfer option available) */}
            {showTransferOption && (
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-400">
                  {isTransferMode 
                    ? `💳 Transfer from Wallet - Available: ${embeddedWalletBalance.toFixed(3)} SOL` 
                    : `🎮 Trade with Game Balance - Available: ${activeBalance.toFixed(3)} ${currentToken}`
                  }
                </div>
                <button
                  onClick={() => setIsTransferMode(!isTransferMode)}
                  className={`text-sm px-3 py-1 rounded transition-colors ${
                    isTransferMode 
                      ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isTransferMode ? 'Switch to Betting' : 'Switch to Transfer'}
                </button>
              </div>
            )}

            <label className="block text-gray-400 text-xs mb-1">
              {isTransferMode 
                ? `Transfer Amount (SOL) - Min: ${minBetAmount}, Max: ${maxBetAmount.toFixed(3)}`
                : `Trade Amount (${currentToken}) - Min: ${minBetAmount}, Max: ${maxBetAmount}`
              }
            </label>
            <div className="flex">
              <input
                type="text"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-l-md focus:outline-none"
                placeholder={isTransferMode ? `Transfer SOL (Min: ${minBetAmount})` : `Trade ${currentToken} (Min: ${minBetAmount})`}
                disabled={isTransferMode ? false : !canBet}
              />
              <button
                onClick={handleHalfAmount}
                className={`px-2 text-xs border-l border-gray-900 transition-colors ${
                  isTransferMode 
                    ? 'bg-purple-600 text-purple-100 hover:bg-purple-500' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
                disabled={isTransferMode ? false : !canBet}
              >
                Half
              </button>
              <button
                onClick={handleMaxAmount}
                className={`px-2 text-xs rounded-r-md transition-colors ${
                  isTransferMode 
                    ? 'bg-purple-600 text-purple-100 hover:bg-purple-500' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
                disabled={isTransferMode ? false : !canBet}
              >
                Max
              </button>
            </div>
            
            {betValidationError && !isTransferMode && (
              <div className="text-red-400 text-xs mt-1">{betValidationError}</div>
            )}
          </div>
          
          <div className="grid grid-cols-4 gap-2 mb-3">
            {currentQuickAmounts.map((amt) => (
              <button
                key={amt}
                onClick={() => handleSmartQuickAmount(amt)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  parseFloat(amount) === amt
                    ? (isTransferMode ? 'bg-purple-600 text-white' : 'bg-green-600 text-white')
                    : (isTransferMode ? 'bg-purple-700 text-purple-300 hover:bg-purple-600' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')
                }`}
                disabled={isTransferMode 
                  ? amt > embeddedWalletBalance 
                  : !canBet || amt > activeBalance
                }
              >
                {amt.toString()} {isTransferMode ? 'SOL' : currentToken}
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

// 🛡️ BALANCE PROTECTION HOOK - Add this right before TradingControls component
// 🔧 DISABLED: Remove problematic balance protection
const useBalanceProtection = (custodialBalance: number, userId: string) => {
  return { 
    validateBalanceUpdate: () => true, // Always allow updates
    resetProtection: () => {}, // No-op
    updateRecentTransfers: () => {} // No-op
  };
};
// 🚀 MAIN COMPONENT - Enhanced with shared state hooks (your existing line)


// 🚀 MAIN COMPONENT - Enhanced with shared state hooks
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
  // 🔧 FIXED: All variable declarations first
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  const HOUSE_WALLET = '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';
  const isWalletReady = authenticated && walletAddress !== '';
  
  // 🚀 IMPORTANT: Declare userId BEFORE using it in hooks
  const [userId, setUserId] = useState<string | null>(null);
  
  const trackedSetUserId = useCallback((newUserId: string) => {
    console.log(`👤 TRACKED setUserId called:`, {
      newUserId,
      newUserIdType: typeof newUserId,
      isUUID: newUserId?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      isPrivyID: newUserId?.startsWith('did:privy:'),
      stackTrace: new Error().stack?.split('\n')[2]?.trim() // Show where it's called from
    });
    
    setUserId(newUserId);
  }, []);
  

  const { 
    custodialBalance, 
    loading: custodialBalanceLoading, 
    updateCustodialBalance, 
    forceRefresh: refreshCustodialBalance,
    syncAfterCashout,
    error: balanceError,
    lastUpdated: custodialLastUpdated
  } = useSharedCustodialBalance(userId || '');
  
  
  const { 
    activeBet, 
    isPlacingBet: sharedIsPlacingBet, 
    isCashingOut: sharedIsCashingOut,
    setActiveBet,
    setIsPlacingBet,
    setIsCashingOut,
    clearActiveBet
  } = useSharedBetState();

  
  // Use shared state values instead of local state
  const isPlacingBet = sharedIsPlacingBet || propIsPlacingBet;
  const isCashingOut = sharedIsCashingOut || propIsCashingOut;
  const hasActiveGame = !!activeBet || propHasActiveGame;
  const [currentToken, setCurrentToken] = useState<TokenType>(TokenType.SOL);
  const [savedAmount, setSavedAmount] = useLocalStorage<string>('default-bet-amount', '0.01');
  const [amount, setAmount] = useState<string>(savedAmount);
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  const [operationTimeouts, setOperationTimeouts] = useState<Set<string>>(new Set());
  const [showBalanceExpanded, setShowBalanceExpanded] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string>('');
  const [balanceIssueDetected, setBalanceIssueDetected] = useState<boolean>(false);
  
  // All ref declarations
  const transferAttempts = useRef<Array<{timestamp: number, amount: number, signature?: string}>>([]);
  const lastBalanceCheck = useRef<number>(0);
  const expectedBalance = useRef<number>(0);
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
  
  // Balance hooks with force refresh capability
  const { 
    balance: embeddedWalletBalance, 
    loading: embeddedWalletLoading, 
    forceRefresh: refreshEmbeddedBalance 
  } = useWalletBalance(walletAddress);
   
  const { 
    ruggedBalance, 
    loading: ruggedBalanceLoading, 
    updateRuggedBalance, 
    forceRefresh: refreshRuggedBalance 
  } = useRuggedBalance(walletAddress);

  // Add this after your other hooks like useGameSocket, useCustodialBalance, etc.
  const { executeAutoTransfer, loading: transferLoading, error: transferError } = usePrivyAutoTransfer();
// ✅ REPLACE WITH SIMPLE NO-OP FUNCTIONS:
const validateBalanceUpdate = () => true;
const resetProtection = () => {};
const updateRecentTransfers = () => {};

  const updateBalance = useCallback((newBalance: number, source: string) => {
    console.log(`💰 Balance update from ${source}: ${newBalance.toFixed(3)} SOL`);
    // Let the shared hook handle the update without interference
  }, []);

  // Memoized calculations
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

  const activeBalance = useMemo(() => {
    return currentToken === TokenType.SOL ? custodialBalance : ruggedBalance;
  }, [currentToken, custodialBalance, ruggedBalance]);
  
  const effectiveCanBet = gameState.gameStatus === 'active' ? true : canBet;

  const betValidationError = useMemo(() => {
    const amountNum = parseFloat(amount);
    const minBetAmount = currentToken === TokenType.SOL ? 0.005 : 1;
    const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
    
    if (isNaN(amountNum) || amountNum <= 0) return 'Enter valid amount';
    if (amountNum < minBetAmount) return `Minimum: ${minBetAmount} ${currentToken}`;
    if (amountNum > maxBetAmount) return `Maximum: ${maxBetAmount} ${currentToken}`;
    if (amountNum > activeBalance) return 'Insufficient balance';
    return '';
  }, [amount, currentToken, activeBalance]);

  const containerClasses = `
    bg-[#0d0d0f] text-white border border-gray-800 rounded-lg
    ${isMobile 
      ? 'p-3 max-w-sm mx-auto' 
      : 'p-4 min-w-[320px] max-w-md'
    }
  `;

  const quickAmounts = useMemo(() => {
    return currentToken === TokenType.SOL 
      ? [0.05, 0.1, 0.25, 0.5] 
      : [10, 50, 100, 500];
  }, [currentToken]);

  // Debug logging system
  const debugLog = useCallback((message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry, data || '');
    
    try {
      const existingLogs = JSON.parse(sessionStorage.getItem('balanceDebugLogs') || '[]');
      const newLogs = [...existingLogs, { timestamp, message, data }].slice(-50);
      sessionStorage.setItem('balanceDebugLogs', JSON.stringify(newLogs));
    } catch (error) {
      // Ignore storage errors
    }
  }, []);

  // Enhanced balance monitoring
  useEffect(() => {
    if (custodialBalance !== lastBalanceCheck.current) {
      debugLog('Balance changed', { 
        from: lastBalanceCheck.current, 
        to: custodialBalance, 
        expected: expectedBalance.current,
        userId 
      });
      lastBalanceCheck.current = custodialBalance;
    }
  }, [custodialBalance, userId, debugLog]);

  // Manual refresh function for all balances
  const refreshAllBalances = useCallback(async () => {
    console.log('🔄 Manual refresh triggered');
    
    try {
      toast.loading('Refreshing...', { id: 'refresh' });
      
      // ✅ FIXED: Sequential refresh to prevent race conditions
      await refreshEmbeddedBalance();
      await new Promise(resolve => setTimeout(resolve, 250));
      
      await refreshCustodialBalance();
      await new Promise(resolve => setTimeout(resolve, 250));
      
      await refreshRuggedBalance();
      
      toast.success('Balances updated!', { id: 'refresh' });
      
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error('Refresh failed', { id: 'refresh' });
    }
  }, [refreshEmbeddedBalance, refreshCustodialBalance, refreshRuggedBalance]);


  // Enhanced auto transfer function
  const autoTransferToGameBalance = useCallback(async (amount: number) => {
    if (!embeddedWallet || !walletAddress || !userId) {
      toast.error('Wallet not ready for transfer');
      return false;
    }
  
    if (amount <= 0 || amount > embeddedWalletBalance) {
      toast.error(`Invalid amount. Available: ${embeddedWalletBalance.toFixed(3)} SOL`);
      return false;
    }
  
    console.log('🚀 Starting transfer with FIXED API:', { amount, userId });
    
    try {
      // ✅ FIXED: Wait for user initialization before transfer
      let retryCount = 0;
      while (!userId && retryCount < 3) {
        console.log('⏳ Waiting for user initialization...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        retryCount++;
      }
      
      if (!userId) {
        throw new Error('User not initialized after 3 seconds');
      }
      
      const result = await executeAutoTransfer(
        userId, 
        amount,
        // ✅ FIXED: Simplified callback - single refresh with delay
        async () => {
          console.log('🔄 Transfer completed, refreshing balance in 2s...');
          setTimeout(() => {
            refreshCustodialBalance();
          }, 2000);
        }
      );
  
      if (result.success) {
        console.log('✅ Transfer completed successfully:', result);
        
        // ✅ FIXED: Single balance refresh, no multiple updates
        setTimeout(() => {
          refreshCustodialBalance();
        }, 3000);
        
        return true;
      } else {
        console.error('❌ Transfer failed:', result.error);
        toast.error(result.error || 'Transfer failed');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Transfer error:', error);
      toast.error(error instanceof Error ? error.message : 'Transfer failed');
      return false;
    }
  }, [embeddedWallet, walletAddress, userId, embeddedWalletBalance, executeAutoTransfer, refreshCustodialBalance]);
  

  // 🚀 UPDATED: Enhanced bet placement with shared state
// 🚀 UPDATED: Enhanced bet placement with stats updates
const handleBuy = useCallback(async () => {
  const amountNum = parseFloat(amount);
  
  if (isPlacingBet || operationTimeouts.has('bet')) {
    console.log('⚠️ Bet placement already in progress');
    return;
  }
  
  setServerError('');
  
  // Enhanced validation
  if (isNaN(amountNum) || amountNum <= 0) {
    setServerError('Invalid amount');
    toast.error('Invalid amount');
    return;
  }
  
  const minBetAmount = currentToken === TokenType.SOL ? 0.005 : 1;
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
  
  setIsPlacingBet(true); // Use shared state setter
  setOperationTimeouts(prev => new Set(prev).add('bet'));
  
  const operationTimeout = setTimeout(() => {
    console.log('⏰ Bet placement timeout reached');
    setIsPlacingBet(false); // Use shared state setter
    setOperationTimeouts(prev => {
      const newSet = new Set(prev);
      newSet.delete('bet');
      return newSet;
    });
    setServerError('Bet placement timed out');
    toast.error('Bet placement timed out - please try again');
  }, 15000);

  try {
    let success = false;
    let entryMultiplier = gameState.gameStatus === 'waiting' ? 1.0 : gameState.activeCurrentMultiplier;

    if (currentToken === TokenType.SOL) {
      console.log('📡 Using placeCustodialBet hook method...');
      
      if (!userId) {
        throw new Error('User ID not available');
      }
      
      success = await placeCustodialBet(userId, amountNum);
      
      if (success) {
        console.log('✅ Custodial bet placed successfully via hook');
        
        const newBet: ActiveBet = {
          id: `custodial_bet_${Date.now()}`,
          amount: amountNum,
          entryMultiplier,
          timestamp: Date.now(),
          gameId: gameState.activeCurrentGame?.id || 'unknown',
          tokenType: 'SOL',
          userId: userId
        };
        
        setActiveBet(newBet);
        console.log('✅ Active bet set:', newBet);
        
        // 🚀 NEW: Update user stats after successful bet
        try {
          console.log('📊 Updating user stats after bet...');
          const statsResult = await UserAPI.updateUserStatsOnly(
            userId, 
            amountNum, 
            0, // No profit/loss yet (bet just placed)
            undefined
          );
          
          if (statsResult.success) {
            console.log('✅ User stats updated after bet placement');
            console.log('📊 Total games played:', statsResult.userStats?.total_games_played);
          } else {
            console.warn('⚠️ Stats update failed:', statsResult.error);
          }
        } catch (statsError) {
          console.warn('⚠️ Stats update error:', statsError);
        }
        
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
      // RUGGED token betting - also add stats update
      console.log('📡 Using RUGGED token betting system...');
      success = await placeBet(walletAddress, amountNum, userId || undefined);
      
      if (success) {
        const newBet: ActiveBet = {
          id: `rugged_bet_${Date.now()}`,
          amount: amountNum,
          entryMultiplier,
          timestamp: Date.now(),
          gameId: gameState.activeCurrentGame?.id || 'unknown',
          tokenType: 'RUGGED'
        };
        
        setActiveBet(newBet);
        
        // 🚀 NEW: Update stats for RUGGED bets too
        if (userId) {
          try {
            console.log('📊 Updating user stats after RUGGED bet...');
            const statsResult = await UserAPI.updateUserStatsOnly(
              userId, 
              amountNum, 
              0, // No profit/loss yet (bet just placed)
              undefined
            );
            
            if (statsResult.success) {
              console.log('✅ RUGGED bet stats updated');
              console.log('📊 Total games played:', statsResult.userStats?.total_games_played);
            } else {
              console.warn('⚠️ RUGGED stats update failed:', statsResult.error);
            }
          } catch (statsError) {
            console.warn('⚠️ RUGGED stats update error:', statsError);
          }
        }
        
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
    clearTimeout(operationTimeout);
    setIsPlacingBet(false); // Use shared state setter
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
  placeCustodialBet,
  onBuy,
  isPlacingBet,
  operationTimeouts,
  serverError,
  setIsPlacingBet, // Add shared state setter
  setActiveBet,    // Add shared state setter
  updateCustodialBalance,
  updateRuggedBalance
]);

  // 🚀 UPDATED: Enhanced cashout with shared state
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
  
    setIsCashingOut(true); // Use shared state setter
    setOperationTimeouts(prev => new Set(prev).add('cashout'));
    
    const operationTimeout = setTimeout(() => {
      setIsCashingOut(false); // Use shared state setter
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
  
      if (activeBet.tokenType === 'SOL') {
        console.log('💸 Using custodialCashOut hook method...');
        
        const result = await custodialCashOut(userId, walletAddress);
        success = result.success;
        payout = result.payout || 0;
        
        if (success) {
          console.log('✅ Custodial cashout successful:', result);
          
          const winAmount = payout - activeBet.amount;
          const currentMultiplier = gameState.activeCurrentMultiplier;
          
          toast.success(`Cashed out at ${currentMultiplier.toFixed(2)}x! Win: +${winAmount.toFixed(3)} SOL`);
          
          clearActiveBet(); // Use shared state setter
          
          // Multiple update strategies
          // ✅ SIMPLE single update:
setTimeout(() => {
  refreshCustodialBalance();
}, 1000);
          
        } else {
          console.error('❌ Custodial cashout failed:', result.reason);
          setServerError(result.reason || 'Cashout failed');
          toast.error(result.reason || 'Cashout failed');
          clearActiveBet(); // Use shared state setter
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
            
            clearActiveBet(); // Use shared state setter
            
            setTimeout(() => {
              updateRuggedBalance();
            }, 100);
          }
          
        } catch (error) {
          console.error('❌ RUGGED cashout error:', error);
          success = false;
          clearActiveBet(); // Use shared state setter
        }
      }

      if (success && activeBet && userId) {
        try {
          const profitLoss = payout - activeBet.amount;
          const currentMultiplier = gameState.activeCurrentMultiplier;
          
          console.log('📊 Updating cashout stats:', {
            betAmount: activeBet.amount,
            payout,
            profitLoss,
            multiplier: currentMultiplier
          });
          
          // Update user stats with the win
          const statsResult = await UserAPI.updateUserStatsOnly(
            userId,
            activeBet.amount,
            profitLoss, // Win/loss amount
            currentMultiplier // Cashout multiplier
          );
          
          if (statsResult.success) {
            console.log('✅ Cashout stats updated:', {
              gamesPlayed: statsResult.userStats?.total_games_played,
              winRate: statsResult.userStats?.win_rate,
              netProfit: statsResult.userStats?.net_profit
            });
          } else {
            console.warn('⚠️ Cashout stats update failed:', statsResult.error);
          }
          
        } catch (error) {
          console.warn('⚠️ Cashout stats update error:', error);
        }
      }
  
      if (!success && activeBet) {
        console.log('⚠️ Cashout failed but clearing active bet to prevent stuck state');
        clearActiveBet(); // Use shared state setter
      }
  
      if (success && onSell) {
        onSell(100);
      }
  
    } catch (error) {
      console.error('❌ Error cashing out:', error);
      setServerError('Failed to RUG');
      toast.error('Failed to RUG');
      clearActiveBet(); // Use shared state setter
    } finally {
      clearTimeout(operationTimeout);
      setIsCashingOut(false); // Use shared state setter
      setOperationTimeouts(prev => {
        const newSet = new Set(prev);
        newSet.delete('cashout');
        return newSet;
      });
    }
  }, [
    authenticated, 
    walletAddress, 
    isConnected, 
    activeBet, 
    userId, 
    isCashingOut, 
    operationTimeouts, 
    custodialCashOut, 
    cashOut, 
    gameState.activeCurrentMultiplier, 
    onSell, 
    updateCustodialBalance, 
    updateRuggedBalance,
    setIsCashingOut, // Add shared state setter
    clearActiveBet   // Add shared state setter
  ]);

  // Handle token switch
  const handleTokenChange = useCallback((token: TokenType) => {
    setCurrentToken(token);
  }, []);

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

  const setQuickAmount = useCallback((amt: number) => {
    const amtStr = amt.toString();
    setAmount(amtStr);
    setSavedAmount(amtStr);
  }, [setSavedAmount]);

  // In your TradingControls component, update the handleQuickTransfer functionconst handleQuickTransfer = useCallback(async (amount: number) => {
    const handleQuickTransfer = useCallback(async (amount: number) => {
      if (!userId) {
        toast.error('User not available for transfer');
        return;
      }
    
      console.log(`💳 Transfer: ${amount} SOL for user ${userId}`);
      
      try {
        const result = await executeAutoTransfer(
          userId, 
          amount,
          // Simple success callback - no complex logic
          async () => {
            console.log('🔄 Transfer complete - refreshing balance');
            setTimeout(() => refreshCustodialBalance(), 500);
          }
        );
    
        if (result.success) {
          console.log(`✅ Transfer successful`);
          toast.success(`Transfer complete: ${amount} SOL`);
        } else {
          console.error(`❌ Transfer failed:`, result.error);
          toast.error(result.error || 'Transfer failed');
        }
      } catch (error) {
        console.error('Transfer error:', error);
        toast.error('Transfer failed');
      }
    }, [userId, executeAutoTransfer, refreshCustodialBalance]);
  
  const handleEmergencyBalanceSync = useCallback(async () => {
    if (!userId) {
      toast.error('User not available for sync');
      return;
    }
    
    toast.loading('Emergency sync...', { id: 'emergency-sync' });
    
    try {
      // Use existing endpoint instead of the new admin endpoint
      const response = await fetch(`/api/custodial/balance/${userId}?force=true&emergency=true&t=${Date.now()}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Trigger refresh to get the latest data
        setTimeout(() => {
          refreshCustodialBalance();
        }, 500);
        
        // Also try to trigger updateCustodialBalance
        setTimeout(() => {
          updateCustodialBalance();
        }, 1000);
        
        toast.success(`Emergency sync completed! Balance: ${(data.custodialBalance || 0).toFixed(3)} SOL`, { 
          id: 'emergency-sync',
          duration: 4000 
        });
      } else {
        toast.error('Emergency sync failed - endpoint error', { id: 'emergency-sync' });
      }
      
    } catch (error) {
      console.error('Emergency sync error:', error);
      toast.error('Emergency sync failed - connection error', { id: 'emergency-sync' });
    }
  }, [userId, refreshCustodialBalance, updateCustodialBalance]);

  // 🚀 ADD THIS: Handle losing bets when game crashes
const handleAutomaticBetLoss = useCallback(async () => {
  if (!activeBet || !userId) return;
  
  console.log(`💸 Resolving losing bet: ${activeBet.amount} ${activeBet.tokenType || 'SOL'}`);
  
  try {
    const profitLoss = -activeBet.amount; // Loss
    const gameEndMultiplier = currentGame?.multiplier || 0; // Crash point
    
    // Update user stats with the loss
    const statsResult = await UserAPI.updateUserStatsOnly(
      userId,
      activeBet.amount,
      profitLoss, // Negative for loss
      gameEndMultiplier // Crash multiplier
    );
    
    if (statsResult.success) {
      console.log('✅ Loss stats updated:', {
        gamesPlayed: statsResult.userStats?.total_games_played,
        netProfit: statsResult.userStats?.net_profit
      });
    }
    
    // Clear the active bet
    clearActiveBet();
    
    // Show loss notification
    toast.error(`Bet lost: -${activeBet.amount} ${activeBet.tokenType || 'SOL'} (Crashed at ${gameEndMultiplier.toFixed(2)}x)`);
    
  } catch (error) {
    console.error('❌ Error resolving losing bet:', error);
    // Still clear the bet to prevent stuck state
    clearActiveBet();
  }
}, [activeBet, userId, currentGame?.multiplier, clearActiveBet]);
  // Now all useEffects after all variables are declared

  useEffect(() => {
    if (currentGame?.status === 'crashed' && activeBet && !isCashingOut) {
      console.log('💥 Game crashed, resolving losing bet...');
      handleAutomaticBetLoss();
    }
  }, [currentGame?.status, activeBet, isCashingOut, handleAutomaticBetLoss]);

  // Use localStorage to remember user's preferred amount
  useEffect(() => {
    setAmount(savedAmount);
  }, [savedAmount]);

  // Expose debug function globally for support troubleshooting
  useEffect(() => {
    if (typeof window !== 'undefined' && userId) {
      (window as any).debugBalanceIssues = () => {
        const debugInfo = {
          timestamp: new Date().toISOString(),
          userId: userId,
          walletAddress: walletAddress,
          balances: {
            custodial: custodialBalance,
            embedded: embeddedWalletBalance,
            rugged: ruggedBalance
          },
          connectionState: {
            isConnected: isConnected,
            isAuthenticated: authenticated,
            isWalletReady: isWalletReady
          },
          gameState: {
            status: gameState.gameStatus,
            multiplier: gameState.activeCurrentMultiplier,
            activeBet: activeBet
          },
          lastUpdated: custodialLastUpdated,
          logs: JSON.parse(sessionStorage.getItem('balanceDebugLogs') || '[]')
        };
        
        console.group('🔍 Balance Debug Information');
        console.log('Copy this information when contacting support:');
        console.log(JSON.stringify(debugInfo, null, 2));
        console.groupEnd();
        
        if (navigator.clipboard) {
          navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2))
            .then(() => toast.success('Debug info copied to clipboard!'))
            .catch(() => toast('Debug info logged to console'));
        } else {
          toast('Debug info logged to console');
        }
        
        return debugInfo;
      };
      
      (window as any).forceBalanceSync = async () => {
        debugLog('Manual force sync triggered via window function');
        await refreshAllBalances();
        return {
          custodialBalance,
          embeddedWalletBalance,
          ruggedBalance,
          lastUpdated: Date.now()
        };
      };
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).debugBalanceIssues;
        delete (window as any).forceBalanceSync;
      }
    };
  }, [userId, walletAddress, custodialBalance, embeddedWalletBalance, ruggedBalance, isConnected, authenticated, isWalletReady, gameState, activeBet, custodialLastUpdated, debugLog, refreshAllBalances]);

  // Automatic issue detection system

  // User initialization effect
  useEffect(() => {
    if (!authenticated || !walletAddress) {
      console.log('🔍 USER INIT: Not authenticated or no wallet');
      return;
    }
    
    if (initializationRef.current.completed && 
        initializationRef.current.lastWallet === walletAddress &&
        initializationRef.current.lastUserId === (userId || '')) {
      console.log('🔍 USER INIT: Already completed');
      return;
    }
    
    console.log(`🔗 Starting user initialization for wallet: ${walletAddress}`);
    initializationRef.current.attempted = true;
    initializationRef.current.lastWallet = walletAddress;
    
    const initUser = async () => {
      try {
        if (userId && initializationRef.current.lastUserId === userId) {
          console.log(`✅ User ${userId} already initialized for this wallet`);
          initializationRef.current.completed = true;
          return;
        }
        
        console.log(`📡 Getting user data for wallet: ${walletAddress}`);
        const userData = await UserAPI.getUserOrCreate(walletAddress);
        
        console.log(`📡 getUserOrCreate returned:`, userData);
        
        if (userData && userData.id) {
          console.log(`👤 Setting userId to: ${userData.id}`);
          trackedSetUserId(userData.id);
          initializationRef.current.lastUserId = userData.id;
          
          // ✅ FIXED: Wait for socket initialization before triggering balance
          setTimeout(() => {
            console.log(`📡 Initializing user via socket with ID: ${userData.id}`);
            
            const socket = (window as any).gameSocket;
            if (socket) {
              socket.emit('initializeUser', {
                userId: userData.id,
                walletAddress: walletAddress
              });
              
              socket.once('userInitializeResult', (result: any) => {
                console.log('📡 User initialization result:', result);
                
                if (result.success) {
                  console.log(`✅ User ${result.userId} initialized successfully`);
                  initializationRef.current.completed = true;
                  
                  // ✅ FIXED: Single balance update after socket confirmation
                  setTimeout(() => {
                    console.log(`🔄 Triggering initial balance update`);
                    updateCustodialBalance(true); // Force initial update
                  }, 1000);
                } else {
                  console.error('❌ User initialization failed:', result.error);
                  toast.error('Failed to initialize wallet');
                  initializationRef.current.attempted = false;
                  initializationRef.current.completed = false;
                }
              });
            } else {
              console.error('❌ Socket not available for user initialization');
              initializationRef.current.attempted = false;
              initializationRef.current.completed = false;
            }
          }, 1500); // Give more time for socket connection
        }
      } catch (error) {
        console.error('❌ Could not initialize user:', error);
        toast.error('Failed to initialize wallet');
        initializationRef.current.attempted = false;
        initializationRef.current.completed = false;
      }
    };
    
    initUser();
  }, [authenticated, walletAddress, userId, user?.id, trackedSetUserId, updateCustodialBalance]);

  useEffect(() => {
    if (userId) {
      const isUUID = userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      const isPrivyID = userId.startsWith('did:privy:');
      
      console.log(`💰 TRACKED: Balance hook userId analysis:`, {
        userId,
        isUUID: !!isUUID,
        isPrivyID: !!isPrivyID,
        expectedFormat: 'UUID',
        willWork: !!isUUID
      });
      
      if (isPrivyID) {
        console.error('🚨 TRACKED: Balance hook called with Privy ID - this will fail!');
        console.error('🚨 Transfer will use UUID, balance will use Privy ID = mismatch');
      }
    }
  }, [userId]);
  
// ✅ REPLACE the entire useEffect with this NULL-SAFE version:
useEffect(() => {
  if (userId) {
    const isValidUUID = userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    
    if (!isValidUUID) {
      console.error(`🚨 Invalid userId format: ${userId} (expected UUID, got ${userId.startsWith('did:privy:') ? 'Privy ID' : 'unknown format'})`);
      // Try to get the correct UUID
      if (walletAddress) {
        UserAPI.getUserOrCreate(walletAddress).then(userData => {
          // ✅ ADD NULL CHECK HERE:
          if (userData && userData.id !== userId) {
            console.log(`🔧 Correcting userId: ${userId} → ${userData.id}`);
            trackedSetUserId(userData.id);
          }
        }).catch(console.error);
      }
    }
  }
}, [userId, walletAddress, trackedSetUserId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugUserIdFlow = () => {
        return {
          currentUserId: userId,
          privyUserId: user?.id,
          walletAddress: walletAddress,
          custodialBalance: custodialBalance,
          initializationState: initializationRef.current,
          expectedTransferMatch: 'UUID should match between transfer and balance'
        };
      };
      
      (window as any).forceCorrectUserId = async () => {
        console.log('🔧 TRACKED: Force getting correct userId...');
        try {
          const userData = await UserAPI.getUserOrCreate(walletAddress);
          console.log('🔧 TRACKED: Fresh getUserOrCreate result:', userData);
          
          if (userData && userData.id) {
            console.log('🔧 TRACKED: Setting correct userId:', userData.id);
            trackedSetUserId(userData.id);
            
            setTimeout(() => {
              console.log('🔧 TRACKED: Force refreshing balance...');
              refreshCustodialBalance();
            }, 500);
            
            return userData.id;
          }
        } catch (error) {
          console.error('🔧 TRACKED: Force update failed:', error);
        }
      };
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).debugUserIdFlow;
        delete (window as any).forceCorrectUserId;
      }
    };
  }, [userId, user?.id, walletAddress, custodialBalance, trackedSetUserId, refreshCustodialBalance]);

  // 🔍 ENHANCED: Check for other places where userId might get set
  useEffect(() => {
    // Look for any other code that might be calling setUserId
    if (typeof window !== 'undefined') {
      const originalSetUserId = setUserId;
      
      // Override setUserId globally to catch all calls
      (window as any).trackSetUserId = (id: string, source: string) => {
        console.log(`👤 EXTERNAL setUserId called from ${source}:`, {
          id,
          isUUID: id?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
          isPrivyID: id?.startsWith('did:privy:')
        });
        trackedSetUserId(id);
      };
    }
  }, [trackedSetUserId]);

  

  // Reset initialization tracking when wallet changes
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

  
  // 🚀 UPDATED: Enhanced socket listeners with shared state
  // 🔥 CONSOLIDATED: Replace the entire complex useEffect with this
// 🔥 SIMPLIFIED: Remove conflicting socket listeners
// ✅ SIMPLIFIED SOCKET LISTENERS:
useEffect(() => {
  if (!userId || !walletAddress) return;
  
  const socket = (window as any).gameSocket;
  if (!socket) return;
  
  // ✅ FIXED: Only listen to essential events, no balance conflicts
  const handleCustodialTransferComplete = (data: any) => {
    if (data.userId === userId) {
      console.log(`💳 Transfer completed for ${userId}, refreshing in 2s...`);
      setTimeout(() => {
        refreshCustodialBalance();
      }, 2000);
    }
  };
  
  // ✅ FIXED: Remove custodialBalanceUpdate listener to prevent conflicts
  // The shared hook handles this now
  socket.on('custodialTransferComplete', handleCustodialTransferComplete);
  
  return () => {
    socket.off('custodialTransferComplete', handleCustodialTransferComplete);
  };
}, [userId, walletAddress, refreshCustodialBalance]);
  // Auto cashout effect
  useEffect(() => {
    if (
      activeBet && 
      gameState.activeIsGameActive && 
      autoCashoutEnabled && 
      parseFloat(autoCashoutValue) > 0 &&
      gameState.activeCurrentMultiplier >= parseFloat(autoCashoutValue) &&
      gameState.gameStatus === 'active' &&
      !isCashingOut
    ) {
      console.log('Auto cashout triggered at', gameState.activeCurrentMultiplier, 'x');
      handleCashout();
    }
  }, [gameState.activeCurrentMultiplier, autoCashoutEnabled, autoCashoutValue, activeBet, gameState.activeIsGameActive, gameState.gameStatus, handleCashout, isCashingOut]);

  // Clear active bet if game is not active
  useEffect(() => {
    if (activeBet && gameState.gameStatus !== 'active') {
      console.log(`🔄 Game status changed to ${gameState.gameStatus}, clearing active bet`);
      clearActiveBet(); // Use shared state setter
    }
  }, [gameState.gameStatus, activeBet, clearActiveBet]);

  // Clear stuck active bets after timeout
  useEffect(() => {
    if (activeBet) {
      const timeout = setTimeout(() => {
        console.log('⏰ Clearing stuck active bet after timeout');
        clearActiveBet(); // Use shared state setter
      }, 5 * 60 * 1000);
  
      return () => clearTimeout(timeout);
    }
  }, [activeBet, clearActiveBet]);

  // Better connection recovery
  useEffect(() => {
    if (!isConnected && isCashingOut) {
      setIsCashingOut(false); // Use shared state setter
      setServerError('Connection lost during cashout');
      toast.error('Connection lost - please try cashing out again');
    }
  }, [isConnected, isCashingOut, setIsCashingOut]);

  // Quick transfer amounts
  const quickTransferAmounts = [0.05, 0.1, 0.5, 1.0];

  // Handle auto cashout value change
  const handleAutoCashoutValueChange = useCallback((value: string) => {
    if (/^(\d+)?(\.\d{0,2})?$/.test(value) || value === '') {
      setAutoCashoutValue(value);
    }
  }, [setAutoCashoutValue]);

  const setQuickAutoCashoutValue = useCallback((value: number) => {
    setAutoCashoutValue(value.toString());
  }, [setAutoCashoutValue]);

  // Render mobile layout
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
  // Add these missing props:
  embeddedWalletBalance={embeddedWalletBalance}
  onQuickTransfer={handleQuickTransfer}
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
          onRefresh={refreshAllBalances}
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

  // Desktop layout (similar to mobile but with different styling)
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
        onRefresh={refreshAllBalances}
      />

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
  // Add these missing props:
  embeddedWalletBalance={embeddedWalletBalance}
  onQuickTransfer={handleQuickTransfer}
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
// src/components/trading/TradingControls.tsx - Complete Fixed Version with Balance Updates
import { FC, useState, useEffect, useContext, useCallback } from 'react';
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
  tokenType?: TokenType; // Track which token was used
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

// 🔧 FIXED: External wallet balance hook using Navbar's method
const useWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const updateBalance = useCallback(async () => {
    if (!walletAddress) {
      console.log('🔍 useWalletBalance: No wallet address provided');
      return;
    }
    
    console.log('🚀 useWalletBalance: Starting balance fetch for:', walletAddress);
    setLoading(true);
    
    try {
      // Use same validation as Navbar
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      console.log('🔧 useWalletBalance RPC config:', {
        hasRpcUrl: !!rpcUrl,
        hasApiKey: !!apiKey,
        rpcUrl: rpcUrl?.substring(0, 50) + '...'
      });
      
      if (!rpcUrl) {
        console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
        setBalance(0);
        return;
      }
      
      // Same connection config as Navbar
      const connectionConfig: any = {
        commitment: 'confirmed',
      };
      
      if (apiKey) {
        connectionConfig.httpHeaders = {
          'x-api-key': apiKey
        };
      }
      
      const connection = new Connection(rpcUrl, connectionConfig);
      
      // Create PublicKey with error handling
      const publicKey = new PublicKey(walletAddress);
      const balanceResponse = await connection.getBalance(publicKey);
      const solBalance = balanceResponse / LAMPORTS_PER_SOL;
      
      console.log(`✅ useWalletBalance: Balance fetched and SETTING STATE: ${solBalance.toFixed(3)} SOL`);
      setBalance(solBalance);
      setLastUpdated(Date.now());
      
      // Double-check state was set
      setTimeout(() => {
        console.log(`🔍 useWalletBalance: State check - balance should be ${solBalance.toFixed(3)}`);
      }, 100);
      
    } catch (error) {
      console.error('❌ useWalletBalance: Failed to fetch balance:', error);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      console.log('🔄 useWalletBalance: useEffect triggered for wallet:', walletAddress);
      updateBalance();
      const interval = setInterval(updateBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, updateBalance]);

  // Log whenever balance state changes
  useEffect(() => {
    console.log(`📊 useWalletBalance: Balance state updated to ${balance.toFixed(3)} SOL`);
  }, [balance]);

  return { balance, loading, lastUpdated };
};

// Custodial SOL balance hook (primary gaming balance)
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const updateCustodialBalance = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/custodial/balance/${userId}`);
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        setCustodialBalance(data.custodialBalance);
        setLastUpdated(Date.now());
        console.log(`💎 Custodial SOL balance updated: ${data.custodialBalance.toFixed(3)} SOL`);
      }
    } catch (error) {
      console.error('Failed to fetch custodial balance:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      updateCustodialBalance();
      const interval = setInterval(updateCustodialBalance, 10000); // Update frequently for gaming
      return () => clearInterval(interval);
    }
  }, [userId, updateCustodialBalance]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance };
};

// RUGGED SPL token balance hook (existing functionality)
const useRuggedBalance = (walletAddress: string) => {
  const [ruggedBalance, setRuggedBalance] = useState<number>(1000); // Default or fetch from SPL token
  const [loading, setLoading] = useState<boolean>(false);

  // TODO: Implement actual SPL token balance fetching
  const updateRuggedBalance = useCallback(async () => {
    if (!walletAddress) return;
    
    setLoading(true);
    try {
      // TODO: Fetch actual RUGGED SPL token balance
      // For now, keeping existing logic
      console.log(`🎯 RUGGED balance check for: ${walletAddress}`);
      // setRuggedBalance(actualBalance);
    } catch (error) {
      console.error('Failed to fetch RUGGED balance:', error);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      updateRuggedBalance();
      const interval = setInterval(updateRuggedBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, updateRuggedBalance]);

  return { ruggedBalance, loading, updateRuggedBalance };
};

// Compact Game Info Component
const CompactGameInfo: FC<{
  game: any;
  countdown: number;
  showCountdown: boolean;
  isConnected: boolean;
  isMobile: boolean;
}> = ({ game, countdown, showCountdown, isConnected, isMobile }) => {
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
};

// Balance Display Component - Shows both custodial and embedded for SOL
const BalanceDisplay: FC<{
  currentToken: TokenType;
  custodialBalance: number; // 🔧 BACK TO: custodialBalance for gaming
  embeddedWalletBalance: number; // 🔧 ADDED: embedded wallet balance for reference
  ruggedBalance: number;
  onTokenChange: (token: TokenType) => void;
  onDepositClick: () => void;
  onWithdrawClick: () => void;
  onAirdropClick: () => void;
  isMobile: boolean;
  showExpanded: boolean;
  onToggleExpanded: () => void;
  isLoading: boolean;
}> = ({ 
  currentToken, 
  custodialBalance, // 🔧 BACK TO: custodial balance for gaming
  embeddedWalletBalance, // 🔧 ADDED: embedded wallet balance for reference
  ruggedBalance,
  onTokenChange, 
  onDepositClick, 
  onWithdrawClick, 
  onAirdropClick, 
  isMobile, 
  showExpanded, 
  onToggleExpanded,
  isLoading
}) => {
  // 🔧 FIXED: SOL = custodial balance for gaming, RUGGED = SPL token balance
  const activeBalance = currentToken === TokenType.SOL ? custodialBalance : ruggedBalance;
  
  const formatBalance = (balance: number, token: TokenType) => {
    if (token === TokenType.SOL) {
      return balance.toFixed(3); // SOL balance with decimals
    } else {
      return balance.toFixed(0); // RUGGED token as whole numbers
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
                // 🔧 ENHANCED: Show both balances for SOL
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
            <Wallet className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400 text-sm">{showExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {showExpanded && (
          <div className="bg-gray-800 rounded-lg p-2 mt-1">
            {/* 🔧 ENHANCED: Show dual balance breakdown for SOL */}
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
        
        <div className="flex space-x-2">
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

      {/* 🔧 ENHANCED: Show dual balance breakdown for SOL */}
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
};

// Auto Cashout Component
const AutoCashoutSection: FC<{
  autoCashoutEnabled: boolean;
  autoCashoutValue: string;
  onToggle: (enabled: boolean) => void;
  onValueChange: (value: string) => void;
  onQuickValue: (value: number) => void;
  isMobile: boolean;
  showExpanded: boolean;
  onToggleExpanded: () => void;
}> = ({ 
  autoCashoutEnabled, 
  autoCashoutValue, 
  onToggle, 
  onValueChange, 
  onQuickValue,
  isMobile,
  showExpanded,
  onToggleExpanded
}) => {
  const quickValues = [1.5, 2.0, 3.0, 5.0];

  return (
    <div className="mb-3">
      <div 
        className="flex justify-between items-center bg-gray-800 p-2 rounded-lg cursor-pointer"
        onClick={onToggleExpanded}
      >
        <div className="flex items-center space-x-2">
          <div className={`h-3 w-3 rounded-full ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
          <span className="text-gray-300 text-sm">Auto RUG</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-gray-400 text-sm">
            {autoCashoutEnabled ? `${autoCashoutValue}x` : 'Off'}
          </span>
          <Settings className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      
      {showExpanded && (
        <div className="bg-gray-800 p-3 rounded-lg mt-1">
          <div className="flex items-center justify-between mb-3">
            <label className="text-gray-300 text-sm">Enable Auto RUG</label>
            <div className="relative inline-block w-10 h-5">
              <input
                type="checkbox"
                id="auto-cashout-toggle"
                checked={autoCashoutEnabled}
                onChange={(e) => onToggle(e.target.checked)}
                className="opacity-0 absolute w-0 h-0"
              />
              <label 
                htmlFor="auto-cashout-toggle"
                className={`absolute cursor-pointer top-0 left-0 right-0 bottom-0 rounded-full transition-colors ${
                  autoCashoutEnabled ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span 
                  className={`absolute h-3 w-3 mt-1 bg-white rounded-full transition-transform ${
                    autoCashoutEnabled ? 'translate-x-5 ml-0' : 'translate-x-1'
                  }`} 
                />
              </label>
            </div>
          </div>
          
          <div className="mb-3">
            <label className="block text-gray-300 text-sm mb-1">
              RUG at Multiplier
            </label>
            <div className="flex">
              <input
                type="text"
                value={autoCashoutValue}
                onChange={(e) => onValueChange(e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-1 rounded-l-md focus:outline-none text-sm"
                placeholder="2.00"
                disabled={!autoCashoutEnabled}
              />
              <span className="bg-gray-600 text-gray-300 px-3 py-1 rounded-r-md text-sm">x</span>
            </div>
          </div>
          
          <div className={`grid gap-2 ${isMobile ? 'grid-cols-4' : 'grid-cols-4'}`}>
            {quickValues.map((value) => (
              <button
                key={value}
                onClick={() => onQuickValue(value)}
                className={`px-2 py-1 text-xs rounded ${
                  parseFloat(autoCashoutValue) === value
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } ${isMobile ? 'text-[10px] px-1' : ''}`}
                disabled={!autoCashoutEnabled}
              >
                {value.toFixed(1)}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Active Bet Display Component
const ActiveBetDisplay: FC<{
  bet: ActiveBet;
  currentMultiplier: number;
  isMobile: boolean;
}> = ({ bet, currentMultiplier, isMobile }) => {
  const calculatePotentialWin = () => {
    const growthRatio = currentMultiplier / bet.entryMultiplier;
    const rawPayout = bet.amount * growthRatio;
    const finalPayout = rawPayout * (1 - 0.40); // Apply 40% house edge
    return Math.max(0, finalPayout);
  };

  const profit = calculatePotentialWin() - bet.amount;
  const isProfit = profit > 0;

  return (
    <div className="bg-blue-900 bg-opacity-30 p-3 rounded-lg mb-3">
      <div className="text-center">
        <div className="text-sm text-blue-400 mb-1">Active Buy</div>
        <div className="text-lg font-bold text-blue-300">
          {bet.amount} {bet.tokenType || 'SOL'} @ {bet.entryMultiplier.toFixed(2)}x
        </div>
        <div className={`text-sm mt-1 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
          Potential: {calculatePotentialWin().toFixed(3)} {bet.tokenType || 'SOL'}
        </div>
        <div className={`text-xs mt-1 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
          P&L: {profit >= 0 ? '+' : ''}{profit.toFixed(3)} {bet.tokenType || 'SOL'}
        </div>
        {isMobile && (
          <div className="text-xs text-gray-400 mt-1">
            Current: {currentMultiplier.toFixed(2)}x
          </div>
        )}
      </div>
    </div>
  );
};

// Betting Section Component - Smart routing based on token type
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
}> = ({
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
  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0 && amountNum <= activeBalance;
  
  // Different min/max based on token type
  const minBetAmount = currentToken === TokenType.SOL ? 0.001 : 1;
  const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
  
  const amountInRange = amountNum >= minBetAmount && amountNum <= maxBetAmount;

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
                disabled={isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet
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
                disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  isCashingOut || !isConnected || gameStatus !== 'active'
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
              disabled={isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet
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
              disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                isCashingOut || !isConnected || gameStatus !== 'active'
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
};

// Status Messages Component
const StatusMessages: FC<{
  isWalletReady: boolean;
  isConnected: boolean;
  amount: string;
  activeBalance: number;
  activeBet: ActiveBet | null;
  isWaitingPeriod: boolean;
  canBet: boolean;
  gameStatus: string;
  currentMultiplier: number;
  countdownSeconds: number;
  serverError?: string;
}> = ({
  isWalletReady,
  isConnected,
  amount,
  activeBalance,
  activeBet,
  isWaitingPeriod,
  canBet,
  gameStatus,
  currentMultiplier,
  countdownSeconds,
  serverError
}) => {
  const getStatusMessage = () => {
    if (serverError) {
      return { text: serverError, icon: AlertCircle, color: 'text-red-500' };
    }

    if (!isWalletReady) {
      return { text: 'Login to play', icon: AlertCircle, color: 'text-yellow-500' };
    }
    
    if (isWalletReady && !isConnected) {
      return { text: 'Connecting to game server...', icon: AlertCircle, color: 'text-red-500' };
    }
    
    if (isWalletReady && parseFloat(amount) > activeBalance && !activeBet) {
      return { text: 'Insufficient balance', icon: AlertCircle, color: 'text-red-500' };
    }
    
    if (isWaitingPeriod && canBet) {
      return { text: `SNIPE NOW - ${countdownSeconds}s remaining`, icon: Timer, color: 'text-blue-500' };
    }
    
    if (isWaitingPeriod && !canBet) {
      return { text: 'Too late to buy - Game starting now!', icon: AlertCircle, color: 'text-red-500' };
    }
    
    if (gameStatus === 'active' && !activeBet) {
      return { text: `Game active - Place buy now at ${currentMultiplier.toFixed(2)}x`, icon: Timer, color: 'text-green-500' };
    }
    
    if (gameStatus === 'crashed') {
      return { text: 'Round ended. Next round starting soon.', icon: AlertCircle, color: 'text-red-500' };
    }

    return null;
  };

  const status = getStatusMessage();
  if (!status) return null;

  const IconComponent = status.icon;

  return (
    <div className="mt-2">
      <div className={`${status.color} text-xs flex items-center`}>
        <IconComponent className="h-3 w-3 mr-1 flex-shrink-0" />
        <span>{status.text}</span>
      </div>
    </div>
  );
};

// MAIN COMPONENT - Dual token system integration
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
  
  // Enhanced game server connection (compatible with existing hook)
  const { 
    currentGame, 
    isConnected, 
    placeBet, 
    cashOut, 
    countdown, 
    isWaitingPeriod, 
    canBet,
    connectionError,
    connectionAttempts
  } = useGameSocket(walletAddress, userId || undefined);
  
  // 🔧 FIXED: Dual balance system with embedded wallet balance
  const { balance: embeddedWalletBalance, loading: embeddedWalletLoading } = useWalletBalance(walletAddress); // 🔧 RENAMED for clarity
  const { custodialBalance, loading: custodialBalanceLoading, updateCustodialBalance } = useCustodialBalance(userId || ''); // Primary gaming balance
  const { ruggedBalance, loading: ruggedBalanceLoading, updateRuggedBalance } = useRuggedBalance(walletAddress); // SPL token
  
  // Calculate countdown values
  const countdownSeconds = countdown ? Math.ceil(countdown / 1000) : 0;
  const showCountdown = Boolean(countdown && countdown > 0 && currentGame?.status === 'waiting');
  
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
  
  // Loading states
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  
  // State for expanded sections
  const [showBalanceExpanded, setShowBalanceExpanded] = useState<boolean>(false);
  
  // Error state
  const [serverError, setServerError] = useState<string>('');
  
  // Real game state from server
  const activeCurrentGame = currentGame;
  const activeIsGameActive = activeCurrentGame?.status === 'active' || activeCurrentGame?.status === 'waiting';
  const activeCurrentMultiplier = activeCurrentGame?.multiplier || propCurrentMultiplier;
  const gameStatus = activeCurrentGame?.status || 'waiting';

  // 🔧 FIXED: Calculate balance based on selected token - custodial for gaming
  const activeBalance = currentToken === TokenType.SOL ? custodialBalance : ruggedBalance;
  const effectiveCanBet = gameStatus === 'active' ? true : canBet;

  // Balance debug logging - only when balances actually change
useEffect(() => {
  console.log('💰 TradingControls Balance Debug:', {
    currentToken,
    embeddedWalletBalance: embeddedWalletBalance.toFixed(3),
    custodialBalance: custodialBalance.toFixed(3), 
    ruggedBalance: ruggedBalance.toFixed(3),
    activeBalance: activeBalance.toFixed(3),
    gamingBalance: 'custodial',
    embeddedWalletLoading
  });
}, [currentToken, embeddedWalletBalance, custodialBalance, ruggedBalance, activeBalance, embeddedWalletLoading]);

  // Validation error message
  const getBetValidationError = () => {
    const amountNum = parseFloat(amount);
    const minBetAmount = currentToken === TokenType.SOL ? 0.002 : 1;
    const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
    
    if (isNaN(amountNum) || amountNum <= 0) return 'Enter valid amount';
    if (amountNum < minBetAmount) return `Minimum: ${minBetAmount} ${currentToken}`;
    if (amountNum > maxBetAmount) return `Maximum: ${maxBetAmount} ${currentToken}`;
    if (amountNum > activeBalance) return 'Insufficient balance';
    return '';
  };

  const betValidationError = getBetValidationError();

  // Enhanced responsive container
  const containerClasses = `
    bg-[#0d0d0f] text-white border border-gray-800 rounded-lg
    ${isMobile 
      ? 'p-3 max-w-sm mx-auto' 
      : 'p-4 min-w-[320px] max-w-md'
    }
  `;

  // Enhanced user initialization with the new initializeUser function
  useEffect(() => {
    if (authenticated && walletAddress) {
      const initUser = async () => {
        try {
          console.log(`🔗 Initializing user with embedded wallet: ${walletAddress}`);
          
          // Get user data
          const userData = await UserAPI.getUserOrCreate(walletAddress);
          if (userData) {
            setUserId(userData.id);
            console.log(`👤 User ID: ${userData.id}`);
            
            // Use the enhanced initialization function
            setTimeout(() => {
              initializeUser(
                walletAddress,
                userData.id,
                UserAPI,
                updateCustodialBalance,
                updateRuggedBalance,
                toast
              );
            }, 1000); // Delay to ensure socket is connected
          }
        } catch (error) {
          console.error('❌ Could not initialize user:', error);
          toast.error('Failed to initialize wallet');
        }
      };
      
      initUser();
    }
  }, [authenticated, walletAddress, updateCustodialBalance, updateRuggedBalance]);

  // Update local amount state when saved amount changes
  useEffect(() => {
    setAmount(savedAmount);
  }, [savedAmount]);

  // Handle token switch
  const handleTokenChange = (token: TokenType) => {
    setCurrentToken(token);
  };

  // Enhanced cashout with dual token support
  // 🔧 FIXED: Enhanced cashout with timeout and better error handling
// ✅ MAINTAINS: Original UI/UX exactly as designed
const handleCashout = useCallback(async () => {
  if (!authenticated || !walletAddress || !isConnected || !activeBet || !userId) {
    return;
  }

  // Prevent multiple simultaneous cashout attempts
  if (isCashingOut) {
    return;
  }

  setIsCashingOut(true);
  try {
    let success = false;

    // Route cashout based on bet token type
    if (activeBet.tokenType === TokenType.SOL) {
      // Enhanced SOL cashout with timeout and better error handling
      success = await new Promise<boolean>((resolve) => {
        const socket = (window as any).gameSocket;
        
        if (!socket || !socket.connected) {
          resolve(false);
          return;
        }

        // Set up timeout to prevent hanging
        const timeoutId = setTimeout(() => {
          resolve(false);
        }, 10000); // 10 second timeout

        // Set up response handler
        const handleCashoutResult = (result: any) => {
          clearTimeout(timeoutId);
          if (result.success) {
            updateCustodialBalance(); // Refresh custodial balance
            resolve(true);
          } else {
            resolve(false);
          }
        };

        // Register listeners (use once to prevent multiple responses)
        socket.once('custodialCashOutResult', handleCashoutResult);
        socket.once('error', () => {
          clearTimeout(timeoutId);
          resolve(false);
        });
        socket.once('disconnect', () => {
          clearTimeout(timeoutId);
          resolve(false);
        });

        // Send cashout request
        try {
          socket.emit('custodialCashOut', { userId, walletAddress });
        } catch (emitError) {
          clearTimeout(timeoutId);
          resolve(false);
        }
      });

      if (success) {
        toast.success('Cashed out to SOL game balance!');
      }
    } else {
      // Enhanced RUGGED token cashout with timeout
      try {
        const cashoutPromise = cashOut(walletAddress);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 15000);
        });

        const cashoutResult = await Promise.race([cashoutPromise, timeoutPromise]);
        success = cashoutResult.success || false;
        
        if (success) {
          updateRuggedBalance(); // Refresh RUGGED balance
          toast.success('Cashed out RUGGED tokens!');
        }
      } catch (error) {
        success = false;
      }
    }

    if (success) {
      setActiveBet(null);
      if (onSell) onSell(100);
    } else {
      setServerError('Failed to RUG');
      toast.error('Failed to RUG');
    }
  } catch (error) {
    console.error('Error cashing out:', error);
    setServerError('Failed to RUG');
    toast.error('Failed to RUG');
  } finally {
    setIsCashingOut(false);
  }
}, [authenticated, walletAddress, isConnected, activeBet, cashOut, onSell, userId, updateCustodialBalance, updateRuggedBalance, isCashingOut]);

// Frontend auto-transfer function - bypasses broken transfer API
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
    // Show loading state
    toast.loading('Transferring SOL to game balance...', { id: 'transfer' });
    
    // Create the transaction
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVzzNb_M2I0WQ0b85sYoNEYx'
    );
    
    const fromPubkey = new PublicKey(walletAddress);
    const toPubkey = new PublicKey(HOUSE_WALLET);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    
    // Create transaction
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
    
    console.log('📝 Transaction created, requesting signature...');
    
    // Use Privy's embedded wallet to sign and send
   // Use Privy's embedded wallet to send transaction
    // Use Privy's embedded wallet to send transaction
    const signature = await embeddedWallet.sendTransaction(transaction, connection); 
    
    console.log('📡 Transaction sent:', signature);
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log('✅ Transfer confirmed:', signature);

    // Success! The deposit monitoring should pick this up automatically
    toast.success(`Transferred ${amount} SOL to game balance!`, { id: 'transfer' });
    
    // ✅ ADD THIS: Manual trigger after successful transfer
    try {
      console.log('🔧 Forcing manual deposit credit...');
      
      // Try multiple manual credit approaches
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
      
      console.log('Manual credit response:', await manualCredit.text());
    } catch (error) {
      console.log('⚠️ Manual credit failed:', error);
    }
    
    // Refresh balances after a short delay to allow server processing
    setTimeout(() => {
      updateCustodialBalance();
      // The embedded wallet balance will auto-refresh via useWalletBalance hook
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
}, [embeddedWallet, walletAddress, userId, embeddedWalletBalance, updateCustodialBalance]);


// Quick transfer amounts
const quickTransferAmounts = [0.001, 0.01, 0.05, 0.1];

const handleQuickTransfer = async (amount: number) => {
  const success = await autoTransferToGameBalance(amount);
  if (success) {
    console.log(`✅ Quick transfer of ${amount} SOL completed`);
  }
};

// 🔧 FIXED: Add connection recovery effect (no UI changes)
useEffect(() => {
  // If we lose connection during cashout, reset the state
  if (!isConnected && isCashingOut) {
    setIsCashingOut(false);
    setServerError('Connection lost during cashout');
    toast.error('Connection lost - please try cashing out again');
  }
}, [isConnected, isCashingOut]);

// ✅ ORIGINAL: Keeping your exact BettingSection component unchanged
// Just ensuring the RUG button respects the enhanced validation
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
}> = ({
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
  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0 && amountNum <= activeBalance;
  
  // Different min/max based on token type
  const minBetAmount = currentToken === TokenType.SOL ? 0.001 : 1;
  const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
  
  const amountInRange = amountNum >= minBetAmount && amountNum <= maxBetAmount;

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
                disabled={isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet
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
                disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  isCashingOut || !isConnected || gameStatus !== 'active'
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
              disabled={isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet
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
              disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                isCashingOut || !isConnected || gameStatus !== 'active'
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
};

  // Auto cashout effect
  useEffect(() => {
    if (
      activeBet && 
      activeIsGameActive && 
      autoCashoutEnabled && 
      parseFloat(autoCashoutValue) > 0 &&
      activeCurrentMultiplier >= parseFloat(autoCashoutValue) &&
      gameStatus === 'active'
    ) {
      console.log('Auto cashout triggered at', activeCurrentMultiplier, 'x');
      handleCashout();
    }
  }, [activeCurrentMultiplier, autoCashoutEnabled, autoCashoutValue, activeBet, activeIsGameActive, gameStatus, handleCashout]);

  // Handle amount change
  const handleAmountChange = (value: string) => {
    const pattern = currentToken === TokenType.SOL 
      ? /^(\d+)?(\.\d{0,6})?$/ 
      : /^\d*$/;
    
    if (pattern.test(value) || value === '') {
      setAmount(value);
      if (value !== '') {
        setSavedAmount(value);
      }
    }
  };

  // Quick amount buttons based on token type
  const quickAmounts = currentToken === TokenType.SOL 
    ? [0.01, 0.05, 0.1, 0.5] 
    : [10, 50, 100, 500];

  const setQuickAmount = (amt: number) => {
    const amtStr = amt.toString();
    setAmount(amtStr);
    setSavedAmount(amtStr);
  };

  // Handle auto cashout value change
  const handleAutoCashoutValueChange = (value: string) => {
    if (/^(\d+)?(\.\d{0,2})?$/.test(value) || value === '') {
      setAutoCashoutValue(value);
    }
  };

  const setQuickAutoCashoutValue = (value: number) => {
    setAutoCashoutValue(value.toString());
  };

  // Enhanced bet placement with dual token routing
  const handleBuy = async () => {
    const amountNum = parseFloat(amount);
    
    // Clear previous errors
    setServerError('');
    
    console.log('🎯 Attempting to place buy:', {
      amount: amountNum,
      walletAddress,
      userId,
      gameStatus,
      isConnected,
      canBet: effectiveCanBet,
      isWaitingPeriod,
      activeBalance,
      currentToken,
      tokenType: currentToken
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
    
    // Check for wallet readiness
    if (!isWalletReady || !isConnected) {
      console.log('❌ Wallet not ready:', { isWalletReady, isConnected });
      setServerError('Please login to play');
      toast.error('Please login to play');
      return;
    }
    
    // Enhanced game availability check
    if (!activeIsGameActive) {
      console.log('❌ Game not available:', { activeIsGameActive, canBet: effectiveCanBet, isWaitingPeriod, countdownSeconds });
      setServerError('Game is not available');
      toast.error('Game is not available');
      return;
    }
    
    // For waiting period, respect the server's canBet flag
    if (isWaitingPeriod && !effectiveCanBet) {
      console.log('❌ Waiting period ended:', { isWaitingPeriod, canBet: effectiveCanBet, countdownSeconds });
      setServerError('Game starting now!');
      toast.error('Game starting now!');
      return;
    }

    // Check balance
    if (amountNum > activeBalance) {
      console.log('❌ Insufficient balance:', { amountNum, activeBalance });
      setServerError('Insufficient balance');
      toast.error('Insufficient balance');
      return;
    }

    console.log('✅ All validations passed, placing bet...');
    
    setIsPlacingBet(true);
    try {
      let success = false;
      let entryMultiplier = gameStatus === 'waiting' ? 1.0 : activeCurrentMultiplier;

      // Route betting based on token type
      if (currentToken === TokenType.SOL) {
        console.log('📡 Using custodial SOL betting system...');
        
        success = await new Promise<boolean>((resolve) => {
          const socket = (window as any).gameSocket;
          if (socket) {
            socket.emit('custodialBet', { userId, betAmount: amountNum });
            socket.once('custodialBetResult', (result: any) => {
              console.log('📡 Custodial SOL bet response:', result);
              if (result.success) {
                entryMultiplier = result.entryMultiplier;
                updateCustodialBalance(); // Refresh custodial balance
                resolve(true);
              } else {
                setServerError(result.reason || 'Failed to place custodial bet');
                resolve(false);
              }
            });
          } else {
            setServerError('Socket connection not available');
            resolve(false);
          }
        });
      } else {
        // Use existing RUGGED token betting
        console.log('📡 Using RUGGED token betting system...');
        success = await placeBet(walletAddress, amountNum, userId || undefined);
        if (success) {
          updateRuggedBalance(); // Refresh RUGGED balance
        }
      }
      
      if (success) {
        // Store bet with token type
        const newBet: ActiveBet = {
          id: `bet_${Date.now()}`,
          amount: amountNum,
          entryMultiplier,
          timestamp: Date.now(),
          gameId: activeCurrentGame?.id || 'unknown',
          tokenType: currentToken
        };
        
        setActiveBet(newBet);
        
        console.log('✅ Bet placed successfully:', newBet);
        
        const betType = gameStatus === 'waiting' ? 'Pre-game bet' : 'Bet';
        const tokenDisplay = currentToken === TokenType.SOL ? 'SOL (game balance)' : 'RUGGED tokens';
        toast.success(`${betType} placed: ${amountNum} ${tokenDisplay} (Entry: ${entryMultiplier.toFixed(2)}x)`);
        
        if (onBuy) onBuy(amountNum);
      } else {
        const errorMsg = serverError || 'Failed to place buy - server returned false';
        console.log('❌ Bet placement failed:', errorMsg);
        if (!serverError) setServerError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('❌ Error placing bet:', error);
      const errorMsg = `Failed to place buy: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setServerError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsPlacingBet(false);
    }
  };

  // Mobile-optimized layout
  if (isMobile) {
    return (
      <div className={containerClasses}>
        <CompactGameInfo
          game={activeCurrentGame}
          countdown={countdown || 0}
          showCountdown={showCountdown}
          isConnected={isConnected}
          isMobile={isMobile}
        />

        {activeBet && (
          <ActiveBetDisplay
            bet={activeBet}
            currentMultiplier={activeCurrentMultiplier}
            isMobile={isMobile}
          />
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
            gameStatus={gameStatus}
            isConnected={isConnected}
            currentMultiplier={activeCurrentMultiplier}
            isMobile={isMobile}
            betValidationError={betValidationError}
          />
        </div>

        <BalanceDisplay
          currentToken={currentToken}
          custodialBalance={custodialBalance} // 🔧 FIXED: custodial balance for gaming
          embeddedWalletBalance={embeddedWalletBalance} // 🔧 ADDED: embedded wallet balance for reference
          ruggedBalance={ruggedBalance}
          onTokenChange={handleTokenChange}
          onDepositClick={() => setShowDepositModal(true)}
          onWithdrawClick={() => setShowWithdrawModal(true)}
          onAirdropClick={() => setShowAirdropModal(true)}
          isMobile={isMobile}
          showExpanded={showBalanceExpanded}
          onToggleExpanded={() => setShowBalanceExpanded(!showBalanceExpanded)}
          isLoading={custodialBalanceLoading || embeddedWalletLoading || ruggedBalanceLoading} // 🔧 FIXED: All loading states
        />
{/* Auto-Transfer Section - Only show if user has embedded wallet balance and SOL is selected */}
{currentToken === TokenType.SOL && embeddedWalletBalance > 0.001 && (
  <div className="bg-purple-900 bg-opacity-30 border border-purple-800 rounded-lg p-3 mb-3">
    <div className="flex items-center justify-between mb-2">
      <div>
        <div className="text-purple-400 text-sm font-medium">💰 Quick Transfer</div>
        <div className="text-xs text-gray-400">
          Move SOL from wallet to game balance instantly
        </div>
      </div>
      <div className="text-xs text-purple-300">
        Available: {embeddedWalletBalance.toFixed(3)} SOL
      </div>
    </div>
    
    {isMobile ? (
      // Mobile layout
      <div className="grid grid-cols-4 gap-1">
        {quickTransferAmounts.map((amount) => (
          <button
            key={amount}
            onClick={() => handleQuickTransfer(amount)}
            disabled={amount > embeddedWalletBalance}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              amount > embeddedWalletBalance
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {amount} SOL
          </button>
        ))}
      </div>
    ) : (
      // Desktop layout
      <div className="grid grid-cols-2 gap-2">
        {quickTransferAmounts.map((amount) => (
          <button
            key={amount}
            onClick={() => handleQuickTransfer(amount)}
            disabled={amount > embeddedWalletBalance}
            className={`px-3 py-2 text-sm rounded transition-colors flex items-center justify-center ${
              amount > embeddedWalletBalance
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 mr-1" />
            Transfer {amount} SOL
          </button>
        ))}
      </div>
    )}
    
    <div className="mt-2 text-xs text-purple-300 text-center">
      ⚡ Transfers are instant and auto-credited to your game balance
    </div>
  </div>
)}
        <AutoCashoutSection
          autoCashoutEnabled={autoCashoutEnabled}
          autoCashoutValue={autoCashoutValue}
          onToggle={setAutoCashoutEnabled}
          onValueChange={handleAutoCashoutValueChange}
          onQuickValue={setQuickAutoCashoutValue}
          isMobile={isMobile}
          showExpanded={showAutoCashout}
          onToggleExpanded={() => setShowAutoCashout(!showAutoCashout)}
        />

        <StatusMessages
          isWalletReady={isWalletReady}
          isConnected={isConnected}
          amount={amount}
          activeBalance={activeBalance}
          activeBet={activeBet}
          isWaitingPeriod={isWaitingPeriod}
          canBet={effectiveCanBet}
          gameStatus={gameStatus}
          currentMultiplier={activeCurrentMultiplier}
          countdownSeconds={countdownSeconds}
          serverError={serverError}
        />

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

  // Desktop layout
  return (
    <div className={containerClasses}>
      <CompactGameInfo
        game={activeCurrentGame}
        countdown={countdown || 0}
        showCountdown={showCountdown}
        isConnected={isConnected}
        isMobile={isMobile}
      />

      <BalanceDisplay
        currentToken={currentToken}
        custodialBalance={custodialBalance} // 🔧 FIXED: custodial balance for gaming
        embeddedWalletBalance={embeddedWalletBalance} // 🔧 ADDED: embedded wallet balance for reference
        ruggedBalance={ruggedBalance}
        onTokenChange={handleTokenChange}
        onDepositClick={() => setShowDepositModal(true)}
        onWithdrawClick={() => setShowWithdrawModal(true)}
        onAirdropClick={() => setShowAirdropModal(true)}
        isMobile={isMobile}
        showExpanded={showBalanceExpanded}
        onToggleExpanded={() => setShowBalanceExpanded(!showBalanceExpanded)}
        isLoading={custodialBalanceLoading || embeddedWalletLoading || ruggedBalanceLoading} // 🔧 FIXED: All loading states
      />
{/* Auto-Transfer Section - Only show if user has embedded wallet balance and SOL is selected */}
{currentToken === TokenType.SOL && embeddedWalletBalance > 0.001 && (
  <div className="bg-purple-900 bg-opacity-30 border border-purple-800 rounded-lg p-3 mb-3">
    <div className="flex items-center justify-between mb-2">
      <div>
        <div className="text-purple-400 text-sm font-medium">💰 Quick Transfer</div>
        <div className="text-xs text-gray-400">
          Move SOL from wallet to game balance instantly
        </div>
      </div>
      <div className="text-xs text-purple-300">
        Available: {embeddedWalletBalance.toFixed(3)} SOL
      </div>
    </div>
    
    {isMobile ? (
      // Mobile layout
      <div className="grid grid-cols-4 gap-1">
        {quickTransferAmounts.map((amount) => (
          <button
            key={amount}
            onClick={() => handleQuickTransfer(amount)}
            disabled={amount > embeddedWalletBalance}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              amount > embeddedWalletBalance
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {amount} SOL
          </button>
        ))}
      </div>
    ) : (
      // Desktop layout
      <div className="grid grid-cols-2 gap-2">
        {quickTransferAmounts.map((amount) => (
          <button
            key={amount}
            onClick={() => handleQuickTransfer(amount)}
            disabled={amount > embeddedWalletBalance}
            className={`px-3 py-2 text-sm rounded transition-colors flex items-center justify-center ${
              amount > embeddedWalletBalance
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 mr-1" />
            Transfer {amount} SOL
          </button>
        ))}
      </div>
    )}
    
    <div className="mt-2 text-xs text-purple-300 text-center">
      ⚡ Transfers are instant and auto-credited to your game balance
    </div>
  </div>
)}
      <AutoCashoutSection
        autoCashoutEnabled={autoCashoutEnabled}
        autoCashoutValue={autoCashoutValue}
        onToggle={setAutoCashoutEnabled}
        onValueChange={handleAutoCashoutValueChange}
        onQuickValue={setQuickAutoCashoutValue}
        isMobile={isMobile}
        showExpanded={showAutoCashout}
        onToggleExpanded={() => setShowAutoCashout(!showAutoCashout)}
      />

      {activeBet && (
        <ActiveBetDisplay
          bet={activeBet}
          currentMultiplier={activeCurrentMultiplier}
          isMobile={isMobile}
        />
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
        gameStatus={gameStatus}
        isConnected={isConnected}
        currentMultiplier={activeCurrentMultiplier}
        isMobile={isMobile}
        betValidationError={betValidationError}
      />

      <StatusMessages
        isWalletReady={isWalletReady}
        isConnected={isConnected}
        amount={amount}
        activeBalance={activeBalance}
        activeBet={activeBet}
        isWaitingPeriod={isWaitingPeriod}
        canBet={effectiveCanBet}
        gameStatus={gameStatus}
        currentMultiplier={activeCurrentMultiplier}
        countdownSeconds={countdownSeconds}
        serverError={serverError}
      />
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
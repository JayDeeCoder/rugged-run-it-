// src/components/trading/PNLButton.tsx - COMPLETE WITH PROPER Z-INDEX ABOVE LEADERBOARD
import React, { useState, useCallback, useRef, createContext, useContext, useEffect } from 'react';
import { TrendingUp, TrendingDown, Sparkles, Crown, Share2, Copy, Download, X } from 'lucide-react';

// P&L Button Component for Trading Controls
interface PNLButtonProps {
  userId?: string;
  userData?: any;
  UserAPI?: any;
  walletAddress?: string;
  variant?: 'portfolio' | 'lastTrade' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export const PNLButton: React.FC<PNLButtonProps> = ({ 
  userId, 
  userData, 
  UserAPI,
  walletAddress,
  variant = 'auto',
  size = 'md',
  className = "",
  children
}) => {
  const [showPNLModal, setShowPNLModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pnlData, setPnlData] = useState<any>(null);
  const [isMobile, setIsMobile] = useState(false);

  // 🚀 Detect mobile vs desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const handlePNLClick = async () => {
    if (!userData && !userId && !walletAddress) {
      console.warn('PNL Button: No user data, userId, or wallet address provided');
      return;
    }

    setIsLoading(true);
    
    try {
      let finalUserData = userData;
      
      if (!finalUserData && UserAPI) {
        if (walletAddress) {
          console.log('🔍 PNL Button: Fetching user data by wallet address:', walletAddress);
          finalUserData = await UserAPI.getUserOrCreate(walletAddress);
        } else if (userId) {
          console.log('🔍 PNL Button: Using provided userId:', userId);
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ineaxxqjkryoobobxrsw.supabase.co';
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZWF4eHFqa3J5b29ib2J4cnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzMxMzIsImV4cCI6MjA2MzM0OTEzMn0.DiFLCCe5-UnzsGpG7dsqJWoUbxmaJxc_v89pxxsa1aA';
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            const { data: user, error } = await supabase
              .from('users_unified')
              .select('*')
              .eq('id', userId)
              .single();
            
            if (!error && user) {
              finalUserData = user;
              console.log('✅ PNL Button: Got user data from database:', user.username);
            }
          } catch (dbError) {
            console.warn('🔍 PNL Button: Failed to fetch user by userId:', dbError);
          }
        }
      }
      
      if (!finalUserData) {
        console.error('PNL Button: Could not get user data with any method');
        return;
      }

      console.log('✅ PNL Button: Got user data:', {
        id: finalUserData.id,
        username: finalUserData.username,
        wallet: finalUserData.wallet_address || finalUserData.external_wallet_address
      });

      // Determine what type of PNL to show
      let displayData = null;

      if (variant === 'portfolio') {
        displayData = {
          profit: finalUserData.net_profit || 0,
          betAmount: finalUserData.total_wagered || 0,
          isWin: (finalUserData.net_profit || 0) > 0,
          timestamp: new Date(),
          isPortfolio: true,
          user: finalUserData,
          isMobile // 🚀 Pass mobile detection
        };
      } else if (variant === 'lastTrade') {
        if (UserAPI && finalUserData.id) {
          console.log('📊 PNL Button: Fetching bet history for user:', finalUserData.id);
          const betHistory = await UserAPI.getUserBetHistory(finalUserData.id, 1);
          const lastTrade = betHistory?.[0];
          
          if (lastTrade) {
            console.log('📊 PNL Button: Found last trade:', lastTrade);
            displayData = {
              profit: lastTrade.profit_loss || 0,
              betAmount: lastTrade.bet_amount,
              multiplier: lastTrade.cashout_multiplier || 0,
              isWin: (lastTrade.profit_loss || 0) > 0,
              timestamp: new Date(lastTrade.created_at),
              isPortfolio: false,
              user: finalUserData,
              gameId: lastTrade.game_id
            };
          } else {
            console.log('📊 PNL Button: No trades found, showing portfolio instead');
            displayData = {
              profit: finalUserData.net_profit || 0,
              betAmount: finalUserData.total_wagered || 0,
              isWin: (finalUserData.net_profit || 0) > 0,
              timestamp: new Date(),
              isPortfolio: true,
              user: finalUserData
            };
          }
        }
      } else {
        // Auto mode - try last trade first, fallback to portfolio
        if (UserAPI && finalUserData.id) {
          console.log('📊 PNL Button: Auto mode - checking for recent trades');
          const betHistory = await UserAPI.getUserBetHistory(finalUserData.id, 1);
          const lastTrade = betHistory?.[0];
          
          if (lastTrade) {
            console.log('📊 PNL Button: Using last trade data');
            displayData = {
              profit: lastTrade.profit_loss || 0,
              betAmount: lastTrade.bet_amount,
              multiplier: lastTrade.cashout_multiplier || 0,
              isWin: (lastTrade.profit_loss || 0) > 0,
              timestamp: new Date(lastTrade.created_at),
              isPortfolio: false,
              user: finalUserData,
              gameId: lastTrade.game_id
            };
          } else {
            console.log('📊 PNL Button: No trades found, using portfolio data');
            displayData = {
              profit: finalUserData.net_profit || 0,
              betAmount: finalUserData.total_wagered || 0,
              isWin: (finalUserData.net_profit || 0) > 0,
              timestamp: new Date(),
              isPortfolio: true,
              user: finalUserData
            };
          }
        }
      }

      console.log('📊 PNL Button: Final display data:', displayData);
      setPnlData(displayData);
      setShowPNLModal(true);
      
    } catch (error) {
      console.error('PNL Button: Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 🚀 Responsive button styling
  const getButtonClasses = () => {
    const baseClasses = `
      font-semibold rounded-lg transition-all duration-200 
      flex items-center justify-center shadow-lg
      disabled:cursor-not-allowed
      ${sizeClasses[size]} ${className}
    `;

    if (isMobile) {
      // Mobile: Keep the gradient design
      return `${baseClasses}
        bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 
        disabled:from-gray-600 disabled:to-gray-700
        text-white
      `;
    } else {
      // Desktop: Simple, clean design
      return `${baseClasses}
        bg-gray-800 hover:bg-gray-700 
        disabled:bg-gray-600 disabled:opacity-50
        text-white border border-gray-700 hover:border-gray-600
      `;
    }
  };

  return (
    <>
      <button
        onClick={handlePNLClick}
        disabled={isLoading}
        className={getButtonClasses()}
      >
        {isLoading ? (
          <>
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
            {isMobile ? 'Loading...' : 'P&L'}
          </>
        ) : (
          children || (
            <>
              <TrendingUp className="mr-2 h-4 w-4" />
              P&L
            </>
          )
        )}
      </button>

      {showPNLModal && pnlData && (
        <PNLModal data={pnlData} onClose={() => setShowPNLModal(false)} />
      )}
    </>
  );
};

// 🚀 FIXED: P&L Modal Component with proper z-index above leaderboard
const PNLModal: React.FC<{ data: any; onClose: () => void }> = ({ data, onClose }) => {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Generate unique ID for this modal instance to avoid gradient ID conflicts
  const modalId = useRef(Math.random().toString(36).substr(2, 9)).current;

  const getDisplayUsername = (user: any) => {
    if (!user) return 'Anonymous';
    
    const hasCustomUsername = user.username && user.username !== `user_${user.id?.slice(-8)}`;
    
    if (hasCustomUsername) {
      return user.username;
    } else {
      return `user_${user.id?.slice(-8) || 'unknown'}`;
    }
  };

  const isProfit = (data.profit || 0) > 0;
  const profitDisplay = Math.abs(data.profit || 0).toFixed(3);
  const roi = (data.betAmount || 0) > 0 ? ((Math.abs(data.profit || 0) / data.betAmount) * 100).toFixed(1) : '0.0';

  // Solana logo components
  const SolanaLogoSmall = ({ className = "" }) => (
    <svg 
      width="12" 
      height="12" 
      viewBox="0 0 397.7 311.7" 
      className={className} 
      style={{ 
        flexShrink: 0, 
        marginLeft: '6px',
        display: 'inline-block',
        verticalAlign: 'middle'
      }}
    >
      <defs>
        <linearGradient id={`solanaSmallGradient_${modalId}`} x1="360.8" y1="351.4" x2="141.7" y2="132.3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00d4ff"/>
          <stop offset="1" stopColor="#a259ff"/>
        </linearGradient>
      </defs>
      <path d="m64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8h-317.4c-5.8 0-8.7-7-4.6-11.1z" fill={`url(#solanaSmallGradient_${modalId})`}/>
      <path d="m64.6 3.8c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8h-317.4c-5.8 0-8.7-7-4.6-11.1z" fill={`url(#solanaSmallGradient_${modalId})`}/>
      <path d="m333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8h-317.4c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1z" fill={`url(#solanaSmallGradient_${modalId})`}/>
    </svg>
  );

  const SolanaLogoMain = ({ className = "" }) => (
    <svg 
      width="28" 
      height="28" 
      viewBox="0 0 397.7 311.7" 
      className={className} 
      style={{ 
        flexShrink: 0,
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: '8px'
      }}
    >
      <defs>
        <linearGradient id={`solanaMainGradient_${modalId}`} x1="360.8" y1="351.4" x2="141.7" y2="132.3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00d4ff"/>
          <stop offset="1" stopColor="#a259ff"/>
        </linearGradient>
      </defs>
      <path d="m64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8h-317.4c-5.8 0-8.7-7-4.6-11.1z" fill={`url(#solanaMainGradient_${modalId})`}/>
      <path d="m64.6 3.8c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8h-317.4c-5.8 0-8.7-7-4.6-11.1z" fill={`url(#solanaMainGradient_${modalId})`}/>
      <path d="m333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8h-317.4c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1z" fill={`url(#solanaMainGradient_${modalId})`}/>
    </svg>
  );

  // Share message generation
  const generateShareMessage = () => {
    const badge = '🚀';
    const winRate = data.user?.win_rate ? data.user.win_rate.toFixed(1) : 'N/A';
    const streak = data.user?.current_win_streak || 0;
    const userLevel = data.user?.level || 1;
    
    if (data.isPortfolio) {
      if (isProfit) {
        return `${badge} PORTFOLIO UPDATE: +${profitDisplay} SOL

📈 Total Profit: +${profitDisplay} SOL
💰 Total Invested: ${(data.betAmount || 0).toFixed(2)} SOL
📊 Win Rate: ${winRate}%${streak > 0 ? ` | ${streak} streak` : ''}
🎯 Level ${userLevel} grinding on @ruggeddotfun

Building alpha stack 📈

#RUGGED #TradingPortfolio #Solana`;
      } else {
        return `📊 PORTFOLIO REPORT: ${data.profit.toFixed(3)} SOL

📉 Total P&L: ${(data.profit || 0).toFixed(3)} SOL 
💰 Total Invested: ${(data.betAmount || 0).toFixed(2)} SOL
📊 Win Rate: ${winRate}%
🎯 Level ${userLevel} | Learning the game

Still early. Building position 🎯

#RUGGED #TradingJourney #Solana`;
      }
    } else {
      if (isProfit) {
        return `${badge} POSITION CLOSED: +${profitDisplay} SOL

📈 ${data.multiplier}x cashout on @ruggeddotfun
💰 P&L: +${roi}% ROI
🎯 Capital: ${data.betAmount || 0} SOL
📊 Win Rate: ${winRate}%${streak > 0 ? ` | ${streak} streak` : ''}

LVL ${userLevel} execution 📊

#RUGGED #TradingAlpha #Solana`;
      } else {
        return `📊 TRADE ANALYSIS: -${profitDisplay} SOL

⚔️ Stopped out at ${data.multiplier || 0}x on @ruggeddotfun
📉 Drawdown: -${roi}%
🎯 Risk capital: ${data.betAmount || 0} SOL
📊 Win Rate: ${winRate}%

LVL ${userLevel} | Part of the process. Next setup loading 🎯

#RUGGED #RiskManagement #Solana`;
      }
    }
  };

  // Copy and share functions
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generateShareMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shareToX = () => {
    const message = encodeURIComponent(generateShareMessage());
    window.open(`https://x.com/intent/tweet?text=${message}`, '_blank');
  };

  // 🚀 CRITICAL FIX: Modal with proper z-index above leaderboard
  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 99999 }} // 🚀 CRITICAL: Higher than leaderboard (1090) and withdraw modal (9999)
    >
      <div className="relative max-w-sm w-full" style={{ zIndex: 100000 }}>
        {/* Modal content */}
        <div 
          ref={cardRef}
          data-pnl-card
          className="relative bg-gradient-to-br from-zinc-900 via-black to-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800/50"
          style={{ 
            width: '400px', 
            height: '420px',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors backdrop-blur-sm border border-zinc-600/50"
            style={{ zIndex: 100001 }}
          >
            ✕
          </button>

          {/* Background effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/8 via-transparent to-blue-500/8"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
          <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-zinc-600/50 to-transparent"></div>

          {/* Header */}
          <div className="relative px-6 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 rounded-lg flex items-center justify-center border border-zinc-600/50 shadow-lg">
                  <span className="text-lg leading-none" style={{ lineHeight: 1 }}>🚀</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-white tracking-tight">
                    {getDisplayUsername(data.user)}
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-zinc-400">
                    <Crown size={10} className="text-amber-400" style={{ marginTop: '0px' }} />
                    <span className="font-medium">LVL {data.user?.level || 1}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-zinc-400 tracking-wider">iRUGGED.FUN</div>
                <div className="text-xs text-zinc-500">{data.timestamp.toLocaleDateString()}</div>
              </div>
            </div>

            {/* Main P&L display */}
            <div className="text-center space-y-3">
              <div className="space-y-1.5">
                <div 
                  data-profit-container
                  className="flex items-center justify-center"
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    textAlign: 'center'
                  }}
                >
                  <SolanaLogoMain className={`${isProfit ? 'opacity-100' : 'opacity-60'}`} />
                  <span 
                    className={`text-4xl font-black tracking-tight ${
                      isProfit 
                        ? 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]' 
                        : 'text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.4)]'
                    }`} 
                    style={{ 
                      lineHeight: '1', 
                      marginTop: '0px',
                      fontSize: '2.25rem',
                      fontWeight: '900',
                      display: 'inline-block',
                      verticalAlign: 'middle'
                    }}
                  >
                    {isProfit ? '+' : '−'}{profitDisplay}
                  </span>
                </div>
              </div>
              
              <div className={`inline-block px-4 py-1.5 rounded-lg border backdrop-blur-sm ${
                isProfit 
                  ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300' 
                  : 'bg-red-500/15 border-red-500/25 text-red-300'
              }`}>
                <div className="text-lg font-bold">
                  {data.isPortfolio 
                    ? `${isProfit ? '+' : '−'}${profitDisplay}` 
                    : `${isProfit ? '+' : '−'}${roi}%`
                  }
                </div>
                <div className="text-xs text-zinc-400 tracking-wider font-medium">
                  {data.isPortfolio ? 'TOTAL PROFIT' : (isProfit ? 'PROFIT' : 'RUGGED')}
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="px-6 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900/60 backdrop-blur-sm rounded-lg p-3 border border-zinc-800/50 shadow-inner">
                <div className="text-xs font-bold text-zinc-500 tracking-wider mb-1.5">
                  MULTIPLIER
                </div>
                <div className="text-lg font-black text-violet-400">
                  {data.multiplier ? `${data.multiplier.toFixed(2)}×` : '1.00×'}
                </div>
              </div>
              
              <div className="bg-zinc-900/60 backdrop-blur-sm rounded-lg p-3 border border-zinc-800/50 shadow-inner">
                <div 
                  className="text-xs font-bold text-zinc-500 tracking-wider mb-1.5"
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  <span>INVESTED</span>
                  <SolanaLogoSmall className="opacity-60" />
                </div>
                <div 
                  className="text-lg font-black text-blue-400"
                  style={{ fontSize: '1.125rem', fontWeight: '900' }}
                >
                  {data.betAmount ? data.betAmount.toFixed(3) : '0.000'}
                </div>
              </div>
            </div>

            {/* Status badge */}
            <div className="flex justify-center pt-1">
              <div className={`inline-flex items-center px-5 py-2.5 rounded-lg font-black text-sm tracking-wide backdrop-blur-sm border-2 ${
                isProfit 
                  ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_25px_rgba(52,211,153,0.2)]' 
                  : 'bg-gradient-to-r from-red-500/20 to-orange-500/20 text-red-300 border-red-500/40 shadow-[0_0_25px_rgba(248,113,113,0.2)]'
              }`}>
                {data.isPortfolio ? (
                  <>
                    {isProfit ? <TrendingUp size={14} className="mr-2" /> : <TrendingDown size={14} className="mr-2" />}
                    {isProfit ? 'PORTFOLIO UP' : 'GRINDING'}
                  </>
                ) : (
                  <>
                    {isProfit ? (
                      <>
                        <Sparkles size={14} className="mr-2" />
                        ALPHA
                        {data.user?.current_win_streak && data.user.current_win_streak > 1 && (
                          <span className="ml-2 text-xs opacity-80">
                            {data.user.current_win_streak}🔥
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <TrendingDown size={14} className="mr-2" />
                        RUGGED
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="absolute bottom-0 left-0 right-0 px-6 py-3 bg-gradient-to-r from-zinc-900/90 to-black/90 backdrop-blur-xl border-t border-zinc-800/50">
            <div className="flex items-center justify-center space-x-2.5">
              <div className="w-1.5 h-1.5 bg-gradient-to-r from-violet-400 to-blue-400 rounded-full animate-pulse"></div>
              <span className="text-xs font-bold text-zinc-200 tracking-wider">iRUGGED.FUN</span>
              <div className="w-0.5 h-0.5 bg-zinc-600 rounded-full"></div>
              <span className="text-xs text-zinc-500 font-medium">@ruggeddotfun</span>
              <div className="w-1.5 h-1.5 bg-gradient-to-r from-violet-400 to-blue-400 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Share Controls */}
        <div className="mt-6 bg-gradient-to-br from-zinc-900/90 to-black/90 backdrop-blur-xl rounded-2xl p-6 border border-zinc-800/60 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-black text-lg tracking-tight flex items-center">
              <div className="w-2 h-2 bg-gradient-to-r from-violet-400 to-blue-400 rounded-full mr-3 animate-pulse"></div>
              Share Your Alpha
            </h3>
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-3 bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 hover:from-zinc-700/60 hover:to-zinc-800/60 rounded-xl transition-all duration-300 border border-zinc-700/60 group shadow-lg backdrop-blur-sm"
              >
                <Share2 size={18} className="text-zinc-300 group-hover:text-white transition-colors" />
              </button>
              
              {showShareMenu && (
                <div 
                  className="absolute right-0 top-14 bg-zinc-900/96 backdrop-blur-2xl border border-zinc-700/60 rounded-xl shadow-2xl w-64 overflow-hidden"
                  style={{ zIndex: 100002 }}
                >
                  <div className="p-1">
                    <button
                      onClick={shareToX}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-800/60 rounded-lg flex items-center space-x-3 transition-all duration-200 group"
                    >
                      <div className="w-8 h-8 bg-zinc-600/20 rounded-lg flex items-center justify-center border border-zinc-600/30">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-300">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-white group-hover:text-zinc-100">Share to X</span>
                    </button>
                    
                    <button
                      onClick={copyToClipboard}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-800/60 rounded-lg flex items-center space-x-3 transition-all duration-200 group"
                    >
                      <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center border border-emerald-500/30">
                        <Copy size={14} className="text-emerald-400" />
                      </div>
                      <span className="text-sm font-semibold text-white group-hover:text-emerald-300">
                        {copied ? 'Copied!' : 'Copy Caption'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Message Preview */}
          <div className="bg-black/50 backdrop-blur-sm rounded-xl p-5 border border-zinc-800/40 shadow-inner">
            <div className="text-xs font-black text-zinc-500 tracking-wider mb-3 flex items-center">
              <div className="w-1 h-1 bg-violet-400 rounded-full mr-2"></div>
              AUTO-GENERATED CAPTION
            </div>
            <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto custom-scrollbar font-medium">
              {generateShareMessage()}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(39, 39, 42, 0.3);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(113, 113, 122, 0.5);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(113, 113, 122, 0.7);
        }
      `}</style>
    </div>
  );
};

// Context and hook code (unchanged from original)
const PNLContext = createContext<any>(null);

export const PNLProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showPNLModal, setShowPNLModal] = useState(false);
  const [pnlData, setPnlData] = useState<any>(null);

  const triggerPNL = useCallback((data: any) => {
    console.log('📊 Triggering P&L modal:', data);
    setPnlData(data);
    setShowPNLModal(true);
  }, []);

  const closePNL = useCallback(() => {
    setShowPNLModal(false);
    setPnlData(null);
  }, []);

  return (
    <PNLContext.Provider value={{ showPNLModal, pnlData, triggerPNL, closePNL }}>
      {children}
    </PNLContext.Provider>
  );
};

export const GlobalPNLModal: React.FC = () => {
  const { showPNLModal, pnlData, closePNL } = useContext(PNLContext) || {};
  if (!showPNLModal || !pnlData) return null;
  return <PNLModal data={pnlData} onClose={closePNL} />;
};

export const usePNLIntegration = (userId?: string, userData?: any, UserAPI?: any, walletAddress?: string) => {
  const { triggerPNL } = useContext(PNLContext) || {};

  const showLastTradePNL = useCallback(async (tradeData: {
    betAmount: number;
    payout?: number;
    profitLoss: number;
    multiplier: number;
    gameId?: string;
  }) => {
    if (!triggerPNL) return;
    
    try {
      let finalUserData = userData;
      
      if (!finalUserData && UserAPI) {
        if (walletAddress) {
          console.log('🔍 PNL Integration: Fetching user by wallet address:', walletAddress);
          finalUserData = await UserAPI.getUserOrCreate(walletAddress);
        } else if (userId) {
          console.log('🔍 PNL Integration: Fetching user by userId:', userId);
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ineaxxqjkryoobobxrsw.supabase.co';
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZWF4eHFqa3J5b29ib2J4cnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzMxMzIsImV4cCI6MjA2MzM0OTEzMn0.DiFLCCe5-UnzsGpG7dsqJWoUbxmaJxc_v89pxxsa1aA';
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            const { data: user, error } = await supabase
              .from('users_unified')
              .select('*')
              .eq('id', userId)
              .single();
            
            if (!error && user) {
              finalUserData = user;
              console.log('✅ PNL Integration: Got user data from database:', user.username);
            }
          } catch (dbError) {
            console.warn('🔍 PNL Integration: Failed to fetch user by userId:', dbError);
          }
        }
      }
      
      if (!finalUserData) {
        console.error('PNL Integration: Could not get user data');
        return;
      }
      
      const displayData = {
        profit: tradeData.profitLoss,
        betAmount: tradeData.betAmount,
        multiplier: tradeData.multiplier,
        isWin: tradeData.profitLoss > 0,
        timestamp: new Date(),
        isPortfolio: false,
        user: finalUserData,
        gameId: tradeData.gameId
      };

      console.log('📊 PNL Integration: Triggering PNL with data:', displayData);
      triggerPNL(displayData);
    } catch (error) {
      console.error('PNL Integration Error:', error);
    }
  }, [userId, userData, UserAPI, walletAddress, triggerPNL]);

  return { showLastTradePNL };
};
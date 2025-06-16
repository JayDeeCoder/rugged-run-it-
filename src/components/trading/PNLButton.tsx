// src/components/trading/PNLButton.tsx - COMPLETE FILE
import React, { useState, useCallback, useRef, createContext, useContext } from 'react';
import { TrendingUp, TrendingDown, Sparkles, Crown, Share2, Copy, Download, X } from 'lucide-react';

// P&L Button Component for Trading Controls
interface PNLButtonProps {
  userId?: string;
  userData?: any;
  UserAPI?: any;
  variant?: 'portfolio' | 'lastTrade' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export const PNLButton: React.FC<PNLButtonProps> = ({ 
  userId, 
  userData, 
  UserAPI,
  variant = 'auto',
  size = 'md',
  className = "",
  children
}) => {
  const [showPNLModal, setShowPNLModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pnlData, setPnlData] = useState<any>(null);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const handlePNLClick = async () => {
    if (!userData && !userId) {
      console.warn('PNL Button: No user data or ID provided');
      return;
    }

    setIsLoading(true);
    
    try {
      let finalUserData = userData;
      
      // Get user data if not provided
      if (!finalUserData && userId && UserAPI) {
        finalUserData = await UserAPI.getUserOrCreate(userId);
      }
      
      if (!finalUserData) {
        console.error('PNL Button: Could not get user data');
        return;
      }

      // Determine what type of PNL to show
      let displayData = null;

      if (variant === 'portfolio') {
        displayData = {
          profit: finalUserData.net_profit || 0,
          betAmount: finalUserData.total_wagered || 0,
          isWin: (finalUserData.net_profit || 0) > 0,
          timestamp: new Date(),
          isPortfolio: true,
          user: finalUserData
        };
      } else if (variant === 'lastTrade') {
        if (UserAPI) {
          const betHistory = await UserAPI.getUserBetHistory(finalUserData.id, 1);
          const lastTrade = betHistory?.[0];
          
          if (lastTrade) {
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
          }
        }
      } else {
        if (UserAPI) {
          const betHistory = await UserAPI.getUserBetHistory(finalUserData.id, 1);
          const lastTrade = betHistory?.[0];
          
          if (lastTrade) {
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

      setPnlData(displayData);
      setShowPNLModal(true);
      
    } catch (error) {
      console.error('PNL Button: Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handlePNLClick}
        disabled={isLoading}
        className={`
          bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 
          disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed
          text-white font-semibold rounded-lg transition-all duration-200 
          flex items-center justify-center shadow-lg
          ${sizeClasses[size]} ${className}
        `}
      >
        {isLoading ? (
          <>
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
            Loading...
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

// P&L Modal Component
const PNLModal: React.FC<{ data: any; onClose: () => void }> = ({ data, onClose }) => {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Generate unique ID for this modal instance to avoid gradient ID conflicts
  const modalId = useRef(Math.random().toString(36).substr(2, 9)).current;

  // Get username using same logic as UserContext
  const getDisplayUsername = (user: any) => {
    if (!user) return 'Anonymous';
    
    // Check if user has custom username (not the default generated one)
    const hasCustomUsername = user.username && user.username !== `user_${user.id?.slice(-8)}`;
    
    if (hasCustomUsername) {
      return user.username;
    } else {
      // Return the default format
      return `user_${user.id?.slice(-8) || 'unknown'}`;
    }
  };

  const isProfit = (data.profit || 0) > 0;
  const profitDisplay = Math.abs(data.profit || 0).toFixed(3);
  const roi = (data.betAmount || 0) > 0 ? ((Math.abs(data.profit || 0) / data.betAmount) * 100).toFixed(1) : '0.0';

  // Fixed Solana logo component with proper sizing for INVESTED section
  const SolanaLogoSmall = ({ className = "" }) => (
    <svg 
      width="12" 
      height="12" 
      viewBox="0 0 397.7 311.7" 
      className={className} 
      style={{ 
        flexShrink: 0, 
        marginLeft: '6px',
        display: 'block'
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

  // Fixed main Solana logo for profit display with proper alignment
  const SolanaLogoMain = ({ className = "" }) => (
    <svg 
      width="28" 
      height="28" 
      viewBox="0 0 397.7 311.7" 
      className={className} 
      style={{ 
        flexShrink: 0,
        display: 'block'
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

  const generateShareMessage = () => {
    const badge = '🚀'; // Always use rocket for consistency
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

  // Download image function with improved rendering
  const downloadImage = async () => {
    if (!cardRef.current) return;
    
    setIsGenerating(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      
      // Hide the close button before capturing
      const closeButton = cardRef.current.querySelector('.close-button') as HTMLElement;
      if (closeButton) {
        closeButton.style.display = 'none';
      }
      
      // Wait for fonts and images to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2, // Reduced from 3 for better performance
        width: 400,
        height: 420,
        useCORS: true,
        allowTaint: true,
        logging: false,
        ignoreElements: (element) => {
          return element.classList?.contains('close-button');
        },
        onclone: (clonedDoc) => {
          // Ensure proper styling in cloned document
          const clonedCard = clonedDoc.querySelector('[data-pnl-card]') as HTMLElement;
          if (clonedCard) {
            clonedCard.style.transform = 'none';
            clonedCard.style.position = 'relative';
          }
        }
      });
      
      // Show the close button again
      if (closeButton) {
        closeButton.style.display = 'flex';
      }
      
      const link = document.createElement('a');
      link.download = `irugged-pnl-${getDisplayUsername(data.user)}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      
    } catch (error) {
      console.error('Failed to generate image:', error);
      alert('Failed to generate image. Please try again.');
      
      // Make sure close button is visible again
      const closeButton = cardRef.current?.querySelector('.close-button') as HTMLElement;
      if (closeButton) {
        closeButton.style.display = 'flex';
      }
    } finally {
      setIsGenerating(false);
    }
  };

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

  const shareToDiscord = () => {
    copyToClipboard();
    window.open('https://discord.gg/dKDSsAw9', '_blank');
  };

  const shareToTelegram = () => {
    const message = encodeURIComponent(generateShareMessage());
    window.open(`https://t.me/share/url?url=https://irugged.fun&text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="relative max-w-sm w-full">
        {/* The PNL Card */}
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
          {/* Close button - with class for hiding during download */}
          <button
            onClick={onClose}
            className="close-button absolute top-4 right-4 z-10 w-8 h-8 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors backdrop-blur-sm border border-zinc-600/50"
          >
            ✕
          </button>

          {/* Glow effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/8 via-transparent to-blue-500/8"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
          <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-zinc-600/50 to-transparent"></div>

          {/* Header - Fixed positioning and alignment */}
          <div className="relative px-6 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                {/* Fixed avatar positioning - always use rocket emoji, properly centered */}
                <div className="w-9 h-9 bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 rounded-lg flex items-center justify-center border border-zinc-600/50 shadow-lg">
                  <span className="text-lg leading-none" style={{ lineHeight: 1 }}>🚀</span>
                </div>
                <div>
                  {/* Fixed username - ensure actual username is displayed */}
                  <div className="text-sm font-bold text-white tracking-tight">
                    {getDisplayUsername(data.user)}
                  </div>
                  {/* Fixed level and crown positioning */}
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

            {/* Main P&L display - Fixed profit figure alignment */}
            <div className="text-center space-y-3">
              <div className="space-y-1.5">
                {/* Fixed Solana logo and profit alignment - perfectly centered */}
                <div 
                  className="flex items-center justify-center" 
                  style={{ 
                    gap: '8px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    display: 'flex'
                  }}
                >
                  <SolanaLogoMain className={`${isProfit ? 'opacity-100' : 'opacity-60'}`} />
                  <div 
                    className={`text-4xl font-black tracking-tight ${
                      isProfit 
                        ? 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]' 
                        : 'text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.4)]'
                    }`} 
                    style={{ 
                      lineHeight: '1', 
                      marginTop: '0px',
                      fontSize: '2.25rem',
                      fontWeight: '900'
                    }}
                  >
                    {isProfit ? '+' : '−'}{profitDisplay}
                  </div>
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

          {/* Details - Fixed multiplier display and Solana logo positioning */}
          <div className="px-6 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Left card - Always show MULTIPLIER for both individual trades and portfolio */}
              <div className="bg-zinc-900/60 backdrop-blur-sm rounded-lg p-3 border border-zinc-800/50 shadow-inner">
                <div className="text-xs font-bold text-zinc-500 tracking-wider mb-1.5">
                  MULTIPLIER
                </div>
                <div className="text-lg font-black text-violet-400">
                  {data.multiplier ? `${data.multiplier.toFixed(2)}×` : '1.00×'}
                </div>
              </div>
              
              {/* Right card - Fixed Solana logo positioning and size */}
              <div className="bg-zinc-900/60 backdrop-blur-sm rounded-lg p-3 border border-zinc-800/50 shadow-inner">
                <div 
                  className="text-xs font-bold text-zinc-500 tracking-wider mb-1.5 flex items-center"
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

        {/* Share Controls - unchanged */}
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
                <div className="absolute right-0 top-14 bg-zinc-900/96 backdrop-blur-2xl border border-zinc-700/60 rounded-xl shadow-2xl z-20 w-64 overflow-hidden">
                  <div className="p-1">
                    <button
                      onClick={downloadImage}
                      disabled={isGenerating}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-800/60 rounded-lg flex items-center space-x-3 disabled:opacity-50 transition-all duration-200 group"
                    >
                      <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                        <Download size={14} className="text-blue-400" />
                      </div>
                      <span className="text-sm font-semibold text-white group-hover:text-blue-300">
                        {isGenerating ? 'Generating...' : 'Download PNG'}
                      </span>
                    </button>
                    
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
                      onClick={shareToDiscord}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-800/60 rounded-lg flex items-center space-x-3 transition-all duration-200 group"
                    >
                      <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center border border-indigo-500/30">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.249a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.249a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-white group-hover:text-indigo-300">Share to Discord</span>
                    </button>
                    
                    <button
                      onClick={shareToTelegram}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-800/60 rounded-lg flex items-center space-x-3 transition-all duration-200 group"
                    >
                      <div className="w-8 h-8 bg-blue-400/20 rounded-lg flex items-center justify-center border border-blue-400/30">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-blue-400">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19c-.14.75-.42 1-.68 1.03c-.58.05-1.02-.38-1.58-.75c-.88-.58-1.38-.94-2.23-1.5c-.99-.65-.35-1.01.22-1.59c.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02c-.09.02-1.49.95-4.22 2.79c-.4.27-.76.41-1.08.4c-.36-.01-1.04-.2-1.55-.37c-.63-.2-1.12-.31-1.08-.66c.02-.18.27-.36.74-.55c2.92-1.27 4.86-2.11 5.83-2.51c2.78-1.16 3.35-1.36 3.73-1.36c.08 0 .27.02.39.12c.1.08.13.19.14.27c-.01.06.01.24 0 .38z"/>
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-white group-hover:text-blue-300">Share to Telegram</span>
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

// Context for global P&L state
const PNLContext = createContext<any>(null);

// Provider component
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

// Global modal
export const GlobalPNLModal: React.FC = () => {
  const { showPNLModal, pnlData, closePNL } = useContext(PNLContext) || {};
  if (!showPNLModal || !pnlData) return null;
  return <PNLModal data={pnlData} onClose={closePNL} />;
};

// Working integration hook
export const usePNLIntegration = (userId?: string, userData?: any, UserAPI?: any) => {
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
      if (!finalUserData && userId && UserAPI) {
        finalUserData = await UserAPI.getUserOrCreate(userId);
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

      triggerPNL(displayData);
    } catch (error) {
      console.error('PNL Error:', error);
    }
  }, [userId, userData, UserAPI, triggerPNL]);

  return { showLastTradePNL };
};
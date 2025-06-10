// src/components/chat/ChatBox.tsx - Updated with highlighted toggle button
import { FC, useEffect, useRef, useState, useContext } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useChat } from '../../context/ChatContext';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useGameSocket } from '../../hooks/useGameSocket';

const ChatBox: FC = () => {
  const { messages, sendMessage, isConnected: chatConnected, activeUsers, isLoading } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { authenticated, login } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { currentUser } = useContext(UserContext);
  const [isMobile, setIsMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Get wallet address for game socket
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // Connect to game socket to get player count data
  const { 
    currentGame, 
    isConnected: gameConnected 
  } = useGameSocket(walletAddress, currentUser?.id);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Auto-collapse on mobile if needed, but keep expanded by default
      if (mobile && window.innerWidth < 640) {
        setIsCollapsed(false); // Keep expanded on mobile for better UX
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (messagesEndRef.current && !isCollapsed) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isCollapsed]);

  const handleSendMessage = (text: string) => {
    if (text.trim() && authenticated) {
      sendMessage(text);
    }
  };

  const handleLoginClick = () => {
    login();
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Calculate total active users: chat users + total game players (real + boosted)
  const calculateTotalActiveUsers = () => {
    const chatUsers = activeUsers || 0;
    
    // Use the same logic as ChartContainer: boostedPlayerCount || totalPlayers
    const totalGamePlayers = currentGame?.boostedPlayerCount || currentGame?.totalPlayers || 0;
    
    // Combine chat users and total game players
    const totalActive = chatUsers + totalGamePlayers;
    
    return {
      total: totalActive,
      chat: chatUsers,
      game: totalGamePlayers,
      showBreakdown: totalActive > 0 && (chatUsers > 0 || totalGamePlayers > 0)
    };
  };

  const activeUserData = calculateTotalActiveUsers();
  const isOnline = chatConnected && gameConnected;

  return (
    <div className={`
      flex flex-col font-dynapuff bg-[#0d0d0f] transition-all duration-300 ease-in-out
      ${isCollapsed ? 'w-12' : 'w-full'}
      h-full
      border-r border-gray-800
    `}>
      
      {/* Header with collapse toggle */}
      <div className="flex justify-between items-center p-3 border-b border-gray-800 bg-[#0d0d0f] flex-shrink-0">
        {!isCollapsed && (
          <h2 className="text-sm text-white font-medium flex items-center">
            <span className={`h-2 w-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'} rounded-full mr-2`}></span>
            <div className="flex flex-col">
              <div className="flex items-center">
                <span className="mr-1">ONLINE</span>
                <span className="font-bold">
                  ({activeUserData.total > 0 ? activeUserData.total : '—'})
                </span>
              </div>
              {/* Show breakdown when there are users */}
              {activeUserData.showBreakdown && (
                <div className="text-xs text-gray-400 mt-0.5">
                  Chat: {activeUserData.chat} | Game: {activeUserData.game}
                </div>
              )}
            </div>
          </h2>
        )}
        
        {/* Social links and toggle button grouped together */}
        <div className="flex items-center space-x-1">
          {/* Social links - only show when expanded */}
          {!isCollapsed && (
            <div className="flex space-x-1 mr-1">
              <a href="https://discord.gg/ZhhGJXB4yD" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300 p-1 hover:bg-gray-700 rounded transition-colors">
                <Image
                  src="/images/icons8-discord.svg"
                  width={16}
                  height={16}
                  alt="Discord"
                />
              </a>
              <a href="https://x.com/ruggeddotfun" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300 p-1 hover:bg-gray-700 rounded transition-colors">
                <Image 
                  src="/images/x-social-media-white-icon.svg"
                  width={16}
                  height={16}
                  alt="X"
                />
              </a>
              <a href="https://telegram.org/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300 p-1 hover:bg-gray-700 rounded transition-colors">
                <Image
                  src="/images/telegram-plane-svgrepo-com.svg"
                  width={16}
                  height={16}
                  alt="Telegram"
                />
              </a>
            </div>
          )}
          
          {/* Enhanced collapse toggle button with better visibility */}
          <button
            onClick={toggleCollapse}
            className={`
              p-2 rounded-md transition-all duration-200 transform active:scale-95
              ${isCollapsed 
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white border border-gray-600'
              }
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800
            `}
            title={isCollapsed ? 'Expand chat' : 'Collapse chat'}
            aria-label={isCollapsed ? 'Expand chat' : 'Collapse chat'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      {/* Collapsed state - show minimal info */}
      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center justify-center p-2 space-y-4">
          <div className="text-center">
            <Users size={20} className="text-green-400 mx-auto mb-2" />
            <div className={`w-2 h-2 rounded-full mx-auto ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
          </div>
          
          {/* User count display vertically */}
          {activeUserData.total > 0 && (
            <div className="text-xs text-gray-400 text-center transform -rotate-90 whitespace-nowrap">
              {activeUserData.total}
            </div>
          )}
          
          {/* New message indicator */}
          {messages.length > 0 && (
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          )}
          
          {/* Vertical social links */}
          <div className="flex flex-col space-y-3 mt-auto mb-4">
            <a href="https://discord.gg/ZhhGJXB4yD" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300 p-1 hover:bg-gray-700 rounded transition-colors">
              <Image
                src="/images/icons8-discord.svg"
                width={14}
                height={14}
                alt="Discord"
              />
            </a>
            <a href="https://x.com/ruggeddotfun" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300 p-1 hover:bg-gray-700 rounded transition-colors">
              <Image 
                src="/images/x-social-media-white-icon.svg"
                width={14}
                height={14}
                alt="X"
              />
            </a>
            <a href="https://telegram.org/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300 p-1 hover:bg-gray-700 rounded transition-colors">
              <Image
                src="/images/telegram-plane-svgrepo-com.svg"
                width={14}
                height={14}
                alt="Telegram"
              />
            </a>
          </div>
        </div>
      )}

      {/* Expanded state - full chat interface */}
      {!isCollapsed && (
        <>
          {/* Connection Status - Show if either chat or game is disconnected */}
          {(!chatConnected || !gameConnected) && (
            <div className="px-3 py-1 bg-yellow-900/50 border-b border-yellow-600/30 flex-shrink-0">
              <div className="text-xs text-yellow-400 flex items-center justify-center">
                <span className="mr-2">⚠️</span>
                {!chatConnected && !gameConnected && "Chat & Game Offline"}
                {!chatConnected && gameConnected && "Chat Offline"}
                {chatConnected && !gameConnected && "Game Offline"}
              </div>
            </div>
          )}

          {/* Chat messages */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent min-h-0"
            style={{
              maxHeight: isMobile ? 'calc(75vh - 120px)' : 'calc(100vh - 200px)',
            }}
          >
            {!authenticated ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <div className="text-gray-400 mb-4">Please login to chat</div>
                <button 
                  onClick={handleLoginClick}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
                >
                  Login
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-pulse text-gray-400">Loading messages...</div>
              </div>
            ) : (
              <div className="p-2">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 my-4">
                    No messages yet. Be the first to chat!
                  </div>
                ) : (
                  messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Chat input - Always visible at bottom when expanded */}
          <div className="border-t border-gray-800 bg-[#0d0d0f] flex-shrink-0">
            <ChatInput onSendMessage={handleSendMessage} />
            
            {/* Debug info in development */}
            {process.env.NODE_ENV === 'development' && (
              <div className="px-2 pb-2 text-xs text-gray-500 flex justify-between">
                <span>Chat: {activeUserData.chat}</span>
                <span>Game: {activeUserData.game}</span>
                <span>Total: {activeUserData.total}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ChatBox;
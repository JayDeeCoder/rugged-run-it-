// src/components/chat/ChatBox.tsx
import { FC, useEffect, useRef, useState, useContext } from 'react';
import Image from 'next/image';
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
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = (text: string) => {
    if (text.trim() && authenticated) {
      sendMessage(text);
    }
  };

  const handleLoginClick = () => {
    login();
  };

  // Calculate total active users: chat users + total game players (real + boosted)
  const calculateTotalActiveUsers = () => {
    const chatUsers = activeUsers || 0;
    
    // Use the same logic as ChartContainer: boostedPlayerCount || totalPlayers
    const totalGamePlayers = currentGame?.boostedPlayerCount || currentGame?.totalPlayers || 0;
    
    // Combine chat users and total game players
    // Note: There might be overlap between chat users and game players,
    // but for display purposes we show the combined count
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
    <div className="flex flex-col font-dynapuff h-[75vh] md:h-[90vh] max-h-[400px] md:max-h-[950px] min-h-[350px] bg-[#0d0d0f] border-r border-b border-gray-800">
      {/* Header */}
      <div className="flex justify-between p-3 border-b border-gray-800 bg-[#0d0d0f] flex-shrink-0">
        <h2 className="text-sm text-white font-medium flex items-center">
          <span className={`h-2 w-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'} rounded-full mr-2`}></span>
          <div className="flex flex-col">
            <div className="flex items-center">
              <span className="mr-1">ONLINE</span>
              <span className="font-bold">
                ({activeUserData.total > 0 ? activeUserData.total : '—'})
              </span>
            </div>
            {/* Show breakdown on hover or when there are users */}
            {activeUserData.showBreakdown && (
              <div className="text-xs text-gray-400 mt-0.5">
                Chat: {activeUserData.chat} | Game: {activeUserData.game}
              </div>
            )}
          </div>
        </h2>
        <div className="flex space-x-3">
          <a href="https://discord.gg/trrn7EZH" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300">
            <Image
              src="/images/icons8-discord.svg"
              width={20}
              height={20}
              alt="Discord"
            />
          </a>
          <a href="https://x.com/ruggeddotfun" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300">
            <Image 
              src="/images/x-social-media-white-icon.svg"
              width={20}
              height={20}
              alt="X"
            />
          </a>
          <a href="https://telegram.org/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300">
            <Image
              src="/images/telegram-plane-svgrepo-com.svg"
              width={20}
              height={20}
              alt="Telegram"
            />
          </a>
        </div>
      </div>

      {/* Connection Status - Show if either chat or game is disconnected */}
      {(!chatConnected || !gameConnected) && (
        <div className="px-3 py-1 bg-yellow-900/50 border-b border-yellow-600/30">
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
        className="flex-1 overflow-y-auto scrollbar-hide min-h-0"
        style={{
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          maxHeight: isMobile ? 'calc(75vh - 120px)' : 'calc(90vh - 120px)',
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

      {/* Chat input - Always visible at bottom */}
      <div className="border-t border-gray-800 bg-[#0d0d0f] p-2 flex-shrink-0">
        <ChatInput onSendMessage={handleSendMessage} />
        
        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-1 text-xs text-gray-500 flex justify-between">
            <span>Chat: {activeUserData.chat} users</span>
            <span>Game: {activeUserData.game} ruggers</span>
            <span>Total: {activeUserData.total}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBox;
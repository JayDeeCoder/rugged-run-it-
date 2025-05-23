// src/components/chat/ChatBox.tsx
import { FC, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useChat } from '../../context/ChatContext';
import { usePrivy } from '@privy-io/react-auth';

const ChatBox: FC = () => {
  const { messages, sendMessage, isConnected, activeUsers, isLoading } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { authenticated, login } = usePrivy();
  const [isMobile, setIsMobile] = useState(false);

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

  return (
    <div className="flex flex-col font-dynapuff h-[75vh] md:h-[90vh] max-h-[400px] md:max-h-[950px] min-h-[350px] bg-[#0d0d0f] border-r border-b border-gray-800">
      {/* Header */}
      <div className="flex justify-between p-3 border-b border-gray-800 bg-[#0d0d0f] flex-shrink-0">
        <h2 className="text-sm text-white font-medium flex items-center">
          <span className={`h-2 w-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'} rounded-full mr-2`}></span>
          ONLINE ({activeUsers > 0 ? activeUsers : '—'})
        </h2>
        <div className="flex space-x-3">
          <a href="https://discord.com/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300">
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
      </div>
    </div>
  );
};

export default ChatBox;
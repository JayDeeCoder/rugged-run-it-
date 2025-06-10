// src/components/chat/MobileChat.tsx - Fixed for proper mobile screen coverage
import { FC, useState, useEffect } from 'react';
import ChatBox from './ChatBox';
import { MessageCircle, X } from 'lucide-react';

const MobileChat: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Toggle chat visibility
  const toggleChat = () => {
    setIsOpen(!isOpen);
    // Reset unread count when opening chat
    if (!isOpen) {
      setUnreadCount(0);
    }
  };

  // Close chat when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && !target.closest('.mobile-chat-container') && !target.closest('.chat-toggle-btn')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Demo: Simulate new message notifications
  useEffect(() => {
    if (!isOpen) {
      const interval = setInterval(() => {
        // Random chance to receive a "message" if chat is closed
        if (Math.random() > 0.9) {
          setUnreadCount(prev => prev + 1);
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Prevent body scroll when chat is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <>
      {/* Chat toggle button - positioned to avoid navbar */}
      <button 
        onClick={toggleChat}
        className="chat-toggle-btn fixed bottom-6 right-4 z-50 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 transform active:scale-95"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {isOpen ? (
          <X size={24} />
        ) : (
          <>
            <MessageCircle size={24} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Full screen chat overlay */}
      <div 
        className={`mobile-chat-container fixed inset-0 z-40 transition-all duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ 
          top: '4rem', // Account for fixed navbar (64px)
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)'
        }}
      >
        {/* Semi-transparent backdrop */}
        <div 
          className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
          onClick={toggleChat}
        />
        
        {/* Chat panel - slides in from right */}
        <div 
          className={`absolute top-0 right-0 h-full bg-[#0d0d0f] shadow-2xl flex flex-col transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          } w-full sm:w-96 max-w-full`}
        >
          {/* Chat header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#0d0d0f] flex-shrink-0">
            <h2 className="text-white font-bold text-lg">Live Chat</h2>
            <button 
              onClick={toggleChat} 
              className="text-gray-400 hover:text-white p-2 hover:bg-gray-700 rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Chat content - takes remaining height */}
          <div className="flex-1 overflow-hidden min-h-0">
            <div className="h-full">
              <ChatBox />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MobileChat;
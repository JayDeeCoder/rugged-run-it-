// src/components/chat/MobileChat.tsx
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
  
  return (
    <>
      {/* Chat toggle button */}
      <button 
        onClick={toggleChat}
        className="chat-toggle-btn fixed bottom-4 right-4 z-40 bg-green-600 hover:bg-green-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300"
      >
        {isOpen ? (
          <X size={24} />
        ) : (
          <>
            <MessageCircle size={24} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </>
        )}
      </button>
      
      {/* Chat container */}
      <div 
        className={`mobile-chat-container fixed inset-0 z-30 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="w-full h-full bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="w-full sm:w-96 h-full bg-[#0d0d0f] absolute right-0 shadow-lg flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <h2 className="text-white font-bold">Chat</h2>
              <button onClick={toggleChat} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatBox />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MobileChat;
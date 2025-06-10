// src/components/layout/CollapsibleSidebar.tsx - New collapsible sidebar wrapper
import { FC, useState, useRef, useEffect, useContext } from 'react';
import { Send, Smile, Users, Clock, ChevronLeft, ChevronRight, Minimize2 } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { ChatMessage } from '../../types/chat';

interface CollapsibleSidebarProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  onlineUsers?: number;
  isLoading?: boolean;
}

const CollapsibleSidebar: FC<CollapsibleSidebarProps> = ({ 
  messages, 
  onSendMessage, 
  isConnected = false,
  onlineUsers = 0,
  isLoading = false 
}) => {
  // State
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Hooks
  const { authenticated } = usePrivy();
  const { currentUser } = useContext(UserContext);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isCollapsed) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isCollapsed]);

  // Focus input when expanded
  useEffect(() => {
    if (authenticated && inputRef.current && !isCollapsed) {
      inputRef.current.focus();
    }
  }, [authenticated, isCollapsed]);

  // Handle message input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= 200) { // Character limit
      setInputMessage(value);
      
      // Show typing indicator briefly
      if (!isTyping && value.length > 0) {
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 1000);
      }
    }
  };

  // Handle sending message
  const handleSendMessage = () => {
    const trimmedMessage = inputMessage.trim();
    if (trimmedMessage && authenticated && isConnected) {
      onSendMessage(trimmedMessage);
      setInputMessage('');
      setShowEmojiPicker(false);
      inputRef.current?.focus();
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Toggle collapse state
  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    setShowEmojiPicker(false);
  };

  // Format timestamp
  const formatTime = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Common emojis
  const commonEmojis = ['😀', '😂', '😍', '🔥', '💎', '🚀', '💰', '🎉', '👍', '❤️'];

  // Add emoji to message
  const addEmoji = (emoji: string) => {
    if (inputMessage.length + emoji.length <= 200) {
      setInputMessage(prev => prev + emoji);
      setShowEmojiPicker(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={`
      bg-[#0d0d0f] border-r border-gray-800 flex flex-col h-full transition-all duration-300 ease-in-out
      ${isCollapsed ? 'w-12' : 'w-64 md:w-72 lg:w-80'}
    `}>
      {/* Header with collapse toggle */}
      <div className="p-2 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <h3 className="text-white font-medium flex items-center text-sm">
              <Users size={16} className="mr-2 text-green-400" />
              Live Chat
            </h3>
          )}
          
          <div className="flex items-center space-x-2">
            {/* Online status indicator */}
            {!isCollapsed && (
              <div className="flex items-center text-xs text-gray-400">
                <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                {onlineUsers > 0 && <span>{onlineUsers} online</span>}
              </div>
            )}
            
            {/* Collapse toggle button */}
            <button
              onClick={toggleCollapse}
              className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
              title={isCollapsed ? 'Expand chat' : 'Collapse chat'}
              aria-label={isCollapsed ? 'Expand chat' : 'Collapse chat'}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Collapsed state - show minimal info */}
      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center justify-center p-2 space-y-4">
          <div className="text-center">
            <Users size={20} className="text-green-400 mx-auto mb-2" />
            <div className={`w-2 h-2 rounded-full mx-auto ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          </div>
          
          {onlineUsers > 0 && (
            <div className="text-xs text-gray-400 text-center transform -rotate-90 whitespace-nowrap">
              {onlineUsers}
            </div>
          )}
          
          {/* New message indicator */}
          {messages.length > 0 && (
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          )}
        </div>
      )}

      {/* Expanded state - full chat interface */}
      {!isCollapsed && (
        <>
          {/* Messages Area */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
          >
            {/* Loading state */}
            {isLoading && (
              <div className="p-4 text-center">
                <div className="animate-pulse text-gray-400 text-sm">Loading messages...</div>
              </div>
            )}

            {/* Empty state */}
            {!isLoading && messages.length === 0 && (
              <div className="p-4 text-center">
                <div className="text-gray-500 text-sm mb-2">No messages yet</div>
                <div className="text-gray-600 text-xs">Be the first to say something!</div>
              </div>
            )}

            {/* Messages */}
            {messages.map((message, index) => {
              const isCurrentUser = authenticated && currentUser && 
                (message.user.id === currentUser.id || message.user.username === currentUser.username);
              const showTimestamp = index === 0 || 
                (new Date(message.timestamp).getTime() - new Date(messages[index - 1].timestamp).getTime()) > 300000; // 5 minutes

              return (
                <div key={message.id} className="px-3 py-2 hover:bg-gray-900/50 transition-colors">
                  {/* Timestamp separator */}
                  {showTimestamp && (
                    <div className="text-center mb-2">
                      <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                        <Clock size={10} className="inline mr-1" />
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                  )}

                  {/* Message */}
                  <div className={`${isCurrentUser ? 'bg-blue-900/30 rounded-lg p-2' : ''}`}>
                    <div className="flex items-center mb-1">
                      {/* User level badge */}
                      {message.user.level && (
                        <span 
                          className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center text-gray-300 text-xs mr-2 font-medium"
                          title={`Level ${message.user.level}`}
                        >
                          {message.user.level}
                        </span>
                      )}
                      
                      {/* Username */}
                      <span className={`font-medium text-sm ${
                        isCurrentUser ? 'text-blue-400' :
                        message.isVerified ? 'text-purple-400' : 'text-gray-300'
                      }`}>
                        {message.user.username}
                        {message.isVerified && (
                          <span className="ml-1" title="Verified user">✓</span>
                        )}
                        {isCurrentUser && (
                          <span className="ml-1 text-xs text-blue-500">(You)</span>
                        )}
                      </span>
                    </div>

                    {/* Message content */}
                    <p className="text-white text-sm leading-relaxed break-words">
                      {message.text}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-gray-800 flex-shrink-0">
            {/* Connection status */}
            {!isConnected && (
              <div className="mb-2 text-center">
                <span className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
                  Reconnecting...
                </span>
              </div>
            )}

            {/* Not authenticated message */}
            {!authenticated ? (
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-2">Login to join the chat</p>
                <button 
                  onClick={() => window.location.href = '/'}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors"
                >
                  Login
                </button>
              </div>
            ) : (
              <>
                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div className="mb-2 p-2 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="grid grid-cols-5 gap-1">
                      {commonEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => addEmoji(emoji)}
                          className="p-1 hover:bg-gray-700 rounded text-sm transition-colors"
                          type="button"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input Row */}
                <div className="flex items-center space-x-2">
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyPress={handleKeyPress}
                      placeholder="Type a message..."
                      className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                      disabled={!isConnected}
                      maxLength={200}
                      aria-label="Chat message input"
                    />
                    
                    {/* Character counter */}
                    {inputMessage.length > 150 && (
                      <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${
                        inputMessage.length > 190 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {200 - inputMessage.length}
                      </span>
                    )}
                  </div>

                  {/* Emoji button */}
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center text-gray-300 transition-colors border border-gray-700"
                    type="button"
                    disabled={!isConnected}
                    aria-label="Add emoji"
                  >
                    <Smile size={14} />
                  </button>

                  {/* Send button */}
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || !isConnected}
                    className="w-8 h-8 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg flex items-center justify-center text-white transition-colors"
                    type="button"
                    aria-label="Send message"
                  >
                    <Send size={14} />
                  </button>
                </div>

                {/* Typing indicator */}
                {isTyping && (
                  <div className="mt-1 text-xs text-gray-500">
                    You are typing...
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CollapsibleSidebar;
// src/components/chat/ChatMessage.tsx
import { FC } from 'react';
import { ChatMessage as ChatMessageType } from '../../services/api';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ChatMessage: FC<ChatMessageProps> = ({ message }) => {
  const { 
    username, 
    message: text, 
    created_at, 
    avatar, 
    level, 
    badge, 
    message_type 
  } = message;
  
  const formattedTime = new Date(created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Determine user status based on badge
  const isVerified = badge === 'verified' || badge === 'premium';
  const isModerator = badge === 'moderator';
  const isSystem = message_type === 'system' || message_type === 'announcement';

  // System message styling
  if (isSystem) {
    return (
      <div className="mb-3 p-2 bg-blue-900/30 rounded-lg border-l-2 border-blue-400">
        <div className="flex items-center justify-between">
          <span className="text-blue-300 font-medium text-sm flex items-center">
            🔔 <span className="ml-1">System</span>
          </span>
          <span className="text-xs text-gray-500">{formattedTime}</span>
        </div>
        <div className="mt-1 text-blue-200 text-xs">{text}</div>
      </div>
    );
  }

  // Get user color based on badge/level
  const getUserColor = () => {
    if (isModerator) return 'text-red-400';
    if (isVerified) return 'text-purple-400';
    if (badge === 'premium') return 'text-yellow-400';
    if (level && level >= 10) return 'text-green-400';
    if (level && level >= 5) return 'text-blue-400';
    return 'text-white';
  };

  // Get badge display
  const getBadgeDisplay = () => {
    if (isModerator) return { icon: '🛡️', color: 'text-red-400' };
    if (isVerified) return { icon: '✓', color: 'text-purple-400' };
    if (badge === 'premium') return { icon: '⭐', color: 'text-yellow-400' };
    return null;
  };

  const userColor = getUserColor();
  const badgeDisplay = getBadgeDisplay();

  return (
    <div className="mb-3 hover:bg-gray-800/30 p-1 rounded transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1 min-w-0">
          {/* Avatar */}
          {avatar && (
            <span className="mr-2 text-sm flex-shrink-0">{avatar}</span>
          )}
          
          {/* Level badge */}
          {level && level > 1 && (
            <span className="text-xs bg-gray-700/80 text-gray-300 rounded px-1.5 py-0.5 mr-2 flex-shrink-0 font-medium">
              Lv.{level}
            </span>
          )}
          
          {/* Username */}
          <span className={`font-medium text-sm ${userColor} truncate flex-shrink`}>
            {username}
          </span>
          
          {/* Badge icon */}
          {badgeDisplay && (
            <span className={`ml-1 ${badgeDisplay.color} flex-shrink-0`}>
              {badgeDisplay.icon}
            </span>
          )}
          
          {/* Custom badge text (for non-standard badges) */}
          {badge && 
           badge !== 'newcomer' && 
           badge !== 'verified' && 
           badge !== 'moderator' && 
           badge !== 'premium' && (
            <span className="text-xs bg-yellow-600/80 text-white rounded px-1.5 py-0.5 ml-2 flex-shrink-0">
              {badge}
            </span>
          )}
        </div>
        
        {/* Timestamp */}
        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{formattedTime}</span>
      </div>
      
      {/* Message text */}
      <div className="mt-1 text-gray-300 text-xs break-words leading-relaxed">
        {text}
      </div>
    </div>
  );
};

export default ChatMessage;
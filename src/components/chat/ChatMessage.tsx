// src/components/chat/ChatMessage.tsx - Fixed TypeScript error
import { FC } from 'react';
import { ChatMessage as ChatMessageType } from '../../services/api';

interface ChatMessageProps {
  message: ChatMessageType & { isPending?: boolean }; // Make isPending optional
}

const ChatMessage: FC<ChatMessageProps> = ({ message }) => {
  const {
    username,
    message: text,
    created_at,
    avatar,
    level,
    badge,
    message_type,
    isPending = false // Default to false if not provided
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
    if (isModerator) return { icon: '🛡️', color: 'text-red-400', label: 'MOD' };
    if (isVerified) return { icon: '✓', color: 'text-purple-400', label: 'Verified' };
    if (badge === 'premium') return { icon: '⭐', color: 'text-yellow-400', label: 'Premium' };
    return null;
  };

  // Get level color based on level value - with better fallbacks
  const getLevelColor = () => {
    const userLevel = level || 1; // Default to 1 if no level
    if (userLevel >= 20) return 'bg-purple-600/80 text-purple-200 border border-purple-400';
    if (userLevel >= 15) return 'bg-red-600/80 text-red-200 border border-red-400';
    if (userLevel >= 10) return 'bg-green-600/80 text-green-200 border border-green-400';
    if (userLevel >= 5) return 'bg-blue-600/80 text-blue-200 border border-blue-400';
    return 'bg-gray-600/80 text-gray-200 border border-gray-400';
  };

  const userColor = getUserColor();
  const badgeDisplay = getBadgeDisplay();
  const levelColorClass = getLevelColor();
  const displayLevel = level || 1;

  return (
    <div className={`mb-3 hover:bg-gray-800/30 p-1.5 rounded transition-colors ${isPending ? 'opacity-75' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1 min-w-0">
          {/* Avatar */}
          {avatar && (
            <span className="mr-2 text-sm flex-shrink-0" title={`${username}'s avatar`}>
              {avatar}
            </span>
          )}

          {/* Level badge - ALWAYS show */}
          <span 
            className={`text-xs rounded px-1.5 py-0.5 mr-2 flex-shrink-0 font-medium ${levelColorClass}`}
            title={`Level ${displayLevel}`}
          >
            Lv.{displayLevel}
          </span>

          {/* Username */}
          <span className={`font-medium text-sm ${userColor} truncate flex-shrink mr-1`}>
            {username}
            {isPending && <span className="ml-1 text-xs text-gray-500">(sending...)</span>}
          </span>

          {/* Badge icon and label */}
          {badgeDisplay && (
            <div className="flex items-center flex-shrink-0 ml-1">
              <span className={`${badgeDisplay.color}`} title={badgeDisplay.label}>
                {badgeDisplay.icon}
              </span>
              {isModerator && (
                <span className="text-xs bg-red-600/80 text-red-200 rounded px-1.5 py-0.5 ml-1">
                  MOD
                </span>
              )}
            </div>
          )}

          {/* Custom badge text */}
          {badge &&
            badge !== 'newcomer' &&
            badge !== 'verified' &&
            badge !== 'moderator' &&
            badge !== 'premium' && (
            <span className="text-xs bg-yellow-600/80 text-white rounded px-1.5 py-0.5 ml-2 flex-shrink-0">
              {badge.toUpperCase()}
            </span>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{formattedTime}</span>
      </div>

      {/* Message text */}
      <div className="mt-1 text-gray-300 text-xs break-words leading-relaxed pl-1">
        {text}
      </div>
    </div>
  );
};

export default ChatMessage;
// src/context/ChatContext.tsx
'use client';

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { UserContext } from './UserContext';
import { ChatMessage } from '../types/chat';

interface ChatContextProps {
  messages: ChatMessage[];
  sendMessage: (text: string) => boolean;
  isConnected: boolean;
  activeUsers: number;
  isLoading: boolean;
}

const defaultValue: ChatContextProps = {
  messages: [],
  sendMessage: () => false,
  isConnected: false,
  activeUsers: 0,
  isLoading: true
};

export const ChatContext = createContext<ChatContextProps>(defaultValue);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const { currentUser } = useContext(UserContext);

  useEffect(() => {
    // Initialize WebSocket connection
    const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'wss://api.rugged.fun/chat';
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('Chat connection established');
      setIsConnected(true);
      setIsLoading(false);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
          const message = data.data;
          setMessages(prev => [...prev, message]);
        } else if (data.type === 'user_count') {
          setActiveUsers(data.data.count);
        } else if (data.type === 'history') {
          setMessages(data.data);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
    
    ws.onclose = () => {
      console.log('Chat connection closed');
      setIsConnected(false);
      
      // Try to reconnect after a delay
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        setIsLoading(true);
      }, 3000);
    };
    
    setSocket(ws);
    
    // Clean up on unmount
    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = (text: string): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !currentUser) {
      return false;
    }
    
    try {
      const messageData = {
        type: 'message',
        data: {
          text,
          user: {
            id: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            level: currentUser.level,
            badge: currentUser.badge || 'none' // Safely handle undefined badge
          },
          timestamp: new Date().toISOString(),
          isVerified: currentUser.badge === 'verified' // Safe comparison
        }
      };
      
      socket.send(JSON.stringify(messageData));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  };

  return (
    <ChatContext.Provider value={{
      messages,
      sendMessage,
      isConnected,
      activeUsers,
      isLoading
    }}>
      {children}
    </ChatContext.Provider>
  );
};

// Custom hook for using the chat context
export const useChat = () => useContext(ChatContext);
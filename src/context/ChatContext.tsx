// src/context/ChatContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { ChatAPI, ChatMessage } from '../services/api';
import { UserContext } from './UserContext';
import { toast } from 'react-hot-toast';

interface ChatContextType {
  messages: ChatMessage[];
  sendMessage: (message: string) => Promise<void>;
  isConnected: boolean;
  activeUsers: number;
  isLoading: boolean;
  error: string | null;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { currentUser } = useContext(UserContext);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Get wallet address
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';

  // Load initial chat history
  const loadChatHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📬 Loading chat history with updated user data...');
      const chatHistory = await ChatAPI.getChatHistory(50);
      
      setMessages(chatHistory);
      setIsConnected(true);
      
      console.log(`✅ Loaded ${chatHistory.length} chat messages with current user data`);
    } catch (err) {
      console.error('❌ Error loading chat history:', err);
      setError('Failed to load chat history');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to new messages
  const subscribeToMessages = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    console.log('🔗 Subscribing to real-time chat messages...');
    
    const unsubscribe = ChatAPI.subscribeToMessages((newMessage: ChatMessage) => {
      console.log('📨 Received new message:', newMessage);
      
      setMessages(prev => {
        // Check if message already exists to prevent duplicates
        const exists = prev.some(msg => msg.id === newMessage.id);
        if (exists) {
          return prev;
        }
        
        return [...prev, newMessage];
      });
      
      // Update active users count (basic simulation)
      setActiveUsers(prev => Math.max(prev, 1));
    });

    unsubscribeRef.current = unsubscribe;
    setIsConnected(true);
  }, []);

  // Send message function
  const sendMessage = useCallback(async (messageText: string) => {
    if (!authenticated || !currentUser || !walletAddress) {
      toast.error('Please login to send messages');
      return;
    }

    if (!messageText.trim()) {
      return;
    }

    try {
      console.log(`💬 Sending message: "${messageText}" from ${currentUser.username}`);
      
      const success = await ChatAPI.sendMessage(
        walletAddress,
        currentUser.username,
        messageText.trim()
      );

      if (success) {
        console.log('✅ Message sent successfully');
        // Message will be added via subscription
      } else {
        toast.error('Failed to send message');
      }
    } catch (err) {
      console.error('❌ Error sending message:', err);
      toast.error('Failed to send message');
    }
  }, [authenticated, currentUser, walletAddress]);

  // Initialize chat when user is authenticated
  useEffect(() => {
    if (authenticated && currentUser) {
      loadChatHistory();
      subscribeToMessages();
    } else {
      setMessages([]);
      setIsLoading(false);
      setIsConnected(false);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [authenticated, currentUser, loadChatHistory, subscribeToMessages]);

  // Simulate active users count (you can enhance this with real data)
  useEffect(() => {
    const updateActiveUsers = () => {
      // This is a basic simulation - you can replace with real active user tracking
      const baseUsers = messages.length > 0 ? Math.min(messages.length, 3) : 0;
      const randomVariation = Math.floor(Math.random() * 5);
      setActiveUsers(baseUsers + randomVariation);
    };

    updateActiveUsers();
    const interval = setInterval(updateActiveUsers, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [messages.length]);

  // Connection health check
  useEffect(() => {
    const healthCheck = setInterval(() => {
      setIsConnected(prev => {
        // Simple connection check - in a real app you might ping the server
        return authenticated && currentUser ? true : false;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(healthCheck);
  }, [authenticated, currentUser]);

  const contextValue: ChatContextType = {
    messages,
    sendMessage,
    isConnected,
    activeUsers,
    isLoading,
    error
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
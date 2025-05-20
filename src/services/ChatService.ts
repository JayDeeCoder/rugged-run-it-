// src/services/ChatService.ts
import { ChatMessage } from '../types/chat';

// Define message types for WebSocket communication
export type MessageType = 
  | 'message'
  | 'user_joined' 
  | 'user_left' 
  | 'error' 
  | 'history' 
  | 'user_count' 
  | 'connection_success';

interface MessageData {
  text: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
    level?: number;
  };
  timestamp?: string;
  isVerified?: boolean;
}

export type ChatSocketMessage = 
  | { type: 'message'; data: MessageData }
  | { type: 'user_joined'; data: { user: { id: string; username: string } } }
  | { type: 'user_left'; data: { user: { id: string; username: string } } }
  | { type: 'error'; data: { message: string; code?: number } }
  | { type: 'history'; data: ChatMessage[] }
  | { type: 'user_count'; data: { count: number } }
  | { type: 'connection_success'; data: { clientId: string } };

class ChatService {
  private socket: WebSocket | null = null;
  private messageHandlers: ((message: ChatMessage) => void)[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  
  // Use your actual WebSocket server URL
  private serverUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'wss://api.rugged.fun/chat';
  
  constructor() {
    // Initialize connection when service is created
    this.connect();
  }
  
  // Add the connect method
  connect(): void {
    if (this.socket || this.isConnecting) return;
    
    this.isConnecting = true;
    
    try {
      console.log('Connecting to chat server...');
      this.socket = new WebSocket(this.serverUrl);
      
      this.socket.onopen = () => {
        console.log('Chat WebSocket connected');
        this.isConnecting = false;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      };
      
      this.socket.onmessage = (event) => {
        try {
          const socketMessage = JSON.parse(event.data) as ChatSocketMessage;
          
          if (socketMessage.type === 'message') {
            // Broadcast message to all registered handlers
            const chatMessage = socketMessage.data as unknown as ChatMessage;
            this.messageHandlers.forEach(handler => handler(chatMessage));
          }
          
          // Handle other message types as needed (user joined, etc.)
        } catch (error) {
          console.error('Failed to parse chat message:', error);
        }
      };
      
      this.socket.onerror = (error) => {
        console.error('Chat WebSocket error:', error);
      };
      
      this.socket.onclose = () => {
        console.log('Chat WebSocket closed. Reconnecting in 3 seconds...');
        this.socket = null;
        this.isConnecting = false;
        
        // Attempt to reconnect after delay
        this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
      };
    } catch (error) {
      console.error('Failed to connect to chat:', error);
      this.isConnecting = false;
      // Schedule reconnect attempt
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    }
  }

  // Send a message to the chat server
  sendMessage(text: string, user: { id: string; username: string }): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.connect();
      console.warn('WebSocket not connected, attempting to connect...');
      return false;
    }
    
    try {
      const payload: ChatSocketMessage = {
        type: 'message',
        data: {
          text,
          user,
          timestamp: new Date().toISOString()
        }
      };
      
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }
  
  // Register a callback to handle incoming messages
  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.push(handler);
    
    // Return an unsubscribe function
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }
  
  // Disconnect from the server
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

// Create a singleton instance
export const chatService = new ChatService();
export default chatService;
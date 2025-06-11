// src/services/sharedSocket.ts
// 🚀 Shared Socket Service for iRUGGED.FUN
// Provides a singleton socket connection that can be shared across components

import { io, Socket } from 'socket.io-client';

class SharedSocketService {
  private socket: Socket | null = null;
  private isInitialized = false;
  private connectionPromise: Promise<Socket | null> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private readonly serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'wss://irugged-run.ngrok.app';

  /**
   * Get the shared socket instance (creates one if it doesn't exist)
   */
  async getSocket(): Promise<Socket | null> {
    // If we already have an active connection, return it
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // If we're already trying to connect, wait for that to complete
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Create new connection
    this.connectionPromise = this.createConnection();
    const socket = await this.connectionPromise;
    this.connectionPromise = null;
    
    return socket;
  }

  /**
   * Create a new socket connection
   */
  private async createConnection(): Promise<Socket | null> {
    return new Promise((resolve) => {
      try {
        console.log('🔌 SharedSocket: Creating new connection to:', this.serverUrl);

        // Close existing socket if it exists
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.close();
        }

        // Create new socket
        this.socket = io(this.serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          forceNew: true,
          upgrade: true,
          rememberUpgrade: false,
        });

        // Connection success handler
        this.socket.on('connect', () => {
          console.log('✅ SharedSocket: Connected successfully');
          console.log('  - Transport:', this.socket?.io.engine.transport.name);
          console.log('  - Socket ID:', this.socket?.id);
          
          this.isInitialized = true;
          this.reconnectAttempts = 0;
          resolve(this.socket);
        });

        // Connection error handler
        this.socket.on('connect_error', (error: any) => {
          console.error('❌ SharedSocket: Connection error:', error);
          this.reconnectAttempts++;
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ SharedSocket: Max reconnection attempts reached');
            resolve(null);
          }
        });

        // Disconnect handler
        this.socket.on('disconnect', (reason: string, details?: any) => {
          console.log('🔌 SharedSocket: Disconnected:', reason);
          this.isInitialized = false;
          
          if (reason === 'io server disconnect') {
            console.log('🔄 SharedSocket: Server disconnected, will attempt reconnect');
          }
        });

        // Reconnect handler
        this.socket.on('reconnect', (attemptNumber: number) => {
          console.log('🔄 SharedSocket: Reconnected after', attemptNumber, 'attempts');
          this.reconnectAttempts = 0;
        });

        // Transport upgrade handlers
        this.socket.on('upgrade', () => {
          console.log('📶 SharedSocket: Upgraded to websocket transport');
        });

        this.socket.on('upgradeError', (error: any) => {
          console.warn('⚠️ SharedSocket: Websocket upgrade failed, using polling:', error);
        });

        // Timeout fallback
        setTimeout(() => {
          if (!this.socket?.connected) {
            console.error('❌ SharedSocket: Connection timeout');
            resolve(null);
          }
        }, 25000);

      } catch (error) {
        console.error('❌ SharedSocket: Failed to create connection:', error);
        resolve(null);
      }
    });
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected === true;
  }

  /**
   * Emit an event through the shared socket
   */
  emit(event: string, data?: any): boolean {
    if (!this.socket || !this.socket.connected) {
      console.warn('⚠️ SharedSocket: Cannot emit - not connected');
      return false;
    }

    this.socket.emit(event, data);
    return true;
  }

  /**
   * Listen for events on the shared socket
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.socket) {
      console.warn('⚠️ SharedSocket: Cannot listen - socket not initialized');
      return;
    }

    this.socket.on(event, handler);
  }

  /**
   * Remove event listener from the shared socket
   */
  off(event: string, handler?: (...args: any[]) => void): void {
    if (!this.socket) {
      return;
    }

    if (handler) {
      this.socket.off(event, handler);
    } else {
      this.socket.off(event);
    }
  }

  /**
   * Force reconnection of the shared socket
   */
  async reconnect(): Promise<Socket | null> {
    console.log('🔄 SharedSocket: Forcing reconnection...');
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
    }
    
    this.socket = null;
    this.isInitialized = false;
    this.connectionPromise = null;
    
    return this.getSocket();
  }

  /**
   * Disconnect and cleanup the shared socket
   */
  disconnect(): void {
    console.log('🔌 SharedSocket: Disconnecting...');
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
    }
    
    this.socket = null;
    this.isInitialized = false;
    this.connectionPromise = null;
  }

  /**
   * Get current socket status for debugging
   */
  getStatus(): {
    isInitialized: boolean;
    isConnected: boolean;
    socketId: string | undefined;
    transport: string | undefined;
    reconnectAttempts: number;
  } {
    return {
      isInitialized: this.isInitialized,
      isConnected: this.isConnected(),
      socketId: this.socket?.id,
      transport: this.socket?.io.engine.transport.name,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Export singleton instance
export const sharedSocket = new SharedSocketService();

// Also export the class for testing purposes
export { SharedSocketService };
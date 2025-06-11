// src/services/sharedSocket.ts
// 🚀 Improved Shared Socket Service with Event Management

import { io, Socket } from 'socket.io-client';

interface EventSubscription {
  id: string;
  event: string;
  handler: (...args: any[]) => void;
  component: string;
}

class SharedSocketService {
  private socket: Socket | null = null;
  private connectionPromise: Promise<Socket | null> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private eventSubscriptions: Map<string, EventSubscription> = new Map();
  private subscriptionCounter = 0;

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
          this.cleanupSocket();
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
          
          this.reconnectAttempts = 0;
          this.reattachEventListeners();
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
          
          if (reason === 'io server disconnect') {
            console.log('🔄 SharedSocket: Server disconnected, will attempt reconnect');
          }
        });

        // Reconnect handler
        this.socket.on('reconnect', (attemptNumber: number) => {
          console.log('🔄 SharedSocket: Reconnected after', attemptNumber, 'attempts');
          this.reconnectAttempts = 0;
          this.reattachEventListeners();
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
   * Reattach all event listeners after reconnection
   */
  private reattachEventListeners(): void {
    if (!this.socket) return;

    console.log(`🔌 SharedSocket: Reattaching ${this.eventSubscriptions.size} event listeners`);
    
    for (const [subscriptionId, subscription] of this.eventSubscriptions) {
      this.socket.on(subscription.event, subscription.handler);
      console.log(`  ✅ Reattached: ${subscription.component} -> ${subscription.event}`);
    }
  }

  /**
   * Clean up socket and all listeners
   */
  private cleanupSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
    }
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
   * 🚀 IMPROVED: Subscribe to events with component tracking
   */
  subscribe(event: string, handler: (...args: any[]) => void, componentName: string = 'unknown'): string {
    const subscriptionId = `${componentName}-${event}-${++this.subscriptionCounter}`;
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      event,
      handler,
      component: componentName
    };

    this.eventSubscriptions.set(subscriptionId, subscription);

    // If socket is connected, attach the listener immediately
    if (this.socket) {
      this.socket.on(event, handler);
      console.log(`🔌 SharedSocket: Subscribed ${componentName} to ${event} (ID: ${subscriptionId})`);
    }

    return subscriptionId;
  }

  /**
   * 🚀 IMPROVED: Unsubscribe from events by subscription ID
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.eventSubscriptions.get(subscriptionId);
    
    if (subscription) {
      // Remove from socket if connected
      if (this.socket) {
        this.socket.off(subscription.event, subscription.handler);
        console.log(`🔌 SharedSocket: Unsubscribed ${subscription.component} from ${subscription.event}`);
      }
      
      // Remove from our tracking
      this.eventSubscriptions.delete(subscriptionId);
    }
  }

  /**
   * 🚀 NEW: Unsubscribe all events for a specific component
   */
  unsubscribeComponent(componentName: string): void {
    const subscriptionsToRemove: string[] = [];
    
    for (const [subscriptionId, subscription] of this.eventSubscriptions) {
      if (subscription.component === componentName) {
        subscriptionsToRemove.push(subscriptionId);
      }
    }
    
    subscriptionsToRemove.forEach(id => this.unsubscribe(id));
    
    if (subscriptionsToRemove.length > 0) {
      console.log(`🧹 SharedSocket: Cleaned up ${subscriptionsToRemove.length} subscriptions for ${componentName}`);
    }
  }

  /**
   * Legacy compatibility: Listen for events (deprecated, use subscribe instead)
   */
  on(event: string, handler: (...args: any[]) => void): void {
    console.warn('⚠️ SharedSocket: on() is deprecated, use subscribe() instead');
    this.subscribe(event, handler, 'legacy');
  }

  /**
   * Legacy compatibility: Remove event listener (deprecated, use unsubscribe instead)
   */
  off(event: string, handler?: (...args: any[]) => void): void {
    if (!this.socket) return;

    if (handler) {
      this.socket.off(event, handler);
      
      // Also remove from our tracking if found
      for (const [subscriptionId, subscription] of this.eventSubscriptions) {
        if (subscription.event === event && subscription.handler === handler) {
          this.eventSubscriptions.delete(subscriptionId);
          console.log(`🔌 SharedSocket: Removed legacy subscription for ${event}`);
          break;
        }
      }
    } else {
      this.socket.off(event);
      
      // Remove all subscriptions for this event
      const subscriptionsToRemove: string[] = [];
      for (const [subscriptionId, subscription] of this.eventSubscriptions) {
        if (subscription.event === event) {
          subscriptionsToRemove.push(subscriptionId);
        }
      }
      subscriptionsToRemove.forEach(id => this.eventSubscriptions.delete(id));
    }
  }

  /**
   * Force reconnection of the shared socket
   */
  async reconnect(): Promise<Socket | null> {
    console.log('🔄 SharedSocket: Forcing reconnection...');
    
    this.cleanupSocket();
    this.socket = null;
    this.connectionPromise = null;
    
    return this.getSocket();
  }

  /**
   * Disconnect and cleanup the shared socket
   */
  disconnect(): void {
    console.log('🔌 SharedSocket: Disconnecting...');
    
    this.cleanupSocket();
    this.socket = null;
    this.connectionPromise = null;
    this.eventSubscriptions.clear();
  }

  /**
   * Get current socket status for debugging
   */
  getStatus(): {
    isConnected: boolean;
    socketId: string | undefined;
    transport: string | undefined;
    reconnectAttempts: number;
    activeSubscriptions: number;
    subscriptionsByComponent: Record<string, number>;
  } {
    const subscriptionsByComponent: Record<string, number> = {};
    
    for (const subscription of this.eventSubscriptions.values()) {
      subscriptionsByComponent[subscription.component] = 
        (subscriptionsByComponent[subscription.component] || 0) + 1;
    }

    return {
      isConnected: this.isConnected(),
      socketId: this.socket?.id,
      transport: this.socket?.io.engine.transport.name,
      reconnectAttempts: this.reconnectAttempts,
      activeSubscriptions: this.eventSubscriptions.size,
      subscriptionsByComponent
    };
  }

  /**
   * 🚀 NEW: Debug method to log all active subscriptions
   */
  debugSubscriptions(): void {
    console.log('🔍 SharedSocket: Active subscriptions:', this.eventSubscriptions.size);
    
    const byComponent: Record<string, string[]> = {};
    
    for (const subscription of this.eventSubscriptions.values()) {
      if (!byComponent[subscription.component]) {
        byComponent[subscription.component] = [];
      }
      byComponent[subscription.component].push(subscription.event);
    }
    
    for (const [component, events] of Object.entries(byComponent)) {
      console.log(`  ${component}: ${events.join(', ')}`);
    }
  }
}

// Export singleton instance
export const sharedSocket = new SharedSocketService();

// Also export the class for testing purposes
export { SharedSocketService };
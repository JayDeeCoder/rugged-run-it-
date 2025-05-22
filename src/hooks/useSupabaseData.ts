// src/hooks/useSupabaseData.ts
import { useState, useEffect } from 'react';
import { supabase, GameSession, ChatMessage } from '../lib/supabase';

// Hook for game sessions
export const useGameSessions = (userId?: string) => {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchSessions = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('game_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setSessions(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [userId]);

  const createGameSession = async (sessionData: Omit<GameSession, 'id' | 'created_at'>) => {
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .insert([sessionData])
        .select()
        .single();

      if (error) throw error;
      setSessions(prev => [data, ...prev]);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      throw err;
    }
  };

  return { sessions, loading, error, createGameSession };
};

// Hook for chat messages
export const useChatMessages = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setMessages(data.reverse()); // Reverse to show oldest first
      }
      setLoading(false);
    };

    fetchMessages();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('chat_messages')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'chat_messages' 
        }, 
        (payload) => {
          setMessages(prev => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const sendMessage = async (message: string, username: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          user_id: userId,
          username,
          message,
        }]);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to send message:', err);
      throw err;
    }
  };

  return { messages, loading, sendMessage };
};

// Hook for leaderboard data
export const useLeaderboard = () => {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const { data, error } = await supabase
          .from('game_sessions')
          .select(`
            user_id,
            users!inner(username),
            profit
          `)
          .gte('profit', 0)
          .order('profit', { ascending: false })
          .limit(100);

        if (error) throw error;

        // Group by user and calculate total profit
        const userProfits = data?.reduce((acc: any, session: any) => {
          const userId = session.user_id;
          const username = session.users.username;
          const profit = session.profit;

          if (!acc[userId]) {
            acc[userId] = { username, totalProfit: 0 };
          }
          acc[userId].totalProfit += profit;
          return acc;
        }, {});

        const leaderboardData = Object.entries(userProfits || {})
          .map(([userId, data]: [string, any]) => ({
            userId,
            username: data.username,
            totalProfit: data.totalProfit,
          }))
          .sort((a, b) => b.totalProfit - a.totalProfit);

        setLeaderboard(leaderboardData);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  return { leaderboard, loading };
};
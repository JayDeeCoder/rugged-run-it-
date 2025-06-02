// utils/supabase.ts - Shared Supabase utilities

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Hardcoded fallback values
const FALLBACK_SUPABASE_URL = 'https://ineaxxqjkryoobobxrsw.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZWF4eHFqa3J5b29ib2J4cnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzMxMzIsImV4cCI6MjA2MzM0OTEzMn0.DiFLCCe5-UnzsGpG7dsqJWoUbxmaJxc_v89pxxsa1aA';

// Frontend client (using anon key)
let frontendSupabaseClient: SupabaseClient | null = null;

export const getFrontendSupabaseClient = () => {
  if (!frontendSupabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
    
    console.log('🔧 Frontend Supabase Config:', {
      hasEnvUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasEnvKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      usingFallback: !process.env.NEXT_PUBLIC_SUPABASE_URL
    });

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing frontend Supabase configuration');
    }

    frontendSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    console.log('✅ Frontend Supabase client initialized');
  }
  
  return frontendSupabaseClient;
};

// Server-side client (using service role key) - only for API routes
export const getServerSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('🔧 Server Supabase Config:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseServiceKey,
    environment: process.env.NODE_ENV
  });

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL for server client');
  }

  if (!supabaseServiceKey) {
    console.warn('⚠️ No SUPABASE_SERVICE_ROLE_KEY found, using anon key as fallback');
    const fallbackKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
    return createClient(supabaseUrl, fallbackKey);
  }

  const client = createClient(supabaseUrl, supabaseServiceKey);
  console.log('✅ Server Supabase client initialized with service role key');
  return client;
};

// Safe client getter with error handling
export const safeGetSupabaseClient = (serverSide = false) => {
  try {
    const client = serverSide ? getServerSupabaseClient() : getFrontendSupabaseClient();
    return { client, error: null };
  } catch (error) {
    console.error(`❌ Failed to get ${serverSide ? 'server' : 'frontend'} Supabase client:`, error);
    return { 
      client: null, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

// Test connection
export const testSupabaseConnection = async (serverSide = false) => {
  try {
    const { client, error } = safeGetSupabaseClient(serverSide);
    
    if (error || !client) {
      return { success: false, error };
    }

    // Test with a simple query
    const { error: queryError } = await client
      .from('profiles') // Try profiles first, fall back to player_bets
      .select('count')
      .limit(1);

    if (queryError) {
      // Try alternative table
      const { error: altError } = await client
        .from('player_bets')
        .select('count')
        .limit(1);
        
      if (altError) {
        return { 
          success: false, 
          error: `Query failed: ${queryError.message}. Alt query: ${altError.message}` 
        };
      }
    }

    console.log(`✅ ${serverSide ? 'Server' : 'Frontend'} Supabase connection test passed`);
    return { success: true };
  } catch (error) {
    console.error(`❌ ${serverSide ? 'Server' : 'Frontend'} Supabase connection test failed:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
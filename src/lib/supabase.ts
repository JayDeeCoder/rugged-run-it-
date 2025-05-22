// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for your database tables (add as needed)
export interface User {
  id: string
  username: string
  email: string
  wallet_address?: string
  created_at: string
  updated_at: string
}

export interface GameSession {
  id: string
  user_id: string
  bet_amount: number
  multiplier: number
  profit: number
  is_rugged: boolean
  created_at: string
}

export interface ChatMessage {
  id: string
  user_id: string
  username: string
  message: string
  created_at: string
}
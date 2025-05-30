// Add this API route file: app/api/admin/manual-monitor/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Manual transaction monitor triggered via API...');
    
    // You could call your game server's monitoring function here
    // or implement the monitoring logic directly in this API route
    
    const response = await fetch('http://localhost:3001/api/admin/trigger-monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to trigger monitor on game server' },
        { status: 500 }
      );
    }
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Transaction monitor triggered manually',
      result,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('❌ Manual monitor trigger error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger manual monitor' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Manual transaction monitor endpoint',
    usage: 'POST to trigger manual scan of house wallet transactions'
  });
}
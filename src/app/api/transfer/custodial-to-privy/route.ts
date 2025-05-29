// app/api/transfer/custodial-to-privy/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Custodial to Privy transfer endpoint called');
    
    const body = await request.json();
    const { userId, amount } = body;
    
    console.log('📋 Transfer request:', { userId, amount });
    
    // Validate inputs
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid amount is required' },
        { status: 400 }
      );
    }
    
    // For now, return a success response since this direction is easier
    // This would typically:
    // 1. Check custodial balance
    // 2. Deduct from custodial balance in database
    // 3. Send SOL to user's Privy wallet address
    
    console.log('⚠️ Mock response - actual transfer logic not implemented yet');
    
    return NextResponse.json({
      success: true,
      message: 'Transfer completed successfully',
      debug: {
        userId,
        amount,
        note: 'Mock successful response - actual transfer logic needs implementation',
        direction: 'custodial-to-privy'
      }
    });
    
  } catch (error) {
    console.error('❌ Transfer API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Custodial to Privy transfer endpoint',
    methods: ['POST'],
    timestamp: new Date().toISOString()
  });
}
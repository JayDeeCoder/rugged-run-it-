// app/api/transfer/privy-to-custodial/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Privy to Custodial transfer endpoint called');
    
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
    
    // For now, return a mock response to test the endpoint
    // TODO: Implement actual Privy wallet → custodial transfer logic
    console.log('⚠️ Mock response - actual transfer logic not implemented yet');
    
    return NextResponse.json({
      success: false,
      action: 'signature_required',
      message: 'This transfer requires wallet signature integration with Privy',
      debug: {
        userId,
        amount,
        note: 'Endpoint working - transfer logic needs implementation'
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
    message: 'Privy to Custodial transfer endpoint',
    methods: ['POST'],
    timestamp: new Date().toISOString()
  });
}
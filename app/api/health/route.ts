import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Basic health check response
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime()
    };

    return NextResponse.json(healthData, { status: 200 });
  } catch {
    // Return error status if something goes wrong
    return NextResponse.json(
      { 
        status: 'error', 
        timestamp: new Date().toISOString(),
        error: 'Health check failed' 
      }, 
      { status: 500 }
    );
  }
} 
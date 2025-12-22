import { NextRequest, NextResponse } from "next/server";
import { syncProducts, getStatus } from "@/lib/knowledgeBase";

// Force Node.js runtime
export const runtime = "nodejs";

// Optional: Add a simple secret key for protection
const SYNC_SECRET = process.env.SYNC_SECRET || "";

/**
 * GET /api/sync - Get sync status
 */
export async function GET() {
  try {
    const status = await getStatus();
    
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error("[Sync API] Status error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync - Trigger a sync
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Check secret key if configured
    if (SYNC_SECRET) {
      const authHeader = request.headers.get("authorization");
      const providedSecret = authHeader?.replace("Bearer ", "");
      
      if (providedSecret !== SYNC_SECRET) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }
    
    console.log("[Sync API] Starting sync...");
    
    const result = await syncProducts();
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Sync completed successfully",
        productsProcessed: result.productsProcessed,
        productsIndexed: result.productsIndexed,
        durationMs: result.durationMs,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          durationMs: result.durationMs,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Sync API] Sync error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


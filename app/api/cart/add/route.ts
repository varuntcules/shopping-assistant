import { NextRequest, NextResponse } from "next/server";
import { ajaxCartAdd } from "@/lib/shopifyAdmin";

export const runtime = "nodejs";

interface AddToCartRequest {
  variantId: number;
  quantity?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: AddToCartRequest = await request.json();
    const { variantId, quantity = 1 } = body;

    if (!variantId || typeof variantId !== "number") {
      return NextResponse.json(
        { error: "Variant ID is required and must be a number" },
        { status: 400 }
      );
    }

    console.log("[Cart API] Adding product to cart:", { variantId, quantity });

    const cookieHeader = request.headers.get("cookie") || "";

    const cartResponse = await ajaxCartAdd(
      [{ id: variantId, quantity }],
      cookieHeader
    );

    console.log("[Cart API] Product added to cart successfully");

    return NextResponse.json({
      success: true,
      message: "Product added to cart",
      cart: cartResponse,
    });
  } catch (error) {
    console.error("[Cart API] Error adding to cart:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to add product to cart";
    
    return NextResponse.json(
      { 
        success: false,
        error: errorMessage 
      },
      { status: 500 }
    );
  }
}






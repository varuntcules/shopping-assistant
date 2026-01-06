import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface GetVariantRequest {
  productHandle: string;
  productId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GetVariantRequest = await request.json();
    const { productHandle, productId } = body;

    if (!productHandle && !productId) {
      return NextResponse.json(
        { error: "Product handle or ID is required" },
        { status: 400 }
      );
    }

    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const adminToken = process.env.SHOPIFY_ADMIN_API_TOKEN;
    
    if (!storeDomain || !adminToken) {
      throw new Error("Shopify configuration is missing");
    }

    let url: string;
    if (productId) {
      const numericId = productId.includes("/") 
        ? productId.split("/").pop() 
        : productId;
      url = `https://${storeDomain}/admin/api/2025-10/products/${numericId}.json`;
    } else {
      url = `https://${storeDomain}/admin/api/2025-10/products.json?limit=250`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify Admin API error: ${response.status}`);
    }

    const data = await response.json();
    
    let product;
    if (productId) {
      product = data.product;
    } else {
      product = data.products?.find((p: any) => p.handle === productHandle);
    }
    
    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }
    
    if (!product.variants || product.variants.length === 0) {
      return NextResponse.json(
        { error: "No variants found for this product" },
        { status: 404 }
      );
    }

    const variantId = product.variants[0].id;

    return NextResponse.json({
      success: true,
      variantId: variantId,
    });
  } catch (error) {
    console.error("[Get Variant API] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to get variant ID";
    
    return NextResponse.json(
      { 
        success: false,
        error: errorMessage 
      },
      { status: 500 }
    );
  }
}






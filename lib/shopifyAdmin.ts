import type { ProductCard } from "./types";

// Read env vars lazily to support scripts that load dotenv after module import
function getStoreDomain(): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is not set");
  return domain;
}

function getAdminToken(): string {
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!token) throw new Error("SHOPIFY_ADMIN_API_TOKEN is not set");
  return token;
}

/**
 * Shared helper to call the Shopify Admin REST API.
 * Uses the private Admin API access token from the environment.
 */
async function shopifyAdminFetch<T>(
  path: string,
  options: RequestInit & { method: "GET" | "POST" | "PUT" } = { method: "GET" },
): Promise<T> {
  const SHOPIFY_STORE_DOMAIN = getStoreDomain();
  const SHOPIFY_ADMIN_API_TOKEN = getAdminToken();
  const url = `https://${SHOPIFY_STORE_DOMAIN}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Shopify Admin API error ${res.status} ${res.statusText} on ${path}: ${body?.slice(
        0,
        300,
      )}`,
    );
  }

  return (await res.json()) as T;
}

/**
 * API 1 – Get All Products (Store Catalog Fetch)
 *
 * NOTE: This is an Admin API used for internal catalog/knowledge-base sync,
 * not for real-time user search (Storefront API is better for that).
 */
export interface AdminProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  vendor: string;
  status: string;
  body_html?: string;
  tags?: string;
  images: Array<{
    id: number;
    src: string;
    alt?: string;
  }>;
  variants: Array<{
    id: number;
    price: string;
    currency_code?: string;
  }>;
}

// Alias for use in knowledgeBase.ts
export type ShopifyAdminProduct = AdminProduct;

interface AdminGetAllProductsResponse {
  products: AdminProduct[];
}

export async function adminGetAllProducts(): Promise<AdminProduct[]> {
  const data = await shopifyAdminFetch<AdminGetAllProductsResponse>(
    "/admin/api/2025-10/products.json",
    { method: "GET" },
  );
  return data.products;
}

/**
 * API 2 – Add Product(s) to Cart (AJAX Cart API)
 *
 * This uses the Shopify AJAX cart endpoint on the shop domain.
 * It relies on the caller to pass through the correct cookies so that the
 * cart is associated with the right browser session.
 */
export interface AjaxCartItemInput {
  id: number; // Variant ID
  quantity: number;
}

interface AjaxCartAddRequestBody {
  items: AjaxCartItemInput[];
}

export async function ajaxCartAdd(
  items: AjaxCartItemInput[],
  cookieHeader?: string,
): Promise<unknown> {
  const url = `https://${getStoreDomain()}/cart/add.js`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ items } satisfies AjaxCartAddRequestBody),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Shopify AJAX cart error ${res.status} ${res.statusText}: ${body?.slice(
        0,
        300,
      )}`,
    );
  }

  // AJAX cart returns JSON describing the updated cart; keep it generic for now.
  return res.json().catch(() => ({}));
}

/**
 * API 3 – Create Draft Order
 */
export interface DraftOrderAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
}

export interface DraftOrderLineItemInput {
  variant_id: number;
  quantity: number;
}

export interface CreateDraftOrderInput {
  email: string;
  shipping_address: DraftOrderAddress;
  billing_address: DraftOrderAddress;
  line_items: DraftOrderLineItemInput[];
  shipping_line?: {
    title: string;
    price: string;
  };
  currency?: string;
  note?: string;
}

interface CreateDraftOrderRequestBody {
  draft_order: CreateDraftOrderInput;
}

export interface DraftOrder {
  id: number;
  name: string;
  invoice_url?: string;
  total_price?: string;
  currency?: string;
}

interface CreateDraftOrderResponse {
  draft_order: DraftOrder;
}

export async function createDraftOrder(
  payload: CreateDraftOrderInput,
): Promise<DraftOrder> {
  const data = await shopifyAdminFetch<CreateDraftOrderResponse>(
    "/admin/api/2025-10/draft_orders.json",
    {
      method: "POST",
      body: JSON.stringify({ draft_order: payload } satisfies CreateDraftOrderRequestBody),
    },
  );

  return data.draft_order;
}

/**
 * API 4 – Complete Draft Order
 */
export interface CompleteDraftOrderResponse {
  draft_order: DraftOrder & {
    order_id?: number;
  };
}

export async function completeDraftOrder(
  draftOrderId: number,
): Promise<CompleteDraftOrderResponse> {
  const path = `/admin/api/2025-10/draft_orders/${draftOrderId}/complete.json?payment_pending=true`;

  return shopifyAdminFetch<CompleteDraftOrderResponse>(path, { method: "PUT" });
}

/**
 * API 5 – Get Customer by Email
 */
export interface AdminCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

interface GetCustomerByEmailResponse {
  customers: AdminCustomer[];
}

export async function getCustomerByEmail(
  email: string,
): Promise<AdminCustomer | null> {
  const encodedEmail = encodeURIComponent(email);
  const path = `/admin/api/2025-01/customers/search.json?query=email:${encodedEmail}`;

  const data = await shopifyAdminFetch<GetCustomerByEmailResponse>(path, {
    method: "GET",
  });

  return data.customers[0] ?? null;
}

/**
 * API 6 – Get Previous Orders of a Customer
 */
export interface AdminOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
}

interface GetCustomerOrdersResponse {
  orders: AdminOrder[];
}

export async function getCustomerOrders(
  customerId: number,
): Promise<AdminOrder[]> {
  const path = `/admin/api/2025-01/orders.json?customer_id=${customerId}&status=any`;

  const data = await shopifyAdminFetch<GetCustomerOrdersResponse>(path, {
    method: "GET",
  });

  return data.orders;
}

/**
 * Optional helper: map an AdminProduct into the ProductCard shape used by the UI.
 * This is useful if you later want to power the UI from the Admin catalog.
 */
export function mapAdminProductToProductCard(product: AdminProduct): ProductCard {
  const firstImage = product.images[0];
  const firstVariant = product.variants[0];

  return {
    id: String(product.id),
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    productType: product.product_type,
    price: {
      amount: firstVariant?.price ?? "0.00",
      currencyCode: (firstVariant?.currency_code ?? "INR").toUpperCase(),
    },
    image: {
      url: firstImage?.src ?? "/placeholder-product.png",
      altText: firstImage?.alt ?? null,
    },
    url: `https://${getStoreDomain()}/products/${product.handle}`,
  };
}



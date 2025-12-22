API 1 – Get All Products (Store Catalog Fetch)

1. API Overview

Field
Details
API Name
Get All Products (Catalog API)
Purpose
Fetch complete product catalog from Shopify Admin API to build internal knowledge base.
Method
GET
Endpoint
https://ladani-store-2.myshopify.com/admin/api/2025-10/products.json
Auth Type
Private App Token
Header Required
"X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>"
Request Body
Not required


Why This API Is Called (Use Case)
This API is used to:
Fetch all products from the Shopify store.
Build or update the internal product knowledge base for:
Product recommendations
AI chatbot queries
Search indexing
Category mapping
Request Details : 
Request Method & URL
GET https://ladani-store-2.myshopify.com/admin/api/2025-10/products.json
Headers
{
  "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>",
  "Content-Type": "application/json"
}
Body : 
No request body is required.

API 2 – Add Product(s) to Cart
1. API Overview
Field
Details
API Name
Add Products to Cart (AJAX Cart API)
Purpose
Add one or more variants of products to the current storefront cart
Method
POST
Endpoint
https://ladani-store-2.myshopify.com/cart/add.js
Headers
Not strictly required, but usually: Content-Type: application/json 
Auth
No auth header (uses Shopify storefront session/cookie)
Request Body
JSON with items array, each item = variant + quantity


When & Why This API Is Called
This API is called when:
User want to “Add to Cart” from chat.
Your AI assistant decides to add selected products (variants) to the cart.
You want to add multiple variants in one call.
 Important:
 id in the request = Variant ID, not Product ID.
 (This matches Shopify’s AJAX Cart API expectation.)
 Request  Details 
Request Method & URL
POST https://ladani-store-2.myshopify.com/cart/add.js
Headers (optional but recommended)
{
  "Content-Type": "application/json"
}
Request Body – Blueprint
This is the exact structural blueprint (no sample values, just placeholders):
{
  "items": [
    {
      "id": 0,          // required: Variant ID (not product ID)
      "quantity": 0     // required: integer quantity to add
    }
    // you can add more variant objects in this array
  ]
}

API 3 – Create Draft Order (Checkout / Tax & Final Total)

1. API Overview

Field
Details
API Name
Create Draft Order (Tax & Final Total Calculation)
Purpose
Create a draft order to calculate line totals, shipping, tax & grand total based on addresses
Method
POST
Endpoint
https://ladani-store-2.myshopify.com/admin/api/2025-10/draft_orders.json
Headers
{ 
  "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>",
  "Content-Type": "application/json" 
}
Auth
Admin API (Private Access Token)


When & Why This API Is Called
You use this API when:
User is ready to checkout from the chatbot.
You want to calculate full cost:
Item totals
Shipping charges
Taxes (based on shipping/billing address)
Final grand total
You need a “pre-invoice” / proforma-style summary to show user before redirecting to payment.
Request Details
Method & URL
POST https://ladani-store-2.myshopify.com/admin/api/2025-10/draft_orders.json
Headers
{
  "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>",
  "Content-Type": "application/json"
}
Request Body – Blueprint (with placeholders)
{
  "draft_order": {
    "email": "",

    "shipping_address": {
      "first_name": "",
      "last_name": "",
      "address1": "",
      "address2": "",
      "city": "",
      "province": "",
      "country": "",
      "zip": "",
      "phone": ""
    },

    "billing_address": {
      "first_name": "",
      "last_name": "",
      "address1": "",
      "address2": "",
      "city": "",
      "province": "",
      "country": "",
      "zip": "",
      "phone": ""
    },

    "line_items": [
      {
        "variant_id": 0,
        "quantity": 0
      }
      // you can add more items here
    ],

    "shipping_line": {
      "title": "Standard Shipping",
      "price": "0.00"
    },

    "currency": "INR",
    "note": ""
  }
}

API 4 – Complete Draft Order (Place the Order)

1. API Overview

Field
Details
API Name
Complete Draft Order (Convert Draft → Real Order)
Purpose
Places the final order. Used after tax calculation + user confirmation.
Method
PUT
Endpoint
https://ladani-store-2.myshopify.com/admin/api/2025-10/draft_orders/{draft_order_id}/complete.json?payment_pending=true
Headers
{ "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>" }
Auth
Shopify Admin API
Payment
COD (Cash on Delivery) – using payment_pending=true


When & Why This API Is Called
This API is triggered after API 3 (draft order) once:
User verifies the final total, tax, shipping, etc.
User confirms “Place Order”.
Your system wants to convert the draft order into an actual order in Shopify.
Because you are using COD, the order is created with:
payment_pending = true
Status becomes Pending Payment, but order is successfully created.
Request Details
Method & URL
PUT https://ladani-store-2.myshopify.com//admin/api/2025-10/draft_orders/{draft_order_id}/complete.json?payment_pending=true
Headers
{
  "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>",
}
Request Body
No request body is required for completing a draft order.


API 5 – Get User Information (Customer Lookup by Email)

1. API Overview

Field
Details
API Name
Get Customer by Email
Purpose
Search and fetch Shopify customer details using their email
Method
GET
Endpoint
https://ladani-store-2.myshopify.com/admin/api/2025-01/customers/search.json?query=email:{email}
Headers
{ "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>" }
Auth
Shopify Admin API


When & Why This API Is Called
You call this API when:
User comes to chatbot and enters email → you want to identify an existing customer.
Request Details
Method & URL
GET https://ladani-store-2.myshopify.com/admin/api/2025-01/customers/search.json?query=email:{email}
Headers
{
  "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>",
}
Request Body
No request body is required for completing a draft order.

API 6 – Get Previous Orders of a Customer

1. API Overview

Field
Details
API Name
Get Customer Order History
Purpose
Fetch all previous orders placed by a specific customer (based on customer_id)
Method
GET
Endpoint
https://ladani-store-2.myshopify.com/admin/api/2025-01/orders.json?customer_id={customer_id}&status=any
Headers
{ "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>" }
Auth
Shopify Admin API
Returns
Array of orders (completed, pending, cancelled, refunded, etc.)


When & Why This API Is Called
This API is used when:
User wants to view their previous orders inside the chatbot.
Recommending products based on purchase history.
Request Details
Method & URL
GET GET https://ladani-store-2.myshopify.com/admin/api/2025-01/orders.json?customer_id={customer_id}&status=any
Headers
{
  "X-Shopify-Access-Token": "<YOUR_SHOPIFY_ACCESS_TOKEN>",
}
Request Body
No request body is required for completing a draft order.
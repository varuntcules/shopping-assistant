import os
import requests
import json

SHOP_URL = "https://ladani-store-2.myshopify.com"
API_VERSION = "2025-10"
ACCESS_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN")

if not ACCESS_TOKEN:
    raise RuntimeError(
        "SHOPIFY_ACCESS_TOKEN is not set. Please add it to your environment or .env.local."
    )

def get_all_products():
    all_products = []
    next_url = f"{SHOP_URL}/admin/api/{API_VERSION}/products.json?limit=250"

    headers = {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

    while next_url:
        print(f"Fetching: {next_url}")
        response = requests.get(next_url, headers=headers)

        if response.status_code != 200:
            print("Error:", response.text)
            break

        data = response.json()
        all_products.extend(data.get("products", []))

        # Parse pagination link header
        link_header = response.headers.get("Link")
        if link_header and 'rel="next"' in link_header:
            # Extract the next page URL
            import re
            match = re.search(r'<([^>]+)>; rel="next"', link_header)
            next_url = match.group(1) if match else None
        else:
            next_url = None

    return all_products


def save_products_to_file(products):
    with open("product.json", "w", encoding="utf-8") as f:
        json.dump(products, f, indent=4, ensure_ascii=False)
    print(f"Saved {len(products)} products to product.json")


if __name__ == "__main__":
    products = get_all_products()
    save_products_to_file(products)

import html
import json
import os
import re
import unittest


os.environ["MONGODB_URI"] = "mongodb://"
os.environ["CORE_SKIP_STARTUP_ASSETS"] = "true"

import core  # noqa: E402


class ChatProductCardActionTests(unittest.TestCase):
    def extract_cart_payload(self, output):
        match = re.search(r"data-chatbot-cart-product='([^']+)'", output)
        self.assertIsNotNone(match)
        return json.loads(html.unescape(match.group(1)))

    def test_product_cards_include_detail_and_checkout_actions(self):
        output = core.generate_product_cards([
            {
                "id": "phone-1",
                "slug": "samsung-galaxy-a55",
                "sku": "SM-A55",
                "name": "Samsung Galaxy A55",
                "brand": "Samsung",
                "category": "Dien thoai",
                "price": 8990000,
                "currentPrice": 8990000,
                "image": "https://example.com/a55.jpg",
            }
        ], response_text_vi="ok")

        self.assertIn('href="/samsung-galaxy-a55.html"', output)
        self.assertIn('data-chatbot-detail-path="/samsung-galaxy-a55.html"', output)
        self.assertIn('href="/checkout"', output)
        self.assertIn("Xem chi ti&#7871;t", output)
        self.assertIn("Mua h&#224;ng", output)
        self.assertIn('data-chatbot-checkout-path="/checkout"', output)

        payload = self.extract_cart_payload(output)
        self.assertEqual("phone-1", payload["id"])
        self.assertEqual("samsung-galaxy-a55", payload["slug"])
        self.assertEqual("/samsung-galaxy-a55.html", payload["url"])
        self.assertEqual(8990000, payload["currentPrice"])

    def test_product_detail_action_can_use_source_url_slug(self):
        output = core.generate_product_cards([
            {
                "id": "tablet-1",
                "name": "May tinh bang ABC",
                "sourceUrl": "https://cellphones.com.vn/may-tinh-bang-abc.html",
                "brand": "ABC",
                "category": "Tablet",
                "currentPrice": 3990000,
            }
        ], response_text_vi="ok")

        self.assertIn('href="/may-tinh-bang-abc.html"', output)
        payload = self.extract_cart_payload(output)
        self.assertEqual("may-tinh-bang-abc", payload["slug"])

    def test_zero_price_product_uses_contact_action_instead_of_checkout(self):
        output = core.generate_product_cards([
            {
                "id": "watch-1",
                "slug": "dong-ho-lien-he",
                "name": "Dong ho lien he",
                "brand": "ABC",
                "price": 0,
            }
        ], response_text_vi="ok")

        self.assertIn("Li&#234;n h&#7879; t&#432; v&#7845;n", output)
        self.assertIn('data-chatbot-contact-path="/lien-he"', output)
        self.assertIn("chatbot-product-contact-note", output)
        self.assertNotIn("data-chatbot-cart-product", output)

    def test_product_without_database_identity_uses_contact_action(self):
        output = core.generate_product_cards([
            {
                "name": "San pham chua dong bo",
                "brand": "ABC",
                "category": "Phu kien",
                "price": 990000,
            }
        ], response_text_vi="ok")

        self.assertIn('href="/lien-he"', output)
        self.assertNotIn("data-chatbot-cart-product", output)


if __name__ == "__main__":
    unittest.main()

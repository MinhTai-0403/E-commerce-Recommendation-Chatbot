"""Regression tests for broad-vs-specific product requests."""

from __future__ import annotations

import os
import json
import unittest
from unittest.mock import patch


# Prevent core.py from using the real MongoDB connection while tests import it.
os.environ["MONGODB_URI"] = "mongodb://"
os.environ["CORE_SKIP_STARTUP_ASSETS"] = "true"

import core  # noqa: E402
from app import create_app  # noqa: E402


def make_product(product_id, name, category, price=0, **extra):
    document = {
        "_id": product_id,
        "id": product_id,
        "sku": extra.pop("sku", product_id),
        "slug": extra.pop("slug", product_id),
        "name": name,
        "title": extra.pop("title", name),
        "brand": extra.pop("brand", ""),
        "category": category,
        "currentPrice": price,
        "price": price,
        "image": "https://example.com/product.jpg",
        **extra,
    }
    return core.normalize_product_document(document)


class QuerySpecificityTests(unittest.TestCase):
    def assert_clarification(self, query, expected):
        parsed = core._parse_search_query(query)
        actual = core.should_ask_clarifying_question(
            query,
            parsed_query=parsed,
            matched_products=[],
        )
        self.assertEqual(expected, actual, query)

    def test_requested_query_matrix(self):
        broad_queries = [
            "điện thoại",
            "tôi muốn mua điện thoại",
            "tablet",
            "iPhone",
            "Samsung",
            "điện thoại Samsung",
        ]
        specific_queries = [
            "điện thoại pin trâu",
            "tablet có bút",
            "laptop mỏng nhẹ",
            "tai nghe bass mạnh",
            "Samsung dưới 10 triệu",
            "iPhone 15 Pro Max",
            "TV 55 inch",
            "máy lọc không khí phòng 30m2",
        ]

        for query in broad_queries:
            with self.subTest(query=query):
                self.assert_clarification(query, True)

        for query in specific_queries:
            with self.subTest(query=query):
                self.assert_clarification(query, False)

    def test_every_guide_is_broad_only_without_criteria(self):
        for guide_key, guide in core.PRODUCT_CLARIFY_GUIDES.items():
            trigger = guide["triggers"][0]
            with self.subTest(guide=guide_key, query=trigger):
                self.assert_clarification(trigger, True)

            specific_query = f"{trigger} màu đen"
            with self.subTest(guide=guide_key, query=specific_query):
                self.assert_clarification(specific_query, False)

    def test_battery_colloquialisms_share_one_clip_concept(self):
        for phrase in ("pin trâu", "pin khỏe", "pin tốt", "thời lượng pin tốt"):
            query = f"điện thoại {phrase}"
            parsed = core._parse_search_query(query)
            self.assertEqual("dien thoai pin lau", parsed["normalized_query"])
            self.assertIn("long battery life", core.build_clip_text_query(query))

    def test_clarification_chip_keeps_requirement_context(self):
        actions = core.get_clarification_suggestion_actions("điện thoại")
        pin_action = next(
            item for item in actions if item["label"] == "Pin lâu"
        )
        self.assertEqual("điện thoại Pin lâu", pin_action["message"])

    def test_price_numbers_are_not_treated_as_product_models(self):
        cases = (
            ("Samsung dưới 10 triệu", ["samsung"]),
            ("Samsung dưới 10m", ["samsung"]),
            ("điện thoại dưới 15000000", []),
        )
        for query, expected_tokens in cases:
            parsed = core._parse_search_query(query)
            self.assertFalse(core.is_specific_model_query(parsed_query=parsed), query)
            self.assertEqual(expected_tokens, parsed["tokens"], query)

    def test_spec_quantity_is_not_treated_as_product_model(self):
        query = "đế sạc Mophie 15W 4 thiết bị"
        product = make_product(
            "mophie-snap-3-in-1",
            "Đế sạc Mophie Snap+ du lịch 3 trong 1 hỗ trợ đa thiết bị",
            "Phụ kiện",
            brand="Mophie",
            specifications=[
                {
                    "groupName": "Tổng quan",
                    "rows": [
                        {"label": "Công suất sạc", "value": "15W"},
                        {"label": "Sử dụng tối đa", "value": "4 thiết bị"},
                    ],
                }
            ],
        )
        parsed = core._parse_search_query(query)
        results, _ = core.search_products(query, [product], limit=5)

        self.assertEqual([], core._query_model_tokens(parsed))
        self.assertEqual([product["id"]], [item["id"] for item in results])

    def test_specific_model_keeps_variants_and_rejects_nearby_items(self):
        query = "iPhone 15 Pro Max"
        parsed = core._parse_search_query(query)
        priced_variant = make_product(
            "iphone-15-pro-max-256",
            "iPhone 15 Pro Max 256GB | Chính hãng",
            "Điện thoại",
            price=24990000,
            brand="Apple",
        )
        contact_variant = make_product(
            "iphone-15-pro-max-512",
            "iPhone 15 Pro Max 512GB | Chính hãng",
            "Điện thoại",
            price=0,
            brand="Apple",
        )
        nearby_model = make_product(
            "iphone-15-pro-256",
            "iPhone 15 Pro 256GB | Chính hãng",
            "Điện thoại",
            price=20990000,
            brand="Apple",
        )
        accessory = make_product(
            "case-iphone-15-pro-max",
            "Ốp lưng iPhone 15 Pro Max",
            "Phụ kiện",
            price=590000,
            brand="Apple",
        )
        battery_kit = make_product(
            "galaxy-s4-extra-battery-kit",
            "Samsung Galaxy S4 Extra Battery Kit",
            "Samsung Galaxy S4 Extra Battery Kit",
            price=0,
            brand="Samsung",
        )
        ranked = [
            (0.9, 0.9, 0.0, contact_variant),
            (0.8, 0.8, 0.0, nearby_model),
            (0.7, 0.7, 0.0, accessory),
            (0.65, 0.65, 0.0, battery_kit),
            (0.6, 0.6, 0.0, priced_variant),
        ]

        grouped = core.filter_ranked_items_by_query_group(
            ranked,
            query,
            parsed,
            product_index=3,
        )
        self.assertNotIn(
            "galaxy-s4-extra-battery-kit",
            [item[3]["id"] for item in grouped],
        )
        exact = core._prioritize_specific_model_ranked(
            grouped,
            parsed,
            product_index=3,
        )

        self.assertEqual(
            ["iphone-15-pro-max-256", "iphone-15-pro-max-512"],
            [item[3]["id"] for item in exact],
        )

    def test_phone_group_rejects_services_and_accessories(self):
        phone = make_product(
            "galaxy-a55",
            "Samsung Galaxy A55 5G",
            "Điện thoại",
            brand="Samsung",
        )
        service = make_product(
            "care-galaxy-a55",
            "Gói 1 năm Samsung Care+ cho Samsung Galaxy A55",
            "Dịch vụ",
            brand="Samsung",
        )
        case = make_product(
            "case-galaxy-a55",
            "Bao da Samsung cho Samsung Galaxy A55",
            "Phụ kiện",
            brand="Samsung",
        )

        self.assertTrue(core.product_matches_query_group(phone, "phone"))
        self.assertFalse(core.product_matches_query_group(service, "phone"))
        self.assertFalse(core.product_matches_query_group(case, "phone"))
        self.assertEqual(
            "phone",
            core.detect_clarify_guide_key("Samsung dưới 10 triệu"),
        )
        self.assertEqual("tv", core.detect_clarify_guide_key("Samsung TV 55 inch"))

    def test_advisory_criteria_defaults_to_new_products(self):
        used_tablet = make_product(
            "used-tab",
            "Samsung Galaxy Tab S9 FE - Cũ Đẹp",
            "Tablet",
            price=7190000,
            brand="Samsung",
            specifications=[
                {
                    "groupName": "Tương thích",
                    "rows": [{"label": "Bút", "value": "S Pen"}],
                }
            ],
        )

        self.assertFalse(core.product_satisfies_user_requirements(
            used_tablet,
            "tablet có bút",
        ))
        self.assertTrue(core.product_satisfies_user_requirements(
            used_tablet,
            "tablet cũ có bút",
        ))

    def test_catalog_identifiers_do_not_trigger_clarification(self):
        ambiguous_phrases = set(core._known_brand_phrases())
        for guide in core.PRODUCT_CLARIFY_GUIDES.values():
            ambiguous_phrases.update(
                core._normalize_search_text(trigger)
                for trigger in guide.get("triggers", [])
            )

        failures = []
        checked = 0
        with open(core.PRODUCTS_METADATA_PATH, encoding="utf-8") as file:
            catalog_products = json.load(file)

        for document in catalog_products:
            product = core.normalize_product_document(document)
            identifier = str(product.get("sku") or product.get("slug") or "").strip()
            normalized = core._normalize_search_text(identifier)
            if not normalized or normalized in ambiguous_phrases:
                continue

            parsed = core._parse_search_query(identifier)
            if core.should_ask_clarifying_question(
                identifier,
                parsed_query=parsed,
                matched_products=[product],
            ):
                failures.append(identifier)
                if len(failures) >= 20:
                    break
            checked += 1

        self.assertGreater(checked, 30000)
        self.assertEqual([], failures)


class ChatRouteSpecificityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = create_app().test_client()

    def setUp(self):
        placeholder = make_product(
            "placeholder",
            "Placeholder Phone",
            "Điện thoại",
            price=1,
        )
        self.asset_patchers = [
            patch.object(core, "products", [placeholder]),
            patch.object(core, "faiss_index", object()),
            patch.object(core, "product_embeddings", object()),
        ]
        for patcher in self.asset_patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_broad_query_returns_clarification_contract(self):
        product = make_product(
            "sample-phone",
            "Sample Phone",
            "Điện thoại",
            price=10000000,
            brand="Samsung",
        )
        parsed = core._parse_search_query("Samsung")
        with patch.object(
            core,
            "search_products_text_embedding",
            return_value=([product], parsed, {"mode": "test"}),
        ):
            response = self.client.post("/chat", json={"message": "Samsung"})

        payload = response.get_json()
        self.assertEqual(200, response.status_code)
        self.assertTrue(payload["needs_clarification"])
        self.assertEqual([], payload["products"])
        self.assertEqual("clarification", payload["response_type"])
        self.assertTrue(payload["suggestions"])

    def test_specific_requirement_returns_product_card(self):
        product = make_product(
            "battery-phone",
            "Sample Battery Phone",
            "Điện thoại",
            price=10990000,
            brand="Samsung",
            detailBlobInfo={"decoded": True, "present": True},
            specifications=[
                {
                    "groupName": "Thông số chính",
                    "rows": [
                        {"label": "Dung lượng pin", "value": "6000mAh"},
                        {"label": "RAM", "value": "8GB"},
                        {"label": "Bộ nhớ trong", "value": "256GB"},
                        {"label": "Màn hình", "value": "AMOLED 120Hz"},
                    ],
                }
            ],
        )
        query = "điện thoại pin trâu"
        parsed = core._parse_search_query(query)
        with patch.object(
            core,
            "search_products_text_embedding",
            return_value=([product], parsed, {"mode": "test"}),
        ), patch.object(
            core,
            "product_satisfies_user_requirements",
            return_value=True,
        ):
            response = self.client.post("/chat", json={"message": query})

        payload = response.get_json()
        self.assertEqual(200, response.status_code)
        self.assertNotIn("needs_clarification", payload)
        self.assertIn("Sample Battery Phone", payload["reply"])
        self.assertIn("Vì sao phù hợp", payload["reply"])
        self.assertEqual("product_advisor", payload["response_type"])
        self.assertEqual("battery-phone", payload["advice"][0]["product_id"])

    def test_advisor_does_not_use_incomplete_product(self):
        product = make_product(
            "incomplete-phone",
            "Incomplete Phone",
            "Điện thoại",
            price=7990000,
            brand="Samsung",
        )
        query = "tư vấn điện thoại pin tốt dưới 10 triệu"
        parsed = core._parse_search_query(query)
        with patch.object(
            core,
            "search_products_text_embedding",
            return_value=([product], parsed, {"mode": "test"}),
        ), patch.object(
            core,
            "product_satisfies_user_requirements",
            return_value=True,
        ):
            response = self.client.post("/chat", json={"message": query})

        payload = response.get_json()
        self.assertEqual(200, response.status_code)
        self.assertEqual("advice_unavailable", payload["response_type"])
        self.assertEqual([], payload["products"])
        self.assertNotIn("Incomplete Phone", payload["reply"])

    def test_specific_model_uses_search_cards_without_advisor(self):
        product = make_product(
            "iphone-15-pro-max",
            "iPhone 15 Pro Max 256GB",
            "Điện thoại",
            price=24990000,
            brand="Apple",
        )
        query = "iPhone 15 Pro Max"
        parsed = core._parse_search_query(query)
        with patch.object(
            core,
            "search_products_text_embedding",
            return_value=([product], parsed, {"mode": "test"}),
        ), patch.object(
            core,
            "product_satisfies_user_requirements",
            return_value=True,
        ):
            response = self.client.post("/chat", json={"message": query})

        payload = response.get_json()
        self.assertEqual(200, response.status_code)
        self.assertEqual("product_search", payload["response_type"])
        self.assertNotIn("Vì sao phù hợp", payload["reply"])

    def test_missing_specific_model_does_not_offer_unrelated_products(self):
        query = "iPhone 99 Pro Max"
        parsed = core._parse_search_query(query)
        with patch.object(
            core,
            "search_products_text_embedding",
            return_value=([], parsed, {"mode": "test"}),
        ), patch.object(
            core,
            "find_alternative_products",
        ) as alternatives, patch.object(
            core,
            "get_available_category_names",
            return_value=["Điện thoại"],
        ), patch.object(
            core,
            "generate_product_not_found_reply",
            return_value="Không tìm thấy đúng model.",
        ):
            response = self.client.post("/chat", json={"message": query})

        self.assertEqual(200, response.status_code)
        self.assertEqual("Không tìm thấy đúng model.", response.get_json()["reply"])
        alternatives.assert_not_called()


if __name__ == "__main__":
    unittest.main()

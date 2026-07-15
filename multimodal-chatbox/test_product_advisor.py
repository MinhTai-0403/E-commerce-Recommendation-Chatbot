from __future__ import annotations

import unittest

import product_advisor


def make_rich_phone(product_id: str, name: str, battery: str = "5000mAh"):
    return {
        "id": product_id,
        "_id": product_id,
        "name": name,
        "brand": "Samsung",
        "category": "Điện thoại",
        "price": 8990000,
        "currentPrice": 8990000,
        "image_path": "https://example.com/phone.jpg",
        "statusLabel": "Liên hệ",
        "detailBlobInfo": {"decoded": True, "present": True},
        "specs": {
            "Pin - Dung lượng pin": battery,
            "Vi xử lý - Chipset": "Exynos 1480",
            "Bộ nhớ - RAM": "8GB",
            "Màn hình - Công nghệ": "Super AMOLED 120Hz",
            "Camera sau": "50MP, chống rung OIS",
        },
    }


class ProductAdvisorTests(unittest.TestCase):
    def test_only_rich_products_are_ready_for_advice(self):
        rich = make_rich_phone("rich", "Samsung Galaxy A55 5G")
        incomplete = {
            "id": "incomplete",
            "name": "Điện thoại thiếu thông số",
            "category": "Điện thoại",
            "price": 5000000,
            "image_path": "https://example.com/incomplete.jpg",
        }

        self.assertTrue(product_advisor.product_detail_profile(rich)["ready"])
        incomplete_profile = product_advisor.product_detail_profile(incomplete)
        self.assertFalse(incomplete_profile["ready"])
        self.assertIn("thông số chi tiết", incomplete_profile["missing"])

    def test_battery_query_prefers_larger_documented_capacity(self):
        smaller = make_rich_phone("small", "Phone 4500", battery="4500mAh")
        larger = make_rich_phone("large", "Phone 6000", battery="6000mAh")

        advice = product_advisor.build_product_advice(
            [smaller, larger],
            "tư vấn điện thoại pin trâu dưới 10 triệu",
            price_constraints={"price_max": 10000000, "price_min": None},
        )

        self.assertEqual(["large", "small"], [item["product_id"] for item in advice])
        self.assertTrue(any("Pin" in reason for reason in advice[0]["reasons"]))
        self.assertTrue(any("tồn kho" in note for note in advice[0]["cautions"]))

    def test_long_battery_advice_rejects_low_capacity_phone(self):
        low_capacity = make_rich_phone("low", "Phone 3300", battery="3300mAh")
        advice = product_advisor.build_product_advice(
            [low_capacity],
            "điện thoại pin lâu",
        )
        self.assertEqual([], advice)

    def test_battery_capacity_accepts_thousands_separator(self):
        product = make_rich_phone("comma", "Phone 4500", battery="4,500mAh")
        advice = product_advisor.build_product_advice(
            [product],
            "điện thoại pin lâu",
        )
        self.assertEqual(["comma"], [item["product_id"] for item in advice])

    def test_advice_rejects_implausible_phone_price(self):
        product = make_rich_phone("bad-price", "Phone Bad Price")
        product["price"] = 4000
        product["currentPrice"] = 4000
        profile = product_advisor.product_detail_profile(product)

        self.assertFalse(profile["ready"])
        self.assertIn("giá", profile["missing"])

    def test_broad_advice_keeps_one_variant_per_model(self):
        white = make_rich_phone("a70-white", "Samsung Galaxy A70 Trắng")
        blue = make_rich_phone("a70-blue", "Samsung Galaxy A70 Xanh")
        other = make_rich_phone("m35", "Samsung Galaxy M35 5G")

        advice = product_advisor.build_product_advice(
            [white, blue, other],
            "điện thoại dưới 10 triệu",
        )
        self.assertEqual(2, len(advice))

        variants = product_advisor.build_product_advice(
            [white, blue],
            "tư vấn Samsung Galaxy A70",
            allow_variants=True,
        )
        self.assertEqual(2, len(variants))

    def test_specific_model_stays_in_search_unless_advice_is_explicit(self):
        self.assertFalse(product_advisor.should_use_advisor(
            "iPhone 15 Pro Max",
            specific_model=True,
            has_criteria=True,
        ))
        self.assertTrue(product_advisor.should_use_advisor(
            "tư vấn iPhone 15 Pro Max có phù hợp không",
            specific_model=True,
        ))

    def test_serialized_advice_does_not_include_full_catalog_document(self):
        product = make_rich_phone("phone", "Samsung Galaxy A55 5G")
        advice = product_advisor.build_product_advice(
            [product],
            "điện thoại camera đẹp",
        )
        serialized = product_advisor.serialize_product_advice(advice)

        self.assertEqual("phone", serialized[0]["product_id"])
        self.assertNotIn("product", serialized[0])
        self.assertGreaterEqual(len(serialized[0]["key_specs"]), 3)


if __name__ == "__main__":
    unittest.main()

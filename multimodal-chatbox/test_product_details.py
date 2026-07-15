import base64
import gzip
import json
import unittest

from product_details import (
    DetailBlobDecodeError,
    decode_detail_blob,
    enrich_product_document,
    html_to_text,
)


class ProductDetailBlobTests(unittest.TestCase):
    def setUp(self):
        self.detail = {
            "name": "Bo sac mau",
            "currentPrice": 100,
            "highlights": ["Sac nhanh 15W", "Ho tro MagSafe"],
            "specifications": [
                {
                    "groupName": "Tong quan",
                    "rows": [
                        {
                            "label": "Dau ra",
                            "value": {"html": "USB-C<br>Khong day 15W"},
                        }
                    ],
                }
            ],
            "articleHtml": "<h2>Mo ta</h2><p>Gon nhe &amp; de mang theo.</p>",
            "rawSource": {"large": "raw payload"},
            "meta": {"description": "Mo ta tu meta"},
        }
        self.payload = gzip.compress(
            json.dumps(self.detail, ensure_ascii=False).encode("utf-8")
        )

    def test_decodes_bson_binary_bytes(self):
        decoded = decode_detail_blob(self.payload)
        self.assertEqual(decoded["highlights"], self.detail["highlights"])

    def test_decodes_extended_json_binary(self):
        value = {
            "$binary": {
                "base64": base64.b64encode(self.payload).decode("ascii"),
                "subType": "00",
            }
        }
        decoded = decode_detail_blob(value)
        self.assertEqual(decoded["specifications"], self.detail["specifications"])

    def test_enriches_document_and_keeps_top_level_authoritative(self):
        product, error = enrich_product_document({
            "_id": "mongo-id",
            "name": "Ten moi tren MongoDB",
            "currentPrice": 0,
            "statusLabel": "Lien he",
            "detailBlob": self.payload,
        })

        self.assertIsNone(error)
        self.assertEqual(product["name"], "Ten moi tren MongoDB")
        self.assertEqual(product["currentPrice"], 0)
        self.assertEqual(product["highlights"], self.detail["highlights"])
        self.assertEqual(
            product["specifications"][0]["rows"][0]["value"],
            "USB-C\nKhong day 15W",
        )
        self.assertEqual(product["articleText"], "Mo ta\nGon nhe & de mang theo.")
        self.assertNotIn("detailBlob", product)
        self.assertNotIn("rawSource", product)
        self.assertTrue(product["detailBlobInfo"]["decoded"])

    def test_invalid_gzip_is_reported_without_raw_blob(self):
        product, error = enrich_product_document({
            "_id": "broken",
            "detailBlob": b"\x1f\x8bnot-a-valid-stream",
        })
        self.assertIsNotNone(error)
        self.assertFalse(product["detailBlobInfo"]["decoded"])
        self.assertNotIn("detailBlob", product)

    def test_rejects_non_object_json(self):
        payload = gzip.compress(b"[1, 2, 3]")
        with self.assertRaises(DetailBlobDecodeError):
            decode_detail_blob(payload)

    def test_html_to_text_ignores_scripts(self):
        value = html_to_text("<p>Thong tin</p><script>alert(1)</script><p>Chi tiet</p>")
        self.assertEqual(value, "Thong tin\nChi tiet")


if __name__ == "__main__":
    unittest.main()

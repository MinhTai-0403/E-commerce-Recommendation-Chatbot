import os
import tempfile
import unittest

from catalog_store import CatalogSearchStore, CatalogSearchWriter


class CatalogSearchStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.path = os.path.join(self.temp_dir.name, "catalog.sqlite3")

        writer = CatalogSearchWriter(self.path)
        writer.add({
            "_id": "mophie-1",
            "name": "De sac Mophie Snap Plus",
            "brand": "Mophie",
            "category": "Phu kien",
            "highlights": ["Sac toi da 4 thiet bi"],
            "specifications": [
                {"label": "Cong suat sac", "value": "15W"},
            ],
        })
        writer.add({
            "_id": "phone-1",
            "name": "Samsung Galaxy A55 5G",
            "brand": "Samsung",
            "category": "Dien thoai",
            "currentPrice": 8990000,
        })
        writer.finish()

        self.store = CatalogSearchStore(self.path)
        self.addCleanup(self.store.close)

    def test_searches_detail_fields(self):
        products = self.store.search(
            '"mophie" AND "15w" AND "4" AND "thiet" AND "bi"',
            limit=5,
        )
        self.assertEqual(["mophie-1"], [item["_id"] for item in products])

    def test_gets_documents_by_product_id(self):
        products = self.store.get_by_ids(["phone-1", "missing"])
        self.assertEqual(["phone-1"], list(products))
        self.assertEqual("Samsung Galaxy A55 5G", products["phone-1"]["name"])

    def test_records_catalog_metadata(self):
        self.assertEqual(2, self.store.product_count)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import os
import sqlite3
import threading
import zlib
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Sequence

from product_details import build_catalog_search_fields


CATALOG_SCHEMA_VERSION = 1
FTS_COLUMNS = (
    "name", "brand", "category", "labels", "specs", "description",
    "details", "extras", "identifiers",
)


def product_identity(product: Dict[str, Any]) -> str:
    for key in (
        "productKey", "_id", "id", "productId", "product_id", "sku",
        "slug", "url", "name", "title",
    ):
        value = product.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


class CatalogSearchWriter:
    def __init__(self, target_path: str) -> None:
        self.target_path = os.path.abspath(target_path)
        self.temp_path = f"{self.target_path}.tmp"
        self.count = 0
        self._closed = False

        if os.path.exists(self.temp_path):
            os.remove(self.temp_path)

        self.connection = sqlite3.connect(self.temp_path)
        self.connection.execute("PRAGMA journal_mode=OFF")
        self.connection.execute("PRAGMA synchronous=OFF")
        self.connection.execute("PRAGMA temp_store=MEMORY")
        self.connection.execute("PRAGMA cache_size=-65536")
        self.connection.executescript(
            """
            CREATE TABLE catalog_products (
                rowid INTEGER PRIMARY KEY,
                product_id TEXT NOT NULL UNIQUE,
                document BLOB NOT NULL
            );
            CREATE TABLE catalog_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE product_fts USING fts5(
                name,
                brand,
                category,
                labels,
                specs,
                description,
                details,
                extras,
                identifiers,
                content=''
            );
            """
        )

    def add(self, product: Dict[str, Any]) -> bool:
        product_id = product_identity(product)
        if not product_id:
            return False

        document_json = json.dumps(
            product,
            ensure_ascii=False,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
        document_blob = zlib.compress(document_json, level=6)

        cursor = self.connection.execute(
            "INSERT OR IGNORE INTO catalog_products(product_id, document) VALUES (?, ?)",
            (product_id, document_blob),
        )
        if cursor.rowcount == 0:
            return False

        rowid = int(cursor.lastrowid)
        fields = build_catalog_search_fields(product)
        placeholders = ", ".join("?" for _ in FTS_COLUMNS)
        self.connection.execute(
            f"INSERT INTO product_fts(rowid, {', '.join(FTS_COLUMNS)}) "
            f"VALUES (?, {placeholders})",
            (rowid, *(fields[column] for column in FTS_COLUMNS)),
        )
        self.count += 1

        if self.count % 1000 == 0:
            self.connection.commit()
        return True

    def finish(self) -> None:
        if self._closed:
            return

        metadata = {
            "schema_version": str(CATALOG_SCHEMA_VERSION),
            "product_count": str(self.count),
            "built_at": datetime.now(timezone.utc).isoformat(),
        }
        self.connection.executemany(
            "INSERT OR REPLACE INTO catalog_metadata(key, value) VALUES (?, ?)",
            metadata.items(),
        )
        self.connection.execute("INSERT INTO product_fts(product_fts) VALUES ('optimize')")
        self.connection.commit()
        self.connection.close()
        self._closed = True
        os.replace(self.temp_path, self.target_path)

    def abort(self) -> None:
        if not self._closed:
            self.connection.close()
            self._closed = True
        if os.path.exists(self.temp_path):
            os.remove(self.temp_path)


class CatalogSearchStore:
    def __init__(self, path: str) -> None:
        self.path = os.path.abspath(path)
        uri = f"file:{self.path.replace(os.sep, '/')}?mode=ro"
        self.connection = sqlite3.connect(
            uri,
            uri=True,
            check_same_thread=False,
        )
        self.connection.row_factory = sqlite3.Row
        self._lock = threading.RLock()

        metadata_rows = self.connection.execute(
            "SELECT key, value FROM catalog_metadata"
        ).fetchall()
        self.metadata = {row["key"]: row["value"] for row in metadata_rows}
        schema_version = int(self.metadata.get("schema_version", "0"))
        if schema_version != CATALOG_SCHEMA_VERSION:
            self.close()
            raise ValueError(
                f"Catalog SQLite schema {schema_version} != {CATALOG_SCHEMA_VERSION}"
            )

    @property
    def product_count(self) -> int:
        return int(self.metadata.get("product_count", "0"))

    @staticmethod
    def _decode_document(blob: bytes) -> Dict[str, Any]:
        return json.loads(zlib.decompress(blob).decode("utf-8"))

    def search(self, match_query: str, limit: int = 300) -> List[Dict[str, Any]]:
        if not str(match_query or "").strip():
            return []

        sql = """
            SELECT catalog_products.document
            FROM product_fts
            JOIN catalog_products ON catalog_products.rowid = product_fts.rowid
            WHERE product_fts MATCH ?
            ORDER BY bm25(product_fts, 14.0, 16.0, 10.0, 9.0, 7.0, 3.0, 5.0, 4.0, 18.0)
            LIMIT ?
        """
        with self._lock:
            rows = self.connection.execute(
                sql,
                (match_query, max(1, int(limit))),
            ).fetchall()
        return [self._decode_document(row["document"]) for row in rows]

    def get_by_ids(self, product_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
        clean_ids = list(dict.fromkeys(str(value) for value in product_ids if value))
        if not clean_ids:
            return {}

        products: Dict[str, Dict[str, Any]] = {}
        with self._lock:
            for start in range(0, len(clean_ids), 500):
                chunk = clean_ids[start:start + 500]
                placeholders = ",".join("?" for _ in chunk)
                rows = self.connection.execute(
                    f"SELECT product_id, document FROM catalog_products "
                    f"WHERE product_id IN ({placeholders})",
                    chunk,
                ).fetchall()
                for row in rows:
                    products[str(row["product_id"])] = self._decode_document(
                        row["document"]
                    )
        return products

    def close(self) -> None:
        connection = getattr(self, "connection", None)
        if connection is not None:
            connection.close()
            self.connection = None

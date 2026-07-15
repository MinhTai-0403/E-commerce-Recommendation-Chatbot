from __future__ import annotations

import argparse
import gzip
import json
import os
import time

from catalog_store import CatalogSearchWriter


BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INDEX_DIR = os.path.join(BASE_DIR, "index")
DEFAULT_INPUT = os.path.join(INDEX_DIR, "catalog.jsonl.gz")
DEFAULT_OUTPUT = os.path.join(INDEX_DIR, "catalog_search.sqlite3")


def build_store(input_path: str, output_path: str) -> int:
    writer = CatalogSearchWriter(output_path)
    started_at = time.perf_counter()

    try:
        with gzip.open(input_path, "rt", encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, start=1):
                line = line.strip()
                if not line:
                    continue
                product = json.loads(line)
                writer.add(product)

                if writer.count % 1000 == 0:
                    print(
                        f"\rĐang tạo catalog FTS: {writer.count}",
                        end="",
                        flush=True,
                    )

        writer.finish()
    except Exception:
        writer.abort()
        raise

    elapsed = time.perf_counter() - started_at
    print()
    print(f"Đã tạo SQLite FTS: {output_path}")
    print(f"Tổng sản phẩm: {writer.count}; thời gian: {elapsed:.1f} giây")
    return writer.count


def parse_args():
    parser = argparse.ArgumentParser(
        description="Tạo SQLite FTS từ catalog detailBlob đã đồng bộ."
    )
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    build_store(args.input, args.output)

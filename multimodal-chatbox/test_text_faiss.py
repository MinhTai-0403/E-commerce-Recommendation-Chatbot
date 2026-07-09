"""Verify that a text query searches the existing image-embedding FAISS index."""

from __future__ import annotations

import argparse
import json
import os

import faiss
import numpy as np

from clip_core import get_clip_text_embedding

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FAISS_DIR = os.path.join(BASE_DIR, "index")
INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMBEDDINGS_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
METADATA_PATH = os.path.join(FAISS_DIR, "products.json")


def product_id(product):
    if not isinstance(product, dict):
        return str(product)
    for key in (
        "productKey", "_id", "id", "productId", "product_id",
        "sku", "slug", "url", "name", "title",
    ):
        value = product.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def product_name(product):
    if not isinstance(product, dict):
        return str(product)
    return str(
        product.get("name")
        or product.get("title")
        or product.get("product_name")
        or product_id(product)
        or "Không có tên"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "query",
        nargs="?",
        default="wireless bluetooth headphones",
        help="Text query to encode with CLIP",
    )
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()

    missing = [
        path for path in (INDEX_PATH, EMBEDDINGS_PATH, METADATA_PATH)
        if not os.path.isfile(path)
    ]
    if missing:
        raise FileNotFoundError(
            "Thiếu file index:\n- " + "\n- ".join(missing)
        )

    index = faiss.read_index(INDEX_PATH)
    embeddings = np.load(EMBEDDINGS_PATH, allow_pickle=False).astype("float32")
    with open(METADATA_PATH, "r", encoding="utf-8") as file:
        metadata = json.load(file)

    print("FAISS vectors :", index.ntotal)
    print("Embeddings    :", embeddings.shape)
    print("Metadata rows :", len(metadata))

    if embeddings.ndim != 2:
        raise ValueError(f"embeddings.npy phải là ma trận 2D, hiện tại: {embeddings.shape}")
    if not (index.ntotal == embeddings.shape[0] == len(metadata)):
        raise ValueError("FAISS, embeddings.npy và products.json không cùng số lượng.")
    if index.d != embeddings.shape[1]:
        raise ValueError("Số chiều FAISS và embeddings.npy không khớp.")

    query_embedding = get_clip_text_embedding(args.query)
    if query_embedding.shape[0] != index.d:
        raise ValueError(
            f"Text embedding có {query_embedding.shape[0]} chiều, FAISS cần {index.d}."
        )

    distances, positions = index.search(
        query_embedding.reshape(1, -1).astype("float32"),
        min(max(1, args.k), index.ntotal),
    )

    print(f"\nQuery: {args.query}")
    print("Kết quả lấy trực tiếp từ image-embedding FAISS:")
    for rank, (distance, position) in enumerate(
        zip(distances[0], positions[0]),
        start=1,
    ):
        if position < 0:
            continue
        item = metadata[int(position)]
        similarity = 1.0 - float(distance) / 2.0
        print(
            f"{rank}. similarity={similarity:.4f} | "
            f"id={product_id(item)} | {product_name(item)}"
        )


if __name__ == "__main__":
    main()

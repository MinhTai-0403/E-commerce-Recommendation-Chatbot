"""Shared OpenCLIP encoder for image-to-image and text-to-image retrieval.

The model and pretrained checkpoint MUST match build_index.py. The current
FAISS index was built with ViT-B-32 / openai and normalized 512-D vectors.
"""

from __future__ import annotations

import os
from threading import Lock

import numpy as np
import open_clip
import torch
from PIL import Image

CLIP_MODEL_NAME = os.getenv("CLIP_MODEL_NAME", "ViT-B-32").strip()
CLIP_PRETRAINED = os.getenv("CLIP_PRETRAINED", "openai").strip()
CLIP_DEVICE = os.getenv(
    "CLIP_DEVICE",
    "cuda" if torch.cuda.is_available() else "cpu",
).strip()
EXPECTED_EMBEDDING_DIM = int(os.getenv("CLIP_EMBEDDING_DIM", "512"))

_model = None
_preprocess = None
_tokenizer = None
_model_lock = Lock()
_encode_lock = Lock()


def _load_clip():
    global _model, _preprocess, _tokenizer

    if _model is not None:
        return _model, _preprocess, _tokenizer

    with _model_lock:
        if _model is None:
            print(
                "Đang tải OpenCLIP dùng chung cho ảnh và văn bản: "
                f"{CLIP_MODEL_NAME}/{CLIP_PRETRAINED} trên {CLIP_DEVICE}..."
            )
            model, _, preprocess = open_clip.create_model_and_transforms(
                CLIP_MODEL_NAME,
                pretrained=CLIP_PRETRAINED,
            )
            tokenizer = open_clip.get_tokenizer(CLIP_MODEL_NAME)
            model = model.to(CLIP_DEVICE).eval()

            _model = model
            _preprocess = preprocess
            _tokenizer = tokenizer
            print("Đã tải OpenCLIP cho tìm kiếm đa phương thức.")

    return _model, _preprocess, _tokenizer


def _to_normalized_numpy(features: torch.Tensor) -> np.ndarray:
    features = features / features.norm(dim=-1, keepdim=True).clamp_min(1e-12)
    vector = (
        features.detach()
        .cpu()
        .numpy()
        .reshape(-1)
        .astype("float32")
    )

    if vector.shape[0] != EXPECTED_EMBEDDING_DIM:
        raise ValueError(
            "Sai kích thước CLIP embedding: "
            f"{vector.shape[0]} != {EXPECTED_EMBEDDING_DIM}. "
            "Hãy dùng cùng CLIP_MODEL_NAME/CLIP_PRETRAINED với build_index.py."
        )

    return vector


def get_clip_embedding(image_path: str) -> np.ndarray:
    """Encode one image into the same normalized space used by FAISS."""
    model, preprocess, _ = _load_clip()

    with Image.open(image_path) as image:
        image = image.convert("RGB")
        image_tensor = preprocess(image).unsqueeze(0).to(CLIP_DEVICE)

    with _encode_lock, torch.inference_mode():
        image_features = model.encode_image(image_tensor)

    return _to_normalized_numpy(image_features)


def get_clip_text_embedding(text: str) -> np.ndarray:
    """Encode text so it can be searched directly against image embeddings."""
    clean_text = " ".join(str(text or "").split()).strip()
    if not clean_text:
        raise ValueError("Nội dung văn bản dùng để tạo embedding đang rỗng.")

    model, _, tokenizer = _load_clip()
    text_tokens = tokenizer([clean_text]).to(CLIP_DEVICE)

    with _encode_lock, torch.inference_mode():
        text_features = model.encode_text(text_tokens)

    return _to_normalized_numpy(text_features)

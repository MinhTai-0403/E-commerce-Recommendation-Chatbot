"""FAISS file helpers that support Unicode paths on Windows.

The native ``faiss.read_index``/``write_index`` functions may fail when a
Windows path contains non-ASCII characters. Reading and writing the serialized
bytes through Python keeps the exact same FAISS format without that limitation.
"""

from pathlib import Path

import faiss
import numpy as np


def read_faiss_index(path):
    serialized = np.frombuffer(Path(path).read_bytes(), dtype=np.uint8).copy()
    return faiss.deserialize_index(serialized)


def write_faiss_index(index, path):
    serialized = faiss.serialize_index(index)
    Path(path).write_bytes(serialized.tobytes())


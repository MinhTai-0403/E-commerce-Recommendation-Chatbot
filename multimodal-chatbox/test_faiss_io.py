import tempfile
import unittest
from pathlib import Path

import faiss
import numpy as np

from utils.faiss_io import read_faiss_index, write_faiss_index


class FaissUnicodePathTests(unittest.TestCase):
    def test_round_trip_on_unicode_path(self):
        index = faiss.IndexFlatIP(3)
        index.add(np.asarray([[1.0, 0.0, 0.0]], dtype="float32"))

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "dữ liệu" / "chỉ-mục.index"
            path.parent.mkdir()
            write_faiss_index(index, path)
            restored = read_faiss_index(path)

        self.assertEqual(restored.ntotal, 1)
        self.assertEqual(restored.d, 3)


if __name__ == "__main__":
    unittest.main()


import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from annual import normalize, refresh


def payload(rate="1.20"):
    return {"groupDetail":{"metadata":{"frequency":"Annual"}},
            "seriesDetail":{"FXAUSDCAD":{"label":"USD/CAD"}, "FXAGBPCAD":{"label":"GBP/CAD"}},
            "observations":[{"d":"2017-01-01", "FXAUSDCAD":{"v":rate}}]}


class AnnualTests(unittest.TestCase):
    def test_observations_preserve_precision_and_omit_unpublished_currencies(self):
        self.assertEqual(normalize(payload()), {"2017":{"USD":"1.20"}})

    def test_incomplete_or_invalid_observations_preserve_last_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "annual.json"
            previous = {"years":{"2017":{"USD":"1.20", "GBP":"1.70"}}}
            path.write_text(json.dumps(previous))
            for invalid in [payload(), payload("0"), payload("-1")]:
                with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                    refresh(path, lambda: invalid)
                self.assertEqual(json.loads(path.read_text()), previous)

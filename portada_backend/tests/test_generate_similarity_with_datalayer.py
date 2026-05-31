import importlib.util
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "generate_similarity_with_datalayer.py"


def load_module():
    spec = importlib.util.spec_from_file_location("generate_similarity_with_datalayer", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeRow:
    def __init__(self, **data):
        self._data = data

    def asDict(self, recursive=False):
        return dict(self._data)


class FakeDataFrame:
    def __init__(self, rows):
        self._rows = rows
        self.columns = ["citation"]

    def count(self):
        return len(self._rows)

    def collect(self):
        return list(self._rows)


class FakeLayer:
    def __init__(self):
        self.read_entities = []
        self.read_entries_called = False
        self.cleaned_entries = []
        self.normalized_entries = []

    def read_raw_entities(self, entity):
        self.read_entities.append(entity)
        return FakeDataFrame([FakeRow(name="Barcelona", voices=["Bcn", "Barna"])])

    def get_known_entity_voices(self, df_entities):
        return FakeDataFrame([
            FakeRow(name="Barcelona", voice="Bcn"),
            FakeRow(name="Barcelona", voice="Barna"),
            FakeRow(name="Valencia", voice="Valencia"),
        ])

    def read_raw_entries(self):
        self.read_entries_called = True
        return FakeDataFrame([FakeRow(entry_id="1")])

    def cleaning_entries(self, df_entries, saving_original_data=True):
        self.cleaned_entries.append((df_entries, saving_original_data))
        return FakeDataFrame([FakeRow(entry_id="1", cleaned=True)])

    def normalize_strings_for_ship_entries(self, df_entries):
        self.normalized_entries.append(df_entries)
        return FakeDataFrame([FakeRow(entry_id="1", normalized=True)])

    def extract_ship_types(self, df_entries):
        rows = df_entries.collect()
        if not rows or not rows[0].asDict().get("normalized"):
            return FakeDataFrame([])
        return FakeDataFrame([FakeRow(citation="Vapor"), FakeRow(citation="Vapor")])


class FakeVoiceList:
    @staticmethod
    def from_dict(entity_type, data):
        return {"entity_type": entity_type, "data": data}


class FakeSimilarityService:
    def __init__(self):
        self.calls = []

    def evaluate(self, terms_input, voice_list):
        self.calls.append((terms_input, voice_list))
        return [
            {
                "term": "Vapor",
                "frequency": 2,
                "classification": "CONSENSUS",
            }
        ]


class DataLayerSimilarityScriptTests(unittest.TestCase):
    def test_collect_known_voices_uses_datalayer_methods(self):
        module = load_module()
        layer = FakeLayer()

        voices = module.collect_known_voices(layer, "port")

        self.assertEqual(layer.read_entities, ["port"])
        self.assertEqual(voices, {
            "Barcelona": ["Bcn", "Barna"],
            "Valencia": ["Valencia"],
        })

    def test_run_similarity_generation_reads_entries_and_known_voices_from_datalayer(self):
        module = load_module()
        layer = FakeLayer()
        service = FakeSimilarityService()

        results = module.run_similarity_generation(
            layer=layer,
            service=service,
            voice_list_factory=FakeVoiceList,
            entities=["ship_type"],
        )

        self.assertTrue(layer.read_entries_called)
        self.assertEqual(layer.read_entities, ["ship_type"])
        self.assertEqual(results["source"], "py-portada-data-layer")
        self.assertEqual(results["entities"]["ship_type"]["status"], "success")
        self.assertEqual(results["entities"]["ship_type"]["coverage"], 100.0)
        self.assertEqual(service.calls[0][0], [{"term": "Vapor", "frequency": 2}])

    def test_run_similarity_generation_cleans_entries_before_extracting_citations(self):
        module = load_module()
        layer = FakeLayer()
        service = FakeSimilarityService()

        module.run_similarity_generation(
            layer=layer,
            service=service,
            voice_list_factory=FakeVoiceList,
            entities=["ship_type"],
        )

        self.assertEqual(len(layer.cleaned_entries), 1)
        self.assertIs(layer.cleaned_entries[0][0].collect()[0].asDict()["entry_id"], "1")
        self.assertFalse(layer.cleaned_entries[0][1])
        self.assertEqual(len(layer.normalized_entries), 1)


if __name__ == "__main__":
    unittest.main()

from pathlib import Path

from app.routers import similarity_results


def test_get_results_file_prefers_datalayer_output(tmp_path, monkeypatch):
    legacy = tmp_path / "similarity_results.json"
    canonical = tmp_path / "similarity_results_datalayer.json"
    legacy.write_text("{}", encoding="utf-8")
    canonical.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(similarity_results, "RESULTS_DIR", tmp_path)

    assert similarity_results.get_results_file() == canonical


def test_get_results_file_falls_back_to_legacy_output(tmp_path, monkeypatch):
    legacy = tmp_path / "similarity_results.json"
    legacy.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(similarity_results, "RESULTS_DIR", tmp_path)

    assert similarity_results.get_results_file() == legacy


def test_load_results_data_rejects_concatenated_json(tmp_path, monkeypatch):
    canonical = tmp_path / "similarity_results_datalayer.json"
    canonical.write_text('{"first": true}{"second": true}', encoding="utf-8")

    monkeypatch.setattr(similarity_results, "RESULTS_DIR", tmp_path)

    try:
        similarity_results.load_results_data()
    except similarity_results.InvalidResultsFileError as exc:
        assert exc.file_name == "similarity_results_datalayer.json"
        assert "line" in exc.message
    else:
        raise AssertionError("Expected invalid concatenated JSON to be rejected")


def test_resolve_delta_similarity_root_uses_config_base_and_project():
    root = similarity_results.resolve_delta_similarity_root({
        "base_path": "/app/delta_lake/",
        "project_data_name": "portada_project",
    })

    assert root == "/app/delta_lake/portada_project/similarity_results"


def test_build_next_cursor_uses_last_row_sort_fields():
    cursor = similarity_results.build_next_cursor([
        {"frequency": 9, "term": "berg"},
        {"frequency": 3, "term": "vapor"},
    ], limit=2)

    assert similarity_results.decode_cursor(cursor) == {"frequency": 3, "term": "vapor"}


class FakeColumn:
    def __init__(self, expr):
        self.expr = expr

    def __lt__(self, other):
        return FakeColumn(f"({self.expr} < {other})")

    def __gt__(self, other):
        return FakeColumn(f"({self.expr} > {other})")

    def __eq__(self, other):
        return FakeColumn(f"({self.expr} = {other})")

    def __and__(self, other):
        return FakeColumn(f"({self.expr} AND {other.expr})")

    def __or__(self, other):
        return FakeColumn(f"({self.expr} OR {other.expr})")


class FakeFunctions:
    @staticmethod
    def col(name):
        return FakeColumn(name)

    @staticmethod
    def desc(name):
        return f"desc:{name}"

    @staticmethod
    def asc(name):
        return f"asc:{name}"


def test_apply_cursor_filter_adds_stable_keyset_condition(monkeypatch):
    class FakeDataFrame:
        def __init__(self):
            self.condition = None

        def where(self, condition):
            self.condition = condition
            return self

    monkeypatch.setattr(similarity_results, "F", FakeFunctions)
    df = FakeDataFrame()

    cursor = similarity_results.encode_cursor(frequency=10, term="abc")

    returned = similarity_results.apply_cursor_filter(df, cursor)

    assert returned is df
    assert df.condition.expr == "((frequency < 10) OR ((frequency = 10) AND (term > abc)))"

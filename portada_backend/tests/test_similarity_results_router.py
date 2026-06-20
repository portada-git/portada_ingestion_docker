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

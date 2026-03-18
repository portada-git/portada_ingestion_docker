import json
import os
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from portada_data_layer import PortadaBuilder
from portada_s_index import SimilarityService as RealSimilarityService, VoiceList
from portada_data_layer.portada_cleaning import BoatFactCleaning
from pyspark.sql import functions as F

from .datalayer import DataLayerService


ENTITY_SPECS: Dict[str, Dict[str, Any]] = {
    "flag": {"known_entity": "flag", "citation_field": "ship_flag"},
    "ship_tons": {"known_entity": "ship_tons", "citation_field": "ship_tons"},
    "travel_duration": {
        "known_entity": "travel_duration",
        "citation_field": "travel_duration",
    },
    "comodity": {"known_entity": "comodity", "citation_field": "comodity"},
    "ship_type": {"known_entity": "ship_type", "citation_field": "ship_type"},
    "unit": {"known_entity": "unit", "citation_field": "unit"},
    "port": {"known_entity": "port", "citation_field": "port"},
    "master_role": {
        "known_entity": "master_role",
        "citation_field": "master_role",
    },
}

ENTITY_ALIASES: Dict[str, str] = {
    "ship_flag": "flag",
    "travel_departure_port": "port",
    "travel_arrival_port": "port",
    "commodity": "comodity",
}

ALGORITHM_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "levenshtein_ocr": {
        "enabled": True,
        "threshold": 0.75,
        "gray_zone": [0.71, 0.749],
        "params": {"confusion_cost": 0.4},
    },
    "levenshtein_ratio": {
        "enabled": False,
        "threshold": 0.75,
        "gray_zone": [0.71, 0.749],
        "params": {},
    },
    "jaro_winkler": {
        "enabled": True,
        "threshold": 0.85,
        "gray_zone": [0.8, 0.849],
        "params": {"prefix_weight": 0.1},
    },
    "ngram_2": {
        "enabled": True,
        "threshold": 0.63,
        "gray_zone": [0.6, 0.629],
        "params": {"n": 2},
    },
    "ngram_3": {
        "enabled": False,
        "threshold": 0.55,
        "gray_zone": [0.52, 0.549],
        "params": {"n": 3},
    },
    "ngram_4": {
        "enabled": False,
        "threshold": 0.5,
        "gray_zone": [0.46, 0.499],
        "params": {"n": 4},
    },
    "phonetic_dm": {
        "enabled": False,
        "threshold": 0.85,
        "gray_zone": [0.8, 0.849],
        "params": {},
    },
    "soundex": {
        "enabled": False,
        "threshold": 0.9,
        "gray_zone": [0.8, 0.899],
        "params": {},
    },
    "semantica": {
        "enabled": False,
        "threshold": 0.72,
        "gray_zone": [0.65, 0.719],
        "params": {"mode": "token_jaccard"},
    },
    "text2vec": {
        "enabled": False,
        "threshold": 0.78,
        "gray_zone": [0.72, 0.779],
        "params": {"mode": "char_cosine", "n": 3},
    },
}

DEFAULT_CONFIG: Dict[str, Any] = {
    "version": 2,
    "normalize": True,
    "consensus": {
        "min_votes": 2,
        "require_levenshtein_ocr": True,
    },
    "algorithms": ALGORITHM_DEFAULTS,
}

OCR_CONFUSION_GROUPS = [
    {"c", "e"},
    {"p", "n", "r"},
    {"a", "o"},
    {"l", "i", "1"},
    {"m", "n"},
    {"u", "v"},
    {"g", "q"},
    {"h", "b"},
    {"d", "cl"},
    {"rn", "m"},
    {"f", "t"},
    {"s", "5"},
]

_OCR_CONFUSION_PAIRS: set[Tuple[str, str]] = set()
for group in OCR_CONFUSION_GROUPS:
    items = list(group)
    for idx, left in enumerate(items):
        for right in items[idx + 1 :]:
            _OCR_CONFUSION_PAIRS.add((left, right))
            _OCR_CONFUSION_PAIRS.add((right, left))


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_text(value: str) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFD", value)
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    lowered = without_marks.lower()
    cleaned = re.sub(r"[^a-z\s-]", " ", lowered)
    return " ".join(cleaned.split())


def levenshtein_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(
                min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (ca != cb))
            )
        previous = current
    return previous[-1]


def levenshtein_ratio(a: str, b: str) -> float:
    max_len = max(len(a), len(b), 1)
    return 1.0 - (levenshtein_distance(a, b) / max_len)


def levenshtein_distance_ocr(a: str, b: str, confusion_cost: float = 0.4) -> float:
    if a == b:
        return 0.0
    if not a:
        return float(len(b))
    if not b:
        return float(len(a))

    previous = [float(i) for i in range(len(b) + 1)]
    for i, ca in enumerate(a, start=1):
        current = [float(i)]
        for j, cb in enumerate(b, start=1):
            substitution_cost = (
                0.0
                if ca == cb
                else confusion_cost
                if (ca, cb) in _OCR_CONFUSION_PAIRS
                else 1.0
            )
            current.append(
                min(
                    current[j - 1] + 1.0,
                    previous[j] + 1.0,
                    previous[j - 1] + substitution_cost,
                )
            )
        previous = current
    return previous[-1]


def jaro_winkler_similarity(a: str, b: str, prefix_weight: float = 0.1) -> float:
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    max_distance = max(len(a), len(b)) // 2 - 1
    max_distance = max(0, max_distance)
    matches_a = [False] * len(a)
    matches_b = [False] * len(b)
    matches = 0
    for i, char_a in enumerate(a):
        start = max(0, i - max_distance)
        end = min(i + max_distance + 1, len(b))
        for j in range(start, end):
            if matches_b[j] or char_a != b[j]:
                continue
            matches_a[i] = True
            matches_b[j] = True
            matches += 1
            break
    if matches == 0:
        return 0.0
    transpositions = 0
    pointer = 0
    for i, matched in enumerate(matches_a):
        if not matched:
            continue
        while not matches_b[pointer]:
            pointer += 1
        if a[i] != b[pointer]:
            transpositions += 1
        pointer += 1
    transpositions //= 2
    jaro = (
        (matches / len(a)) + (matches / len(b)) + ((matches - transpositions) / matches)
    ) / 3
    prefix_len = 0
    for ca, cb in zip(a, b):
        if ca != cb or prefix_len == 4:
            break
        prefix_len += 1
    return jaro + prefix_len * prefix_weight * (1 - jaro)


def ngram_similarity(a: str, b: str, n: int = 2) -> float:
    ta = a.replace(" ", "")
    tb = b.replace(" ", "")

    def extract_ngrams(text: str, width: int) -> set[str]:
        if not text:
            return set()
        if len(text) < width:
            return {text}
        return {text[i : i + width] for i in range(len(text) - width + 1)}

    ngrams_a = extract_ngrams(ta, n)
    ngrams_b = extract_ngrams(tb, n)
    if not ngrams_a and not ngrams_b:
        return 1.0
    if not ngrams_a or not ngrams_b:
        return 0.0
    inter = len(ngrams_a & ngrams_b)
    union = len(ngrams_a | ngrams_b)
    return inter / union if union else 0.0


def soundex(text: str) -> str:
    if not text:
        return ""
    first = text[0].upper()
    mapping = {
        "B": "1",
        "F": "1",
        "P": "1",
        "V": "1",
        "C": "2",
        "G": "2",
        "J": "2",
        "K": "2",
        "Q": "2",
        "S": "2",
        "X": "2",
        "Z": "2",
        "D": "3",
        "T": "3",
        "L": "4",
        "M": "5",
        "N": "5",
        "R": "6",
    }
    result = [first]
    prev = mapping.get(first, "")
    for char in text[1:].upper():
        code = mapping.get(char, "")
        if code and code != prev:
            result.append(code)
        if len(result) == 4:
            break
        prev = code
    while len(result) < 4:
        result.append("0")
    return "".join(result)


def simple_metaphone(text: str) -> str:
    txt = text.upper()
    txt = re.sub(r"[^A-Z]", "", txt)
    if not txt:
        return ""
    txt = re.sub(r"PH", "F", txt)
    txt = re.sub(r"(KN|GN|PN|AE|WR)", "N", txt)
    txt = re.sub(r"MB$", "M", txt)
    txt = re.sub(r"[AEIOU]", "", txt[0] + txt[1:])
    txt = re.sub(r"(.)\1+", r"\1", txt)
    return txt[:8]


def token_jaccard(a: str, b: str) -> float:
    sa = {token for token in a.split(" ") if token}
    sb = {token for token in b.split(" ") if token}
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def char_cosine(a: str, b: str, n: int = 3) -> float:
    def grams(text: str) -> Counter:
        clean = text.replace(" ", "")
        if not clean:
            return Counter()
        if len(clean) < n:
            return Counter([clean])
        return Counter(clean[i : i + n] for i in range(len(clean) - n + 1))

    ga = grams(a)
    gb = grams(b)
    if not ga and not gb:
        return 1.0
    if not ga or not gb:
        return 0.0

    keys = set(ga.keys()) | set(gb.keys())
    dot = sum(float(ga.get(key, 0) * gb.get(key, 0)) for key in keys)
    mag_a = sum(float(v * v) for v in ga.values()) ** 0.5
    mag_b = sum(float(v * v) for v in gb.values()) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


class SimilarityService:
    _instance = None

    def __init__(self):
        self.config_path = Path(
            os.getenv("SIMILARITY_CONFIG_PATH", "/app/config/config_similarity.json")
        )
        self.cache_dir = Path(
            os.getenv("SIMILARITY_CACHE_DIR", "/app/cache/similarity")
        )
        self._boat_cleaning: Optional[BoatFactCleaning] = None
        self._entity_cache: Dict[str, Dict[str, Any]] = {}
        self._algorithm_functions: Dict[
            str, Callable[[str, str, Dict[str, Any]], float]
        ] = {
            "levenshtein_ocr": self._algo_levenshtein_ocr,
            "levenshtein_ratio": self._algo_levenshtein_ratio,
            "jaro_winkler": self._algo_jaro_winkler,
            "ngram_2": self._algo_ngram,
            "ngram_3": self._algo_ngram,
            "ngram_4": self._algo_ngram,
            "phonetic_dm": self._algo_phonetic_dm,
            "soundex": self._algo_soundex,
            "semantica": self._algo_semantica,
            "text2vec": self._algo_text2vec,
        }

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_config(self) -> Dict[str, Any]:
        if self.config_path.exists():
            return self._normalize_config(self._load_config_file())

        config = self._default_config()
        config["updated_at"] = _utc_now()
        try:
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_path, "w", encoding="utf-8") as file_handle:
                json.dump(config, file_handle, ensure_ascii=False, indent=2)
        except OSError:
            pass
        return config

    def save_config(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = self._normalize_config(payload)
        self._validate_config(normalized)
        normalized["updated_at"] = _utc_now()

        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as file_handle:
            json.dump(normalized, file_handle, ensure_ascii=False, indent=2)

        self._entity_cache = {}
        return normalized

    def status(self) -> Dict[str, Any]:
        config = self.get_config()
        entities_status: List[Dict[str, Any]] = []

        self.cache_dir.mkdir(parents=True, exist_ok=True)
        for entity in ENTITY_SPECS:
            memory_entry = self._entity_cache.get(entity)
            meta_path = self._entity_meta_path(entity)
            disk_entry = self._read_json_file(meta_path) if meta_path.exists() else {}
            source = memory_entry or disk_entry or {}

            entities_status.append(
                {
                    "entity": entity,
                    "has_cache": bool(source),
                    "config_signature": source.get("config_signature"),
                    "voices_signature": source.get("voices_signature"),
                    "voices_count": source.get("voices_count", 0),
                    "trained_at": source.get("trained_at"),
                    "algorithms": source.get("algorithms", []),
                    "cache_file": str(meta_path),
                }
            )

        enabled_algorithms = [
            key
            for key, algo in config["algorithms"].items()
            if bool(algo.get("enabled"))
        ]

        return {
            "config_path": str(self.config_path),
            "config_exists": self.config_path.exists(),
            "cache_dir": str(self.cache_dir),
            "enabled_algorithms": enabled_algorithms,
            "entities": entities_status,
        }

    def get_entities(self) -> List[Dict[str, str]]:
        return [
            {
                "key": key,
                "known_entity": spec["known_entity"],
                "citation_field": spec["citation_field"],
            }
            for key, spec in ENTITY_SPECS.items()
        ]

    def run_similarity(
        self,
        entity: Optional[str] = None,
        citation_field: Optional[str] = None,
        known_entity: Optional[str] = None,
        use_clean_entries: bool = True,
        publication_name: Optional[str] = None,
        user: Optional[str] = None,
        y: Optional[int] = None,
        m: Optional[int] = None,
        d: Optional[int] = None,
        edition: Optional[str] = None,
        force_refit: bool = False,
    ) -> Dict[str, Any]:
        selected_entity, selected_known_entity, selected_citation_field = (
            self._resolve_entity(
                entity=entity,
                known_entity=known_entity,
                citation_field=citation_field,
            )
        )

        config = self.get_config()
        enabled_algorithms = [
            key
            for key, algo_cfg in config["algorithms"].items()
            if bool(algo_cfg.get("enabled"))
        ]
        if not enabled_algorithms:
            raise ValueError(
                "La configuración requiere al menos un algoritmo habilitado"
            )

        boat_cleaning = self._get_boat_cleaning()
        if use_clean_entries:
            entries_df = boat_cleaning.read_ship_entries()
        else:
            entries_df = boat_cleaning.read_raw_entries(
                user=user,
                publication_name=publication_name,
                y=y,
                m=m,
                d=d,
                edition=edition,
            )

        if entries_df is None:
            raise ValueError("No se pudieron obtener entradas desde Delta Lake")

        # FIX: The data layer extraction methods (extract_ship_flags, etc.)
        # require 'temp_key' to exist in the input DataFrame.
        if "temp_key" not in entries_df.columns:
            entries_df = entries_df.withColumn("temp_key", F.lit(None).cast("string"))

        # FIX: Ensure field columns exist in raw mode if they are missing
        if not use_clean_entries:
            if (
                selected_citation_field == "ship_flag"
                and "ship_flag" not in entries_df.columns
            ):
                entries_df = entries_df.withColumn(
                    "ship_flag", F.lit(None).cast("string")
                )
            elif (
                selected_citation_field == "ship_type"
                and "ship_type" not in entries_df.columns
            ):
                entries_df = entries_df.withColumn(
                    "ship_type", F.lit(None).cast("string")
                )
            elif (
                selected_citation_field == "master_role"
                and "master_role" not in entries_df.columns
            ):
                entries_df = entries_df.withColumn(
                    "master_role", F.lit(None).cast("string")
                )
            elif (
                selected_citation_field == "ship_tons"
                and "ship_tons" not in entries_df.columns
            ):
                entries_df = entries_df.withColumn(
                    "ship_tons", F.lit(None).cast("string")
                )
            elif selected_citation_field == "port":
                for col_name in [
                    "travel_departure_port",
                    "travel_port_of_call_list",
                    "travel_arrival_port",
                ]:
                    if col_name not in entries_df.columns:
                        entries_df = entries_df.withColumn(
                            col_name, F.lit(None).cast("string")
                        )

        citations_df = self._extract_citations(
            selected_citation_field, entries_df, boat_cleaning
        )
        if citations_df is None:
            raise ValueError(
                f"No se pudo extraer citaciones para el campo '{selected_citation_field}'"
            )

        term_frequencies = self._collect_term_frequencies(citations_df)
        if not term_frequencies:
            raise ValueError("No se encontraron citaciones válidas para comparar")

        voices_df = boat_cleaning.get_known_entity_voices(selected_known_entity)
        voices, voice_to_entity = self._collect_voices(voices_df)
        if not voices:
            raise ValueError(
                f"No se encontraron voces válidas para known_entity='{selected_known_entity}'"
            )

        cache_entry = self._ensure_entity_cache(
            entity=selected_entity,
            voices=voices,
            config=config,
            force_refit=force_refit,
        )

        result_rows = self._classify_terms(
            term_frequencies=term_frequencies,
            voices=voices,
            voice_to_entity=voice_to_entity,
            config=config,
            enabled_algorithms=enabled_algorithms,
            cache_entry=cache_entry,
        )
        summary = self._build_summary(
            result_rows, term_frequencies, voices, cache_entry
        )

        return {
            "input": {
                "entity": selected_entity,
                "known_entity": selected_known_entity,
                "citation_field": selected_citation_field,
                "use_clean_entries": use_clean_entries,
                "filters": {
                    "publication_name": publication_name,
                    "user": user,
                    "y": y,
                    "m": m,
                    "d": d,
                    "edition": edition,
                },
            },
            "config": config,
            "summary": summary,
            "results": result_rows,
        }

    def _default_config(self) -> Dict[str, Any]:
        return json.loads(json.dumps(DEFAULT_CONFIG))

    def _load_config_file(self) -> Dict[str, Any]:
        with open(self.config_path, "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)

    def _normalize_config(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = self._default_config()
        if not isinstance(payload, dict):
            return normalized

        if "normalize" in payload:
            normalized["normalize"] = bool(payload.get("normalize"))

        input_consensus = payload.get("consensus", {})
        if isinstance(input_consensus, dict):
            normalized["consensus"]["min_votes"] = int(
                input_consensus.get("min_votes", normalized["consensus"]["min_votes"])
            )
            normalized["consensus"]["require_levenshtein_ocr"] = bool(
                input_consensus.get(
                    "require_levenshtein_ocr",
                    normalized["consensus"]["require_levenshtein_ocr"],
                )
            )
        else:
            normalized["consensus"]["min_votes"] = int(
                payload.get("min_votes_consensus", normalized["consensus"]["min_votes"])
            )
            normalized["consensus"]["require_levenshtein_ocr"] = bool(
                payload.get(
                    "require_levenshtein_ocr",
                    normalized["consensus"]["require_levenshtein_ocr"],
                )
            )

        for algo_key, algo_default in ALGORITHM_DEFAULTS.items():
            source = payload.get("algorithms", {}).get(algo_key, {})

            if not source and "thresholds" in payload:
                if algo_key in payload.get("thresholds", {}):
                    source = {
                        "enabled": algo_key in payload.get("algorithms", []),
                        "threshold": payload["thresholds"][algo_key],
                        "gray_zone": payload.get("gray_zones", {}).get(
                            algo_key,
                            algo_default["gray_zone"],
                        ),
                    }

            merged = json.loads(json.dumps(algo_default))
            if isinstance(source, dict):
                if "enabled" in source:
                    merged["enabled"] = bool(source["enabled"])
                if "threshold" in source:
                    merged["threshold"] = float(source["threshold"])
                if "gray_zone" in source and isinstance(
                    source["gray_zone"], (list, tuple)
                ):
                    low = float(source["gray_zone"][0])
                    high = float(source["gray_zone"][1])
                    merged["gray_zone"] = [low, high]
                if "params" in source and isinstance(source["params"], dict):
                    merged["params"].update(source["params"])
            normalized["algorithms"][algo_key] = merged

        return normalized

    def _validate_config(self, config: Dict[str, Any]) -> None:
        enabled_count = 0
        for algo_key, algo_cfg in config.get("algorithms", {}).items():
            if algo_key not in ALGORITHM_DEFAULTS:
                raise ValueError(f"Algoritmo no soportado: {algo_key}")
            threshold = float(algo_cfg.get("threshold", 0.0))
            gray_zone = algo_cfg.get("gray_zone", [0.0, 0.0])
            if threshold < 0.0 or threshold > 1.0:
                raise ValueError(f"Umbral inválido para {algo_key}: {threshold}")
            if not isinstance(gray_zone, (list, tuple)) or len(gray_zone) != 2:
                raise ValueError(f"Zona gris inválida para {algo_key}")
            floor = float(gray_zone[0])
            ceiling = float(gray_zone[1])
            if floor < 0 or ceiling > 1 or floor > ceiling:
                raise ValueError(f"Rango de zona gris inválido para {algo_key}")
            if bool(algo_cfg.get("enabled")):
                enabled_count += 1
        if enabled_count == 0:
            raise ValueError(
                "La configuración requiere al menos un algoritmo habilitado"
            )

    def _resolve_entity(
        self,
        entity: Optional[str],
        known_entity: Optional[str],
        citation_field: Optional[str],
    ) -> Tuple[str, str, str]:
        candidate = entity or known_entity or citation_field
        if not candidate:
            raise ValueError("Se requiere entity, known_entity o citation_field")

        normalized = ENTITY_ALIASES.get(candidate, candidate)
        if normalized not in ENTITY_SPECS:
            available = ", ".join(sorted(ENTITY_SPECS.keys()))
            raise ValueError(
                f"Entidad no soportada: {candidate}. Disponibles: {available}"
            )

        spec = ENTITY_SPECS[normalized]
        resolved_known = known_entity or spec["known_entity"]
        resolved_field = citation_field or spec["citation_field"]
        return normalized, resolved_known, resolved_field

    def _extract_citations(
        self, citation_field: str, entries_df, boat_cleaning: BoatFactCleaning
    ):
        if citation_field == "ship_flag":
            #retorna directamente extracted
            extracted = boat_cleaning.extract_ship_flags(entries_df)
            return extracted.select(
                F.col("id"),
                F.col("entry_id"),
                F.lit("ship_flag").alias("field_origin"),
                F.col("citation"),
            )
        if citation_field == "ship_type":
            extracted = boat_cleaning.extract_ship_types(entries_df)
            return extracted.select(
                F.col("id"),
                F.col("entry_id"),
                F.lit("ship_type").alias("field_origin"),
                F.col("citation"),
            )
        if citation_field == "master_role":
            extracted = boat_cleaning.extract_master_roles(entries_df)
            return extracted.select(
                F.col("id"),
                F.col("entry_id"),
                F.lit("master_role").alias("field_origin"),
                F.col("citation"),
            )
        if citation_field == "ship_tons":
            extracted = boat_cleaning.extract_ship_tons_units(entries_df)
            return extracted.select(
                F.col("id"),
                F.col("entry_id"),
                F.lit("ship_tons").alias("field_origin"),
                F.col("citation"),
            )
        if citation_field == "port":
            extracted = boat_cleaning.extract_ports(entries_df)
            return extracted.select(
                F.col("id"),
                F.col("entry_id"),
                F.col("field_origin"),
                F.col("citation"),
            )
        if citation_field == "comodity":
            return boat_cleaning.extract_cargo_comodities_and_units(entries_df).select(
                "id",
                "entry_id",
                F.col("cargo_commodity_citation").alias("citation"),
            )
        if citation_field == "unit":
            return boat_cleaning.extract_cargo_comodities_and_units(entries_df).select(
                "id",
                "entry_id",
                F.col("cargo_unit_citation").alias("citation"),
            )
        if citation_field == "travel_duration":
            return (
                entries_df.select(
                    F.col("entry_id").alias("id"),
                    "entry_id",
                    F.lit("travel_duration").alias("field_origin"),
                    F.datediff(
                        F.to_date("travel_arrival_date"),
                        F.to_date("travel_departure_date"),
                    )
                    .cast("string")
                    .alias("citation"),
                )
                .filter(F.col("citation").isNotNull())
                .filter(F.col("citation") != "")
            )
        raise ValueError(f"citation_field inválido: {citation_field}")

    def _collect_term_frequencies(self, citations_df) -> Dict[str, int]:
        rows = citations_df.collect()
        counter: Counter = Counter()
        for row in rows:
            value = row.asDict(True).get("citation")
            if value is None:
                continue
            text = str(value).strip()
            if text:
                counter[text] += 1
        return dict(counter)

    def _collect_voices(self, voices_df) -> Tuple[List[str], Dict[str, str]]:
        rows = voices_df.collect()
        voices: List[str] = []
        voice_to_entity: Dict[str, str] = {}
        for row in rows:
            data = row.asDict(True)
            voice_value = data.get("voice")
            if voice_value is None:
                continue
            voice = str(voice_value).strip()
            if not voice:
                continue
            entity = str(data.get("name"))
            voices.append(voice)
            voice_to_entity[voice] = entity
        return voices, voice_to_entity

    def _entity_meta_path(self, entity: str) -> Path:
        return self.cache_dir / f"{entity}_cache_meta.json"

    def _ensure_entity_cache(
        self,
        entity: str,
        voices: List[str],
        config: Dict[str, Any],
        force_refit: bool,
    ) -> Dict[str, Any]:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        enabled_algorithms = [
            key
            for key, algo_cfg in config["algorithms"].items()
            if bool(algo_cfg.get("enabled"))
        ]
        config_signature = sha256(
            json.dumps(
                {
                    "algorithms": {
                        k: config["algorithms"][k] for k in enabled_algorithms
                    }
                },
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        voices_signature = sha256(
            json.dumps(sorted(voices), ensure_ascii=False).encode("utf-8")
        ).hexdigest()

        current = self._entity_cache.get(entity)
        if (
            current
            and current.get("config_signature") == config_signature
            and current.get("voices_signature") == voices_signature
            and not force_refit
        ):
            current["cache_hit"] = True
            return current

        normalized_voices = [normalize_text(voice) for voice in voices]
        cache_entry = {
            "entity": entity,
            "voices": voices,
            "normalized_voices": normalized_voices,
            "voices_count": len(voices),
            "config_signature": config_signature,
            "voices_signature": voices_signature,
            "trained_at": _utc_now(),
            "algorithms": enabled_algorithms,
            "cache_hit": False,
        }
        self._entity_cache[entity] = cache_entry

        disk_meta = {
            "entity": entity,
            "voices_count": len(voices),
            "config_signature": config_signature,
            "voices_signature": voices_signature,
            "trained_at": cache_entry["trained_at"],
            "algorithms": enabled_algorithms,
        }
        with open(self._entity_meta_path(entity), "w", encoding="utf-8") as file_handle:
            json.dump(disk_meta, file_handle, ensure_ascii=False, indent=2)

        return cache_entry

    def _build_summary(
        self,
        result_rows: List[Dict[str, Any]],
        term_frequencies: Dict[str, int],
        voices: List[str],
        cache_entry: Dict[str, Any],
    ) -> Dict[str, Any]:
        total_occurrences = sum(term_frequencies.values())
        strict_occ = 0
        fuzzy_occ = 0
        by_classification: Counter = Counter()
        for row in result_rows:
            freq = int(row.get("frequency", 0))
            classification = row.get("classification", "RECHAZADO")
            by_classification[classification] += freq
            if classification == "CONSENSUADO":
                strict_occ += freq
            if classification in {"CONSENSUADO", "CONSENSUADO_DEBIL"}:
                fuzzy_occ += freq

        return {
            "terms_count": len(term_frequencies),
            "total_occurrences": total_occurrences,
            "voices_count": len(voices),
            "strict_match_percentage": round((strict_occ / total_occurrences * 100), 2)
            if total_occurrences
            else 0.0,
            "fuzzy_match_percentage": round((fuzzy_occ / total_occurrences * 100), 2)
            if total_occurrences
            else 0.0,
            "classification_distribution": dict(by_classification),
            "cache": {
                "entity": cache_entry.get("entity"),
                "cache_hit": cache_entry.get("cache_hit", False),
                "trained_at": cache_entry.get("trained_at"),
                "config_signature": cache_entry.get("config_signature"),
                "voices_signature": cache_entry.get("voices_signature"),
            },
        }

    def _classify_terms(
        self,
        term_frequencies: Dict[str, int],
        voices: List[str],
        voice_to_entity: Dict[str, str],
        config: Dict[str, Any],
        enabled_algorithms: List[str],
        cache_entry: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        normalize = bool(config.get("normalize", True))
        min_votes = int(config.get("consensus", {}).get("min_votes", 2))
        require_lev = bool(
            config.get("consensus", {}).get("require_levenshtein_ocr", True)
        )

        normalized_voice_to_voice = {
            normalize_text(voice): voice for voice in cache_entry.get("voices", [])
        }

        for term, frequency in sorted(
            term_frequencies.items(), key=lambda item: item[1], reverse=True
        ):
            normalized_term = normalize_text(term) if normalize else term
            if normalized_term in normalized_voice_to_voice:
                exact_voice = normalized_voice_to_voice[normalized_term]
                rows.append(
                    {
                        "term": term,
                        "frequency": frequency,
                        "entity": voice_to_entity.get(exact_voice, ""),
                        "best_voice": exact_voice,
                        "classification": "CONSENSUADO",
                        "consensus": True,
                        "no_match": False,
                        "votes_approval": len(enabled_algorithms),
                        "votes_entity": len(enabled_algorithms),
                        "algorithm_scores": {},
                    }
                )
                continue

            votes_by_entity: Dict[str, List[Tuple[str, str]]] = {}
            algorithm_scores: Dict[str, Dict[str, Any]] = {}
            votes_approval = 0
            in_gray_zone = False
            lev_voice = ""

            for algo_key in enabled_algorithms:
                algo_cfg = config["algorithms"][algo_key]
                score, best_voice = self._compute_best_score(
                    term=term,
                    voices=voices,
                    algo_key=algo_key,
                    algo_cfg=algo_cfg,
                    normalize=normalize,
                )

                threshold = float(algo_cfg["threshold"])
                gray_floor = float(algo_cfg["gray_zone"][0])
                gray_ceiling = float(algo_cfg["gray_zone"][1])
                approved = score >= threshold
                in_gray = gray_floor <= score <= gray_ceiling
                algorithm_scores[algo_key] = {
                    "score": round(score, 4),
                    "voice": best_voice,
                    "approved": approved,
                    "in_gray_zone": in_gray,
                    "threshold": threshold,
                }

                if approved:
                    votes_approval += 1
                    entity = voice_to_entity.get(best_voice, best_voice)
                    votes_by_entity.setdefault(entity, []).append(
                        (algo_key, best_voice)
                    )
                    if algo_key == "levenshtein_ocr":
                        lev_voice = best_voice
                elif in_gray:
                    in_gray_zone = True

            consensus_entity = ""
            consensus_voice = ""
            votes_entity = 0
            lev_in_consensus = False

            if votes_by_entity:
                consensus_entity = max(
                    votes_by_entity, key=lambda key: len(votes_by_entity[key])
                )
                votes_entity = len(votes_by_entity[consensus_entity])
                consensus_algorithms = [
                    algo for algo, _ in votes_by_entity[consensus_entity]
                ]
                lev_in_consensus = "levenshtein_ocr" in consensus_algorithms
                if lev_in_consensus and lev_voice:
                    consensus_voice = lev_voice
                else:
                    consensus_voice = votes_by_entity[consensus_entity][0][1]

            if votes_entity >= min_votes and (not require_lev or lev_in_consensus):
                classification = "CONSENSUADO"
            elif votes_approval >= min_votes:
                classification = "CONSENSUADO_DEBIL"
            elif votes_approval == 1:
                classification = "SOLO_1_VOTO"
            elif in_gray_zone:
                classification = "ZONA_GRIS"
            else:
                classification = "RECHAZADO"

            rows.append(
                {
                    "term": term,
                    "frequency": frequency,
                    "entity": consensus_entity,
                    "best_voice": consensus_voice,
                    "classification": classification,
                    "consensus": classification in {"CONSENSUADO", "CONSENSUADO_DEBIL"},
                    "no_match": classification == "RECHAZADO",
                    "votes_approval": votes_approval,
                    "votes_entity": votes_entity,
                    "algorithm_scores": algorithm_scores,
                }
            )
        return rows

    def _compute_best_score(
        self,
        term: str,
        voices: List[str],
        algo_key: str,
        algo_cfg: Dict[str, Any],
        normalize: bool,
    ) -> Tuple[float, str]:
        term_value = normalize_text(term) if normalize else term
        best_score = 0.0
        best_voice = ""
        func = self._algorithm_functions[algo_key]

        for voice in voices:
            voice_value = normalize_text(voice) if normalize else voice
            score = func(term_value, voice_value, algo_cfg.get("params", {}))
            if score > best_score:
                best_score = score
                best_voice = voice
        return best_score, best_voice

    def _algo_levenshtein_ocr(
        self, left: str, right: str, params: Dict[str, Any]
    ) -> float:
        if not left and not right:
            return 1.0
        max_len = max(len(left), len(right), 1)
        confusion_cost = float(params.get("confusion_cost", 0.4))
        return 1.0 - (
            levenshtein_distance_ocr(left, right, confusion_cost=confusion_cost)
            / max_len
        )

    def _algo_levenshtein_ratio(
        self, left: str, right: str, params: Dict[str, Any]
    ) -> float:
        _ = params
        return levenshtein_ratio(left, right)

    def _algo_jaro_winkler(
        self, left: str, right: str, params: Dict[str, Any]
    ) -> float:
        prefix_weight = float(params.get("prefix_weight", 0.1))
        return jaro_winkler_similarity(left, right, prefix_weight=prefix_weight)

    def _algo_ngram(self, left: str, right: str, params: Dict[str, Any]) -> float:
        n = int(params.get("n", 2))
        return ngram_similarity(left, right, n=n)

    def _algo_phonetic_dm(self, left: str, right: str, params: Dict[str, Any]) -> float:
        _ = params
        code_left = simple_metaphone(left)
        code_right = simple_metaphone(right)
        if not code_left and not code_right:
            return 1.0
        if code_left == code_right:
            return 1.0
        return levenshtein_ratio(code_left, code_right)

    def _algo_soundex(self, left: str, right: str, params: Dict[str, Any]) -> float:
        _ = params
        return 1.0 if soundex(left) == soundex(right) else 0.0

    def _algo_semantica(self, left: str, right: str, params: Dict[str, Any]) -> float:
        mode = params.get("mode", "token_jaccard")
        if mode == "char_cosine":
            return char_cosine(left, right, n=int(params.get("n", 3)))
        return token_jaccard(left, right)

    def _algo_text2vec(self, left: str, right: str, params: Dict[str, Any]) -> float:
        n = int(params.get("n", 3))
        return char_cosine(left, right, n=n)

    def _read_json_file(self, file_path: Path) -> Dict[str, Any]:
        if not file_path.exists():
            return {}
        with open(file_path, "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)

    def _get_boat_cleaning(self) -> BoatFactCleaning:
        if self._boat_cleaning is not None:
            return self._boat_cleaning

        data_layer_service = DataLayerService.get_instance()
        config = data_layer_service.config
        if not config:
            raise ValueError("No hay configuración de data layer cargada")

        builder = PortadaBuilder(config)
        boat_cleaning = BoatFactCleaning(builder=builder)
        boat_cleaning.start_session()
        self._boat_cleaning = boat_cleaning
        return self._boat_cleaning

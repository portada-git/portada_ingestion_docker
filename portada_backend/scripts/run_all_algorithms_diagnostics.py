"""
Diagnóstico de ejecución de TODOS los algoritmos sobre TODAS las entidades.

Estrategia:
1) Carga términos desde /app/similarity_results/similarity_results.json (última corrida exitosa de extracción)
2) Prueba corrida "all enabled" por entidad
3) Si falla, prueba algoritmo por algoritmo para aislar causa
4) Guarda reporte detallado en /app/similarity_results/all_algorithms_diagnostics.json
"""

import json
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
import os

from portada_s_index import SimilarityService, VoiceList


CONFIG_PATH = Path("/app/config/config_similarity.json")
KNOWN_ENTITIES_PATH = Path("/app/known_entities.json")
INPUT_RESULTS_PATH = Path("/app/similarity_results/similarity_results.json")
OUTPUT_PATH = Path("/app/similarity_results/all_algorithms_diagnostics.json")
MAX_TERMS_PER_ENTITY = int(os.getenv("DIAG_MAX_TERMS_PER_ENTITY", "120"))


def load_json(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_terms_from_results(similarity_results: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    entities = similarity_results.get("entities", {})
    terms_by_entity: Dict[str, List[Dict[str, Any]]] = {}
    for entity, data in entities.items():
        rows = data.get("results", []) or []
        terms = [
            {"term": r.get("term", ""), "frequency": int(r.get("frequency", 1))}
            for r in rows
            if r.get("term")
        ]
        # Priorizar términos más frecuentes para diagnóstico rápido y comparable
        terms.sort(key=lambda x: x["frequency"], reverse=True)
        terms_by_entity[entity] = terms[:MAX_TERMS_PER_ENTITY]
    return terms_by_entity


def config_enable_only(base_cfg: Dict[str, Any], algo_name: str) -> Dict[str, Any]:
    cfg = json.loads(json.dumps(base_cfg))
    for name in cfg.get("algorithms", {}).keys():
        cfg["algorithms"][name]["enabled"] = name == algo_name
    return cfg


def config_enable_all(base_cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg = json.loads(json.dumps(base_cfg))
    for name in cfg.get("algorithms", {}).keys():
        cfg["algorithms"][name]["enabled"] = True
    return cfg


def main() -> None:
    base_cfg = load_json(CONFIG_PATH)
    known_entities = load_json(KNOWN_ENTITIES_PATH)
    similarity_results = load_json(INPUT_RESULTS_PATH)
    terms_by_entity = build_terms_from_results(similarity_results)

    algo_names = list(base_cfg.get("algorithms", {}).keys())
    report: Dict[str, Any] = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "max_terms_per_entity": MAX_TERMS_PER_ENTITY,
        "input_results_path": str(INPUT_RESULTS_PATH),
        "algorithms_declared": algo_names,
        "entities": {},
        "summary": {
            "all_enabled_ok_entities": 0,
            "all_enabled_failed_entities": 0,
            "single_algo_failures": 0,
        },
    }

    cfg_all = config_enable_all(base_cfg)
    service_all = SimilarityService.from_dict(cfg_all)

    for entity, terms in terms_by_entity.items():
        entity_known = known_entities.get(entity, {})
        entity_report: Dict[str, Any] = {
            "terms_count": len(terms),
            "known_entities_count": len(entity_known) if isinstance(entity_known, dict) else 0,
            "all_enabled": {"ok": False, "error": None},
            "per_algorithm": {},
        }

        if not terms or not isinstance(entity_known, dict) or not entity_known:
            entity_report["all_enabled"]["error"] = "Sin términos o sin entidades conocidas"
            report["entities"][entity] = entity_report
            report["summary"]["all_enabled_failed_entities"] += 1
            continue

        voice_list = VoiceList.from_dict(entity_type=entity, data=entity_known)

        # 1) Intento all-enabled
        try:
            _ = service_all.evaluate(terms, voice_list)
            entity_report["all_enabled"]["ok"] = True
            report["summary"]["all_enabled_ok_entities"] += 1
        except Exception as e:
            entity_report["all_enabled"]["ok"] = False
            entity_report["all_enabled"]["error"] = {
                "message": str(e),
                "traceback": traceback.format_exc(limit=5),
            }
            report["summary"]["all_enabled_failed_entities"] += 1

        # 2) Diagnóstico por algoritmo (siempre, para trazabilidad completa)
        for algo in algo_names:
            cfg_one = config_enable_only(base_cfg, algo)
            try:
                service_one = SimilarityService.from_dict(cfg_one)
                res = service_one.evaluate(terms, voice_list)
                entity_report["per_algorithm"][algo] = {
                    "ok": True,
                    "results_count": len(res),
                }
            except Exception as e:
                report["summary"]["single_algo_failures"] += 1
                entity_report["per_algorithm"][algo] = {
                    "ok": False,
                    "error": {
                        "message": str(e),
                        "traceback": traceback.format_exc(limit=5),
                    },
                }

        report["entities"][entity] = entity_report
        print(f"[{entity}] all_enabled={entity_report['all_enabled']['ok']} terms={len(terms)}", flush=True)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("\n=== DIAGNOSTICS DONE ===")
    print(f"Output: {OUTPUT_PATH}")
    print(f"all_enabled_ok_entities: {report['summary']['all_enabled_ok_entities']}")
    print(f"all_enabled_failed_entities: {report['summary']['all_enabled_failed_entities']}")
    print(f"single_algo_failures: {report['summary']['single_algo_failures']}")


if __name__ == "__main__":
    main()

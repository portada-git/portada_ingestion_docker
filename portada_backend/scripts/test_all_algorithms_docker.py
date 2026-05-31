import json
from pathlib import Path
from collections import defaultdict
from portada_s_index import SimilarityService, VoiceList

BASE = Path('/app')
CONFIG_PATH = BASE / 'config' / 'config_similarity.json'
KNOWN_PATH = BASE / 'known_entities.json'
OUT_PATH = Path('/tmp/all_algorithms_smoke_report.json')


def enable_all_algorithms(cfg: dict) -> dict:
    cfg = json.loads(json.dumps(cfg))
    for name, spec in cfg.get('algorithms', {}).items():
        spec['enabled'] = True
    return cfg


def mutate(term: str) -> str:
    t = term.lower().strip()
    t = t.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
    if len(t) > 4:
        return t[:-1]
    return t


def main():
    cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    cfg_all = enable_all_algorithms(cfg)

    service = SimilarityService.from_dict(cfg_all)

    known = json.loads(KNOWN_PATH.read_text(encoding='utf-8'))

    report = {
        'active_algorithms': getattr(service, 'active_algorithms', []),
        'entities': {},
        'errors': []
    }

    for entity, data in known.items():
        if not isinstance(data, dict) or not data:
            continue

        voice_list = VoiceList.from_dict(entity_type=entity, data=data)

        # build tiny synthetic set from first voices
        terms = []
        for canonical, voices in list(data.items())[:5]:
            if not isinstance(voices, list):
                continue
            for v in voices[:2]:
                vv = str(v).strip()
                if not vv:
                    continue
                terms.append({'term': mutate(vv), 'frequency': 1})

        if not terms:
            continue

        try:
            results = service.evaluate(terms, voice_list)
        except Exception as e:
            report['errors'].append({'entity': entity, 'error': str(e)})
            continue

        seen = defaultdict(int)
        for r in results:
            for score in r.get('algorithm_scores', []):
                name = score.get('algorithm')
                if name:
                    seen[name] += 1

        report['entities'][entity] = {
            'input_terms': len(terms),
            'results': len(results),
            'algorithms_seen_in_scores': sorted(seen.keys()),
            'scores_count_by_algorithm': dict(sorted(seen.items()))
        }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    print('=== ALL ALGORITHMS TEST REPORT ===')
    print(f'active_algorithms: {report["active_algorithms"]}')
    print(f'entities_tested: {len(report["entities"])}')
    print(f'errors: {len(report["errors"])}')
    print(f'report: {OUT_PATH}')

    if report['errors']:
        for err in report['errors'][:10]:
            print(f"ERROR {err['entity']}: {err['error']}")


if __name__ == '__main__':
    main()

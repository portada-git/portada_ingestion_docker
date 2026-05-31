import json
from pathlib import Path
from portada_s_index import SimilarityService, VoiceList

cfg=json.load(open('/app/config/config_similarity.json',encoding='utf-8'))
for a in cfg['algorithms'].values():
    a['enabled']=True
service=SimilarityService.from_dict(cfg)
known=json.load(open('/app/known_entities.json',encoding='utf-8'))

report={'active_algorithms':service.active_algorithms,'entities':{},'errors':[]}
for entity,data in known.items():
    if not isinstance(data,dict) or not data:
        continue
    try:
        vl=VoiceList.from_dict(entity_type=entity,data=data)
        base=list(data.keys())[0]
        term=str(base)+'x'  # avoid exact match shortcut
        res=service.evaluate([{'term':term,'frequency':1}],vl)[0]
        scores=res.get('algorithm_scores',[])
        report['entities'][entity]={
            'term':term,
            'classification':res.get('classification'),
            'algorithms_scored':[s.get('algorithm') for s in scores],
            'scores_count':len(scores)
        }
    except Exception as e:
        report['errors'].append({'entity':entity,'error':str(e)})

out=Path('/tmp/all_algorithms_quick_report.json')
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('active',len(report['active_algorithms']))
print('entities',len(report['entities']))
print('errors',len(report['errors']))
print('out',out)

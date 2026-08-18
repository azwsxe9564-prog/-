import json, re
from pathlib import Path

BANK=Path('data/bank.json')
CORE=Path('data/core_keywords.json')
OUT=Path('data/core_keywords_ranked.json')

def norm(s):
    return re.sub(r'\s+', '', str(s or '')).lower()

bank=json.loads(BANK.read_text(encoding='utf-8')) if BANK.exists() else {}
questions=bank.get('questions', [])
core=json.loads(CORE.read_text(encoding='utf-8')).get('keywords', []) if CORE.exists() else []
rows=[]
for k in core:
    term=k['term']
    aliases=k.get('aliases', [])
    needles=[norm(term)]+[norm(a) for a in aliases]
    hits=[]; years=set(); subjects=set()
    for q in questions:
        text=norm((q.get('question') or '')+' '+(q.get('explanation') or ''))
        if any(n and n in text for n in needles):
            hits.append(q.get('id'))
            years.add(str(q.get('year','')))
            subjects.add(q.get('subject',''))
    rows.append({**k,'frequency':len(hits),'years':sorted(x for x in years if x),'subjects':sorted(x for x in subjects if x),'question_ids':hits})
rows.sort(key=lambda x:(-x['frequency'],x.get('priority',9),x['term']))
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps({'source':'data/bank.json','question_count':len(questions),'status':'computed','keywords':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'questions={len(questions)} keywords={len(rows)}')
print('top10:', [(x['term'],x['frequency']) for x in rows[:10]])

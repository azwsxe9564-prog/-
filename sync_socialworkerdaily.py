import json
from pathlib import Path
from build_bank_v4 import BASE, YEARS, SUBJECTS, fetch, html_text, parse_questions, social_url

DATA = Path(__file__).parent / 'data' / 'bank.json'


def main():
    if not DATA.exists():
        raise SystemExit('data/bank.json 不存在，無法進行安全同步。')
    data = json.loads(DATA.read_text(encoding='utf-8'))
    questions = data.get('questions', [])
    by_id = {q.get('id'): q for q in questions}
    changes = 0
    checked = 0
    failures = []

    for year in YEARS:
        for session in ('1', '2'):
            # 115-2 以考選部官方試題為主，不覆蓋成社工日常來源。
            if year == '115' and session == '2':
                continue
            for subject, (slug, _code) in SUBJECTS.items():
                prefix = f'{year}-{session}-{subject}-'
                existing = sorted((q for q in questions if str(q.get('id','')).startswith(prefix)), key=lambda x: int(x.get('number', 0)))
                if not existing:
                    failures.append({'year': year, 'session': session, 'subject': subject, 'stage': 'existing-bank', 'error': '找不到既有題目，為避免誤新增，略過同步'})
                    continue
                expected = len(existing)
                url = social_url(year, session, slug)
                checked += 1
                try:
                    parsed = parse_questions(html_text(fetch(url)), expected)
                except Exception as exc:
                    failures.append({'year': year, 'session': session, 'subject': subject, 'stage': 'fetch-parse', 'url': url, 'error': str(exc)})
                    continue
                if len(parsed) != expected or [q['number'] for q in parsed] != list(range(1, expected + 1)):
                    failures.append({'year': year, 'session': session, 'subject': subject, 'stage': 'question-count', 'expected': expected, 'parsed': len(parsed), 'url': url})
                    continue
                for q in parsed:
                    qid = f'{year}-{session}-{subject}-{q["number"]}'
                    old = by_id.get(qid)
                    if old is None:
                        failures.append({'year': year, 'session': session, 'subject': subject, 'number': q['number'], 'stage': 'missing-id', 'url': url})
                        continue
                    # 只同步社工日常維護的內容；答案、送分題與複數答案判定仍以官方資料為準。
                    for key, value in {
                        'question': q.get('question', ''),
                        'choices': q.get('choices', []),
                        'explanation': q.get('explanation', ''),
                        'source': url,
                        'source_name': '社工日常 socialworkerdaily',
                        'explanation_source': '社工日常解析',
                    }.items():
                        if old.get(key) != value:
                            old[key] = value
                            changes += 1

    if failures:
        # 安全策略：任何一份來源異常都不提交半套同步結果。
        print(json.dumps({'checked_pages': checked, 'changes': changes, 'failures': failures}, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    data.setdefault('meta', {})['socialworkerdaily_sync'] = 'verified_source_sync'
    data['meta']['socialworkerdaily_sync_checked_pages'] = checked
    data['meta']['socialworkerdaily_sync_note'] = '每5天檢查；只同步社工日常題目、選項與解析；答案與官方更正仍以考選部為準。'
    DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'checked_pages': checked, 'changes': changes, 'status': 'ok'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

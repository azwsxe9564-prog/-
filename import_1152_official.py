import io
import json
import re
import subprocess
import tempfile
from pathlib import Path

import build_bank_v4 as b
from pypdf import PdfReader

YEAR='115'
SESSION='2'
EXAM_CODE='115100'
MOEX='https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx'
SUBJECTS={
    '社會工作':'1103',
    '社會工作直接服務':'2103',
    '社會政策與社會立法':'3103',
    '人類行為與社會環境':'4103',
    '社會工作研究方法':'5103',
}


def fetch_pdf(url):
    last=''
    for attempt in range(1,7):
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            path=f.name
        try:
            cmd=[
                'curl','-L','--fail','--silent','--show-error','--http1.1',
                '--retry','0','--connect-timeout','30','--max-time','180',
                '-H','User-Agent: Mozilla/5.0 social-worker-exam-builder/11.0',
                '-H','Accept: application/pdf,*/*',
                '-H','Accept-Encoding: identity',
                '-H','Connection: close',
                '-H','Referer: https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx?e=115100&y=2026',
                '-o',path,url,
            ]
            p=subprocess.run(cmd,text=True,capture_output=True)
            if p.returncode==0:
                data=Path(path).read_bytes()
                if data.startswith(b'%PDF') and len(data)>1000:
                    return data
                last=f'invalid PDF response: {len(data)} bytes'
            else:
                last=(p.stderr or '').strip() or f'curl exit {p.returncode}'
        finally:
            try: Path(path).unlink()
            except FileNotFoundError: pass
        if attempt<6:
            import time; time.sleep(min(2**(attempt-1),10))
    raise RuntimeError(f'MOEX PDF download failed after 6 attempts: {last}')


def pdf_text(url):
    raw=fetch_pdf(url)
    try:
        return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(raw)).pages)
    except Exception:
        raw=fetch_pdf(url)
        return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(raw)).pages)


def answer_data(subject_code):
    url=f'{MOEX}?c=103&code={EXAM_CODE}&q=1&s={subject_code}&t=S'
    text=pdf_text(url).translate(str.maketrans('ＡＢＣＤ','ABCD'))
    expected, accepted=b.parse_official_answers(text,subject_code)
    return expected,accepted,url


def question_data(subject_code, expected):
    url=f'{MOEX}?c=103&code={EXAM_CODE}&q=1&s={subject_code}&t=Q'
    text=pdf_text(url)
    qs=b.parse_questions(text,expected,official_pdf=True)
    if len(qs)!=expected or [q['number'] for q in qs]!=list(range(1,expected+1)):
        raise RuntimeError(f'115-2 {subject_code} 題數解析失敗：MOEX公布 {expected} 題，實得 {len(qs)} 題，題號={ [q["number"] for q in qs] }')
    return qs,url


def main():
    bank_path=Path('data/bank.json')
    data=json.loads(bank_path.read_text(encoding='utf-8'))
    old=data.get('questions',[])
    old=[q for q in old if not (q.get('year')==YEAR and q.get('session')==SESSION)]
    new=[]
    report=[]
    for subject,code in SUBJECTS.items():
        expected,accepted,answer_url=answer_data(code)
        qs,question_url=question_data(code,expected)
        for q in qs:
            vals=accepted[q['number']]
            new.append({
                'id':f'{YEAR}-{SESSION}-{subject}-{q["number"]}',
                'year':YEAR,'session':SESSION,'subject':subject,'number':q['number'],
                'question':q['question'],'choices':q['choices'],
                'answer':vals[0],'accepted_answers':vals,
                'explanation':'考選部官方未提供逐題解析；答案以考選部測驗式試題標準答案為準。',
                'source':question_url,'answer_source':answer_url,
                'source_name':'考選部官方115-2考畢試題',
                'answer_authority':'考選部測驗式試題標準答案',
                'answer_verified':True,
                'explanation_source':'考選部官方試題（未提供逐題解析）',
                'corrected':len(vals)!=1,
                'is_full_credit':vals==[0,1,2,3],
                'answer_type':'送分題' if vals==[0,1,2,3] else ('複數答案' if len(vals)>1 else '單一答案'),
            })
        report.append({'subject':subject,'code':code,'question_count':expected})
    merged=sorted(old+new,key=lambda x:(x.get('year',''),x.get('session',''),x.get('subject',''),x.get('number',0)))
    ids=[q['id'] for q in merged]
    if len(ids)!=len(set(ids)): raise RuntimeError('題目 ID 重複')
    meta=data.setdefault('meta',{})
    meta['official_115_2_verified']=True
    meta['official_115_2_report']=report
    meta['official_question_count_authority']='考選部各科公布題數'
    meta['answer_authority']='考選部測驗式試題標準答案'
    meta['papers_ok']=len({(q.get('year'),q.get('session'),q.get('subject')) for q in merged})
    meta['items']=len(merged)
    meta['papers_failed']=0
    data['questions']=merged
    bank_path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'115-2':report,'total_questions':len(merged),'papers':meta['papers_ok']},ensure_ascii=False,indent=2))

if __name__=='__main__': main()

import html
import io
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs

import build_bank_v4 as b
from pypdf import PdfReader
from yamol_fallback import get_subject_text

YEAR='115'
SESSION='2'
EXAM_CODE='115100'
EXAM_PAGE=f'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx?e={EXAM_CODE}&y=2026'
MOEX='https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx'
SUBJECTS={
    '社會工作':'1103',
    '社會工作直接服務':'2103',
    '社會政策與社會立法':'3103',
    '人類行為與社會環境':'4103',
    '社會工作研究方法':'5103',
}


def curl(url, output, cookie_jar=None):
    cmd=['curl','-L','--fail','--silent','--show-error','--http1.1',
         '--connect-timeout','30','--max-time','180',
         '-H','User-Agent: Mozilla/5.0 social-worker-exam-builder/13.0',
         '-H','Accept: text/html,application/xhtml+xml,application/pdf,*/*',
         '-H','Accept-Encoding: identity','-H','Connection: close',
         '-H',f'Referer: {EXAM_PAGE}','-o',str(output)]
    if cookie_jar: cmd += ['-b',str(cookie_jar),'-c',str(cookie_jar)]
    cmd += [url]
    return subprocess.run(cmd,text=True,capture_output=True)


def discover_official_links():
    with tempfile.TemporaryDirectory() as td:
        td=Path(td); page=td/'exam.html'; cookies=td/'cookies.txt'
        p=curl(EXAM_PAGE,page,cookies)
        if p.returncode!=0: raise RuntimeError(f'MOEX exam page failed: {(p.stderr or "").strip()}')
        raw=page.read_text(encoding='utf-8',errors='ignore')
        links=[]
        for m in re.finditer(r'''href\s*=\s*["']([^"']*wHandExamQandA_File\.ashx[^"']*)["']''',raw,re.I):
            href=html.unescape(m.group(1)).replace('&amp;','&')
            links.append(urljoin(EXAM_PAGE,href))
        result={}
        for subject,code in SUBJECTS.items():
            for typ in ('Q','S'):
                candidates=[]
                for u in links:
                    q=parse_qs(urlparse(u).query)
                    if q.get('code',[''])[0]==EXAM_CODE and q.get('s',[''])[0]==code and q.get('t',[''])[0]==typ:
                        candidates.append(u)
                if candidates: result[(subject,typ)]=candidates[0]
        return result


def fetch_pdf(url):
    last=''
    for attempt in range(1,7):
        with tempfile.TemporaryDirectory() as td:
            td=Path(td); path=td/'file.pdf'; cookies=td/'cookies.txt'; page=td/'exam.html'
            p=curl(EXAM_PAGE,page,cookies)
            if p.returncode==0:
                p=curl(url,path,cookies)
                if p.returncode==0:
                    data=path.read_bytes()
                    if data.startswith(b'%PDF') and len(data)>1000: return data
                    head=data[:120].decode('utf-8',errors='replace').replace('\n',' ')
                    last=f'invalid PDF response: {len(data)} bytes; head={head!r}'
                else: last=(p.stderr or '').strip() or f'PDF curl exit {p.returncode}'
            else: last=(p.stderr or '').strip() or f'exam page curl exit {p.returncode}'
        if attempt<6: time.sleep(min(2**(attempt-1),10))
    raise RuntimeError(f'MOEX PDF download failed after 6 attempts: {last}')


def pdf_text(url):
    raw=fetch_pdf(url)
    try: return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(raw)).pages)
    except Exception:
        raw=fetch_pdf(url)
        return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(raw)).pages)


def answer_data(subject_code, answer_url):
    text=pdf_text(answer_url).translate(str.maketrans('ＡＢＣＤ','ABCD'))
    expected,accepted=b.parse_official_answers(text,subject_code)
    return expected,accepted


def question_data(subject, expected, question_url=None):
    # 官方試題 PDF 優先；若 MOEX 沒有可用連結或 PDF 暫時失敗，改用阿摩公開 115-2 試卷。
    # 無論題目來源為何，答案仍只能由考選部官方標準答案驗證。
    official_error=None
    if question_url:
        try:
            qs=b.parse_questions(pdf_text(question_url),expected,official_pdf=True)
            if len(qs)==expected and [q['number'] for q in qs]==list(range(1,expected+1)):
                return qs,question_url,'考選部官方考畢試題'
            official_error=f'官方 PDF 題數解析失敗：實得 {len(qs)} 題'
        except Exception as e:
            official_error=str(e)
    try:
        yamol_url,yamol_text=get_subject_text(subject)
        qs=b.parse_questions(yamol_text,expected,official_pdf=False)
        if len(qs)!=expected or [q['number'] for q in qs]!=list(range(1,expected+1)):
            raise RuntimeError(f'阿摩實得 {len(qs)} 題，預期 {expected} 題')
        return qs,yamol_url,'阿摩線上測驗 115-2 公開試卷'
    except Exception as yamol_error:
        raise RuntimeError(f'官方試題來源失敗：{official_error or "無官方 PDF 連結"}；阿摩備援失敗：{yamol_error}')


def main():
    links=discover_official_links()
    bank_path=Path('data/bank.json')
    data=json.loads(bank_path.read_text(encoding='utf-8'))
    old=[q for q in data.get('questions',[]) if not (q.get('year')==YEAR and q.get('session')==SESSION)]
    new=[]; report=[]
    for subject,code in SUBJECTS.items():
        answer_url=links.get((subject,'S'))
        if not answer_url: raise RuntimeError(f'MOEX 找不到 {subject} 官方答案連結；115-2 不允許用第三方答案冒充官方驗證')
        expected,accepted=answer_data(code,answer_url)
        question_url=links.get((subject,'Q'))
        qs,used_question_url,question_source=question_data(subject,expected,question_url)
        for q in qs:
            vals=accepted[q['number']]
            new.append({
                'id':f'{YEAR}-{SESSION}-{subject}-{q["number"]}',
                'year':YEAR,'session':SESSION,'subject':subject,'number':q['number'],
                'question':q['question'],'choices':q['choices'],
                'answer':vals[0],'accepted_answers':vals,
                'explanation':'考選部官方未提供逐題解析；答案以考選部測驗式試題標準答案為準。',
                'source':used_question_url,'answer_source':answer_url,
                'source_name':question_source,
                'answer_authority':'考選部測驗式試題標準答案',
                'answer_verified':True,
                'explanation_source':'考選部官方試題（未提供逐題解析）',
                'corrected':len(vals)!=1,
                'is_full_credit':vals==[0,1,2,3],
                'answer_type':'送分題' if vals==[0,1,2,3] else ('複數答案' if len(vals)>1 else '單一答案'),
            })
        report.append({'subject':subject,'code':code,'question_count':expected,'question_source':question_source,'question_url':used_question_url,'answer_url':answer_url})
    merged=sorted(old+new,key=lambda x:(x.get('year',''),x.get('session',''),x.get('subject',''),x.get('number',0)))
    ids=[q['id'] for q in merged]
    if len(ids)!=len(set(ids)): raise RuntimeError('題目 ID 重複')
    meta=data.setdefault('meta',{})
    meta['official_115_2_verified']=True
    meta['official_115_2_report']=report
    meta['official_question_count_authority']='考選部各科公布題數'
    meta['answer_authority']='考選部測驗式試題標準答案'
    meta['papers_ok']=len({(q.get('year'),q.get('session'),q.get('subject')) for q in merged})
    meta['items']=len(merged); meta['papers_failed']=0
    data['questions']=merged
    bank_path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'115-2':report,'total_questions':len(merged),'papers':meta['papers_ok']},ensure_ascii=False,indent=2))

if __name__=='__main__': main()

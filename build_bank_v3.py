import io
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path

BASE = 'https://socialworkerdaily.com/'
MOEX = 'https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx'
YEARS = [str(y) for y in range(110, 116)]
SUBJECTS = {
    '社會工作': ('socialwork', '1103'),
    '社會工作直接服務': ('socialwork-service', '2103'),
    '社會政策與社會立法': ('socialwork-policy', '3103'),
    '人類行為與社會環境': ('socialwork-human-behavior-and-social-environment', '4103'),
    '社會工作研究方法': ('socialwork-research-methods', '5103'),
}
DATA = Path(__file__).parent / 'data'
DATA.mkdir(exist_ok=True)

class Extractor(HTMLParser):
    BLOCK = {'p','div','li','h1','h2','h3','h4','h5','h6','br','blockquote','pre','section','article'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        tag=tag.lower()
        if tag in {'script','style','noscript'}: self.skip += 1
        elif tag in self.BLOCK and not self.skip: self.parts.append('\n')
    def handle_endtag(self, tag):
        tag=tag.lower()
        if tag in {'script','style','noscript'}: self.skip=max(0,self.skip-1)
        elif tag in self.BLOCK and not self.skip: self.parts.append('\n')
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)
    def text(self):
        s=''.join(self.parts).replace('\xa0',' ')
        s=re.sub(r'[ \t]+',' ',s)
        s=re.sub(r'\n[ \t]+','\n',s)
        s=re.sub(r'\n{3,}','\n\n',s)
        return s.strip()

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 social-worker-exam-builder/7.0','Accept':'text/html,application/xhtml+xml,application/pdf'})
    with urllib.request.urlopen(req,timeout=60) as r: return r.read()

def ExtractorText(raw):
    p=Extractor(); p.feed(raw.decode('utf-8',errors='ignore')); return p.text()

def fetch_pdf_text(url):
    from pypdf import PdfReader
    reader=PdfReader(io.BytesIO(fetch(url)))
    return '\n'.join((page.extract_text() or '') for page in reader.pages)

def clean(s): return re.sub(r'[ \t\r\n]+',' ',s).strip()
def norm_answer(s): return s.translate(str.maketrans('ＡＢＣＤ','ABCD')).strip().upper()

def parse_page(text):
    starts=list(re.finditer(r'(?m)^\s*(?:#{1,6}\s*)?(\d{1,3})\s*[\.、．)）]\s*',text))
    out=[]
    for i,m in enumerate(starts):
        n=int(m.group(1))
        if not 1<=n<=40: continue
        end=starts[i+1].start() if i+1<len(starts) else len(text)
        block=text[m.end():end]
        marks=list(re.finditer(r'(?m)^\s*[（(]?\s*([ABCDＡＢＣＤ])\s*[)）.．、:：]\s*',block))
        if len(marks)<4: continue
        marks=marks[:4]
        if [norm_answer(x.group(1)) for x in marks] != list('ABCD'): continue
        question=clean(block[:marks[0].start()])
        choices=[]
        for j,mark in enumerate(marks):
            e=marks[j+1].start() if j<3 else len(block)
            choice=block[mark.end():e]
            if j==3: choice=re.split(r'\n\s*(?:解析|看更多)\s*[:：]?',choice,maxsplit=1)[0]
            choices.append(clean(choice))
        if not question or any(not x for x in choices): continue
        am=re.search(r'解析\s*[:：]\s*[（(]?\s*([ABCDＡＢＣＤ])\s*[)）]?\s*',block,re.I)
        exp=''
        if am:
            exp=clean(re.split(r'\n\s*看更多\s*[:：]?',block[am.end():],maxsplit=1)[0])
        out.append({'number':n,'question':question,'choices':choices,'source_answer':norm_answer(am.group(1)) if am else None,'explanation':exp})
    unique={x['number']:x for x in out}
    return [unique[n] for n in sorted(unique)]

def parse_official_subject_questions(text, subject_code):
    hits=list(re.finditer(r'(?m)^\s*'+re.escape(subject_code)+r'\s*$',text))
    if not hits: raise ValueError(f'找不到考選部科目代碼 {subject_code} 的試題區段')
    start=hits[0].start()
    nxt=re.search(r'(?m)^\s*\d{4}\s*$',text[hits[0].end():])
    end=hits[0].end()+nxt.start() if nxt else len(text)
    block=text[start:end]
    qs=parse_page(block)
    if len(qs)!=40 or [q['number'] for q in qs]!=list(range(1,41)):
        raise ValueError(f'官方試題 {subject_code} 題目結構異常：解析到{len(qs)}題')
    return qs

def parse_official_answers(text, subject_code):
    hits=list(re.finditer(r'(?m)^\s*'+re.escape(subject_code)+r'\s*$',text))
    if not hits: raise ValueError(f'找不到考選部科目代碼 {subject_code}')
    start=hits[0].start()
    nxt=re.search(r'(?m)^\s*\d{4}\s*$',text[hits[0].end():])
    end=hits[0].end()+nxt.start() if nxt else len(text)
    block=text[start:end]
    after=block.split('答案',1)[1] if '答案' in block else ''
    letters=re.findall(r'[ABCD#]',after)
    if len(letters)<40: raise ValueError(f'科目 {subject_code} 官方答案不足40題，目前{len(letters)}')
    answers=letters[:40]
    accepted={i:["ABCD".index(a)] if a in 'ABCD' else [0,1,2,3] for i,a in enumerate(answers,1)}
    notes=block[block.find('備註'):] if '備註' in block else ''
    notes=notes.replace('\n','')
    for m in re.finditer(r'第\s*(\d+)\s*題[^。；;]*?一律給分',notes):
        accepted[int(m.group(1))]=[0,1,2,3]
    for m in re.finditer(r'第\s*(\d+)\s*題[^。；;]*?([ABCDＡＢＣＤ]+(?:或[ABCDＡＢＣＤ]+)+)[^。；;]*?(?:均給分|者均給分)',notes):
        tokens=re.split('或',norm_answer(m.group(2)))
        vals=[]
        for token in tokens:
            for ch in token:
                if ch in 'ABCD': vals.append('ABCD'.index(ch))
        if vals: accepted[int(m.group(1))]=sorted(set(vals))
    return accepted

def exam_code(year, session): return f'{year}{"030" if session=="1" else "100"}'

def candidate_urls(year,slug):
    return [('1',f'{BASE}{year}-1-{slug}/'),('2',f'{BASE}{year}-2-{slug}/')]

def build_one(year,subject,slug,code):
    results=[]; failures=[]
    sessions=['1','2']
    for session in sessions:
        try:
            code_full=exam_code(year,session)
            answer_url=f'{MOEX}?code={code_full}&t=A'
            official_text=fetch_pdf_text(answer_url)
            accepted=parse_official_answers(official_text,code)
        except Exception as e:
            failures.append({'year':year,'session':session,'subject':subject,'stage':'official-answer','error':str(e)}); continue

        if year=='115' and session=='2':
            # 115-2 is not currently listed by Socialworkerdaily; use the official MOEX question PDF.
            question_url=f'{MOEX}?code={code_full}&t=Q'
            try:
                qs=parse_official_subject_questions(fetch_pdf_text(question_url),code)
            except Exception as e:
                failures.append({'year':year,'session':session,'subject':subject,'stage':'official-question','url':question_url,'error':str(e)}); continue
            source_url=question_url
            source_name='考選部官方考畢試題'
            explanation_source='考選部官方試題未提供解析'
            source_explanation='官方未提供解析；答案以考選部測驗式試題標準答案為準。'
        else:
            _,url=candidate_urls(year,slug)[0 if session=='1' else 1]
            try: text=ExtractorText(fetch(url))
            except Exception as e:
                failures.append({'year':year,'session':session,'subject':subject,'stage':'source','url':url,'error':str(e)}); continue
            qs=parse_page(text)
            if len(qs)!=40 or [q['number'] for q in qs]!=list(range(1,41)):
                failures.append({'year':year,'session':session,'subject':subject,'stage':'source','url':url,'error':f'題目結構異常：解析到{len(qs)}題'}); continue
            source_url=url
            source_name='社工日常 socialworkerdaily'
            explanation_source='社工日常解析'
            source_explanation=''

        for q in qs:
            vals=accepted[q['number']]
            primary=vals[0]
            exp=q.get('explanation','') or source_explanation
            results.append({
                'id':f'{year}-{session}-{subject}-{q["number"]}',
                'year':year,'session':session,'subject':subject,'number':q['number'],
                'question':q['question'],'choices':q['choices'],'answer':primary,'accepted_answers':vals,
                'explanation':exp,'source':source_url,'answer_source':answer_url,
                'source_name':source_name,'answer_authority':'考選部測驗式試題標準答案',
                'answer_verified':True,'explanation_source':explanation_source,
                'corrected':len(vals)!=1
            })
    return results, failures

def main():
    jobs=[(y,s,slug,code) for y in YEARS for s,(slug,code) in SUBJECTS.items()]
    all_items=[]; failures=[]
    with ThreadPoolExecutor(max_workers=8) as ex:
        fs={ex.submit(build_one,*j):j for j in jobs}
        for f in as_completed(fs):
            y,s,_,_=fs[f]
            try:
                items,errs=f.result(); all_items.extend(items); failures.extend(errs)
                print('OK' if items else 'FAIL',y,s,len(items))
            except Exception as e:
                failures.append({'year':y,'subject':s,'stage':'worker','error':str(e)})
    unique={x['id']:x for x in all_items}; all_items=sorted(unique.values(),key=lambda x:(x['year'],x['session'],x['subject'],x['number']))
    papers=sorted({(x['year'],x['session'],x['subject']) for x in all_items})
    meta={
        'generated_from':BASE+'index/exam/',
        'official_115_2_source':'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx?e=115100&y=2026',
        'answer_authority':'考選部測驗式試題標準答案','source_name':'社工日常 socialworkerdaily + 考選部官方115-2',
        'years':YEARS,'subjects':list(SUBJECTS.keys()),'papers_selected':60,'papers_ok':len(papers),'papers_failed':len(failures),
        'items':len(all_items),'failures':failures,'parser_version':'socialworkerdaily-7.0 + MOEX-answer-verification-2.0 + official-115-2'
    }
    (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False,indent=2))
    if len(papers)!=60 or len(all_items)!=len(papers)*40 or failures:
        raise SystemExit(1)

if __name__=='__main__': main()

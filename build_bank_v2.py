import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = 'https://socialworkerdaily.com/'
YEARS = [str(y) for y in range(110, 116)]
SUBJECTS = {
    '社會工作': 'socialwork',
    '社會工作直接服務': 'socialwork-service',
    '社會政策與社會立法': 'socialwork-policy',
    '人類行為與社會環境': 'socialwork-human-behavior-and-social-environment',
    '社會工作研究方法': 'socialwork-research-methods',
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
        if tag in {'script','style','noscript'}: self.skip+=1
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
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 social-worker-exam-builder/5.0','Accept':'text/html,application/xhtml+xml'})
    with urllib.request.urlopen(req,timeout=60) as r: raw=r.read()
    p=Extractor(); p.feed(raw.decode('utf-8',errors='ignore')); return p.text()

def clean(s): return re.sub(r'[ \t\r\n]+',' ',s).strip()

def norm_answer(s):
    return s.translate(str.maketrans('ＡＢＣＤ','ABCD')).strip().upper()

def parse_page(text):
    # The source uses headings such as "1.題幹" and "1. 題幹".
    # The previous parser required whitespace after the punctuation and therefore
    # rejected virtually every question. This version accepts both forms.
    starts=list(re.finditer(r'(?m)^\s*(?:#{1,6}\s*)?(\d{1,3})\s*[\.、．)]\s*',text))
    out=[]; seen=set()
    for i,m in enumerate(starts):
        n=int(m.group(1))
        if not 1<=n<=100: continue
        end=starts[i+1].start() if i+1<len(starts) else len(text)
        block=text[m.end():end]
        marks=list(re.finditer(r'(?m)^\s*[（(]\s*([ABCDＡＢＣＤ])\s*[)）]\s*',block))
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
        am=re.search(r'解析\s*[:：]\s*[（(]\s*([ABCDＡＢＣＤ])\s*[)）]',block,re.I)
        if not am: am=re.search(r'解析\s*[:：]\s*([ABCDＡＢＣＤ])\b',block,re.I)
        if not am or not question or not all(choices): continue
        answer=norm_answer(am.group(1))
        exp=block[am.end():]
        exp=re.split(r'\n\s*看更多\s*[:：]?',exp,maxsplit=1)[0]
        exp=clean(exp)
        if n in seen: continue
        seen.add(n)
        out.append({'number':n,'question':question,'choices':choices,'answer':'ABCD'.index(answer),'explanation':exp})
    out.sort(key=lambda x:x['number'])
    return out

def candidate_urls(year,slug):
    sessions=['1'] if year=='115' else ['1','2']
    return [f'{BASE}{year}-{s}-{slug}/' for s in sessions]

def build_one(year,subject,slug):
    results=[]; failures=[]
    for url in candidate_urls(year,slug):
        try: text=fetch(url)
        except Exception as e: failures.append({'url':url,'error':str(e)}); continue
        # A valid page must contain the year and the subject or the site's exam navigation.
        if str(year) not in text: continue
        qs=parse_page(text)
        if not qs:
            failures.append({'url':url,'error':'頁面取得成功，但沒有解析到四選一題目與解析'}); continue
        session='1' if f'-1-' in url else '2'
        for q in qs:
            results.append({'id':f'{year}-{session}-{subject}-{q["number"]}','year':year,'session':session,'subject':subject,'number':q['number'],'question':q['question'],'choices':q['choices'],'answer':q['answer'],'explanation':q['explanation'],'source':url,'answer_source':url,'source_name':'社工日常 socialworkerdaily','corrected':False})
    return results, failures

def main():
    jobs=[(y,s,slug) for y in YEARS for s,slug in SUBJECTS.items()]
    all_items=[]; failures=[]
    with ThreadPoolExecutor(max_workers=8) as ex:
        fs={ex.submit(build_one,*j):j for j in jobs}
        for f in as_completed(fs):
            y,s,_=fs[f]
            try:
                items,errs=f.result(); all_items.extend(items); failures.extend(errs)
                print('OK' if items else 'FAIL',y,s,len(items))
            except Exception as e: failures.append({'year':y,'subject':s,'error':str(e)})
    unique={x['id']:x for x in all_items}; all_items=sorted(unique.values(),key=lambda x:(x['year'],x['session'],x['subject'],x['number']))
    papers=sorted({(x['year'],x['session'],x['subject']) for x in all_items})
    meta={'generated_from':BASE+'index/exam/','source_name':'社工日常 socialworkerdaily','years':YEARS,'subjects':list(SUBJECTS.keys()),'papers_selected':55,'papers_ok':len(papers),'papers_failed':len(failures),'items':len(all_items),'failures':failures,'parser_version':'socialworkerdaily-2.0'}
    (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False,indent=2))
    if len(all_items)<1000 or failures: raise SystemExit(1)

if __name__=='__main__': main()

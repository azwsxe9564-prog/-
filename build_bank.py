import json, re, subprocess, urllib.request, shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

YEARS={str(y) for y in range(110,116)}
SUBJECTS={"社會工作","社會工作直接服務","社會政策與社會立法","人類行為與社會環境","社會工作研究方法"}
INDEX_URL='https://raw.githubusercontent.com/pofeng/exams_tw/main/fse_all.json'
ROOT=Path(__file__).parent
DATA=ROOT/'data'; PDF=ROOT/'.pdf_cache'
DATA.mkdir(exist_ok=True); PDF.mkdir(exist_ok=True)
CHOICE_MARKS=''

def get(url, dest):
    if dest.exists() and dest.stat().st_size>100: return
    req=urllib.request.Request(url,headers={'User-Agent':'social-worker-exam-builder/3.0'})
    with urllib.request.urlopen(req,timeout=120) as r, open(dest,'wb') as f: shutil.copyfileobj(r,f)

def pdf_text(path):
    p=subprocess.run(['pdftotext','-layout',str(path),'-'],capture_output=True,text=True,encoding='utf-8',errors='ignore')
    if p.returncode != 0:
        raise RuntimeError(f'pdftotext failed for {path.name}: {p.stderr[-500:]}')
    return p.stdout.replace('\x0c','\n')

def clean(s):
    return re.sub(r'\s+',' ',s).strip()

def normalize_digits(s):
    return s.translate(str.maketrans('０１２３４５６７８９','0123456789'))

def parse_questions(text):
    """Parse the actual MOEX multiple-choice section. MOEX mixed papers use private glyphs
        for A-D and put the section after 乙、測驗題部分; essay questions are excluded."""
    text=normalize_digits(text)
    m=re.search(r'乙、?\s*測驗題部分',text)
    if not m: m=re.search(r'測驗題部分',text)
    if not m: raise ValueError('找不到「測驗題部分」')
    text=text[m.end():]
    expected=None
    cm=re.search(r'共\s*(\d{1,3})\s*題',text[:1500])
    if cm: expected=int(cm.group(1))
    starts=list(re.finditer(r'(?m)^\s*(\d{1,3})(?:[\.、．）)]|\s+)',text))
    out=[]
    for i,sm in enumerate(starts):
        n=int(sm.group(1))
        if n<1 or n>100: continue
        em=starts[i+1].start() if i+1<len(starts) else len(text)
        block=text[sm.end():em]
        if '頁次' in block[:40] or '代號' in block[:40]: continue
        marks=list(re.finditer(r'([])\s*',block))
        if len(marks)<4:
            # Fallback for PDFs where the private glyphs were mapped to literal A-D.
            marks=list(re.finditer(r'([ABCD])(?:[\.、．）)]|\s)',block))
        if len(marks)<4: continue
        q=clean(block[:marks[0].start()])
        choices=[]
        for j,mm in enumerate(marks[:4]):
            ee=marks[j+1].start() if j+1<len(marks) else len(block)
            choices.append(clean(block[mm.end():ee]))
        if q and all(choices): out.append({'number':n,'question':q,'choices':choices})
    seen=set(); result=[]
    for q in out:
        if q['number'] not in seen:
            seen.add(q['number']); result.append(q)
    result.sort(key=lambda x:x['number'])
    if expected and len(result)!=expected:
        raise ValueError(f'題目解析數量不符：預期 {expected}，實得 {len(result)}')
    return result

def parse_answers(text, expected=None):
    """Answer PDFs are table-formatted. Restrict extraction to the answer section and
    accept both ASCII and full-width A-D. This avoids accidental letters elsewhere."""
    t=normalize_digits(text).translate(str.maketrans('ＡＢＣＤ','ABCD'))
    m=re.search(r'標準答案',t)
    if m: t=t[m.end():]
    # The PDF table lists the answer letters as isolated tokens after the question-number table.
    letters=re.findall(r'(?<![A-Za-z])[ABCD](?![A-Za-z])',t)
    if expected is not None:
        if len(letters)<expected:
            raise ValueError(f'答案解析數量不足：預期 {expected}，實得 {len(letters)}')
        letters=letters[:expected]
    return letters

def main():
    index_path=PDF/'fse_all.json'; get(INDEX_URL,index_path)
    with open(index_path,encoding='utf-8') as f: rows=json.load(f)
    selected=[r for r in rows if r.get('考試年度') in YEARS and r.get('類科組別')=='社會工作師' and r.get('科目全名') in SUBJECTS and r.get('試題網址') and r.get('測驗式試題答案網址')]
    selected=sorted({r['試題網址']:r for r in selected}.values(),key=lambda r:(r['考試年度'],r['考試代碼'],r['節次']))
    print('selected papers:',len(selected))
    def one(r):
        base=re.sub(r'[^A-Za-z0-9_-]','_',r['試題檔案'])
        qpath=PDF/base; apath=PDF/('A_'+base)
        get(r['試題網址'],qpath); get(r['測驗式試題答案網址'],apath)
        qs=parse_questions(pdf_text(qpath))
        ans=parse_answers(pdf_text(apath),len(qs))
        amap={c:i for i,c in enumerate('ABCD')}
        items=[]
        for q,a in zip(qs,ans):
            items.append({'id':f"{r['考試年度']}-{r['考試代碼']}-{r['科目全名']}-{q['number']}",
              'year':r['考試年度'],'exam_code':r['考試代碼'],'subject':r['科目全名'],'number':q['number'],
              'question':q['question'],'choices':q['choices'],'answer':amap[a],
              'source':r['試題網址'],'answer_source':r['測驗式試題答案網址'],'corrected':r.get('備註')=='更正答案'})
        return r,items
    all_items=[]; failures=[]
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs={ex.submit(one,r):r for r in selected}
        for fut in as_completed(futs):
            r=futs[fut]
            try:
                rr,items=fut.result(); all_items.extend(items); print('OK',rr['考試年度'],rr['科目全名'],len(items))
            except Exception as e:
                failures.append({'year':r['考試年度'],'subject':r['科目全名'],'file':r['試題檔案'],'error':str(e)}); print('FAIL',failures[-1])
    all_items.sort(key=lambda x:(x['year'],x['exam_code'],x['subject'],x['number']))
    meta={'generated_from':INDEX_URL,'years':sorted(YEARS),'subjects':sorted(SUBJECTS),'papers_selected':len(selected),'papers_failed':len(failures),'items':len(all_items),'failures':failures,'parser_version':'3.0-moeX-glyph-test-section'}
    (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False,indent=2))
    if failures or len(all_items)<1000: raise SystemExit(1)
if __name__=='__main__': main()

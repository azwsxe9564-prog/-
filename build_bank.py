import json, re, subprocess, urllib.request, urllib.error, tempfile, shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

YEARS={str(y) for y in range(110,116)}
SUBJECTS={"社會工作","社會工作直接服務","社會政策與社會立法","人類行為與社會環境","社會工作研究方法"}
INDEX_URL='https://raw.githubusercontent.com/pofeng/exams_tw/main/fse_all.json'
ROOT=Path(__file__).parent
DATA=ROOT/'data'; PDF=ROOT/'.pdf_cache'
DATA.mkdir(exist_ok=True); PDF.mkdir(exist_ok=True)

def get(url, dest):
    if dest.exists() and dest.stat().st_size>100: return
    req=urllib.request.Request(url,headers={'User-Agent':'social-worker-exam-builder/1.0'})
    with urllib.request.urlopen(req,timeout=90) as r, open(dest,'wb') as f: shutil.copyfileobj(r,f)

def pdf_text(path):
    p=subprocess.run(['pdftotext','-layout',str(path),'-'],capture_output=True,text=True,encoding='utf-8',errors='ignore',check=True)
    return p.stdout.replace('\x0c','\n')

def clean(s):
    return re.sub(r'\s+',' ',s).strip()

def parse_questions(text):
    lines=[x.rstrip() for x in text.splitlines()]
    starts=[]
    for i,line in enumerate(lines):
        if re.match(r'^\s*\d{1,3}[\.、]\s*',line): starts.append(i)
    out=[]
    for k,start in enumerate(starts):
        block=lines[start:(starts[k+1] if k+1<len(starts) else len(lines))]
        first=re.sub(r'^\s*(\d{1,3})[\.、]\s*','',block[0]).strip()
        n=int(re.match(r'^\s*(\d{1,3})',block[0]).group(1))
        parts=[]; choices=[]; cur=None
        for line in [first]+block[1:]:
            line=line.strip()
            if not line: continue
            m=re.match(r'^([A-D])[\.、]\s*(.*)$',line)
            if m:
                if cur is not None: choices.append(clean(cur))
                cur=m.group(2)
            elif cur is not None:
                cur+=' '+line
            else:
                parts.append(line)
        if cur is not None: choices.append(clean(cur))
        q=clean(' '.join(parts))
        if len(choices)==4 and q and n<200:
            out.append({'number':n,'question':q,'choices':choices})
    return out

def parse_answers(text):
    t=text.translate(str.maketrans('ＡＢＣＤ','ABCD'))
    # Answer PDFs may contain a leading # and explanatory letters; collect runs of answer cells.
    letters=re.findall(r'[ABCD]',t)
    return letters

def main():
    index_path=PDF/'fse_all.json'; get(INDEX_URL,index_path)
    with open(index_path,encoding='utf-8') as f: rows=json.load(f)
    selected=[r for r in rows if r.get('考試年度') in YEARS and r.get('類科組別')=='社會工作師' and r.get('科目全名') in SUBJECTS and r.get('試題網址') and r.get('測驗式試題答案網址')]
    # Keep one row per paper/subject; the answer URL already points to the official answer or correction.
    selected=sorted({r['試題網址']:r for r in selected}.values(),key=lambda r:(r['考試年度'],r['考試代碼'],r['節次']))
    print('selected papers:',len(selected))
    def one(r):
        base=re.sub(r'[^A-Za-z0-9_-]','_',r['試題檔案'])
        qpath=PDF/(base); apath=PDF/('A_'+base)
        get(r['試題網址'],qpath); get(r['測驗式試題答案網址'],apath)
        qs=parse_questions(pdf_text(qpath)); ans=parse_answers(pdf_text(apath))
        # Prefer the first answer sequence whose length covers the parsed questions.
        if len(ans)<len(qs): raise RuntimeError(f"{r['試題檔案']}: parsed {len(qs)} questions but only {len(ans)} answer letters")
        # Most official answer sheets have exactly N answer cells, sometimes with trailing notes. Use first N.
        ans=ans[:len(qs)]
        amap={c:i for i,c in enumerate('ABCD')}
        items=[]
        for q,a in zip(qs,ans):
            if a not in amap: continue
            items.append({
              'id':f"{r['考試年度']}-{r['考試代碼']}-{r['科目全名']}-{q['number']}",
              'year':r['考試年度'],'exam_code':r['考試代碼'],'subject':r['科目全名'],'number':q['number'],
              'question':q['question'],'choices':q['choices'],'answer':amap[a],
              'source':r['試題網址'],'answer_source':r['測驗式試題答案網址'],'corrected':r.get('備註')=='更正答案'
            })
        return r,items
    all_items=[]; failures=[]
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs={ex.submit(one,r):r for r in selected}
        for fut in as_completed(futs):
            r=futs[fut]
            try:
                rr,items=fut.result(); all_items.extend(items); print(rr['考試年度'],rr['科目全名'],len(items))
            except Exception as e:
                failures.append({'year':r['考試年度'],'subject':r['科目全名'],'file':r['試題檔案'],'error':str(e)}); print('FAIL',failures[-1])
    all_items.sort(key=lambda x:(x['year'],x['exam_code'],x['subject'],x['number']))
    meta={'generated_from':INDEX_URL,'years':sorted(YEARS),'subjects':sorted(SUBJECTS),'papers_selected':len(selected),'items':len(all_items),'failures':failures}
    (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False,indent=2))
    if failures: raise SystemExit(1)
if __name__=='__main__': main()

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
    req=urllib.request.Request(url,headers={'User-Agent':'social-worker-exam-builder/2.0'})
    with urllib.request.urlopen(req,timeout=120) as r, open(dest,'wb') as f: shutil.copyfileobj(r,f)

def pdf_text(path):
    p=subprocess.run(['pdftotext','-layout',str(path),'-'],capture_output=True,text=True,encoding='utf-8',errors='ignore',check=True)
    if p.returncode != 0:
        raise RuntimeError(f'pdftotext failed for {path.name}: {p.stderr[-500:]}')
    return p.stdout.replace('\x0c','\n')

def clean(s):
    s=re.sub(r'[ \t\r\n]+',' ',s)
    return s.strip()

def normalize_digits(s):
    return s.translate(str.maketrans('０１２３４５６７８９','0123456789'))

def parse_questions(text):
    # Official MOEX PDFs use a glyph set (   ) for A-D, and mixed papers
    # place the multiple-choice section after 「乙、測驗題部分」. Parse only that section
    # so essay question numbers are never mistaken for test questions.
    text=normalize_digits(text)
    marker=re.search(r'[乙]、?\s*測驗題部分',text)
    if marker:
        text=text[marker.end():]
    else:
        marker=re.search(r'測驗題部分',text)
        if marker:
            text=text[marker.end():]

    starts=list(re.finditer(r'(?m)^\s*(\d{1,3})(?:[\.、．）)]|\s+)',text))
    out=[]
    for i,m in enumerate(starts):
        n=int(m.group(1))
        if n<=0 or n>100: continue
        end=starts[i+1].start() if i+1<len(starts) else len(text)
        block=text[m.end():end]
        # Ignore page headers accidentally captured as numbered text.
        if '頁次' in block[:30] or '代號' in block[:30]:
            continue
        marks=list(re.finditer(r'([])\s*',block))
        if len(marks)<4:
            # Some PDFs may use literal A-D instead of the MOEX private glyphs.
            marks=list(re.finditer(r'([ABCD])(?:[\.、．）)]|\s)',block))
        if len(marks)<4:
            continue
        q=clean(block[:marks[0].start()])
        choices=[]
        for j,mm in enumerate(marks[:4]):
            ee=marks[j+1].start() if j+1<len(marks) else len(block)
            choices.append(clean(block[mm.end():ee]))
        if q and all(choices) and len(choices)==4:
            out.append({'number':n,'question':q,'choices':choices})
    # Keep first occurrence of each question number; the official test section is sequential.
    seen=set(); result=[]
    for q in out:
        if q['number'] not in seen:
            seen.add(q['number']); result.append(q)
    return result

def parse_answers(text):
    # Official answer PDFs use full-width A-D and may have a leading full-width #.
    t=text.translate(str.maketrans('ＡＢＣＤ','ABCD'))
    letters=re.findall(r'[ABCD]',t)
    return letters

def main():
    index_path=PDF/'fse_all.json'
    get(INDEX_URL,index_path)
    with open(index_path,encoding='utf-8') as f: rows=json.load(f)

    selected=[r for r in rows
              if r.get('考試年度') in YEARS
              and r.get('類科組別')=='社會工作師'
              and r.get('科目全名') in SUBJECTS
              and r.get('試題網址')
              and r.get('測驗式試題答案網址')]
    selected=sorted({r['試題網址']:r for r in selected}.values(),
                    key=lambda r:(r['考試年度'],r['考試代碼'],r['節次']))
    print('selected papers:',len(selected))

    def one(r):
        base=re.sub(r'[^A-Za-z0-9_-]','_',r['試題檔案'])
        qpath=PDF/base
        apath=PDF/('A_'+base)
        get(r['試題網址'],qpath)
        get(r['測驗式試題答案網址'],apath)
        qtext=pdf_text(qpath)
        atext=pdf_text(apath)
        qs=parse_questions(qtext)
        ans=parse_answers(atext)
        if not qs:
            raise RuntimeError(f'{r["試題檔案"]}: no multiple-choice questions parsed')
        if len(ans)<len(qs):
            raise RuntimeError(f'{r["試題檔案"]}: parsed {len(qs)} questions but only {len(ans)} answer letters')
        amap={c:i for i,c in enumerate('ABCD')}
        items=[]
        for q,a in zip(qs,ans[:len(qs)]):
            if a not in amap: continue
            items.append({
                'id':f"{r['考試年度']}-{r['考試代碼']}-{r['科目全名']}-{q['number']}",
                'year':r['考試年度'],
                'exam_code':r['考試代碼'],
                'subject':r['科目全名'],
                'number':q['number'],
                'question':q['question'],
                'choices':q['choices'],
                'answer':amap[a],
                'source':r['試題網址'],
                'answer_source':r['測驗式試題答案網址'],
                'corrected':r.get('備註')=='更正答案'
            })
        if len(items)!=len(qs):
            raise RuntimeError(f'{r["試題檔案"]}: answer mapping incomplete ({len(items)}/{len(qs)})')
        return r,items

    all_items=[]; failures=[]
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs={ex.submit(one,r):r for r in selected}
        for fut in as_completed(futs):
            r=futs[fut]
            try:
                rr,items=fut.result()
                all_items.extend(items)
                print(rr['考試年度'],rr['科目全名'],len(items))
            except Exception as e:
                failures.append({'year':r['考試年度'],'subject':r['科目全名'],'file':r['試題檔案'],'error':str(e)})
                print('FAIL',failures[-1])

    all_items.sort(key=lambda x:(x['year'],x['exam_code'],x['subject'],x['number']))
    meta={
        'generated_from':INDEX_URL,
        'years':sorted(YEARS),
        'subjects':sorted(SUBJECTS),
        'papers_selected':len(selected),
        'papers_failed':len(failures),
        'items':len(all_items),
        'failures':failures,
        'parser_version':'2.0-moeX-glyph-test-section'
    }
    (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False,indent=2))

    # Never deploy an empty/partial bank as if it were a successful build.
    if failures or len(all_items)<1000:
        raise SystemExit(1)

if __name__=='__main__':
    main()

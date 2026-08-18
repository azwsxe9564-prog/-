import json, re, subprocess, urllib.request, shutil, hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

YEARS={str(y) for y in range(110,116)}
SUBJECTS={"社會工作","社會工作直接服務","社會政策與社會立法","人類行為與社會環境","社會工作研究方法"}
INDEX_URL='https://raw.githubusercontent.com/pofeng/exams_tw/main/fse_all.json'
ROOT=Path(__file__).parent
DATA=ROOT/'data'; PDF=ROOT/'.pdf_cache_v3'
DATA.mkdir(exist_ok=True); PDF.mkdir(exist_ok=True)

CHOICE_MARKS=''

def get(url, dest):
    # Cache is keyed by the full source URL, so the same MOEX filename from
    # different exam sessions can never overwrite/collide with another paper.
    if dest.exists() and dest.stat().st_size>1000:
        return
    req=urllib.request.Request(url,headers={'User-Agent':'social-worker-exam-builder/3.0'})
    with urllib.request.urlopen(req,timeout=180) as r, open(dest,'wb') as f:
        shutil.copyfileobj(r,f)
    if dest.stat().st_size<=1000:
        raise RuntimeError(f'downloaded file is unexpectedly small: {dest.name}')

def cached_pdf(url, prefix):
    key=hashlib.sha256(url.encode('utf-8')).hexdigest()[:16]
    return PDF/f'{prefix}_{key}.pdf'

def pdf_text(path):
    p=subprocess.run(['pdftotext','-layout',str(path),'-'],capture_output=True,text=True,encoding='utf-8',errors='ignore')
    if p.returncode != 0:
        raise RuntimeError(f'pdftotext failed for {path.name}: {p.stderr[-500:]}')
    return p.stdout.replace('\x0c','\n')

def clean(s):
    s=re.sub(r'[ \t\r\n]+',' ',s)
    return s.strip()

def normalize_digits(s):
    return s.translate(str.maketrans('０１２３４５６７８９','0123456789'))

def parse_questions(text):
    text=normalize_digits(text)
    marker=re.search(r'乙\s*、?\s*測驗題部分',text)
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
        if '頁次' in block[:40] or '代號' in block[:40]:
            continue
        marks=list(re.finditer(r'([])\s*',block))
        if len(marks)<4:
            marks=list(re.finditer(r'([ＡＢＣＤABCD])(?:[\.、．）)]|\s)',block))
        if len(marks)<4:
            continue
        q=clean(block[:marks[0].start()])
        choices=[]
        for j,mm in enumerate(marks[:4]):
            ee=marks[j+1].start() if j+1<len(marks) else len(block)
            choices.append(clean(block[mm.end():ee]))
        if q and all(choices):
            out.append({'number':n,'question':q,'choices':choices})
    seen=set(); result=[]
    for q in out:
        if q['number'] not in seen:
            seen.add(q['number']); result.append(q)
    return result

def parse_answers(text, expected_count):
    # MOEX answer PDFs are laid out as a table. pdftotext -layout may put all
    # question labels first and the answer letters later. Anchor on the last
    # expected question label, then read only A-D letters before the next table.
    t=text.translate(str.maketrans('ＡＢＣＤ','ABCD'))
    stop=re.search(r'複選題數',t)
    if stop:
        t=t[:stop.start()]
    # Use the last occurrence of the highest expected question label.
    anchor=None
    for pattern in [rf'第\s*{expected_count}\s*題', rf'\b{expected_count}\b']:
        ms=list(re.finditer(pattern,t))
        if ms: anchor=ms[-1]; break
    if anchor:
        tail=t[anchor.end():]
        letters=re.findall(r'[ABCD]',tail)
        if len(letters)>=expected_count:
            return letters[:expected_count]
    # Fallback: many MOEX PDFs expose a compact sequence after 標準答案.
    tail=t[t.find('標準答案'):] if '標準答案' in t else t
    letters=re.findall(r'[ABCD]',tail)
    if len(letters)>=expected_count:
        return letters[-expected_count:]
    raise RuntimeError(f'could not parse {expected_count} official answers; found {len(letters)}')

def main():
    index_path=PDF/'fse_all_index.json'
    get(INDEX_URL,index_path)
    with open(index_path,encoding='utf-8') as f: rows=json.load(f)

    selected=[r for r in rows
              if str(r.get('考試年度')) in YEARS
              and r.get('類科組別')=='社會工作師'
              and r.get('科目全名') in SUBJECTS
              and r.get('試題網址')
              and r.get('測驗式試題答案網址')]
    # One paper per unique Q URL. Keep corrected-answer metadata from the same row.
    selected=sorted({r['試題網址']:r for r in selected}.values(),
                    key=lambda r:(str(r['考試年度']),r.get('考試代碼',''),r.get('節次','')))
    print('selected papers:',len(selected))

    def one(r):
        qpath=cached_pdf(r['試題網址'],'Q')
        apath=cached_pdf(r['測驗式試題答案網址'],'A')
        get(r['試題網址'],qpath)
        get(r['測驗式試題答案網址'],apath)
        qtext=pdf_text(qpath)
        qs=parse_questions(qtext)
        if not qs:
            raise RuntimeError(f'{r["試題檔案"]}: no multiple-choice questions parsed')
        atext=pdf_text(apath)
        ans=parse_answers(atext,len(qs))
        amap={c:i for i,c in enumerate('ABCD')}
        items=[]
        for q,a in zip(qs,ans):
            if a not in amap:
                raise RuntimeError(f'{r["試題檔案"]}: invalid answer {a} at question {q["number"]}')
            items.append({
                'id':f"{r['考試年度']}-{r['考試代碼']}-{r['科目全名']}-{q['number']}",
                'year':str(r['考試年度']),
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
        return r,items

    all_items=[]; failures=[]
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs={ex.submit(one,r):r for r in selected}
        for fut in as_completed(futs):
            r=futs[fut]
            try:
                rr,items=fut.result(); all_items.extend(items)
                print('OK',rr['考試年度'],rr['考試代碼'],rr['科目全名'],len(items))
            except Exception as e:
                failure={'year':r['考試年度'],'exam_code':r['考試代碼'],'subject':r['科目全名'],'file':r['試題檔案'],'error':str(e)}
                failures.append(failure); print('FAIL',failure)

    all_items.sort(key=lambda x:(x['year'],x['exam_code'],x['subject'],x['number']))
    meta={
        'generated_from':INDEX_URL,
        'years':sorted(YEARS),
        'subjects':sorted(SUBJECTS),
        'papers_selected':len(selected),
        'papers_ok':len(selected)-len(failures),
        'papers_failed':len(failures),
        'items':len(all_items),
        'failures':failures,
        'parser_version':'3.0-moeX-test-section-url-cache-answer-anchor'
    }
    (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False,indent=2))
    # Never deploy a partial or empty bank as successful.
    if failures or len(all_items)<1000:
        raise SystemExit(1)

if __name__=='__main__':
    main()

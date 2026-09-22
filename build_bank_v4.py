import io
import json
import re
import time
import urllib.request
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from pypdf import PdfReader
try:
 import fitz
except Exception:
 fitz=None

BASE='https://socialworkerdaily.com/'
MOEX='https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx'
MOEX_C='103'
YEARS=[str(y) for y in range(110,116)]
SUBJECTS={
 '社會工作':('socialwork','1103'),
 '社會工作直接服務':('socialwork-service','2103'),
 '社會政策與社會立法':('socialwork-policy','3103'),
 '人類行為與社會環境':('socialwork-human-behavior-and-social-environment','4103'),
 '社會工作研究方法':('socialwork-research-methods','5103'),
}
DATA=Path(__file__).parent/'data'; DATA.mkdir(exist_ok=True)

class Extractor(HTMLParser):
 BLOCK={'p','div','li','h1','h2','h3','h4','h5','h6','br','blockquote','pre','section','article'}
 def __init__(self): super().__init__(convert_charrefs=True); self.parts=[]; self.skip=0
 def handle_starttag(self,tag,attrs):
  tag=tag.lower()
  if tag in {'script','style','noscript'}: self.skip+=1
  elif tag in self.BLOCK and not self.skip: self.parts.append('\n')
 def handle_endtag(self,tag):
  tag=tag.lower()
  if tag in {'script','style','noscript'}: self.skip=max(0,self.skip-1)
  elif tag in self.BLOCK and not self.skip: self.parts.append('\n')
 def handle_data(self,data):
  if not self.skip:self.parts.append(data)
 def text(self):
  s=''.join(self.parts).replace('\xa0',' ')
  s=re.sub(r'[ \t]+',' ',s); s=re.sub(r'\n[ \t]+','\n',s); s=re.sub(r'\n{3,}','\n\n',s)
  return s.strip()

def fetch(url,retries=5):
 last=None
 for attempt in range(1,retries+1):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 social-worker-exam-builder/10.1','Accept':'text/html,application/xhtml+xml,application/pdf,*/*','Accept-Encoding':'identity','Connection':'close'})
   with urllib.request.urlopen(req,timeout=90) as r:data=r.read()
   if not data: raise OSError('empty response')
   return data
  except Exception as e:
   last=e
   if attempt<retries: time.sleep(min(2**(attempt-1),8))
 raise last

def html_text(raw):
 p=Extractor(); p.feed(raw.decode('utf-8',errors='ignore')); return p.text()
def pdf_text(url):
 raw=fetch(url)
 texts=[]
 try:
  if fitz:
   doc=fitz.open(stream=raw,filetype='pdf')
   texts.append('\n'.join(page.get_text('text') for page in doc))
   doc.close()
 except Exception:
  pass
 try:
  texts.append('\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(raw)).pages))
 except Exception:
  pass
 # 考選部部分 PDF 的文字層在 pypdf 下可能不完整；以系統 pdftotext 交叉取較完整的文字。
 try:
  with tempfile.TemporaryDirectory() as td:
   pdf=Path(td)/'source.pdf'; txt=Path(td)/'source.txt'
   pdf.write_bytes(raw)
   p=subprocess.run(['pdftotext','-layout',str(pdf),str(txt)],capture_output=True,text=True,timeout=60)
   if p.returncode==0 and txt.exists():
    texts.append(txt.read_text(encoding='utf-8',errors='ignore'))
 except Exception:
  pass
 text=max(texts,key=len,default='')
 if len(text)<200:
  raw=fetch(url,retries=3)
  try:return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(raw)).pages)
  except Exception: return text
 return text

def _pdf_text_raw(raw):
 if not fitz: raise RuntimeError('PyMuPDF 未安裝')
 doc=fitz.open(stream=raw,filetype='pdf')
 try:return '\\n'.join(page.get_text('text') for page in doc)
 finally:doc.close()

def _answer_cells(raw):
 if not fitz: raise RuntimeError('PyMuPDF 未安裝，無法用座標解析考選部答案表')
 doc=fitz.open(stream=raw,filetype='pdf')
 try:
  words=[]
  for page in doc:
   for w in page.get_text('words'):
    x0,y0,x1,y1,t=w[:5]
    t=norm(str(t))
    if t in {'A','B','C','D','#'}:
     words.append((page.number,float(x0),float(y0),float(x1),float(y1),t))
   all_words=page.get_text('words')
   y_q1=[float(w[1]) for w in all_words if '第1題' in str(w[4]).replace(' ','')]
   y_start=min(y_q1) if y_q1 else 0.0
   y_end_candidates=[float(w[1]) for w in all_words if str(w[4]).replace(' ','') in {'複選題數：','複選題數','備註：','備註'}]
   y_end=min(y_end_candidates) if y_end_candidates else float('inf')
   words=[z for z in words if z[0]!=page.number or not (z[2] <= y_start or z[2] >= y_end)]
  # The official table is laid out in rows; coordinates, not PDF text extraction order,
  # determine the question order.
  words.sort(key=lambda z:(z[0],round(z[2]/2)*2,z[1]))
  return [w[5] for w in words]
 finally:doc.close()

def parse_official_answers_pdf(raw,code):
 text=_pdf_text_raw(raw)
 m=re.search(r'單選題數\s*[:：]?\s*(\d+)\s*題',text)
 if not m:m=re.search(r'共\s*(\d+)\s*題',text)
 expected=int(m.group(1)) if m else None
 letters=_answer_cells(raw)
 if expected is None: expected=len(letters)
 if expected<=0 or len(letters)<expected:
  raise ValueError(f'考選部 {code} 座標答案不足：應有{expected}題，實得{len(letters)}')
 letters=letters[:expected]
 accepted={i:(['ABCD'.index(a)] if a in 'ABCD' else [0,1,2,3]) for i,a in enumerate(letters,1)}
 return expected,accepted

def parse_official_correction_pdf(raw,code):
 text=_pdf_text_raw(raw)
 letters=_answer_cells(raw)
 corrected=[i for i,a in enumerate(letters,1) if a=='#']
 if not corrected:return {}
 notes=text[text.find('備註'):] if '備註' in text else text
 notes=notes.replace('\\n',' ')
 out={}
 for q in corrected:
  m=re.search(rf'第\s*{q}\s*題(.*?)(?=第\s*\d+\s*題|標準答案|$)',notes,re.S)
  seg=m.group(1) if m else ''
  if '一律給分' in seg:
   out[q]=[0,1,2,3]; continue
  vals=[]
  for token in re.findall(r'[ABCDＡＢＣＤ]+',norm(seg)):
   for ch in token:
    if ch in 'ABCD': vals.append('ABCD'.index(ch))
  if '均給分' in seg and vals:
   out[q]=sorted(set(vals)); continue
  m2=re.search(r'(?:更正(?:答案)?(?:為|成)|改(?:為|成)|答案(?:由[^ABCDＡＢＣＤ]+)?(?:為|成))\s*([ABCDＡＢＣＤ])',seg)
  if m2:
   out[q]=['ABCD'.index(norm(m2.group(1)))]; continue
  if vals: out[q]=sorted(set(vals))
 return out

def clean(s):return re.sub(r'[ \t\r\n]+',' ',s).strip()
def norm(s):return s.translate(str.maketrans('ＡＢＣＤ','ABCD')).strip().upper()

def parse_questions(text, expected_count=None, official_pdf=False):
 if official_pdf:
  text=text.replace('\r','\n')
  # 考選部試題 PDF 的選項標記是私有字元 ；直接以這四個標記切題，
  # 避免 PDF 文字層把 A/B/C/D 或換行位置改寫後造成整份題目變成 0 題。
  starts=list(re.finditer(r'(?m)^\s*(\d{1,3})\s+(?=\S)',text))
  out=[]
  for i,m in enumerate(starts):
   n=int(m.group(1))
   if n<1 or (expected_count and n>expected_count): continue
   end=starts[i+1].start() if i+1<len(starts) else len(text)
   block=text[m.end():end]
   marks=list(re.finditer(r'[]',block))
   if len(marks)<4:
    # 若系統 PDF 文字層已把私有字元轉成英文字母，退回 A-D 標記。
    marks=list(re.finditer(r'(?m)(?:^|\n)\s*([ABCD])\s+',block))
    marker_mode='letters'
   else:
    marker_mode='glyphs'
   if len(marks)<4: continue
   marks=marks[:4]
   q=clean(block[:marks[0].start()])
   choices=[]
   for j,mark in enumerate(marks):
    epos=marks[j+1].start() if j<3 else len(block)
    if marker_mode=='glyphs':
     c=block[mark.end():epos]
    else:
     c=block[mark.end():epos]
    choices.append(clean(c))
   if not q or any(not x for x in choices): continue
   out.append({'number':n,'question':q,'choices':choices,'explanation':''})
  unique={q['number']:q for q in out}
  return [unique[n] for n in sorted(unique)]

 starts=list(re.finditer(r'(?m)^\s*(?:#{1,6}\s*)?(\d{1,3})\s*[\.\、．)）]\s*',text))
 out=[]
 for i,m in enumerate(starts):
  n=int(m.group(1))
  if n<1 or (expected_count and n>expected_count):continue
  end=starts[i+1].start() if i+1<len(starts) else len(text); block=text[m.end():end]
  marks=list(re.finditer(r'(?m)^\s*[（(]?\s*([ABCDＡＢＣＤ])\s*[)）.．、:：]?\s+',block))
  if len(marks)<4:continue
  chosen=None
  for k in range(len(marks)-3):
   cand=marks[k:k+4]
   if [norm(x.group(1)) for x in cand]==list('ABCD'): chosen=cand; break
  if not chosen:continue
  marks=chosen; q=clean(block[:marks[0].start()]); choices=[]
  for j,mark in enumerate(marks):
   epos=marks[j+1].start() if j<3 else len(block); c=block[mark.end():epos]
   if j==3:c=re.split(r'\n\s*(?:解析|看更多|備註|試題代號)\s*[:：]?',c,maxsplit=1)[0]
   choices.append(clean(c))
  if not q or any(not c for c in choices):continue
  am=re.search(r'解析\s*[:：]\s*[（(]?\s*([ABCDＡＢＣＤ])\s*[)）]?\s*',block,re.I); exp=''
  if am:exp=clean(re.split(r'\n\s*看更多\s*[:：]?',block[am.end():],maxsplit=1)[0])
  out.append({'number':n,'question':q,'choices':choices,'explanation':exp})
 unique={q['number']:q for q in out}; return [unique[n] for n in sorted(unique)]

def official_block(text,code):
 # PDF 文字層可能把試題代號拆成「1 1 0 3」，也可能保留為1103；
 # 先鎖定「試題代號／代號」附近的代碼，再以科目名稱作官方 PDF 的備援識別。
 text=text.replace('\r','\n')
 code_digits=re.escape(str(code))
 spaced_code=r'\s*'.join(re.escape(ch) for ch in str(code))
 labeled=re.compile(r'(?:試題代號|代號)\s*[：:（(]?\s*'+spaced_code+r'\s*[)）]?',re.I)
 labeled_hits=list(labeled.finditer(text))
 if labeled_hits:
  hit=labeled_hits[0]
 else:
  hits=list(re.finditer(r'(?<!\d)'+code_digits+r'(?!\d)',text))
  if not hits:
   hits=list(re.finditer(r'(?<!\d)'+spaced_code+r'(?!\d)',text))
  if hits:
   ranked=sorted(hits,key=lambda h:(0 if re.search(r'代號\s*[：:]?\s*$',text[max(0,h.start()-20):h.start()]) else 1,h.start()))
   hit=ranked[0]
  else:
   subject_by_code={'1103':'社會工作','2103':'社會工作直接服務','3103':'社會政策與社會立法','4103':'人類行為與社會環境','5103':'社會工作研究方法'}
   subject=subject_by_code.get(str(code))
   if not subject or subject not in text or '標準答案' not in text:
    raise ValueError(f'找不到考選部科目代碼 {code}')
   pos=text.find(subject)
   hit=re.search(re.escape(subject),text[pos:])
   if not hit:
    raise ValueError(f'找不到考選部科目 {subject}')
   # 將相對命中位置轉成全域位置。
   hit_start=pos+hit.start()
   class Hit:
    def __init__(self,start): self._start=start
    def start(self): return self._start
    def end(self): return self._start+len(subject)
   hit=Hit(hit_start)
 start=hit.start()
 prev=list(re.finditer(r'(?m)^\s*(?:代號\s*[：:]?\s*)?\d{4,6}\s*$',text[:start]))
 if prev:start=prev[-1].start()
 nxt=re.search(r'(?m)^\s*(?:代號\s*[：:]?\s*)?\d{4,6}\s*$',text[hit.end():])
 end=hit.end()+nxt.start() if nxt else len(text)
 return text[start:end]

def moex_url(year,session,subject_code,file_type):return f'{MOEX}?c={MOEX_C}&code={exam_code(year,session)}&q=1&s={subject_code}&t={file_type}'

def parse_official_answers(text,code):
 block=official_block(text,code)
 m=re.search(r'單選題數\s*[:：]?\s*(\d+)\s*題',block)
 if not m:m=re.search(r'共\s*(\d+)\s*題',block)
 expected=int(m.group(1)) if m else None
 after=block.split('答案',1)[1] if '答案' in block else ''
 letters=re.findall(r'(?<![A-Z])[ABCD#](?![A-Z])',after)
 if expected is None: expected=len(letters)
 if expected<=0 or len(letters)<expected:raise ValueError(f'考選部 {code} 公布答案不足：應有{expected}題，實得{len(letters)}')
 letters=letters[:expected]; accepted={i:(["ABCD".index(a)] if a in 'ABCD' else [0,1,2,3]) for i,a in enumerate(letters,1)}
 notes=block[block.find('備註'):] if '備註' in block else ''; notes=notes.replace('\n','')
 for x in re.finditer(r'第\s*(\d+)\s*題[^。；;]*?一律給分',notes):accepted[int(x.group(1))]=[0,1,2,3]
 for x in re.finditer(r'第\s*(\d+)\s*題[^。；;]*?([ABCDＡＢＣＤ]+(?:或[ABCDＡＢＣＤ]+)+)[^。；;]*?(?:均給分|者均給分)',notes):
  vals=[]
  for token in re.split('或',norm(x.group(2))):vals += ['ABCD'.index(ch) for ch in token if ch in 'ABCD']
  if vals:accepted[int(x.group(1))]=sorted(set(vals))
 return expected,accepted

def exam_code(y,s):return f'{y}{"030" if s=="1" else "100"}'
def social_url(y,s,slug):return f'{BASE}{y}-{s}-{slug}/'

def build_one(y,subject,slug,code):
 results=[]; failures=[]
 for session in ('1','2'):
  answer_url=moex_url(y,session,code,'S')
  try:\n   expected,accepted=parse_official_answers_pdf(fetch(answer_url),code)\n   try:\n    correction=fetch(moex_url(y,session,code,'M'))\n    accepted.update(parse_official_correction_pdf(correction,code))\n   except Exception:\n    pass
  except Exception as e:failures.append({'year':y,'session':session,'subject':subject,'stage':'official-answer','url':answer_url,'error':str(e)});continue
  if y=='115' and session=='2':
   source_url=moex_url(y,session,code,'Q'); source_name='考選部官方考畢試題'; explanation_source='考選部官方試題未提供解析'; default_exp='官方未提供解析；答案以考選部測驗式試題標準答案為準。'
   try:qs=parse_questions(pdf_text(source_url),expected,official_pdf=True)
   except Exception as e:failures.append({'year':y,'session':session,'subject':subject,'stage':'official-question','url':source_url,'error':str(e)});continue
  else:
   source_url=social_url(y,session,slug); source_name='社工日常 socialworkerdaily'; explanation_source='社工日常解析'; default_exp=''
   try:qs=parse_questions(html_text(fetch(source_url)),expected)
   except Exception as e:failures.append({'year':y,'session':session,'subject':subject,'stage':'source','url':source_url,'error':str(e)});continue
  nums=[q['number'] for q in qs]
  if len(qs)!=expected or nums!=list(range(1,expected+1)):
   failures.append({'year':y,'session':session,'subject':subject,'stage':'question-count','expected_from_moex':expected,'parsed':len(qs),'url':source_url});continue
  for q in qs:
   vals=accepted[q['number']]
   results.append({'id':f'{y}-{session}-{subject}-{q["number"]}','year':y,'session':session,'subject':subject,'number':q['number'],'question':q['question'],'choices':q['choices'],'answer':vals[0],'accepted_answers':vals,'explanation':q.get('explanation') or default_exp,'source':source_url,'answer_source':answer_url,'source_name':source_name,'answer_authority':'考選部測驗式試題標準答案','answer_verified':True,'explanation_source':explanation_source,'corrected':len(vals)!=1})
 return results,failures

def main():
 jobs=[(y,s,slug,code) for y in YEARS for s,(slug,code) in SUBJECTS.items()]
 all_items=[];failures=[]
 with ThreadPoolExecutor(max_workers=3) as ex:
  fs={ex.submit(build_one,*j):j for j in jobs}
  for f in as_completed(fs):
   y,s,_,_=fs[f]
   try:
    items,errs=f.result();all_items.extend(items);failures.extend(errs);print('OK' if items else 'FAIL',y,s,len(items))
   except Exception as e:failures.append({'year':y,'subject':s,'stage':'worker','error':str(e)})
 unique={x['id']:x for x in all_items};all_items=sorted(unique.values(),key=lambda x:(x['year'],x['session'],x['subject'],x['number']))
 papers=sorted({(x['year'],x['session'],x['subject']) for x in all_items}); counts={}
 for q in all_items:
  k=f"{q['year']}-{q['session']}-{q['subject']}";counts[k]=counts.get(k,0)+1
 meta={'generated_from':BASE+'index/exam/','official_question_count_authority':'考選部各科「單選題數」；系統僅納入測驗式選擇題','official_115_2_source':'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx?e=115100&y=2026','answer_authority':'考選部測驗式試題標準答案','source_name':'社工日常 socialworkerdaily + 考選部官方115-2','years':YEARS,'subjects':list(SUBJECTS.keys()),'papers_selected':60,'papers_ok':len(papers),'papers_failed':len(failures),'items':len(all_items),'paper_question_counts':counts,'failures':failures,'parser_version':'socialworkerdaily-10.1 + MOEX-official-count-and-pdf-parser-with-robust-code-detection'}
 (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print(json.dumps(meta,ensure_ascii=False,indent=2))
 if len(papers)!=60 or failures:raise SystemExit(1)
if __name__=='__main__':main()

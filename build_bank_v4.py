import io
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from pypdf import PdfReader

BASE='https://socialworkerdaily.com/'
MOEX='https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx'
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

def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 social-worker-exam-builder/8.0','Accept':'text/html,application/xhtml+xml,application/pdf'})
 with urllib.request.urlopen(req,timeout=60) as r:return r.read()

def html_text(raw):
 p=Extractor(); p.feed(raw.decode('utf-8',errors='ignore')); return p.text()

def pdf_text(url):
 r=PdfReader(io.BytesIO(fetch(url))); return '\n'.join((p.extract_text() or '') for p in r.pages)

def clean(s):return re.sub(r'[ \t\r\n]+',' ',s).strip()
def norm(s):return s.translate(str.maketrans('ＡＢＣＤ','ABCD')).strip().upper()

def parse_questions(text, expected_count=None):
 starts=list(re.finditer(r'(?m)^\s*(?:#{1,6}\s*)?(\d{1,3})\s*[\.、．)）]\s*',text)); out=[]
 for i,m in enumerate(starts):
  n=int(m.group(1))
  if n<1 or (expected_count and n>expected_count):continue
  end=starts[i+1].start() if i+1<len(starts) else len(text); block=text[m.end():end]
  marks=list(re.finditer(r'(?m)^\s*[（(]?\s*([ABCDＡＢＣＤ])\s*[)）.．、:：]\s*',block))
  if len(marks)<4:continue
  marks=marks[:4]
  if [norm(x.group(1)) for x in marks]!=list('ABCD'):continue
  q=clean(block[:marks[0].start()]); choices=[]
  for j,mark in enumerate(marks):
   e=marks[j+1].start() if j<3 else len(block); c=block[mark.end():e]
   if j==3:c=re.split(r'\n\s*(?:解析|看更多)\s*[:：]?',c,maxsplit=1)[0]
   choices.append(clean(c))
  if not q or any(not c for c in choices):continue
  am=re.search(r'解析\s*[:：]\s*[（(]?\s*([ABCDＡＢＣＤ])\s*[)）]?\s*',block,re.I)
  exp=''
  if am:exp=clean(re.split(r'\n\s*看更多\s*[:：]?',block[am.end():],maxsplit=1)[0])
  out.append({'number':n,'question':q,'choices':choices,'explanation':exp})
 unique={q['number']:q for q in out}; return [unique[n] for n in sorted(unique)]

def official_block(text,code):
 hits=list(re.finditer(r'(?m)^\s*'+re.escape(code)+r'\s*$',text))
 if not hits:raise ValueError(f'找不到考選部科目代碼 {code}')
 start=hits[0].start(); nxt=re.search(r'(?m)^\s*\d{4}\s*$',text[hits[0].end():]); end=hits[0].end()+nxt.start() if nxt else len(text)
 return text[start:end]

def parse_official_answers(text,code):
 block=official_block(text,code)
 m=re.search(r'單選題數\s*[:：]?\s*(\d+)\s*題',block)
 expected=int(m.group(1)) if m else None
 after=block.split('答案',1)[1] if '答案' in block else ''
 letters=re.findall(r'[ABCD#]',after)
 if expected is None:
  expected=len(letters)
 if expected<=0 or len(letters)<expected:raise ValueError(f'考選部 {code} 公布答案不足：應有{expected}題，實得{len(letters)}')
 letters=letters[:expected]
 accepted={i:(["ABCD".index(a)] if a in 'ABCD' else [0,1,2,3]) for i,a in enumerate(letters,1)}
 notes=block[block.find('備註'):] if '備註' in block else ''
 notes=notes.replace('\n','')
 for x in re.finditer(r'第\s*(\d+)\s*題[^。；;]*?一律給分',notes):accepted[int(x.group(1))]=[0,1,2,3]
 for x in re.finditer(r'第\s*(\d+)\s*題[^。；;]*?([ABCDＡＢＣＤ]+(?:或[ABCDＡＢＣＤ]+)+)[^。；;]*?(?:均給分|者均給分)',notes):
  vals=[]
  for token in re.split('或',norm(x.group(2))):
   vals += ['ABCD'.index(ch) for ch in token if ch in 'ABCD']
  if vals:accepted[int(x.group(1))]=sorted(set(vals))
 return expected,accepted

def exam_code(y,s):return f'{y}{"030" if s=="1" else "100"}'
def social_url(y,s,slug):return f'{BASE}{y}-{s}-{slug}/'

def build_one(y,subject,slug,code):
 results=[]; failures=[]
 for session in ('1','2'):
  answer_url=f'{MOEX}?code={exam_code(y,session)}&t=A'
  try:expected,accepted=parse_official_answers(pdf_text(answer_url),code)
  except Exception as e:failures.append({'year':y,'session':session,'subject':subject,'stage':'official-answer','error':str(e)});continue
  if y=='115' and session=='2':
   source_url=f'{MOEX}?code={exam_code(y,session)}&t=Q'; source_name='考選部官方考畢試題'; explanation_source='考選部官方試題未提供解析'; default_exp='官方未提供解析；答案以考選部測驗式試題標準答案為準。'
   try:qs=parse_questions(pdf_text(source_url),expected)
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
 jobs=[(y,s,slug,code) for y in YEARS for s,(slug,code) in SUBJECTS.items()]; all_items=[];failures=[]
 with ThreadPoolExecutor(max_workers=8) as ex:
  fs={ex.submit(build_one,*j):j for j in jobs}
  for f in as_completed(fs):
   y,s,_,_=fs[f]
   try:
    items,errs=f.result();all_items.extend(items);failures.extend(errs);print('OK' if items else 'FAIL',y,s,len(items))
   except Exception as e:failures.append({'year':y,'subject':s,'stage':'worker','error':str(e)})
 unique={x['id']:x for x in all_items};all_items=sorted(unique.values(),key=lambda x:(x['year'],x['session'],x['subject'],x['number']))
 papers=sorted({(x['year'],x['session'],x['subject']) for x in all_items})
 counts={}
 for q in all_items:counts[f"{q['year']}-{q['session']}-{q['subject']}"]=counts.get(f"{q['year']}-{q['session']}-{q['subject']}",0)+1
 meta={'generated_from':BASE+'index/exam/','official_question_count_authority':'考選部各科「單選題數」；系統僅納入測驗式選擇題','official_115_2_source':'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx?e=115100&y=2026','answer_authority':'考選部測驗式試題標準答案','source_name':'社工日常 socialworkerdaily + 考選部官方115-2','years':YEARS,'subjects':list(SUBJECTS.keys()),'papers_selected':60,'papers_ok':len(papers),'papers_failed':len(failures),'items':len(all_items),'paper_question_counts':counts,'failures':failures,'parser_version':'socialworkerdaily-8.0 + MOEX-question-count-authority'}
 (DATA/'bank.json').write_text(json.dumps({'meta':meta,'questions':all_items},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print(json.dumps(meta,ensure_ascii=False,indent=2))
 if len(papers)!=60 or failures:raise SystemExit(1)

if __name__=='__main__':main()

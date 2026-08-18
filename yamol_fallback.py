import re
import time
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin

LATEST_URLS = [
    'https://yamol.tw/latest-1777666594.htm',
    'https://api.yamol.tw/latest-1777666594.htm',
]
SUBJECT_NAMES = [
    '社會工作',
    '社會工作直接服務',
    '社會政策與社會立法',
    '人類行為與社會環境',
    '社會工作研究方法',
]

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links=[]
        self.href=None
        self.buf=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower()=='a':
            self.href=dict(attrs).get('href')
            self.buf=[]
    def handle_data(self, data):
        if self.href is not None:
            self.buf.append(data)
    def handle_endtag(self, tag):
        if tag.lower()=='a' and self.href is not None:
            self.links.append((self.href, ''.join(self.buf)))
            self.href=None; self.buf=[]

class TextParser(HTMLParser):
    BLOCK={'p','div','li','h1','h2','h3','h4','h5','h6','br','blockquote','pre','section','article'}
    def __init__(self):
        super().__init__(convert_charrefs=True); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        tag=tag.lower()
        if tag in {'script','style','noscript'}: self.skip+=1
        elif tag in self.BLOCK and not self.skip: self.parts.append('\n')
    def handle_endtag(self,tag):
        tag=tag.lower()
        if tag in {'script','style','noscript'}: self.skip=max(0,self.skip-1)
        elif tag in self.BLOCK and not self.skip: self.parts.append('\n')
    def handle_data(self,data):
        if not self.skip: self.parts.append(data)
    def text(self):
        s=''.join(self.parts).replace('\xa0',' ')
        s=re.sub(r'[ \t]+',' ',s)
        s=re.sub(r'\n[ \t]+','\n',s)
        return re.sub(r'\n{3,}','\n\n',s).strip()

def fetch(url,retries=5):
    last=None
    for attempt in range(1,retries+1):
        try:
            req=urllib.request.Request(url,headers={
                'User-Agent':'Mozilla/5.0 social-worker-exam-builder/12.0',
                'Accept':'text/html,application/xhtml+xml,*/*',
                'Accept-Encoding':'identity','Connection':'close'})
            with urllib.request.urlopen(req,timeout=60) as r:
                data=r.read()
            if not data: raise OSError('empty response')
            return data
        except Exception as e:
            last=e
            if attempt<retries: time.sleep(min(2**(attempt-1),8))
    raise last

def discover_exam_url(subject):
    needles=[f'115年 - 115-2 專技高考_社會工作師：{subject}',f'115-2 專技高考_社會工作師：{subject}']
    for latest in LATEST_URLS:
        try:
            raw=fetch(latest)
            p=LinkParser(); p.feed(raw.decode('utf-8',errors='ignore'))
            for href,text in p.links:
                joined=' '.join(text.split())
                if any(n in joined for n in needles):
                    return urljoin(latest,href)
        except Exception:
            continue
    raise RuntimeError(f'阿摩找不到 115-2 試卷連結：{subject}')

def get_subject_html(subject):
    url=discover_exam_url(subject)
    return url, fetch(url).decode('utf-8',errors='ignore')

def get_subject_text(subject):
    url, html=get_subject_html(subject)
    p=TextParser(); p.feed(html)
    return url,p.text()

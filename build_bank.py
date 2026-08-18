import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# 題庫來源改為「社工日常」歷屆試題頁。
# 不再依賴考選部答案 PDF 的表格文字層，因此不會因為「第1題、第2題……」
# 與答案列分離而造成題庫解析失敗。
BASE = 'https://socialworkerdaily.com/'
YEARS = [str(y) for y in range(110, 116)]
SUBJECTS = {
    '社會工作': 'socialwork',
    '社會工作直接服務': 'socialwork-service',
    '社會政策與社會立法': 'socialwork-policy',
    '人類行為與社會環境': 'socialwork-human-behavior-and-social-environment',
    '社會工作研究方法': 'socialwork-research-methods',
}
ROOT = Path(__file__).parent
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)


class TextExtractor(HTMLParser):
    """Turn WordPress HTML into block-oriented plain text."""

    BLOCK_TAGS = {
        'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'br', 'blockquote', 'pre', 'section', 'article'
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ('script', 'style', 'noscript'):
            self._skip += 1
        elif tag in self.BLOCK_TAGS and self._skip == 0:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ('script', 'style', 'noscript'):
            self._skip = max(0, self._skip - 1)
        elif tag in self.BLOCK_TAGS and self._skip == 0:
            self.parts.append('\n')

    def handle_data(self, data):
        if self._skip == 0:
            self.parts.append(data)

    def text(self):
        s = ''.join(self.parts)
        s = s.replace('\xa0', ' ')
        s = re.sub(r'[ \t]+', ' ', s)
        s = re.sub(r'\n[ \t]+', '\n', s)
        s = re.sub(r'\n{3,}', '\n\n', s)
        return s.strip()


def fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'social-worker-exam-builder/socialworkerdaily-1.0',
            'Accept': 'text/html,application/xhtml+xml',
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    parser = TextExtractor()
    parser.feed(raw.decode('utf-8', errors='ignore'))
    return parser.text()


def clean(s):
    s = re.sub(r'[ \t\r\n]+', ' ', s)
    return s.strip()


def normalize_answer(s):
    s = s.replace('（', '(').replace('）', ')')
    s = s.replace('Ａ', 'A').replace('Ｂ', 'B').replace('Ｃ', 'C').replace('Ｄ', 'D')
    return s.strip().upper()


def parse_questions(text):
    """Parse the full question/choice/explanation blocks from 社工日常 pages.

    The pages contain a table of contents followed by the full questions.
    We intentionally ignore TOC entries because they do not contain four choices.
    """
    # Question headings appear as either '#### 1.' in HTML or plain '1.' after
    # text extraction. Require the number to start a line so years/references
    # inside explanations are not mistaken for question numbers.
    starts = list(re.finditer(
        r'(?m)^\s*(?:#{1,6}\s*)?(\d{1,3})[\.、．)]\s+',
        text
    ))

    out = []
    seen = set()
    for i, m in enumerate(starts):
        number = int(m.group(1))
        if number < 1 or number > 100:
            continue
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        block = text[m.end():end]

        marks = list(re.finditer(r'(?m)^\s*[（(]\s*([ABCDＡＢＣＤ])\s*[)）]\s*', block))
        if len(marks) < 4:
            continue

        # Only accept the first four choice markers. The remaining block may
        # contain explanation text that happens to mention (A)/(B)/(C)/(D).
        marks = marks[:4]
        if [normalize_answer(x.group(1)) for x in marks] != ['A', 'B', 'C', 'D']:
            continue

        question = clean(block[:marks[0].start()])
        choices = []
        for j, mark in enumerate(marks):
            end_choice = marks[j + 1].start() if j < 3 else len(block)
            choice = clean(block[mark.end():end_choice])
            # Cut off explanation/references after the fourth choice.
            if j == 3:
                choice = re.split(r'\n\s*解析\s*[:：]', choice, maxsplit=1)[0]
                choice = re.split(r'\n\s*看更多\s*[:：]?', choice, maxsplit=1)[0]
                choice = clean(choice)
            choices.append(choice)

        if not question or len(choices) != 4 or not all(choices):
            continue

        answer_match = re.search(
            r'解析\s*[:：]\s*[（(]\s*([ABCDＡＢＣＤ])\s*[)）]',
            block,
            re.I,
        )
        if not answer_match:
            # Some pages may omit the parenthesis but still explicitly state
            # the answer. Keep a conservative fallback.
            answer_match = re.search(
                r'解析\s*[:：]\s*([ABCDＡＢＣＤ])\b', block, re.I
            )
        if not answer_match:
            continue

        answer = normalize_answer(answer_match.group(1))
        if number in seen:
            continue
        seen.add(number)
        out.append({
            'number': number,
            'question': question,
            'choices': choices,
            'answer': 'ABCD'.index(answer),
        })

    # Keep the natural question order and reject malformed numbering.
    out.sort(key=lambda x: x['number'])
    if not out:
        return []
    return out


def page_url(year, slug):
    return f'{BASE}{year}-1-{slug}/' if year != '114' else f'{BASE}{year}-2-{slug}/'


def candidate_urls(year, slug):
    # Each year has an upper/lower exam. For 110–114 both sessions exist;
    # 115 currently has the upper session used by the site index.
    sessions = ['1', '2'] if year != '115' else ['1']
    return [f'{BASE}{year}-{session}-{slug}/' for session in sessions]


def detect_session(url, text, year):
    m = re.search(rf'{year}年?(上|下)', text)
    if m:
        return '1' if m.group(1) == '上' else '2'
    m = re.search(rf'{year}[- ]([12])', text)
    if m:
        return m.group(1)
    m = re.search(rf'{year}-(1|2)', url)
    return m.group(1) if m else None


def build_one(year, subject, slug):
    # Try the site's conventional URL directly. If a page is unavailable,
    # return a transparent failure rather than substituting another source.
    urls = candidate_urls(year, slug)
    pages = []
    for url in urls:
        try:
            text = fetch(url)
            if f'{year}' in text and ('社工師歷屆試題' in text or subject in text):
                pages.append((url, text))
        except Exception:
            continue

    if not pages:
        return [], {
            'year': year,
            'subject': subject,
            'error': f'找不到社工日常頁面：{urls}'
        }

    items = []
    failures = []
    for url, text in pages:
        questions = parse_questions(text)
        if not questions:
            failures.append({'url': url, 'error': '頁面存在，但沒有解析到完整四選一題目與答案'})
            continue

        session = detect_session(url, text, year) or ('1' if '-1-' in url else '2')
        for q in questions:
            items.append({
                'id': f'{year}-{session}-{subject}-{q["number"]}',
                'year': year,
                'session': session,
                'subject': subject,
                'number': q['number'],
                'question': q['question'],
                'choices': q['choices'],
                'answer': q['answer'],
                'source': url,
                'answer_source': url,
                'source_name': '社工日常socialworkerdaily',
                'corrected': False,
            })

    return items, {
        'year': year,
        'subject': subject,
        'pages_found': len(pages),
        'failures': failures,
    }


def main():
    jobs = [(year, subject, slug) for year in YEARS for subject, slug in SUBJECTS.items()]
    all_items = []
    failures = []

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(build_one, *job): job for job in jobs}
        for fut in as_completed(futures):
            year, subject, _ = futures[fut]
            try:
                items, meta = fut.result()
                all_items.extend(items)
                if meta.get('failures'):
                    failures.extend(meta['failures'])
                if not items:
                    failures.append(meta)
                else:
                    print('OK', year, subject, len(items))
            except Exception as e:
                failures.append({'year': year, 'subject': subject, 'error': str(e)})
                print('FAIL', year, subject, e)

    # The site can expose the same post through category pages. De-duplicate
    # by year/session/subject/question number while preserving the first source.
    unique = {}
    for item in all_items:
        unique[item['id']] = item
    all_items = list(unique.values())
    all_items.sort(key=lambda x: (x['year'], x['session'], x['subject'], x['number']))

    papers = sorted({(x['year'], x['session'], x['subject']) for x in all_items})
    meta = {
        'generated_from': BASE + 'index/exam/',
        'source_name': '社工日常socialworkerdaily',
        'years': YEARS,
        'subjects': list(SUBJECTS.keys()),
        'papers_selected': len(papers),
        'papers_ok': len(papers),
        'papers_failed': len(failures),
        'items': len(all_items),
        'failures': failures,
        'parser_version': 'socialworkerdaily-1.0',
    }

    (DATA / 'bank.json').write_text(
        json.dumps({'meta': meta, 'questions': all_items}, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    print(json.dumps(meta, ensure_ascii=False, indent=2))

    # Fail loudly if the source produced no usable questions. A partial bank
    # must never be presented as a finished official question bank.
    if len(all_items) < 1000:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

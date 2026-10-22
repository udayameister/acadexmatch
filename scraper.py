"""
Universal Academic Faculty Web Scraper Engine
AcadeXMatch AI Platform

Features:
- Asynchronous & sync HTTP link exploration with priority scoring
- Discovers careers, recruitment, vacancy hubs up to depth 2
- Layout heuristics: HTML Tables, Job Cards, Accordions, Headings, Link Sections
- Strict faculty position filtering (Professors, Deans, Lecturers, Postdocs)
- Exclusion of administrative, non-teaching, and non-job pages
- Extraction of qualifications, pay scale (7th CPC/AICTE), experience, and deadlines
- Structured JSON output & interactive CLI runner

Usage:
  python scraper.py https://mits.ac.in/positionsoffered
  python scraper.py (prompts for URL)
  python scraper.py <url> --json-only
"""

import os
import sys
import re
import json
import heapq
import urllib.parse
from typing import List, Dict, Set, Tuple, Optional

# Third-party dependencies
try:
    import httpx
    from bs4 import BeautifulSoup
except ImportError:
    print("Required packages missing. Please install with: pip install httpx beautifulsoup4 pypdf")
    sys.exit(1)

try:
    from pypdf import PdfReader  # optional: reads vacancy notices published as PDF
    import io
    PDF_SUPPORT = True
except Exception:  # pragma: no cover
    PDF_SUPPORT = False

# Configure UTF-8 stdout for Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Browser headers for requests
DEFAULT_BROWSER_HEADERS: Dict[str, str] = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}

# Positive faculty / academic teaching & research keywords
FACULTY_TITLE_KEYWORDS = [
    r"\bprofessor\b",
    r"\bprof\b",
    r"\bassistant\s+professor\b",
    r"\bassociate\s+professor\b",
    r"\badjunct\s+professor\b",
    r"\bvisiting\s+professor\b",
    r"\bchair\s+professor\b",
    r"\bemeritus\b",
    r"\bfaculty\b",
    r"\bteaching\s+faculty\b",
    r"\bacademic\s+staff\b",
    r"\blecturer\b",
    r"\bsenior\s+lecturer\b",
    r"\breader\b",
    r"\binstructor\b",
    r"\bdean\b",
    r"\bpostdoc\b",
    r"\bpostdoctoral\b",
    r"\bresearch\s+associate\b",
    r"\bresearch\s+scientist\b",
    r"\bresearch\s+fellow\b",
    r"\bteaching\s+associate\b",
    r"\bteaching\s+fellow\b",
    r"\btenure[\s-]track\b",
    r"\bprincipal\s+investigator\b",
]

# Negative / Non-faculty administrative / manual staff keywords
NON_FACULTY_KEYWORDS = [
    r"\bdriver\b", r"\bcleaner\b", r"\bpeon\b", r"\battendant\b", r"\bplumber\b",
    r"\belectrician\b", r"\bgardener\b", r"\bcook\b", r"\bcanteen\b", r"\bsecurity\s+guard\b",
    r"\bwarden\b", r"\bnurse\b", r"\bpharmacist\b", r"\bstenographer\b", r"\bsteno\b",
    r"\btypist\b", r"\bdata\s+entry\b", r"\bclerk\b", r"\bstore\s*keeper\b", r"\boffice\s+assistant\b",
    r"\baccountant\b", r"\baccounts\s+officer\b", r"\baudit\s+officer\b", r"\bcaretaker\b",
    r"\bsweeper\b", r"\bcarpenter\b", r"\bhelper\b", r"\bbus\s+conductor\b", r"\bsports\s+coach\b",
    r"\bfitness\s+instructor\b", r"\bgym\s+(?:trainer|instructor)\b", r"\byoga\s+instructor\b",
    r"\bdriving\s+instructor\b", r"\bfaculty\s+development\s+program(?:me)?s?\b",
    r"\bdevelopment\s+program(?:me)?s?\b", r"\bfdp\b", r"\bworkshop\b", r"\bconference\b", r"\bsymposium\b",
    r"\bseminar\b", r"\bfaculty\s+profile\b", r"\bfaculty\s+directory\b", r"\bfaculty\s+list\b",
    r"\bmeet\s+our\s+faculty\b", r"\bfaculty\s+coordinator\b", r"\bfaculty\s+advisor\b",
    r"\bboard\s+of\s+studies\b", r"\bfaculty\s+exchange\b", r"\bfaculty\s+awards?\b",
    r"\bfaculty\s+achievements?\b", r"\bfaculty\s+publications?\b", r"\bexam\s+schedule\b",
    r"\bsyllabus\b", r"\bhow\s+to\s+apply\b", r"\beligibility\s+criteria\b",
    r"\bcampus\s+life\b", r"\bhostel\b",
]

COMPILED_FACULTY_RE = [re.compile(p, re.IGNORECASE) for p in FACULTY_TITLE_KEYWORDS]
COMPILED_NON_FACULTY_RE = [re.compile(p, re.IGNORECASE) for p in NON_FACULTY_KEYWORDS]

# Priority scoring patterns for URL discovery
HIGH_PRIORITY_RECRUITMENT_PATTERNS = [
    (re.compile(r"positionsoffered|positions-offered", re.I), 150),
    (re.compile(r"faculty[-_]recruitment|faculty[-_]openings|faculty[-_]positions|teaching[-_]positions", re.I), 140),
    (re.compile(r"dean[-_]positions?|vc[-_]?position", re.I), 120),
    (re.compile(r"current[-_]vacanc|academic[-_]openings?|faculty[-_]vacanc", re.I), 110),
    (re.compile(r"careers?|recruitment|current[-_]openings?|vacanc|jobs?|work[-_]with[-_]us|join[-_]us", re.I), 70),
    (re.compile(r"employment|advertisements?|notifications?|notices?", re.I), 40),
]

DISCARD_URL_PATTERNS = [
    re.compile(r"login|signin|signup|register|admission|apply[-_]online|fees?|syllabus|curriculum|exam|result", re.I),
    re.compile(r"alumni|sports|hostel|mess|gallery|campus[-_]life|events?|news|media|stories|story", re.I),
    re.compile(r"placement|recruiters|career[-_]guidance|career[-_]competency|career[-_]services|student[-_]career", re.I),
    re.compile(r"speaker|speakers|team|author|faculty[-_]profile|faculty[-_]directory|bio", re.I),
    re.compile(r"facebook|twitter|instagram|youtube|linkedin|whatsapp|mailto:|tel:|javascript:|#", re.I),
    re.compile(r"\.(jpg|jpeg|png|gif|svg|css|js|ico|mp4|zip|rar|docx?|xlsx?)($|\?)", re.I),
]


def is_faculty_requirement(title: str, text: str = "") -> bool:
    """Returns True ONLY if the item represents an academic faculty or research position."""
    title_lower = (title or "").lower().strip()
    text_lower = (text or "").lower()

    CATEGORY_LABELS = {
        "faculty", "faculty positions", "dean positions", "vc position",
        "open positions", "careers", "career", "recruitment", "our recruiters",
        "about us", "academics", "programmes", "admissions", "campus life",
        "facilities for faculty", "innovations by the faculty"
    }
    if title_lower in CATEGORY_LABELS or any(c in title_lower for c in ["facilities for faculty", "innovations by"]):
        return False

    if re.match(r"^(?:Prof\.?|Dr\.?|Shri|Mr\.?|Ms\.?)\s+", title.strip(), re.I):
        if not re.search(r"\b(in|of|for|department|school|engineering|science|arts|medicine|computing|law|assistant|associate)\b", title.strip(), re.I):
            return False

    has_faculty_in_title = any(pattern.search(title_lower) for pattern in COMPILED_FACULTY_RE)
    has_non_faculty_in_title = any(pattern.search(title_lower) for pattern in COMPILED_NON_FACULTY_RE)

    if has_non_faculty_in_title:
        return False

    if has_faculty_in_title:
        return True

    RECRUITMENT_PHRASE_RE = re.compile(
        r"\b(recruitment|vacanc|openings?|positions?|walk[-_\s]*in|hiring|advertisements?|advt|special\s+drive|employment)\b",
        re.IGNORECASE
    )
    if not RECRUITMENT_PHRASE_RE.search(title_lower):
        return False

    combined_sample = f"{title_lower} {text_lower[:1500]}"
    faculty_mentions = sum(1 for pattern in COMPILED_FACULTY_RE if pattern.search(combined_sample))
    non_faculty_mentions = sum(1 for pattern in COMPILED_NON_FACULTY_RE if pattern.search(combined_sample))

    return faculty_mentions >= 1 and faculty_mentions > non_faculty_mentions


# Labels used in recruitment notices; the value after a label runs until the next label.
FIELD_LABELS = {
    "qualification": r"(?:Essential\s+|Minimum\s+|Educational\s+)?Qualifications?|Eligibility(?:\s+Criteria)?",
    "experience": r"(?:Minimum\s+|Desirable\s+)?Experience",
    "salary": r"Salary|Pay\s*(?:Scale|Level|Band|Matrix)?|Emoluments?|Remuneration|Scale\s+of\s+Pay|Compensation",
    "deadline": r"Last\s+Date(?:\s+(?:for|of)\s+(?:receipt\s+of\s+)?(?:applications?|submission))?|Closing\s+Date|Deadline|Apply\s+(?:before|by)|Due\s+Date",
    "posts": r"(?:No\.?|Number)\s+of\s+(?:Posts?|Vacanc(?:y|ies)|Positions?)|Vacanc(?:y|ies)",
    "advt": r"Advt\.?\s*No\.?|Advertisement\s+No\.?|Notification\s+No\.?|Ref(?:erence)?\.?\s*No\.?",
    "department": r"Department|Dept\.?|School|Discipline",
}
_ANY_LABEL = "|".join(f"(?:{v})" for v in FIELD_LABELS.values())
# Where a value stops: the next label (without optional prefixes such as "Minimum"/"Desirable",
# so words like "desirable" stay part of the previous value).
_STOP_LABEL = re.sub(r"\(\?:(?:Essential|Minimum|Desirable)[^)]*\)\?", "", _ANY_LABEL)
_LABEL_RES = {
    k: re.compile(rf"(?:^|[\n|;•]|\s)(?:{v})\s*[:：\-–]\s*(.+?)(?=\s*(?:[\n|•]|\b(?:{_STOP_LABEL})\s*[:：\-–]|$))", re.IGNORECASE)
    for k, v in FIELD_LABELS.items()
}

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _clean(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    v = re.sub(r"\s+", " ", v).strip(" .;:,|-–")
    return v or None


def parse_deadline_iso(text: Optional[str]) -> Optional[str]:
    """Returns YYYY-MM-DD when the text contains an unambiguous date, else None."""
    if not text:
        return None
    t = text.strip()
    m = re.search(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b", t)  # Indian DD/MM/YYYY
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = y + 2000 if y < 100 else y
        if 1 <= d <= 31 and 1 <= mo <= 12:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", t)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b", t)
    if m and m.group(2)[:3].lower() in MONTHS:
        return f"{int(m.group(3)):04d}-{MONTHS[m.group(2)[:3].lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b", t)
    if m and m.group(1)[:3].lower() in MONTHS:
        return f"{int(m.group(3)):04d}-{MONTHS[m.group(1)[:3].lower()]:02d}-{int(m.group(2)):02d}"
    return None


def extract_faculty_details(title: str, text: str = "") -> Dict[str, Optional[str]]:
    """
    Extracts qualification, experience, pay, deadline, posts, advertisement number and department
    exactly as written in the listing. Anything not stated is returned as None (never a default).
    """
    combined = f"{title}\n{text}"
    details: Dict[str, Optional[str]] = {
        "qualification": None, "experience": None, "pay_level": None, "salary": None,
        "department": None, "deadline": None, "number_of_posts": None, "advt_no": None,
    }

    # 1. Labelled values ("Qualification: …", "Salary: …") — the most reliable source.
    for key, rx in _LABEL_RES.items():
        m = rx.search(combined)
        if m:
            val = _clean(m.group(1))
            if val and len(val) <= 400:
                target = {"salary": "salary", "posts": "number_of_posts", "advt": "advt_no"}.get(key, key)
                details[target] = val

    # 2. Unlabelled patterns, only for fields still missing.
    if not details["qualification"]:
        qual_match = re.search(
            r"(Ph\.?\s?D\.?(?:\s+(?:in|with|from)\s+[^;\n|]+)?|Doctorate(?:\s+degree)?(?:\s+in\s+[^;\n|]+)?|"
            r"Master(?:'s)?\s+Degree(?:\s+in\s+[^;\n|]+)?|M\.?\s?Tech\.?(?:\s+in\s+[^;\n|]+)?|M\.?E\.?\s+in\s+[^;\n|]+|"
            r"(?:UGC|CSIR)[\s-]NET[^;\n|]*|NET\s*/\s*S?L?ET[^;\n|]*)",
            combined, re.IGNORECASE)
        if qual_match:
            q = re.split(rf"(?i)\s+(?:{_ANY_LABEL})\s*[:：\-–]", qual_match.group(0))[0]
            q = re.split(r"(?i)\s+(?:Minimum\s+\d+|\d+\s+years?)\b", q)[0]
            details["qualification"] = _clean(q)

    if not details["experience"]:
        exp_match = re.search(
            r"((?:Minimum\s+(?:of\s+)?)?\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b[^;\n|]*?experience[^;\n|]*)",
            combined, re.IGNORECASE)
        if exp_match:
            e = re.split(rf"(?i)\s*(?:{_ANY_LABEL})\s*[:：\-–]", exp_match.group(0))[0]
            details["experience"] = _clean(e)

    if not details["salary"]:
        pay_match = re.search(
            r"((?:As\s+per\s+)?(?:the\s+)?(?:revised\s+)?(?:AICTE|UGC|7th\s+CPC|6th\s+CPC|Institute|University)\s+"
            r"(?:Pay\s*scales?|Pay\s+Matrix|norms|scale\s+of\s+pay)[^;\n|.]*|"
            r"(?:Rs\.?|INR|₹)\s*[\d.,]+(?:\s*(?:-|to|–)\s*(?:Rs\.?|INR|₹)?\s*[\d.,]+)?(?:\s*(?:LPA|Lakhs?|per\s+annum|p\.?a\.?|pm|per\s+month))?|"
            r"(?:Pay|Academic)\s+Level[\s-]*\d+[A-Za-z]?(?:\s*\([^)]*\))?|Level[\s-]*\d+[A-Za-z]?\s*\([^)]*\)|"
            r"Consolidated\s+(?:pay|salary)[^;\n|.]*|Negotiable|Best\s+in\s+the\s+industry)",
            combined, re.IGNORECASE)
        if pay_match:
            details["salary"] = _clean(pay_match.group(0))

    # A pay level ("Level 12") stated inside the salary text is kept as the pay level too.
    if details["salary"]:
        lvl = re.search(r"(?:Pay\s+|Academic\s+)?Level[\s-]*\d+[A-Za-z]?(?:\s*\([^)]*\))?", details["salary"], re.IGNORECASE)
        if lvl:
            details["pay_level"] = _clean(lvl.group(0))

    if not details["department"]:
        dept_match = re.search(
            r"(?:Department|Dept\.?|School|Discipline)\s+of\s+([A-Z][A-Za-z\s&,()]+?)(?=[,.\n|;]|$)",
            combined)
        if dept_match:
            details["department"] = _clean(dept_match.group(0))

    if not details["deadline"]:
        dl = re.search(
            r"(?:Last\s+Date|Deadline|Closing\s+Date|Apply\s+(?:before|by))[^0-9A-Za-z]{0,5}"
            r"([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+[0-9]{4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})",
            combined, re.IGNORECASE)
        if dl:
            details["deadline"] = _clean(dl.group(1))
        elif re.search(r"\brolling\s+(?:advertisement|basis|recruitment)\b|\bopen\s+till\s+filled\b", combined, re.IGNORECASE):
            details["deadline"] = _clean(re.search(r"rolling\s+\w+|open\s+till\s+filled", combined, re.IGNORECASE).group(0))

    if not details["advt_no"]:
        adv = re.search(r"\b(?:Advt|Advertisement)\.?\s*No\.?\s*[:.]?\s*([A-Z0-9][A-Za-z0-9/._-]{2,40})", combined, re.IGNORECASE)
        if adv:
            details["advt_no"] = _clean(adv.group(1))

    return details


def score_link(href: str, text: str, base_url: str) -> int:
    """Calculates relevance score of an internal link for faculty recruitment."""
    combined = f"{href} {text}".lower()
    for pattern in DISCARD_URL_PATTERNS:
        if pattern.search(href) and not (href.lower().endswith(".pdf") and any(k in combined for k in ["faculty", "recruit", "prof", "advt"])):
            return -100

    try:
        base_domain = urllib.parse.urlparse(base_url).netloc.lower().replace("www.", "")
        target_domain = urllib.parse.urlparse(href).netloc.lower().replace("www.", "")
        if target_domain and target_domain != base_domain and not target_domain.endswith("." + base_domain):
            return -100
    except Exception:
        return -100

    score = 0
    for pattern, weight in HIGH_PRIORITY_RECRUITMENT_PATTERNS:
        if pattern.search(href):
            score += weight
        if pattern.search(text):
            score += weight

    return score


def fetch_html(url: str, timeout: int = 15) -> Tuple[Optional[str], Optional[str]]:
    """Fetches HTML with httpx, following redirects and meta refreshes."""
    try:
        with httpx.Client(headers=DEFAULT_BROWSER_HEADERS, follow_redirects=True, verify=False, timeout=timeout) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                ctype = resp.headers.get("content-type", "").lower()
                if "pdf" in ctype or resp.content[:5] == b"%PDF-" or not ("html" in ctype or "xml" in ctype or ctype.startswith("text/") or not ctype):
                    return None, None
                final_url = str(resp.url)
                text = resp.text
                
                soup_temp = BeautifulSoup(text[:2000], "html.parser")
                meta_refresh = soup_temp.find("meta", attrs={"http-equiv": re.compile(r"refresh", re.I)})
                if meta_refresh and meta_refresh.get("content"):
                    match = re.search(r"url=([^\s;]+)", meta_refresh["content"], re.I)
                    if match:
                        redirect_target = urllib.parse.urljoin(final_url, match.group(1).strip("'\""))
                        if redirect_target != final_url:
                            resp2 = client.get(redirect_target)
                            if resp2.status_code == 200:
                                return resp2.text, str(resp2.url)
                return text, final_url
    except Exception:
        pass
    return None, None


MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 15
MAX_PDFS_PER_CRAWL = 8
PDF_HINT_RE = re.compile(r"recruit|faculty|professor|advt|advertisement|vacanc|teaching|notification|career|job", re.I)
DESIGNATION_RE = re.compile(r"\b(?:Assistant|Associate)\s+Professor\b|\bProfessor\b|\bLecturer\b|\bPrincipal\b|\bDirector\b|\bDean\b", re.I)


def is_pdf_url(url: str) -> bool:
    return bool(re.search(r"\.pdf($|[?#])", url, re.IGNORECASE))


def fetch_pdf_text(url: str, timeout: int = 25) -> Tuple[Optional[str], Optional[str]]:
    """Downloads a PDF notice and returns (text, note). text is None when nothing could be read."""
    if not PDF_SUPPORT:
        return None, "PDF reading is not installed (pip install pypdf)"
    try:
        with httpx.Client(headers=DEFAULT_BROWSER_HEADERS, follow_redirects=True, verify=False, timeout=timeout) as client:
            with client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    return None, f"PDF not available (HTTP {resp.status_code})"
                data = b""
                for chunk in resp.iter_bytes():
                    data += chunk
                    if len(data) > MAX_PDF_BYTES:
                        return None, "PDF is larger than 10 MB"
        if not data.startswith(b"%PDF-"):
            return None, "Link is not a PDF"
        reader = PdfReader(io.BytesIO(data))
        pages = []
        for page in reader.pages[:MAX_PDF_PAGES]:
            try:
                pages.append(page.extract_text() or "")
            except Exception:
                pages.append("")
        text = "\n".join(pages)
        text = re.sub(r"[ \t ]+", " ", text)
        text = re.sub(r"\n\s*\n+", "\n", text).strip()
        if len(text) < 60:
            return None, "Scanned PDF (no readable text)"
        return text, None
    except Exception as e:  # corrupt or encrypted PDF
        return None, f"Could not read PDF ({type(e).__name__})"


def pdf_segment_for(position: str, text: str) -> Tuple[str, bool]:
    """
    Returns the part of the notice that belongs to this position, and whether that could be
    determined. A notice listing several designations is only trusted for the part that follows
    the position's own designation; values elsewhere might belong to another post.
    """
    designations = {re.sub(r"\s+", " ", m.group(0).lower()) for m in DESIGNATION_RE.finditer(text)}
    if len(designations) <= 1:
        return text, True
    own = DESIGNATION_RE.search(position)
    if not own:
        return text, False
    key = r"\s+".join(re.escape(w) for w in own.group(0).split())
    m = re.search(rf"(?m)^\s*{key}\b", text, re.IGNORECASE) or re.search(rf"(?<![A-Za-z]\s){key}\b", text, re.IGNORECASE)
    if not m:
        return text, False
    start = m.start()
    nxt = None
    for d in DESIGNATION_RE.finditer(text, m.end()):
        if d.group(0).lower() != own.group(0).lower():
            nxt = d
            break
    end = nxt.start() if nxt else min(len(text), start + 2500)
    return text[start:end], True


def pdf_title(text: str) -> Optional[str]:
    """A heading line from the notice that names a faculty recruitment, used when the link text is generic."""
    for line in text.splitlines()[:40]:
        line = line.strip()
        if 10 < len(line) < 160 and is_faculty_requirement(line):
            return _clean(line)
    return None


def pdf_post_headings(text: str) -> List[str]:
    """Short lines that are just a designation (\"Associate Professor\", \"Professor - Civil\") mark separate posts."""
    out: List[str] = []
    for line in text.splitlines():
        line = line.strip()
        if 5 <= len(line) <= 80 and DESIGNATION_RE.match(line) and ":" not in line and line not in out:
            out.append(_clean(line))
    return [h for h in out if h]


NOTICE_WIDE_RES = {
    "deadline": re.compile(r"(?:Last\s+Date|Deadline|Closing\s+Date|Apply\s+(?:before|by))[^0-9A-Za-z]{0,5}([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+[0-9]{4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})", re.I),
    "advt_no": re.compile(r"\b(?:Advt|Advertisement)\.?\s*No\.?\s*[:.]?\s*([A-Z0-9][A-Za-z0-9/._-]{2,40})", re.I),
}


def notice_wide_values(text: str) -> Dict[str, str]:
    """Last date and advertisement number, only when the whole notice states exactly one value."""
    out: Dict[str, str] = {}
    for key, rx in NOTICE_WIDE_RES.items():
        vals = {_clean(m.group(1)) for m in rx.finditer(text)}
        vals.discard(None)
        if len(vals) == 1:
            out[key] = vals.pop()
    return out


def enrich_from_pdfs(openings: List[Dict], pdf_links: List[Tuple[str, str]], verbose: bool = True) -> List[Dict]:
    """
    Reads PDF notices linked from the crawled pages. Values are copied exactly as written in the
    PDF and only fill fields the web page itself did not state.
    """
    budget = MAX_PDFS_PER_CRAWL
    cache: Dict[str, Tuple[Optional[str], Optional[str]]] = {}

    def text_for(url: str):
        nonlocal budget
        if url not in cache:
            if budget <= 0:
                return None, "PDF limit for one run reached"
            budget -= 1
            if verbose:
                print(f"  📄 Reading PDF notice: {url}", flush=True)
            cache[url] = fetch_pdf_text(url)
        return cache[url]

    # PDFs whose link text was generic ("Click here", "Advertisement") but look like recruitment notices.
    known = {o.get("source_url") for o in openings}
    for url, anchor in pdf_links:
        if url in known:
            continue
        text, note = text_for(url)
        if not text or not is_faculty_requirement(anchor or "", text[:3000]):
            continue
        title = pdf_title(text)
        if not title:
            continue
        known.add(url)
        posts = pdf_post_headings(text)
        if len(posts) >= 2:
            for heading in posts:
                openings.append({"position": heading, "department": None, "description": heading, "source_url": url, "layout": "PDF Notice", "notice_title": title})
        else:
            openings.append({"position": title, "department": None, "description": title, "source_url": url, "layout": "PDF Notice"})

    for item in openings:
        url = item.get("source_url") or ""
        if not is_pdf_url(url):
            continue
        text, note = text_for(url)
        if not text:
            item["pdf_note"] = note
            continue
        segment, certain = pdf_segment_for(item["position"], text)
        item["pdf_text"] = segment if certain else ""
        item["pdf_wide"] = notice_wide_values(text)
        item["pdf_note"] = None if certain else "Notice lists several posts; only notice-wide details (last date, advertisement no.) were used"
    return openings


def extract_faculty_from_page(soup: BeautifulSoup, page_url: str) -> List[Dict]:
    """Extracts faculty openings from a single page using multiple layout heuristics."""
    openings = []
    seen_titles = set()

    # 1. Academic HTML Tables
    current_dept = None
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        headers: List[str] = []
        for row in rows:
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            if all(c.name == "th" for c in cells):
                headers = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)) for c in cells]
                continue

            cell_texts = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)) for c in cells]
            # Prefix each cell with its column heading so labelled extraction can read it.
            labelled = (
                [f"{h}: {v}" if h else v for h, v in zip(headers, cell_texts) if v]
                if headers and len(headers) == len(cell_texts) else cell_texts
            )

            if len(cell_texts) == 1:
                header = cell_texts[0]
                if len(header) < 140 and not is_faculty_requirement(header):
                    current_dept = header
                continue

            pos = None
            desc = ""
            dept = current_dept

            link_tag = row.find("a", href=True)
            apply_link = urllib.parse.urljoin(page_url, link_tag["href"]) if link_tag else page_url

            if len(cell_texts) >= 3:
                if is_faculty_requirement(cell_texts[1]):
                    dept = cell_texts[0]
                    current_dept = dept
                    pos = cell_texts[1]
                    desc = " | ".join(labelled[2:])
                elif is_faculty_requirement(cell_texts[0]):
                    pos = cell_texts[0]
                    dept = current_dept
                    desc = " | ".join(labelled[1:])
                elif is_faculty_requirement(cell_texts[2]):
                    dept = cell_texts[1]
                    current_dept = dept
                    pos = cell_texts[2]
                    desc = " | ".join(labelled[3:])
            elif len(cell_texts) == 2:
                if is_faculty_requirement(cell_texts[0]):
                    pos = cell_texts[0]
                    desc = cell_texts[1]
                elif is_faculty_requirement(cell_texts[1]):
                    pos = cell_texts[1]
                    desc = cell_texts[0]

            if pos and is_faculty_requirement(pos, desc):
                item_key = f"{pos.lower().strip()}_{str(dept).lower().strip()}"
                if item_key not in seen_titles:
                    seen_titles.add(item_key)
                    openings.append({
                        "position": pos,
                        "department": dept,
                        "description": desc,
                        "source_url": apply_link,
                        "layout": "HTML Table"
                    })

    # 2. Job Cards & Accordions
    for card in soup.find_all(["div", "li", "section", "article"], class_=re.compile(r"job|career|vacancy|opening|position|post|accordion|card", re.I)):
        title_el = card.find(["h1", "h2", "h3", "h4", "h5", "h6", "strong", "a"])
        if not title_el:
            continue

        raw_title = re.sub(r"\s+", " ", title_el.get_text(" ", strip=True)).strip()
        full_text = re.sub(r"\s+", " ", card.get_text(" ", strip=True)).strip()

        if is_faculty_requirement(raw_title, full_text) and 5 < len(raw_title) < 140 and raw_title not in seen_titles:
            seen_titles.add(raw_title)
            link = card.find("a", href=True)
            url = urllib.parse.urljoin(page_url, link["href"]) if link else page_url
            openings.append({
                "position": raw_title,
                "department": None,
                "description": full_text,
                "source_url": url,
                "layout": "Job Card"
            })

    # 3. Headings with following descriptions
    for h in soup.find_all(["h2", "h3", "h4", "h5"]):
        title = re.sub(r"\s+", " ", h.get_text(" ", strip=True)).strip()
        if not is_faculty_requirement(title) or len(title) > 140 or title in seen_titles:
            continue

        desc_parts = []
        curr = h.next_sibling
        count = 0
        while curr and count < 3:
            if hasattr(curr, "get_text"):
                t = curr.get_text(" ", strip=True)
                if t:
                    desc_parts.append(t)
                    count += 1
            curr = curr.next_sibling

        desc = " ".join(desc_parts)
        seen_titles.add(title)
        link = h.find("a", href=True)
        url = urllib.parse.urljoin(page_url, link["href"]) if link else page_url
        openings.append({
            "position": title,
            "department": None,
            "description": desc,
            "source_url": url,
            "layout": "Heading Section"
        })

    # 4. Direct Faculty Opening Links
    for a in soup.find_all("a", href=True):
        raw_href = a["href"].strip()
        href_lower = raw_href.lower()
        if any(bad in href_lower for bad in ["/speaker/", "/speakers/", "/team/", "/author/", "/profile/", "/people/", "/category/", "/doctoral/", "/centers/"]):
            continue

        link_text = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).strip()
        if 8 < len(link_text) < 180 and is_faculty_requirement(link_text) and link_text not in seen_titles:
            seen_titles.add(link_text)
            full_url = urllib.parse.urljoin(page_url, raw_href)
            openings.append({
                "position": link_text,
                "department": None,
                "description": link_text,
                "source_url": full_url,
                "layout": "Direct Job Link"
            })

    return openings


def crawl_college_in_depth(start_url: str, max_pages: int = 12, max_depth: int = 2, verbose: bool = True) -> Dict:
    """Crawls any college website in depth to find faculty recruitment notices."""
    if not start_url.startswith("http://") and not start_url.startswith("https://"):
        start_url = "https://" + start_url

    if verbose:
        print("\n" + "=" * 80, flush=True)
        print(f"🕵️  UNIVERSAL DEEP FACULTY CRAWLER INITIALIZED", flush=True)
        print(f"🌐 Seed Target:   {start_url}", flush=True)
        print(f"🔍 Max Crawl Depth: {max_depth} levels | Max Pages: {max_pages}", flush=True)
        print("=" * 80, flush=True)

    queue = [(-200, 0, start_url)]
    visited: Set[str] = set()
    discovered_career_pages: List[str] = []
    all_raw_openings: List[Dict] = []
    pdf_links: List[Tuple[str, str]] = []
    institution_title = ""

    pages_crawled = 0

    while queue and pages_crawled < max_pages:
        neg_score, depth, current_url = heapq.heappop(queue)
        clean_url = current_url.split("#")[0].rstrip("/")
        if clean_url in visited:
            continue
        visited.add(clean_url)
        pages_crawled += 1

        if verbose:
            print(f"\n[{pages_crawled}/{max_pages}] [Depth {depth}] Fetching: {current_url}", flush=True)
        html, final_url = fetch_html(current_url)
        if not html:
            if verbose:
                print("  ⚠️ Could not fetch page or empty response, skipping.", flush=True)
            continue

        soup = BeautifulSoup(html, "html.parser")
        if not institution_title and soup.title and soup.title.string:
            institution_title = soup.title.string.strip()

        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        page_openings = extract_faculty_from_page(soup, final_url or current_url)
        if page_openings:
            if verbose:
                print(f"  🎯 Found {len(page_openings)} faculty opening(s) on this page!", flush=True)
            all_raw_openings.extend(page_openings)
            hub_entry = final_url or current_url
            if hub_entry not in discovered_career_pages:
                discovered_career_pages.append(hub_entry)

        if depth >= max_depth:
            for a in soup.find_all("a", href=True):
                abs_url = urllib.parse.urljoin(final_url or current_url, a["href"].strip())
                anchor_text = a.get_text(" ", strip=True)
                if is_pdf_url(abs_url) and PDF_HINT_RE.search(f"{abs_url} {anchor_text}") and all(u != abs_url for u, _ in pdf_links):
                    pdf_links.append((abs_url, anchor_text))

        if depth < max_depth:
            child_links_found = 0
            for a in soup.find_all("a", href=True):
                raw_href = a["href"].strip()
                if not raw_href or raw_href.startswith("#"):
                    continue

                abs_url = urllib.parse.urljoin(final_url or current_url, raw_href)
                abs_clean = abs_url.split("#")[0].rstrip("/")
                if abs_clean in visited:
                    continue

                anchor_text = a.get_text(" ", strip=True)
                if is_pdf_url(abs_url):
                    if PDF_HINT_RE.search(f"{abs_url} {anchor_text}") and all(u != abs_url for u, _ in pdf_links):
                        pdf_links.append((abs_url, anchor_text))
                    continue
                score = score_link(abs_url, anchor_text, start_url)

                if score > 0:
                    child_links_found += 1
                    heapq.heappush(queue, (-score, depth + 1, abs_url))

            if child_links_found > 0 and verbose:
                print(f"  🔗 Discovered {child_links_found} candidate recruitment link(s) to explore in depth.", flush=True)

    all_raw_openings = enrich_from_pdfs(all_raw_openings, pdf_links, verbose)

    final_vacancies = []
    seen_dedup = set()

    for item in all_raw_openings:
        pos = item["position"]
        desc = item.get("description", "") or ""
        details = extract_faculty_details(pos, desc)
        from_pdf = False
        if item.get("pdf_text"):
            pdf_details = extract_faculty_details(pos, item["pdf_text"])
            for k, v in pdf_details.items():
                if v and not details.get(k):
                    details[k] = v
                    from_pdf = True
        for k, v in (item.get("pdf_wide") or {}).items():
            if v and not details.get(k):
                details[k] = v
                from_pdf = True

        # Only values found on the page; None means "not stated in the source".
        dept = item.get("department") or details.get("department")
        dedup_key = f"{re.sub(r'[^a-z0-9]', '', pos.lower())}_{re.sub(r'[^a-z0-9]', '', str(dept or '').lower())}"

        if dedup_key in seen_dedup:
            continue
        seen_dedup.add(dedup_key)

        body = desc[len(pos):].strip() if desc.startswith(pos) else desc
        if not body and item.get("pdf_text"):
            body = item["pdf_text"]
        raw_text = re.sub(r"\s+", " ", f"{pos} | {body}" if body else pos).strip()
        final_vacancies.append({
            "position": pos,
            "department": _clean(dept),
            "qualification": details.get("qualification"),
            "experience": details.get("experience"),
            "pay_scale": details.get("pay_level") or details.get("salary"),
            "pay_level": details.get("pay_level"),
            "salary": details.get("salary"),
            "deadline": details.get("deadline"),
            "deadline_iso": parse_deadline_iso(details.get("deadline")),
            "number_of_posts": details.get("number_of_posts"),
            "advt_no": details.get("advt_no"),
            "description": raw_text[:1500] if raw_text else None,
            "source_url": item.get("source_url") or start_url,
            "extraction_layout": item.get("layout", "Direct"),
            "details_from_pdf": from_pdf,
            "pdf_note": item.get("pdf_note"),
        })

    return {
        "start_url": start_url,
        "institution_title": institution_title or None,
        "pages_crawled": pages_crawled,
        "career_hubs_discovered": discovered_career_pages,
        "pdf_notices_read": len([1 for o in all_raw_openings if o.get("pdf_text")]),
        "pdf_support": PDF_SUPPORT,
        "total_openings": len(final_vacancies),
        "openings": final_vacancies
    }


def print_crawl_results(data: Dict):
    """Prints formatted console output."""
    openings = data.get("openings", [])
    hubs = data.get("career_hubs_discovered", [])

    print("\n" + "=" * 80, flush=True)
    print("🎓 DEEP CRAWL SUMMARY & FACULTY OPENINGS", flush=True)
    print("=" * 80, flush=True)
    print(f"🏛️  Institution:          {data.get('institution_title')}", flush=True)
    print(f"🌐 Seed URL:             {data.get('start_url')}", flush=True)
    print(f"📄 Total Pages Crawled:  {data.get('pages_crawled')}", flush=True)
    print(f"🎯 Total Faculty Found:  {len(openings)}", flush=True)
    if hubs:
        print("🔗 Active Recruitment Hubs Discovered:", flush=True)
        for h in hubs:
            print(f"    👉 {h}", flush=True)
    print("=" * 80, flush=True)

    if not openings:
        print("\n⚠️  No faculty recruitment openings found after deep-crawling candidate pages.", flush=True)
        print("=" * 80 + "\n", flush=True)
        return

    for idx, job in enumerate(openings, 1):
        print(f"\n[{idx}] 📌 Role:        {job['position']}", flush=True)
        print(f"    🏢 Department:  {job['department'] or 'Not specified'}", flush=True)
        print(f"    🎓 Requirement: {job['qualification'] or 'Not specified'}", flush=True)
        print(f"    ⏱️  Experience:  {job['experience'] or 'Not specified'}", flush=True)
        print(f"    💰 Pay Scale:   {job['pay_scale'] or 'Not specified'}", flush=True)
        print(f"    📅 Deadline:    {job['deadline'] or 'Not specified'}", flush=True)
        print(f"    🔗 Direct Link:  {job['source_url']}", flush=True)
        print(f"    ⚙️  Source:      {job['extraction_layout']}", flush=True)
        print("-" * 80, flush=True)


def main():
    json_only = "--json-only" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--json-only"]

    if args:
        target_url = args[0].strip()
    else:
        if json_only:
            print(json.dumps({"error": "No URL provided"}))
            sys.exit(1)
        print("\n" + "=" * 65)
        print("🎓 AcadeXMatch AI — Universal College Faculty Scraper")
        print("=" * 65)
        print("Enter any university or college website URL (homepage or careers page).")
        print("Example: https://mits.ac.in/positionsoffered")
        print("=" * 65)
        try:
            target_url = input("\nEnter College URL: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExited.")
            sys.exit(0)

    if not target_url:
        if json_only:
            print(json.dumps({"error": "No URL provided"}))
        else:
            print("❌ No target URL provided. Exiting.")
        sys.exit(1)

    result = crawl_college_in_depth(target_url, max_pages=12, max_depth=2, verbose=not json_only)

    if json_only:
        print(json.dumps(result, ensure_ascii=False))
        return

    print_crawl_results(result)

    # Save to data directory
    workspace_root = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(workspace_root, "data")
    os.makedirs(data_dir, exist_ok=True)

    domain_match = re.search(r"https?://(?:www\.)?([^/]+)", target_url)
    domain_clean = domain_match.group(1).replace(".", "_") if domain_match else "scraped"
    out_file = os.path.join(data_dir, f"faculty_openings_{domain_clean}.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\n💾 Saved structured results to: {out_file}\n")


if __name__ == "__main__":
    main()

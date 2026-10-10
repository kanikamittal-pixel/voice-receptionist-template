"""Split the enquiries PDF into tests/transcripts/Txx.txt (phone section only).
Usage: python3 scripts/extract_transcripts.py "<path to pdf>"   (needs: pip install pypdf)"""
import re, sys, pathlib
from pypdf import PdfReader

pdf = sys.argv[1]
text = " ".join((p.extract_text() or "") for p in PdfReader(pdf).pages)
text = re.sub(r"\s+", " ", text)
# phone section only: from "SECTION 1" up to the next SECTION
m = re.search(r"SECTION 1\b.*?(?=SECTION 2\b|$)", text)
phone = m.group(0)
parts = re.split(r"(?=\bT\d{2} · Phone ·)", phone)
out = pathlib.Path(__file__).resolve().parent.parent / "tests" / "transcripts"
out.mkdir(parents=True, exist_ok=True)
n = 0
for part in parts:
    h = re.match(r"(T\d{2}) · Phone ·", part)
    if not h:
        continue
    tid = h.group(1)
    if tid == "T08":
        continue  # missed call: not a test case
    if tid == "T17":  # two calls: dropped first call, then callback (merge test)
        a, _, b = part.partition("Second call")
        for suffix, chunk in (("a", a), ("b", "Second call" + b)):
            chunk = re.sub(r"\s*(Front Desk:|Caller:|\(line drops\))", r"\n\1", chunk).strip()
            out.joinpath(f"T17{suffix}.txt").write_text(chunk + "\n")
        n += 2
        continue
    body = part[h.end():] if False else part
    header, _, rest = body.partition(" Front Desk:") if " Front Desk:" in body else (body, "", "")
    rest = ("Front Desk:" + rest) if rest else body
    rest = re.sub(r"\s*(Front Desk:|Caller:|Agent:|\[[^\]]{0,80}\])", r"\n\1", rest).strip()
    out.joinpath(f"{tid}.txt").write_text(header.strip() + "\n\n" + rest + "\n")
    n += 1
print("wrote", n, "transcripts to", out)

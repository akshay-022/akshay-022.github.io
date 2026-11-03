"""Turn the site's pages into plain-text blocks for the copy editor.

Conventions in the text:
  # Heading / ## Section label / ### Sub-heading
  blank line between paragraphs
  - bullet, 1. numbered item
  [link text](url), **bold**, *italic*
  [video: ...] / [image: ...] / [tweet: ...]  placeholders for things that are not text
"""
import json, re, sys
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = sys.argv[1]
OUT = sys.argv[2]
PAGES = [("home", "Home", "index.html"), ("polymath", "Polymath", "polymath.html"),
         ("projects", "Projects", "projects.html"), ("thoughts", "Thoughts", "thoughts.html"),
         ("books", "Books", "books.html"), ("art", "Art", "art.html")]
ITEM = lambda t: isinstance(t, Tag) and (
    (t.name == "details" and "take" in t.get("class", [])) or
    (t.name == "div" and {"project-cell", "xp"} & set(t.get("class", []))))


def inline(node):
    out = []
    for c in node.children:
        if isinstance(c, NavigableString):
            out.append(str(c).replace("\n", " "))
        elif c.name == "a":
            href = c.get("href", "")
            out.append(f"[{squash(inline(c))}]({href})")
        elif c.name in ("strong", "b"):
            out.append(f"**{squash(inline(c))}**")
        elif c.name in ("em", "i"):
            out.append(f"*{squash(inline(c))}*")
        elif c.name == "br":
            out.append("\n")
        elif c.name == "img":
            out.append(f"[image: {c.get('src', '')}]")
        else:
            out.append(inline(c))
    return "".join(out)


def squash(s):
    lines = [re.sub(r"[ \t\r\f\v]+", " ", l).strip() for l in s.replace(" ", " ").split("\n")]
    return "\n".join(lines).strip()


def blocks_of(node):
    """Return a list of text chunks (paragraph-level) for a container."""
    chunks = []
    for c in node.children:
        if isinstance(c, NavigableString):
            if c.strip():
                chunks.append(squash(str(c).replace("\n", " ")))
            continue
        cls = set(c.get("class", []))
        if c.name in ("form", "button", "script", "style"):
            continue
        if c.name == "h1":
            chunks.append("# " + squash(inline(c)))
        elif c.name == "h2" or (c.name == "p" and "kicker" in cls):
            chunks.append("## " + squash(inline(c)))
        elif c.name == "h3" or c.name == "summary":
            chunks.append("### " + squash(inline(c)))
        elif c.name == "p":
            t = squash(inline(c))
            if t:
                chunks.append(t)
        elif c.name in ("ul", "ol"):
            items = []
            for i, li in enumerate(c.find_all("li", recursive=False), 1):
                mark = f"{i}." if c.name == "ol" else "-"
                items.append(f"{mark} " + squash(inline(li)).replace("\n", "\n   "))
            chunks.append("\n".join(items))
        elif c.name == "iframe":
            chunks.append(f"[video: {c.get('src', '')}]")
        elif c.name == "img":
            chunks.append(f"[image: {c.get('src', '')}]")
        elif c.name == "blockquote" and "twitter-tweet" in cls:
            a = c.find("a")
            chunks.append(f"[tweet: {a.get('href') if a else ''}]")
        elif c.name == "div" and "essay-item" in cls:
            a = c.find("a"); d = c.find(class_="date")
            chunks.append(f"- [{squash(inline(a))}]({a.get('href')}) | {squash(d.get_text()) if d else ''}")
        elif c.name == "div" and "sub" in cls:
            chunks.append(squash(inline(c)))
        elif c.name == "div" and "links" in cls:
            chunks.append("  ".join(f"[{squash(inline(a))}]({a.get('href')})" for a in c.find_all("a")))
        else:
            chunks.extend(blocks_of(c))
    merged = []
    for x in [x for x in chunks if x]:
        if merged and x.startswith("- ") and merged[-1].split("\n")[-1].startswith("- "):
            merged[-1] += "\n" + x
        else:
            merged.append(x)
    return merged


def label_for(item, fallback):
    for sel in ("summary", "h3", "h2", "h1", ".kicker"):
        h = item.select_one(sel)
        if h and h.get_text(strip=True):
            return squash(h.get_text(" "))
    return fallback


def section_label(sec, fallback):
    for sel in (".kicker", "h2", "h1"):
        h = sec.select_one(sel)
        if h and h.get_text(strip=True):
            return squash(h.get_text(" "))
    p = sec.find("p")
    return (squash(p.get_text(" "))[:40] + "...") if p else fallback


out = []
for page_order, (slug, page_label, fname) in enumerate(PAGES):
    soup = BeautifulSoup(open(f"{ROOT}/{fname}").read(), "html.parser")
    wrap = soup.select_one(".wrap")
    n = 0
    for top in wrap.find_all(["header", "section"], recursive=False):
        if top.find("form", class_="subscribe"):
            continue
        items = [t for t in top.find_all(ITEM)]
        if items:
            # the section's own text first, then each item on its own
            shell = BeautifulSoup(str(top), "html.parser").find(top.name)
            for t in shell.find_all(ITEM):
                t.decompose()
            # drop now-empty grid wrappers
            intro = "\n\n".join(blocks_of(shell))
            if intro.strip():
                n += 1
                out.append(dict(id=f"{slug}-{n:02d}", page=page_label, pageOrder=page_order, order=n,
                                label=section_label(top, "Section intro"), text=intro))
            for it in items:
                n += 1
                out.append(dict(id=f"{slug}-{n:02d}", page=page_label, pageOrder=page_order, order=n,
                                label=label_for(it, "Item"), text="\n\n".join(blocks_of(it) if it.name != "details" else
                                    blocks_of(it))))
        else:
            n += 1
            label = "Top of page" if top.name == "header" else section_label(top, "Section")
            out.append(dict(id=f"{slug}-{n:02d}", page=page_label, pageOrder=page_order, order=n,
                            label=label, text="\n\n".join(blocks_of(top))))

for b in out:
    b["synced"] = b["text"]
json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
print(len(out), "blocks")
for b in out:
    print(f"{b['id']:14s} {b['label'][:60]:60s} {len(b['text']):5d}")

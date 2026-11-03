"""Apply changed copy-editor boxes to the site's HTML.

usage: sync.py <docs_dir> <site_root>
Prints a report; writes the page files in place.
"""
import json, glob, os, re, sys, html, textwrap

DOCS, ROOT = sys.argv[1], sys.argv[2]
FILES = {"Home": "index.html", "Polymath": "polymath.html", "Projects": "projects.html",
         "Thoughts": "thoughts.html", "Books": "books.html", "Art": "art.html"}


def inline(t):
    t = html.escape(t.strip(), quote=False)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return t


def wrap(t, ind):
    return textwrap.fill(t, width=92, initial_indent=" " * ind, subsequent_indent=" " * ind,
                         break_long_words=False, break_on_hyphens=False)


def chunks(text):
    return [c.strip("\n") for c in re.split(r"\n\s*\n", text.strip()) if c.strip()]


def heading(text):
    for c in chunks(text):
        m = re.match(r"^(#{1,3}) (.+)$", c.strip())
        if m:
            return len(m.group(1)), m.group(2).strip()
    return None, None


def render(text, ind, sec_heading_tag, lede=False, titles=None):
    """Body markup for a hero/section from plain text."""
    out = []
    p_open = '<p class="lede">' if lede else "<p>"
    for c in chunks(text):
        first = c.split("\n")[0]
        if c.startswith("# "):
            out.append(" " * ind + f"<h1>{inline(c[2:])}</h1>")
        elif c.startswith("## "):
            if sec_heading_tag == "h2":
                out.append(" " * ind + f"<h2>{inline(c[3:])}</h2>")
            else:
                out.append(" " * ind + f'<p class="kicker">{inline(c[3:])}</p>')
        elif c.startswith("### "):
            out.append(" " * ind + f"<h3>{inline(c[4:])}</h3>")
        elif re.match(r"^\[video: (.+)\]$", c):
            src = re.match(r"^\[video: (.+)\]$", c).group(1)
            title = (titles or {}).get(src, "Video")
            out.append(" " * ind + f'<iframe class="embed" src="{src}" title="{title}" loading="lazy" allowfullscreen></iframe>')
        elif re.match(r"^1\. ", first):
            items = re.split(r"\n(?=\d+\. )", c)
            out.append(" " * ind + '<ol class="numbered">')
            for it in items:
                body = re.sub(r"^\d+\. ", "", it).replace("\n", " ")
                out.append(" " * (ind + 2) + "<li>\n" + wrap(inline(body), ind + 4) + "\n" + " " * (ind + 2) + "</li>")
            out.append(" " * ind + "</ol>")
        elif first.startswith("- "):
            items = re.split(r"\n(?=- )", c)
            out.append(" " * ind + '<ul class="plain">')
            for it in items:
                body = inline(it[2:].replace("\n", " "))
                w = wrap("<li>" + body + "</li>", ind + 2)
                out.append(w)
            out.append(" " * ind + "</ul>")
        else:
            out.append(" " * ind + p_open + "\n" + wrap(inline(c.replace("\n", " ")), ind + 2) + "\n" + " " * ind + "</p>")
    return "\n".join(out)


def find_section(s, old_heading):
    esc = html.escape(old_heading, quote=False)
    for m in re.finditer(r'    <section class="block"[^>]*>\n.*?\n    </section>\n', s, re.S):
        blk = m.group(0)
        if re.search(r'(<p class="kicker">|<h2>)' + re.escape(esc) + r"(</p>|</h2>)", blk):
            return m
    return None


def find_take(s, old_title):
    esc = html.escape(old_title, quote=False)
    return re.search(r'\n[ \t]*<details class="take">\s*<summary>' + re.escape(esc) + r"</summary>.*?</details>\n", s, re.S)


docs = {}
for f in glob.glob(DOCS + "/*.json"):
    j = json.load(open(f)); d = j.get("data", j)
    d["id"] = os.path.basename(f)[:-5]; d["version"] = j.get("version")
    docs[d["id"]] = d

changed = [d for d in docs.values() if d["text"] != d["synced"]]
pages = {}
report = []
for d in sorted(changed, key=lambda x: (x["pageOrder"], x["order"])):
    fname = FILES[d["page"]]
    s = pages.get(fname) or open(f"{ROOT}/{fname}").read()
    lvl, old_h = heading(d["synced"])
    empty = not d["text"].strip()
    is_take = lvl == 3 and d["page"] == "Thoughts"
    is_hero = d["label"] == "Top of page"
    if is_hero:
        m = re.search(r'    <header class="hero">\n.*?\n    </header>', s, re.S)
        new = '    <header class="hero">\n' + render(d["text"], 6, "kicker", lede=True) + "\n    </header>"
        s = s[:m.start()] + new + s[m.end():]
        report.append(f"{d['id']}: hero rebuilt")
    elif is_take:
        m = find_take(s, old_h)
        assert m, (d["id"], old_h)
        if empty:
            s = s[:m.start()] + "\n" + s[m.end():]
            report.append(f"{d['id']}: take '{old_h}' removed")
        else:
            _, new_h = heading(d["text"])
            body = "\n\n".join(c for c in chunks(d["text"]) if not c.startswith("### "))
            new = ("\n      <details class=\"take\">\n        <summary>" + inline(new_h) + "</summary>\n        <div class=\"body\">\n"
                   + render(body, 10, "kicker") + "\n        </div>\n      </details>\n")
            s = s[:m.start()] + new + s[m.end():]
            report.append(f"{d['id']}: take '{old_h}' -> '{new_h}'")
    else:
        m = find_section(s, old_h) if old_h else None
        if m is None and d["id"] == "polymath-04":
            m = re.search(r'    <section class="block">\n      <p><a class="btn"[^\n]*\n    </section>\n', s)
        assert m, (d["id"], old_h)
        old_blk = m.group(0)
        if empty:
            s = s[:m.start()] + s[m.end():]
            report.append(f"{d['id']}: section '{old_h}' removed")
        else:
            tag = "h2" if "<h2>" in old_blk else "kicker"
            titles = {a: b for a, b in re.findall(r'<iframe class="embed" src="([^"]+)" title="([^"]*)"', old_blk)}
            open_tag = re.match(r'    <section class="block"[^>]*>', old_blk).group(0)
            new = open_tag + "\n" + render(d["text"], 6, tag, titles=titles) + "\n    </section>\n"
            s = s[:m.start()] + new + s[m.end():]
            report.append(f"{d['id']}: section '{old_h}' rebuilt")
    pages[fname] = s

# a section left holding only its label has nothing under it any more
for fname, s in pages.items():
    def drop_bare(m):
        inner = re.sub(r'\s*<p class="kicker">[^<]*</p>\s*', "", m.group(1)).strip()
        if inner:
            return m.group(0)
        report.append(f"{fname}: removed now-empty section {re.search(r'kicker\">([^<]*)', m.group(1)).group(1)!r}")
        return ""
    s = re.sub(r'    <section class="block"[^>]*>\n(.*?)\n    </section>\n\n?', drop_bare, s, flags=re.S)
    s = re.sub(r"\n{3,}", "\n\n", s)
    open(f"{ROOT}/{fname}", "w").write(s)

print("\n".join(report))
json.dump([{"id": d["id"], "version": d["version"], "text": d["text"]} for d in changed],
          open(DOCS + "/../applied.json", "w"), ensure_ascii=False)

"""Builds the Vera wordmark font files from Abril Fatface (SIL OFL 1.1, TypeTogether).

  python3 scripts/make-wordmark-font.py AbrilFatface-Regular.ttf

Source: https://github.com/google/fonts/tree/main/ofl/abrilfatface (downloaded 2026-10-04).
Needs fonttools and brotli (pip install fonttools brotli).

What it does, and why:
- Subsets to Latin (Basic Latin, Latin-1, common punctuation) so the file is small.
- Renames the font inside the file to "Wordmark Display". The OFL reserves the names "Abril" and "Abril Fatface" for
  unmodified copies, and a subset in a new format is a Modified Version. The copyright and licence strings are kept.
- Writes woff2 for the browser and woff for the social-preview renderer (which cannot read woff2).
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

SRC = sys.argv[1]
OUT = "public/fonts/wordmark-display-latin"
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC]

for flavor in ("woff2", "woff"):
    font = TTFont(SRC)
    opts = subset.Options()
    opts.flavor = flavor
    opts.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep copyright and licence text
    opts.notdef_outline = True
    opts.hinting = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    name = font["name"]
    for record in name.names:
        if record.nameID in (1, 16):
            record.string = "Wordmark Display"
        elif record.nameID == 4:
            record.string = "Wordmark Display Regular"
        elif record.nameID == 6:
            record.string = "WordmarkDisplay-Regular"
        elif record.nameID == 3:
            record.string = "WordmarkDisplay-Regular;subset of Abril Fatface"
    font.flavor = flavor
    font.save(f"{OUT}.{flavor}")
    print(f"{OUT}.{flavor}")

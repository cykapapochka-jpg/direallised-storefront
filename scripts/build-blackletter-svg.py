from pathlib import Path
from xml.sax.saxutils import escape

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = ROOT / "public" / "fonts" / "DireallisedBlackletter.woff"
OUT_PATH = ROOT / "public" / "fonts" / "DireallisedBlackletter-source.svg"

ROWS = [
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "0123456789",
    ".,:;!?&/+-*'\"()[]",
]


def main() -> None:
    font = TTFont(FONT_PATH)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    units = font["head"].unitsPerEm

    cell_w = 960
    cell_h = 1180
    margin_x = 240
    margin_y = 160
    baseline = 860
    scale = 0.82

    width = margin_x * 2 + max(len(row) for row in ROWS) * cell_w
    height = margin_y * 2 + len(ROWS) * cell_h
    elements: list[str] = []

    for row_index, row in enumerate(ROWS):
        y = margin_y + row_index * cell_h
        for col_index, char in enumerate(row):
            glyph_name = cmap.get(ord(char))
            if not glyph_name:
                continue

            pen = SVGPathPen(glyph_set)
            glyph = glyph_set[glyph_name]
            glyph.draw(pen)
            path = pen.getCommands()
            advance = getattr(glyph, "width", units)
            x = margin_x + col_index * cell_w + max(0, (cell_w - advance * scale) / 2)

            elements.append(
                f'  <g id="glyph-u{ord(char):04X}" data-char="{escape(char)}" '
                f'transform="translate({x:.2f} {y + baseline:.2f}) scale({scale:.4f} {-scale:.4f})">\n'
                f'    <path d="{path}" />\n'
                f"  </g>"
            )

    svg = "\n".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {width} {height}" width="{width}" height="{height}">',
            "  <title>DireallisedBlackletter vector glyph source</title>",
            "  <desc>Uppercase A-Z, digits 0-9 and base punctuation exported as vector contours.</desc>",
            "  <rect width=\"100%\" height=\"100%\" fill=\"#050605\" />",
            "  <g fill=\"#f4f1ea\" fill-rule=\"nonzero\">",
            *elements,
            "  </g>",
            "</svg>",
            "",
        ]
    )

    OUT_PATH.write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    main()

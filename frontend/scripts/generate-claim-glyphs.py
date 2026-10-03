"""Export the claim's original serif outlines; browser masking removes overlap seams."""
from pathlib import Path
import json
import sys

frontend = Path(__file__).resolve().parents[1]
workspace = frontend.parents[1]
sys.path.insert(0, str(workspace / "output/font-tools"))

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font = TTFont(workspace / "output/noto-serif-sc-full.ttf")
glyphs = font.getGlyphSet(location={"wght": 400})
cmap = font.getBestCmap()
scale = 1000 / font["head"].unitsPerEm
paths = {}
for character in dict.fromkeys("看见微小，才能看得更远。"):
    pen = SVGPathPen(glyphs)
    glyphs[cmap[ord(character)]].draw(TransformPen(pen, (scale, 0, 0, -scale, 0, 880)))
    paths[character] = pen.getCommands()

destination = frontend / "src/jianwei-claim-glyphs.json"
destination.write_text(json.dumps(paths, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Exported {len(paths)} glyphs to {destination}")

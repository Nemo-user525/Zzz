"""Build the site's self-hosted Noto SC variable font subsets.

Requires Python 3.10+, fonttools and brotli. Run from any working directory:
    python -m pip install fonttools brotli
    python frontend/scripts/build-typography-fonts.py

Upstream downloads are cached outside the repository. Only the two text fonts,
their OFL licenses and typography-fonts.json are written to public/fonts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


FRONTEND = Path(__file__).resolve().parents[1]
REVISION = "9710da1eacb3be272583c3224dcb70f9da6eadbb"
FAMILIES = (
    ("Noto Serif SC", "notoserifsc", "NotoSerifSC%5Bwght%5D.ttf", "noto-serif-sc-text.woff2"),
    ("Noto Sans SC", "notosanssc", "NotoSansSC%5Bwght%5D.ttf", "noto-sans-sc-text.woff2"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def codepoints(values: set[int]) -> list[str]:
    return [f"U+{cp:04X}" for cp in sorted(values)]


def unicode_range(values: set[int]) -> str:
    ranges = []
    for cp in sorted(values):
        if ranges and cp == ranges[-1][1] + 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp])
    return ",".join(f"U+{lo:X}" if lo == hi else f"U+{lo:X}-{hi:X}" for lo, hi in ranges)


def download(url: str, destination: Path) -> Path:
    if not destination.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "xray-typography-build"})
        with urllib.request.urlopen(request, timeout=120) as response:
            destination.write_bytes(response.read())
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "xray-typography-fonts" / REVISION)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    output = FRONTEND / "public" / "fonts"
    output.mkdir(parents=True, exist_ok=True)

    sources = sorted(path for path in (FRONTEND / "src").rglob("*") if path.suffix in {".ts", ".tsx", ".css"})
    source_characters = {
        ord(character)
        for path in sources
        for character in path.read_text(encoding="utf-8")
        if character.isprintable()
    }
    # Preserve a practical Latin/punctuation repertoire alongside every static
    # UI character. Dynamic CJK names outside this subset use the CSS fallback.
    requested = source_characters | set(range(0x20, 0x7F)) | set(range(0xA0, 0x100))
    for start, end in ((0x2000, 0x2070), (0x20A0, 0x20D0), (0x3000, 0x3040), (0xFF00, 0xFFF0)):
        requested.update(range(start, end))

    manifest = {
        "upstream_repository": "https://github.com/google/fonts",
        "upstream_revision": REVISION,
        "license": "SIL Open Font License 1.1",
        "build_command": "python frontend/scripts/build-typography-fonts.py",
        "coverage_policy": "All printable characters in frontend/src TS, TSX and CSS files, plus Latin-1, general punctuation, currency, CJK punctuation and fullwidth forms supported by the upstream fonts. Other dynamic characters use system fallback fonts. Generated JSON artwork is excluded.",
        "source_files": [path.relative_to(FRONTEND).as_posix() for path in sources],
        "source_character_count": len(source_characters),
        "fonts": [],
    }

    jobs = []
    for family, directory, filename, output_name in FAMILIES:
        root = f"https://raw.githubusercontent.com/google/fonts/{REVISION}/ofl/{directory}"
        jobs.extend(((f"{root}/{filename}", args.cache / f"{directory}.ttf"), (f"{root}/OFL.txt", args.cache / f"{directory}-OFL.txt")))
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda job: download(*job), jobs))

    for family, directory, filename, output_name in FAMILIES:
        source = args.cache / f"{directory}.ttf"
        font = TTFont(source, recalcTimestamp=False)
        available = set(font.getBestCmap())
        selected = requested & available
        missing = source_characters - available
        missing_cjk = {cp for cp in missing if "CJK" in unicodedata.name(chr(cp), "")}
        if missing_cjk:
            raise RuntimeError(f"{family} cannot cover source CJK characters: {codepoints(missing_cjk)}")

        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_legacy = True
        options.name_languages = ["*"]
        options.recalc_timestamp = False
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=selected)
        subsetter.subset(font)
        font.flavor = "woff2"
        destination = output / output_name
        font.save(destination)
        font.close()

        with TTFont(destination) as result:
            actual = set(result.getBestCmap())
            if selected - actual:
                raise RuntimeError(f"Lost supported glyphs while subsetting {family}")
            axes = {axis.axisTag: {"min": axis.minValue, "default": axis.defaultValue, "max": axis.maxValue} for axis in result["fvar"].axes}
            if "wght" not in axes:
                raise RuntimeError(f"Lost variable weight axis in {family}")
            glyph_count = len(result.getGlyphOrder())

        license_name = f"OFL-{family.replace(' ', '')}-Text.txt"
        (output / license_name).write_bytes((args.cache / f"{directory}-OFL.txt").read_bytes())
        metadata = {
            "family": family,
            "file": output_name,
            "bytes": destination.stat().st_size,
            "sha256": sha256(destination),
            "source_url": f"https://raw.githubusercontent.com/google/fonts/{REVISION}/ofl/{directory}/{filename}",
            "source_sha256": sha256(source),
            "license_file": license_name,
            "axes": axes,
            "unicode_character_count": len(actual),
            "glyph_count": glyph_count,
            "source_character_count_covered": len(source_characters & actual),
            "source_characters_using_system_fallback": [{"codepoint": f"U+{cp:04X}", "character": chr(cp), "name": unicodedata.name(chr(cp), "UNNAMED")} for cp in sorted(missing)],
            "unicode_range": unicode_range(actual),
        }
        manifest["fonts"].append(metadata)
        print(f"{output_name}: {metadata['bytes']:,} bytes; {len(actual)} characters; axes {axes}; fallback {codepoints(missing)}")

    (output / "typography-fonts.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

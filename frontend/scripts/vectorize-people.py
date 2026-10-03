"""Build actual SVG paths from the approved character artwork and performance.

Build-only dependency: vtracer. No raster images are embedded in any result.
Preserve the source performance in 60 discrete frames at 12 fps. Fieldwork
characters keep their full-resolution first pose for articulated joint motion.
All paths use the original fixed stage so joint coordinates remain exact.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import io
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent.parent
sys.path.insert(0, str(ROOT / 'output/vector-tools'))
import vtracer

PUBLIC = FRONTEND / 'public'
TEAM_ARTWORK = FRONTEND / 'scripts/artwork/team-reference.png'
DEST = PUBLIC / 'images/vectors'
DEST.mkdir(parents=True, exist_ok=True)
FFMPEG = Path('C:/Program Files (x86)/Lenovo/LegionZone/2.0.27.7062/SEGamingAI/services/editor/ffmpeg.exe')
SVG_NS = 'http://www.w3.org/2000/svg'
TEAM = {
    'detective': [67, 246, 179, 266], 'analyst': [303, 253, 150, 261],
    'researcher': [487, 248, 149, 267], 'connector': [697, 223, 188, 292],
    'checker': [879, 260, 245, 255], 'translator': [1145, 247, 104, 268],
    'guardian': [1303, 288, 191, 228],
}
FIELD = {'checker': [645, 677, 184, 211], 'translator': [769, 141, 176, 214]}
FIELDWORK_ACTIONS = ('analyst', 'researcher', 'binoculars', 'connector', 'guardian')


def ink_image(image, threshold=125, remove_paper=False, connected_body=False):
    image = image.convert('RGBA')
    data = np.asarray(image).copy()
    gray = data[:, :, :3].max(axis=2)
    if remove_paper:
        # Keep a white interior enclosed by the original ink, remove exterior paper.
        support = Image.fromarray(np.uint8(gray < 180) * 255)
        support = support.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
        regions = support.copy()
        for x in range(regions.width):
            for y in (0, regions.height - 1):
                if regions.getpixel((x, y)) == 0:
                    ImageDraw.floodfill(regions, (x, y), 128, thresh=0)
        for y in range(regions.height):
            for x in (0, regions.width - 1):
                if regions.getpixel((x, y)) == 0:
                    ImageDraw.floodfill(regions, (x, y), 128, thresh=0)
        data[:, :, 3] = np.where(np.asarray(regions) == 128, 0, 255)
    else:
        data[:, :, 3] = np.where(data[:, :, 3] > 160, 255, 0)
    if connected_body:
        # The opaque torso is connected to the arm, lens, hair and clothes.
        # Disconnected source-video matte flecks must not float beside the head.
        mask = Image.fromarray(data[:, :, 3]).copy()
        seed = (int(image.width * .65), int(image.height * .65))
        if mask.getpixel(seed) != 255:
            ys, xs = np.where(data[:, :, 3] == 255)
            nearest = np.argmin((xs - seed[0]) ** 2 + (ys - seed[1]) ** 2)
            seed = int(xs[nearest]), int(ys[nearest])
        ImageDraw.floodfill(mask, seed, 128, thresh=0)
        data[:, :, 3] = np.where(np.asarray(mask) == 128, 255, 0)
    data[:, :, :3] = np.where(gray[:, :, None] < threshold, 25, 250)
    return Image.fromarray(data)


def paths(image, threshold=125, remove_paper=False, connected_body=False):
    buffer = io.BytesIO()
    ink_image(image, threshold, remove_paper, connected_body).save(buffer, format='PNG')
    svg = vtracer.convert_raw_image_to_svg(
        buffer.getvalue(), img_format='png', colormode='color', hierarchical='stacked',
        mode='spline', filter_speckle=2, color_precision=8, layer_difference=16,
        corner_threshold=60, length_threshold=3, max_iterations=10,
        splice_threshold=45, path_precision=1,
    )
    return path_elements(svg)


def path_elements(svg):
    node = ET.fromstring(svg)
    result = []
    for child in node:
        if child.tag != f'{{{SVG_NS}}}path':
            raise ValueError(f'Unexpected non-path tracer output: {child.tag}')
        attributes = ' '.join(f'{key}="{value}"' for key, value in child.attrib.items())
        result.append(f'<path {attributes}/>')
    return ''.join(result)


def team_ink_paths(image):
    """Preserve the original pencil hatching and light detail in eight ink tones.

    A single low black/white threshold erases glasses, paper edges and the
    relationship board. Keep those gray strokes while lifting the source paper
    to the site's white, with transparent space outside the drawn silhouettes.
    """
    gray = np.asarray(image.convert('L'))
    support = Image.fromarray(np.uint8(gray < 195) * 255)
    support = support.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    regions = support.copy()
    for x in range(regions.width):
        for y in (0, regions.height - 1):
            if regions.getpixel((x, y)) == 0:
                ImageDraw.floodfill(regions, (x, y), 128, thresh=0)
    for y in range(regions.height):
        for x in (0, regions.width - 1):
            if regions.getpixel((x, y)) == 0:
                ImageDraw.floodfill(regions, (x, y), 128, thresh=0)
    ink = np.clip(gray.astype(float) * 250 / 231, 0, 250)
    quantized = np.round(ink / (250 / 7)) * (250 / 7)
    data = np.empty((*gray.shape, 4), dtype=np.uint8)
    data[:, :, :3] = quantized[:, :, None].astype(np.uint8)
    data[:, :, 3] = np.where((np.asarray(regions) != 128) | (gray < 212), 255, 0)
    buffer = io.BytesIO()
    Image.fromarray(data).save(buffer, format='PNG')
    svg = vtracer.convert_raw_image_to_svg(
        buffer.getvalue(), img_format='png', colormode='color', hierarchical='stacked',
        mode='spline', filter_speckle=2, color_precision=8, layer_difference=8,
        corner_threshold=45, length_threshold=2, max_iterations=10,
        splice_threshold=35, path_precision=1,
    )
    return path_elements(svg)


def fieldwork_ink_paths(image):
    """Keep the sprite's transparent silhouette and original fine ink shading.

    These sprites already have alpha, so unlike the printed team artwork they
    need no paper extraction or enclosed-region filling. Sixteen gray tones at
    native source resolution retain hair, clothing and fine prop hatching.
    """
    rgba = np.asarray(image.convert('RGBA'))
    gray = np.asarray(image.convert('L')).astype(float)
    ink = np.clip(gray * 250 / 245, 0, 250)
    quantized = np.round(ink / (250 / 15)) * (250 / 15)
    data = np.empty(rgba.shape, dtype=np.uint8)
    data[:, :, :3] = quantized[:, :, None].astype(np.uint8)
    # The original cutout has faint exterior matte flecks; retain its solid
    # silhouette without tracing those disconnected low-alpha artifacts.
    data[:, :, 3] = np.where(rgba[:, :, 3] > 160, 255, 0)
    buffer = io.BytesIO()
    Image.fromarray(data).save(buffer, format='PNG')
    svg = vtracer.convert_raw_image_to_svg(
        buffer.getvalue(), img_format='png', colormode='color', hierarchical='stacked',
        mode='spline', filter_speckle=1, color_precision=8, layer_difference=8,
        corner_threshold=45, length_threshold=1.5, max_iterations=10,
        splice_threshold=35, path_precision=2,
    )
    return path_elements(svg)


def write_svg(name, contents, width=720, height=720):
    text = f'<svg xmlns="{SVG_NS}" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{contents}</svg>'
    path = DEST / name
    path.write_text(text, encoding='utf-8')
    assert not re.search(r'<(?:image|foreignObject)|data:image|\.png|\.jpe?g', text, re.I)
    return {'file': f'/images/vectors/{name}', 'bytes': path.stat().st_size,
            'gzip_bytes': len(gzip.compress(text.encode(), compresslevel=9)),
            'paths': text.count('<path'), 'sha256': hashlib.sha256(text.encode()).hexdigest()}


def video_frames():
    source = PUBLIC / 'videos/hero-observer.webm'
    process = subprocess.Popen([str(FFMPEG), '-hide_banner', '-loglevel', 'error',
        '-c:v', 'libvpx-vp9', '-i', str(source), '-an', '-vf', 'fps=12',
        '-frames:v', '60', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], stdout=subprocess.PIPE)
    frames = []
    while True:
        raw = process.stdout.read(720 * 720 * 4)
        if len(raw) != 720 * 720 * 4:
            break
        frame = Image.frombytes('RGBA', (720, 720), raw)
        if len(frames) == 0 and np.asarray(frame)[:, :, 3].min() != 0:
            raise ValueError('Video alpha was not decoded; no black background may be traced.')
        frames.append(paths(frame, threshold=105, connected_body=True))
        if len(frames) % 12 == 0:
            print(f'Video: {len(frames)} frames traced', flush=True)
    if process.wait() or len(frames) != 60:
        raise ValueError('Expected the approved 5 second performance at 12 fps')
    result = write_svg('observer-performance.svg', ''.join(
        f'<g id="frame-{index}">{frame}</g>' for index, frame in enumerate(frames)))
    if result['paths'] < 60 or len(set(frames)) < 30:
        raise ValueError('The performance must contain genuine, nonempty different poses')
    poster = write_svg('observer-poster.svg', frames[0])
    result.update(frames=len(frames), fps=12, duration_seconds=5,
                  unique_frames=len(set(hashlib.sha256(frame.encode()).hexdigest() for frame in frames)))
    return [result, poster]


def action_frames(kinds=('observer', *FIELDWORK_ACTIONS)):
    results = []
    for kind in kinds:
        name = 'hero-observer-actions.png' if kind == 'observer' else f'{kind}-actions.png'
        image = Image.open(PUBLIC / 'images' / name).convert('RGBA')
        width, height = image.width // 2, image.height // 2
        frames = []
        poses = ((x, y) for y in range(2) for x in range(2)) if kind == 'observer' else ((0, 0),)
        for x, y in poses:
            frame = image.crop((x * width, y * height, (x + 1) * width, (y + 1) * height))
            # Fieldwork animates separate head/hand paths from frame-0. Trace
            # that pose at native resolution instead of storing three unused
            # poses or reducing the ink detail to a 384px intermediate image.
            frames.append(paths(frame) if kind == 'observer' else fieldwork_ink_paths(frame))
        result = write_svg(f'{kind}-actions.svg', ''.join(
            f'<g id="frame-{index}">{frame}</g>' for index, frame in enumerate(frames)), width, height)
        result.update(frames=len(frames), width=width, height=height,
                      unique_frames=len(set(hashlib.sha256(frame.encode()).hexdigest() for frame in frames)))
        results.append(result)
        print(f'{kind}: {result["bytes"]} bytes', flush=True)
    return results


def team_paths():
    contents = []
    for name, boxes, source in [('team', TEAM, TEAM_ARTWORK),
                                ('field', FIELD, PUBLIC / 'images/xray-field-notes-reference.png')]:
        image = Image.open(source)
        for role, (x, y, width, height) in boxes.items():
            # The small contact-sheet originals need supersampling before tracing,
            # otherwise one-pixel hatching gaps disappear into solid black blobs.
            crop = image.crop((x, y, x + width, y + height))
            if name == 'team' and role == 'connector':
                # The contact sheet includes a corner of the next person's papers.
                ImageDraw.Draw(crop).rectangle((175, 265, width, height), fill=(231, 231, 231))
            crop = crop.resize((width * 3, height * 3), Image.Resampling.LANCZOS)
            vector = team_ink_paths(crop) if name == 'team' else paths(crop, threshold=100)
            contents.append(f'<g id="{name}-{role}" transform="translate({x} {y}) scale(0.333333)">{vector}</g>')
    result = write_svg('people.svg', ''.join(contents), 1536, 1024)
    result['team_artwork'] = {
        'file': str(TEAM_ARTWORK.relative_to(FRONTEND)).replace('\\', '/'),
        'sha256': hashlib.sha256(TEAM_ARTWORK.read_bytes()).hexdigest(),
    }
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument('--team-only', action='store_true',
                       help='Rebuild people.svg without retracing the video or action sprites.')
    scope.add_argument('--fieldwork-only', action='store_true',
                       help='Rebuild the five fieldwork sprites without changing the hero or team.')
    args = parser.parse_args()
    if args.team_only or args.fieldwork_only:
        previous = json.loads((DEST / 'manifest.json').read_text(encoding='utf-8'))
        assets = previous['assets']
        rebuilding = ({'/images/vectors/people.svg'} if args.team_only else
                      {f'/images/vectors/{kind}-actions.svg' for kind in FIELDWORK_ACTIONS})
        for asset in assets:
            if asset['file'] in rebuilding:
                continue
            existing = PUBLIC / asset['file'].lstrip('/')
            if hashlib.sha256(existing.read_bytes()).hexdigest() != asset['sha256']:
                raise ValueError(f'Existing asset does not match its manifest: {existing}')
        replacements = [team_paths()] if args.team_only else action_frames(FIELDWORK_ACTIONS)
        replacements_by_file = {asset['file']: asset for asset in replacements}
        assets = [replacements_by_file.get(asset['file'], asset) for asset in assets]
    else:
        assets = video_frames() + action_frames() + [team_paths()]
    manifest = {'format': 'SVG path only; external use references, no raster embedding',
                'build_tool': 'vtracer 0.6.15; eight-tone team ink, native-resolution sixteen-tone fieldwork ink, two-tone hero performance',
                'assets': assets, 'total_bytes': sum(a['bytes'] for a in assets),
                'total_gzip_bytes': sum(a['gzip_bytes'] for a in assets)}
    (DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'total_bytes': manifest['total_bytes'], 'total_gzip_bytes': manifest['total_gzip_bytes']}, indent=2))

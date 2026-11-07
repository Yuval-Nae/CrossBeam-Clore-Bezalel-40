#!/usr/bin/env python3
"""Extract artist text and web images from the CB40 InDesign package."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
IDML = ROOT / "CB40-book" / "CB40Book_Shira_7.10.idml"
LINKS = ROOT / "CB40-book" / "Links"
OUT_JSON = ROOT / "data" / "artists.json"
OUT_IMG = ROOT / "assets" / "artists"

SKIP_TITLES = {"greetings", "scholarship recipients", "index", "works"}


def local(tag: str) -> str:
    return tag.split("}")[-1]


def style_map(zf: zipfile.ZipFile) -> dict[str, str]:
    root = ET.fromstring(zf.read("Resources/Styles.xml"))
    names = {}
    for el in root.iter():
        if local(el.tag) in {"ParagraphStyle", "CharacterStyle"}:
            names[el.attrib.get("Self", "")] = el.attrib.get("Name", "")
    return names


def story_blocks(zf: zipfile.ZipFile, styles: dict[str, str], story_id: str) -> list[dict]:
    path = f"Stories/Story_{story_id}.xml"
    if path not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(path))
    blocks = []
    for para in root.iter():
        if local(para.tag) != "ParagraphStyleRange":
            continue
        style = styles.get(para.attrib.get("AppliedParagraphStyle", ""), "")
        chunks: list[str] = []
        buf: list[str] = []

        def flush() -> None:
            text = "".join(buf).strip()
            buf.clear()
            if text:
                chunks.append(text)

        for node in para.iter():
            kind = local(node.tag)
            if kind == "Content" and node.text:
                buf.append(node.text)
            elif kind == "Br":
                flush()
        flush()
        if chunks:
            blocks.append({"style": style, "parts": chunks})
    return blocks


def transform_xy(value: str | None) -> tuple[float, float]:
    if not value:
        return (0.0, 0.0)
    parts = value.split()
    if len(parts) < 6:
        return (0.0, 0.0)
    return (float(parts[4]), float(parts[5]))


def script_of(text: str) -> str:
    he = ar = en = 0
    for ch in text:
        code = ord(ch)
        if 0x0590 <= code <= 0x05FF:
            he += 1
        elif (
            0x0600 <= code <= 0x06FF
            or 0x0750 <= code <= 0x077F
            or 0x08A0 <= code <= 0x08FF
            or 0xFB50 <= code <= 0xFDFF
            or 0xFE70 <= code <= 0xFEFF
        ):
            ar += 1
        elif ch.isascii() and ch.isalpha():
            en += 1
    if he >= ar and he >= en and he:
        return "he"
    if ar >= en and ar:
        return "ar"
    return "en"


def split_scripts(text: str) -> dict[str, str]:
    buckets = {"en": [], "he": [], "ar": []}
    current = None
    buf: list[str] = []

    def kind(ch: str) -> str | None:
        code = ord(ch)
        if 0x0590 <= code <= 0x05FF:
            return "he"
        if (
            0x0600 <= code <= 0x06FF
            or 0x0750 <= code <= 0x077F
            or 0x08A0 <= code <= 0x08FF
            or 0xFB50 <= code <= 0xFDFF
            or 0xFE70 <= code <= 0xFEFF
        ):
            return "ar"
        if ch.isascii() and ch.isalpha():
            return "en"
        return None

    def flush() -> None:
        nonlocal buf
        if current and buf:
            piece = "".join(buf).strip(" \u2028\u2029")
            if piece:
                buckets[current].append(piece)
        buf = []

    for ch in text.replace("\u2028", "\n"):
        found = kind(ch)
        if found is None:
            if current:
                buf.append(ch)
            continue
        if found != current:
            flush()
            current = found
        buf.append(ch)
    flush()
    return {key: " ".join(value).strip() for key, value in buckets.items()}


def assign_lines(lines: list[str]) -> dict[str, str]:
    found = {"en": "", "he": "", "ar": ""}
    for line in lines:
        found[script_of(line)] = line.strip()
    return found


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "artist"


def link_name(uri: str) -> str:
    name = unquote(uri.split("/")[-1])
    return unicodedata.normalize("NFC", name)


def find_link(filename: str) -> Path | None:
    direct = LINKS / filename
    if direct.exists():
        return direct
    wanted = unicodedata.normalize("NFC", filename)
    for path in LINKS.iterdir():
        if unicodedata.normalize("NFC", path.name) == wanted:
            return path
    return None


def spread_items(zf: zipfile.ZipFile, styles: dict[str, str], src: str) -> dict:
    root = ET.fromstring(zf.read(src))
    texts = []
    images = []
    for el in root.iter():
        kind = local(el.tag)
        if kind == "TextFrame":
            story_id = el.attrib.get("ParentStory")
            if not story_id:
                continue
            x, y = transform_xy(el.attrib.get("ItemTransform"))
            texts.append({"x": x, "y": y, "blocks": story_blocks(zf, styles, story_id)})
        elif kind == "Rectangle":
            filename = ""
            for child in el.iter():
                if local(child.tag) == "Link":
                    filename = link_name(child.attrib.get("LinkResourceURI", ""))
            if not filename:
                continue
            x, y = transform_xy(el.attrib.get("ItemTransform"))
            images.append({"x": x, "y": y, "file": filename})
    texts.sort(key=lambda item: (item["y"], item["x"]))
    images.sort(key=lambda item: (item["x"], item["y"]))
    return {"src": src, "texts": texts, "images": images}


def paragraphs(spread: dict, style: str) -> list[str]:
    found = []
    for frame in spread["texts"]:
        for block in frame["blocks"]:
            if block["style"] == style:
                found.extend(block["parts"])
    return found


def is_artist(spread: dict) -> bool:
    titles = paragraphs(spread, "Interview:E title")
    if not titles:
        return False
    return titles[0].strip().lower() not in SKIP_TITLES


def schools_from(spread: dict) -> list[dict]:
    frames = []
    for frame in spread["texts"]:
        for block in frame["blocks"]:
            if block["style"] == "Interview:School":
                frames.append((frame["y"], frame["x"], block["parts"]))
    frames.sort()
    schools = []
    pending_year = ""
    for _y, _x, parts in frames:
        text = " ".join(parts).strip()
        if re.fullmatch(r"\d{4}", text):
            pending_year = text
            continue
        institution = split_scripts(parts[0]) if parts else {"en": "", "he": "", "ar": ""}
        department = split_scripts(" ".join(parts[1:])) if len(parts) > 1 else {"en": "", "he": "", "ar": ""}
        for lang in ("en", "he", "ar"):
            if not institution[lang]:
                institution[lang] = institution["en"]
            if not department[lang]:
                department[lang] = department["en"]
        schools.append({"year": pending_year, "name": institution, "department": department})
        pending_year = ""
    return schools


def hebrew_count(value: str) -> int:
    return sum(1 for char in value if "\u0590" <= char <= "\u05FF")


def choose_portrait(images: list[dict]) -> dict | None:
    """Portrait files are named in Hebrew. Artwork files include an English title."""

    def latin_count(value: str) -> int:
        return sum(1 for char in value if char.isascii() and char.isalpha())

    pure = [image for image in images if hebrew_count(image["file"]) > 0 and latin_count(Path(image["file"]).stem) == 0]
    pool = pure or [image for image in images if hebrew_count(image["file"]) > 0]
    if not pool:
        return None
    return sorted(pool, key=lambda image: (len(image["file"]), image["file"]))[0]


def unique(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        key = unicodedata.normalize("NFC", item)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def build() -> list[dict]:
    with zipfile.ZipFile(IDML) as zf:
        styles = style_map(zf)
        designmap = ET.fromstring(zf.read("designmap.xml"))
        sources = [
            el.attrib["src"]
            for el in designmap
            if local(el.tag) == "Spread" and el.attrib.get("src", "").startswith("Spreads/")
        ]
        spreads = [spread_items(zf, styles, src) for src in sources]

    artists = []
    used_slugs = set()
    for spread in spreads:
        if not is_artist(spread):
            continue
        names = {
            "en": (paragraphs(spread, "Interview:E title") or [""])[0].strip(),
            "ar": (paragraphs(spread, "Interview:A title") or [""])[0].strip(),
            "he": (paragraphs(spread, "Interview:H title") or [""])[0].strip(),
        }
        slug = slugify(names["en"])
        if slug in used_slugs:
            slug = f"{slug}-{len(used_slugs)+1}"
        used_slugs.add(slug)
        portrait = choose_portrait(spread["images"])
        portrait_file = portrait["file"] if portrait else ""
        gallery = [name for name in unique(image["file"] for image in spread["images"]) if name != portrait_file]
        artists.append(
            {
                "slug": slug,
                "name": names,
                "bio": assign_lines(paragraphs(spread, "Interview:Bio H+A+E")),
                "born": assign_lines(paragraphs(spread, "Interview:ID")),
                "schools": schools_from(spread),
                "body": {
                    "en": paragraphs(spread, "Interview:E text 1") + paragraphs(spread, "Interview:E text 2"),
                    "he": paragraphs(spread, "Interview:H text 1") + paragraphs(spread, "Interview:H text 2"),
                    "ar": paragraphs(spread, "Interview:A text 1") + paragraphs(spread, "Interview:A text 2"),
                },
                "portrait_file": portrait_file,
                "gallery_files": gallery,
            }
        )
    return artists


def parse_transform(value: str | None) -> tuple[float, float, float, float, float, float]:
    parts = [float(part) for part in (value or "1 0 0 1 0 0").split()]
    while len(parts) < 6:
        parts.append(0.0)
    return tuple(parts[:6])  # type: ignore[return-value]


def path_frames(rect: ET.Element) -> list[tuple[float, float, float, float]]:
    frames = []
    for el in rect:
        if local(el.tag) != "Properties":
            continue
        for path in el.iter():
            if local(path.tag) != "GeometryPathType":
                continue
            points = []
            for point in path.iter():
                if local(point.tag) == "PathPointType" and "Anchor" in point.attrib:
                    x, y = (float(part) for part in point.attrib["Anchor"].split())
                    points.append((x, y))
            if len(points) < 2:
                continue
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            frames.append((min(xs), min(ys), max(xs), max(ys)))
        break
    return frames


def portrait_crops(artists: list[dict]) -> dict[str, tuple[float, float, float, float, bool]]:
    """Visible rectangle of each interview portrait, as fractions of the source image."""

    crops: dict[str, tuple[float, float, float, float, bool]] = {}
    with zipfile.ZipFile(IDML) as zf:
        styles = style_map(zf)
        designmap = ET.fromstring(zf.read("designmap.xml"))
        sources = [
            el.attrib["src"]
            for el in designmap
            if local(el.tag) == "Spread" and el.attrib.get("src", "").startswith("Spreads/")
        ]
        index = 0
        for src in sources:
            spread = spread_items(zf, styles, src)
            if not is_artist(spread):
                continue
            artist = artists[index]
            index += 1
            root = ET.fromstring(zf.read(src))
            target = unicodedata.normalize("NFC", artist["portrait_file"])
            candidates = []
            for el in root.iter():
                if local(el.tag) != "Rectangle":
                    continue
                image = None
                link = ""
                bounds = None
                for child in el.iter():
                    if local(child.tag) == "Image" and image is None:
                        image = child
                    if local(child.tag) == "Link" and not link:
                        link = unicodedata.normalize("NFC", unquote(child.attrib.get("LinkResourceURI", "").split("/")[-1]))
                    if local(child.tag) == "GraphicBounds" and bounds is None:
                        bounds = child
                if image is None or bounds is None or link != target:
                    continue
                a, b, c, d, tx, ty = parse_transform(image.attrib.get("ItemTransform"))
                if abs(b) > 1e-4 or abs(c) > 1e-4 or a == 0 or d == 0:
                    continue
                left, top, right, bottom = (float(bounds.attrib[key]) for key in ("Left", "Top", "Right", "Bottom"))
                width = right - left
                height = bottom - top
                if width == 0 or height == 0:
                    continue
                for frame_left, frame_top, frame_right, frame_bottom in path_frames(el):
                    x0 = ((frame_left - tx) / a - left) / width
                    x1 = ((frame_right - tx) / a - left) / width
                    y0 = ((frame_top - ty) / d - top) / height
                    y1 = ((frame_bottom - ty) / d - top) / height
                    if x0 > x1:
                        x0, x1 = x1, x0
                    if y0 > y1:
                        y0, y1 = y1, y0
                    crop_left, crop_right = max(0.0, x0), min(1.0, x1)
                    crop_top, crop_bottom = max(0.0, y0), min(1.0, y1)
                    if crop_right - crop_left < 0.05 or crop_bottom - crop_top < 0.05:
                        continue
                    area = abs((frame_right - frame_left) * (frame_bottom - frame_top))
                    candidates.append((area, crop_left, crop_top, crop_right, crop_bottom, a < 0))
            if not candidates:
                continue
            _area, x0, y0, x1, y1, flip_x = max(candidates, key=lambda item: item[0])
            crops[artist["slug"]] = (x0, y0, x1, y1, flip_x)
    return crops


def image_size(path: Path) -> tuple[int, int]:
    result = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)], capture_output=True, text=True)
    width = height = 0
    for line in result.stdout.splitlines():
        if "pixelWidth" in line:
            width = int(line.split()[-1])
        elif "pixelHeight" in line:
            height = int(line.split()[-1])
    if result.returncode != 0 or width <= 0 or height <= 0:
        raise RuntimeError(result.stderr.strip() or f"could not read size of {path.name}")
    return width, height


def apply_crop(path: Path, crop: tuple[float, float, float, float, bool]) -> None:
    x0, y0, x1, y1, flip_x = crop
    width, height = image_size(path)
    left = max(0, min(width - 1, round(x0 * width)))
    top = max(0, min(height - 1, round(y0 * height)))
    crop_width = max(1, min(width - left, round((x1 - x0) * width)))
    crop_height = max(1, min(height - top, round((y1 - y0) * height)))
    full = x0 <= 0.01 and y0 <= 0.01 and x1 >= 0.99 and y1 >= 0.99
    if full and not flip_x:
        return
    temp = path.with_suffix(".crop.jpg")
    if not full:
        result = subprocess.run(
            [
                "sips",
                "--cropOffset",
                str(top),
                str(left),
                "--cropToHeightWidth",
                str(crop_height),
                str(crop_width),
                str(path),
                "--out",
                str(temp),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.returncode != 0 or not temp.exists():
            raise RuntimeError(result.stderr.strip() or f"crop failed for {path.name}")
    else:
        temp.write_bytes(path.read_bytes())
    if flip_x:
        flipped = subprocess.run(["sips", "-f", "horizontal", str(temp)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if flipped.returncode != 0:
            temp.unlink(missing_ok=True)
            raise RuntimeError(flipped.stderr.strip() or f"flip failed for {path.name}")
    temp.replace(path)


def crop_existing_portraits() -> None:
    """Write the interview crop to card.jpg. portrait.jpg stays the full photo."""

    artists = build()
    crops = portrait_crops(artists)
    print(f"crops {len(crops)}")
    for artist in artists:
        crop = crops.get(artist["slug"])
        source = OUT_IMG / artist["slug"] / "portrait.jpg"
        dest = OUT_IMG / artist["slug"] / "card.jpg"
        if crop is None or not source.exists():
            print("skip", artist["slug"])
            continue
        dest.write_bytes(source.read_bytes())
        apply_crop(dest, crop)
        x0, y0, x1, y1, flip_x = crop
        print(f"  {artist['slug']}: {x1 - x0:.2f}x{y1 - y0:.2f} flip={flip_x}")


def convert(source: Path, dest: Path, max_edge: int) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0 and dest.stat().st_mtime >= source.stat().st_mtime:
        return False
    result = subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", str(max_edge), str(source), "--out", str(dest)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0 or not dest.exists():
        raise RuntimeError(result.stderr.strip() or f"sips failed for {source.name}")
    return True


def main() -> None:
    artists = build()
    print(f"artists {len(artists)}")
    for artist in artists:
        missing = []
        if not artist["portrait_file"]:
            missing.append("portrait")
        if not artist["body"]["en"]:
            missing.append("en-text")
        if not artist["bio"]["en"]:
            missing.append("bio")
        if missing:
            print(f"  missing {artist['slug']}: {', '.join(missing)} images={len(artist['gallery_files'])}")
        else:
            print(f"  {artist['slug']}: portrait + {len(artist['gallery_files'])} works")

    public = []
    for number, artist in enumerate(artists, start=1):
        print(f"[{number}/{len(artists)}] {artist['slug']}", flush=True)
        folder = OUT_IMG / artist["slug"]
        portrait_path = ""
        if artist["portrait_file"]:
            source = find_link(artist["portrait_file"])
            if source is None:
                print("MISSING FILE", artist["portrait_file"])
            else:
                portrait_path = f"assets/artists/{artist['slug']}/portrait.jpg"
                try:
                    convert(source, ROOT / portrait_path, 900)
                except RuntimeError as error:
                    print("CONVERT", artist["slug"], error)
                    portrait_path = ""
        gallery_paths = []
        for index, filename in enumerate(artist["gallery_files"], start=1):
            source = find_link(filename)
            if source is None:
                print("MISSING FILE", filename)
                continue
            rel = f"assets/artists/{artist['slug']}/work-{index:02d}.jpg"
            try:
                convert(source, ROOT / rel, 1600)
            except RuntimeError as error:
                print("CONVERT", artist["slug"], error)
                continue
            gallery_paths.append(rel)
        public.append(
            {
                "slug": artist["slug"],
                "name": artist["name"],
                "bio": artist["bio"],
                "born": artist["born"],
                "schools": artist["schools"],
                "body": artist["body"],
                "portrait": portrait_path,
                "gallery": gallery_paths,
            }
        )

    payload = {
        "title": {"en": "CrossBeam", "he": "קוֹרוֹת", "ar": "ركائز وسير"},
        "artists": public,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_JSON}")


if __name__ == "__main__":
    if "--crop-only" in sys.argv:
        crop_existing_portraits()
    else:
        main()

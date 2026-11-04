#!/usr/bin/env python3
"""Convert a Google Sheets CSV export into data/artists.json."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "content" / "artists.csv"
DEFAULT_JSON = ROOT / "data" / "artists.json"

EXHIBITION = {
    "en": {
        "name": "CrossBeam · Clore · Bezalel 40",
        "tagline": "Exhibition — artist stories",
        "homeIntro": "Scan the QR code or browse below to read about each of the 41 artists. Choose your language in the top bar.",
        "artistsHeading": "Artists",
        "backHome": "All artists",
        "bioLabel": "About the artist",
        "galleryLabel": "Gallery",
        "notFound": "Artist not found.",
        "loading": "Loading…",
    },
    "he": {
        "name": "CrossBeam · Clore · בצלאל 40",
        "tagline": "תערוכה — סיפורי האמנים",
        "homeIntro": "סרקו את קוד ה־QR או דפדפו למטה לקריאה על כל אחד מ־41 האמנים. בחרו שפה בסרגל העליון.",
        "artistsHeading": "אמנים",
        "backHome": "כל האמנים",
        "bioLabel": "על האמן",
        "galleryLabel": "גלריה",
        "notFound": "האמן לא נמצא.",
        "loading": "טוען…",
    },
    "ar": {
        "name": "CrossBeam · Clore · بتسلئيل 40",
        "tagline": "معرض — قصص الفنانين",
        "homeIntro": "امسح رمز الاستجابة السريعة أو تصفح أدناه لقراءة المزيد عن كل فنان من أصل 41. اختر اللغة من الشريط العلوي.",
        "artistsHeading": "الفنانون",
        "backHome": "كل الفنانين",
        "bioLabel": "عن الفنان",
        "galleryLabel": "معرض الصور",
        "notFound": "الفنان غير موجود.",
        "loading": "جارٍ التحميل…",
    },
}


def gallery_for(row: dict) -> list[str]:
    images = []
    for key in ("gallery_1", "gallery_2"):
        value = (row.get(key) or "").strip()
        if value:
            images.append(value)
    return images


def artist_from_row(row: dict) -> dict:
    artist_id = (row.get("id") or row.get("slug") or "").strip()
    slug = (row.get("slug") or artist_id).strip()
    if not artist_id or not slug:
        raise ValueError(f"Row missing id/slug: {row}")

    return {
        "id": artist_id,
        "slug": slug,
        "cover": (row.get("cover") or "").strip(),
        "gallery": gallery_for(row),
        "en": {
            "title": row.get("title_en", "").strip(),
            "subtitle": row.get("subtitle_en", "").strip(),
            "bio": row.get("bio_en", "").strip(),
            "body": row.get("body_en", "").strip(),
        },
        "he": {
            "title": row.get("title_he", "").strip(),
            "subtitle": row.get("subtitle_he", "").strip(),
            "bio": row.get("bio_he", "").strip(),
            "body": row.get("body_he", "").strip(),
        },
        "ar": {
            "title": row.get("title_ar", "").strip(),
            "subtitle": row.get("subtitle_ar", "").strip(),
            "bio": row.get("bio_ar", "").strip(),
            "body": row.get("body_ar", "").strip(),
        },
    }


def main() -> None:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    json_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_JSON

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))

    artists = [artist_from_row(row) for row in rows if any(row.values())]
    payload = {"exhibition": EXHIBITION, "artists": artists}
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(artists)} artists to {json_path}")


if __name__ == "__main__":
    main()

# CrossBeam · Clore · Bezalel 40

Public exhibition website for 41 artists. Mobile-first, with English / Hebrew / Arabic.

Hosted on **personal** GitHub Pages under `Yuval-Nae` (not Lightricks), at:

`https://crossbeam.info`

## Local preview

```bash
cd CrossBeam-Clore-Bezalel-40
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Google Sheets workflow

1. Create a Google Sheet with the columns from `content/artists.template.csv`.
2. One row per artist (41 rows).
3. Put image files in `assets/artists/` and set paths like `assets/artists/name-cover.jpg`.
4. File → Download → Comma-separated values (`.csv`) into `content/artists.csv`.
5. Run:

```bash
python3 scripts/csv_to_artists_json.py content/artists.csv
```

6. Commit and push to update the live site.

### Required columns

`id`, `slug`, `cover`, `gallery_1`, `gallery_2`,  
`title_en`, `subtitle_en`, `bio_en`, `body_en`,  
`title_he`, `subtitle_he`, `bio_he`, `body_he`,  
`title_ar`, `subtitle_ar`, `bio_ar`, `body_ar`

`gallery_2` can be left empty when an artist has only one gallery image.

## QR code

Point the printed QR code at `https://crossbeam.info`. Visitors pick a language and open any artist.

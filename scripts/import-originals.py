#!/usr/bin/env python3
"""Add the actual high-resolution originals to the offline photo library.
Run: python3 scripts/import-originals.py /path/to/extracted-original-photo-folder
Safe: copies JPG/PNG/WEBP files without re-encoding, never removes input files.
IMPORTANT: published files will be PUBLIC on the celebration website.
"""
from pathlib import Path
from shutil import copy2
from urllib.parse import quote
import json,sys
if len(sys.argv)!=2:raise SystemExit("Usage: python3 scripts/import-originals.py /path/to/photos")
src=Path(sys.argv[1]).expanduser().resolve()
if not src.is_dir():raise SystemExit("Photo folder not found: "+str(src))
root=Path(__file__).resolve().parents[1]
dst=root/'assets'/'originals';dst.mkdir(exist_ok=True)
photos=[]
for i,p in enumerate(sorted(src.rglob('*'))):
 if not p.is_file() or p.suffix.lower() not in {'.jpg','.jpeg','.png','.webp'}:continue
 name=f'family-original-{len(photos)+1:04d}'+p.suffix.lower()
 copy2(p,dst/name)
 photos.append({'url':'/assets/originals/'+quote(name)})
 # Absolute site-root URL works for both the homepage and the live TV reel.
(root/'assets'/'full-resolution-photos.json').write_text(json.dumps({'images':photos},indent=2))
print(f'Copied {len(photos)} originals into {dst}. They are now PUBLIC if deployed.')

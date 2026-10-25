#!/usr/bin/env python3
"""Remove only the original bottom emblem from the poster.

The seal is animated directly from the original uncut seal_wide.mp4 in
the Android WebView. Do not crop, recomposite or convert its video frames.
"""
from pathlib import Path
import numpy as np
from PIL import Image

assets=Path(__file__).resolve().parents[1]/"app"/"src"/"main"/"assets"
cover=assets/"cover.png"
seal=assets/"seal_wide.mp4"
if not seal.is_file() or seal.stat().st_size < 1000:
    raise RuntimeError("Missing original seal_wide.mp4")
base=np.asarray(Image.open(cover).convert("RGB")).copy()
height,width=base.shape[:2]
if (width,height)!=(1054,1492):
    raise RuntimeError(f"Unexpected cover dimensions: {width}x{height}")

# Remove the original small symbol from the BOTTOM-CENTER of the poster.
# A short feather prevents a hard-edged patch on the Swiss editorial paper.
x1,y1,x2,y2=445,1260,609,1439
part=base[y1:y2,x1:x2].astype(np.float32)
H,W=part.shape[:2]
yy,xx=np.mgrid[:H,:W]
edge=np.minimum.reduce([xx,W-1-xx,yy,H-1-yy]).astype(np.float32)
blend=np.clip(edge/12.0,0,1)[:,:,None]
white=np.full_like(part,255)
base[y1:y2,x1:x2]=(part*(1-blend)+white*blend).astype(np.uint8)
Image.fromarray(base,"RGB").save(cover,optimize=True)
print("Old symbol erased. Original seal_wide.mp4 preserved uncut for bottom-center video overlay.")

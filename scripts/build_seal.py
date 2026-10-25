#!/usr/bin/env python3
"""Replace the original bottom seal with a centered transparent animated WebP.

An alpha animation eliminates the rectangular movie-strip boundary that used
to crop the artwork. It also keeps the seal and all status labels together.
"""
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT=Path(__file__).resolve().parents[1]/'app'/'src'/'main'/'assets'
COVER=ROOT/'cover.png'
SOURCE=ROOT/'seal_wide.mp4'
ANIM=ROOT/'seal_centered.webp'
FALLBACK=ROOT/'seal_fallback.png'

base=np.asarray(Image.open(COVER).convert('RGB')).copy()
H,W=base.shape[:2]
if (W,H)!=(1054,1492):
    raise RuntimeError(f'Unexpected cover size: {W}x{H}')

# Remove the old symbol from the actual BOTTOM of the poster,
# blending the erased region with surrounding editorial white.
x1,y1,x2,y2=449,1208,619,1442
near_l=np.asarray(base[y1:y2,402:429],dtype=np.float32)
near_r=np.asarray(base[y1:y2,666:693],dtype=np.float32)
background=(np.median(near_l,axis=1)+np.median(near_r,axis=1))/2
background=np.clip(background,246,255)
y,x=np.mgrid[y1:y2,x1:x2]
edge=np.minimum.reduce((x-x1,x2-1-x,y-y1,y2-1-y)).astype(np.float32)
a=np.clip(edge/15,0,1)[:,:,None]
base[y1:y2,x1:x2]=np.uint8(base[y1:y2,x1:x2]*(1-a)+background[:,None,:]*a)

# x=340..714: the entire seal+status group is centered at 527px,
# precisely where the removed emblem's center was.
GW,GH=374,204
fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
try: font=ImageFont.truetype(fontfile,16)
except OSError: font=ImageFont.load_default()

sw,sh=map(int,subprocess.check_output([
 'ffprobe','-v','error','-select_streams','v:0','-show_entries',
 'stream=width,height','-of','csv=p=0',str(SOURCE)
],text=True).strip().split(','))
fps=12
reader=subprocess.Popen([
 'ffmpeg','-hide_banner','-loglevel','error','-i',str(SOURCE),
 '-vf',f'fps={fps}','-f','rawvideo','-pix_fmt','rgb24','pipe:1'
],stdout=subprocess.PIPE)
frames=[]
while True:
    raw=reader.stdout.read(sw*sh*3)
    if len(raw)<sw*sh*3: break
    source=np.frombuffer(raw,dtype=np.uint8).reshape(sh,sw,3)
    crop=source[22:220,65:180].astype(np.float32)
    red,green,blue=crop[:,:,0],crop[:,:,1],crop[:,:,2]
    delta=red-np.maximum(green,blue)
    ratio=delta/np.maximum(red,1)
    alpha=np.clip((delta-11)/41,0,1)*np.clip((ratio-.06)/.16,0,1)
    alpha*=np.clip((red-52)/62,0,1)
    alpha=np.clip(alpha*1.9,0,1)
    alpha=Image.fromarray((alpha*255).astype('uint8'),'L').filter(ImageFilter.GaussianBlur(.8))
    intensity=np.clip((red-75)/145,0,1)
    color=np.stack([136+75*intensity,26+20*intensity,43+31*intensity],axis=-1)
    rgba=np.dstack([np.clip(color,0,255).astype('uint8'),np.array(alpha)])
    emblem=Image.fromarray(rgba,'RGBA').resize((130,181),Image.Resampling.LANCZOS)
    pane=Image.new('RGBA',(GW,GH),(0,0,0,0))
    pane.alpha_composite(emblem,(26,11))
    pen=ImageDraw.Draw(pane)
    for i,label in enumerate(('SEAL INTACT','NO DISRUPTION','OVERRIDE READY')):
        pen.text((174,65+29*i),label,font=font,fill=(139,35,48,255))
    frames.append(pane)
reader.stdout.close()
if reader.wait(timeout=60)!=0 or len(frames)<60:
    raise RuntimeError(f'Could not decode seal clip: {len(frames)} frames')

Image.fromarray(base,'RGB').save(COVER,optimize=True)
frames[len(frames)//2].save(FALLBACK,optimize=True)
frames[0].save(ANIM,save_all=True,append_images=frames[1:],
               duration=round(1000/fps),loop=0,
               quality=88,method=4,minimize_size=True)
print(f'Generated {len(frames)} transparent seal frames ({ANIM.stat().st_size} bytes)')

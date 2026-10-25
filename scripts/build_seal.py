#!/usr/bin/env python3
"""Physically replace the bottom-center seal during the APK build.

Sources are the existing, committed cover.png and seal_wide.mp4.
Produces a static fallback in cover.png and a correctly aligned 10s MP4.
"""
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]/'app'/'src'/'main'/'assets'
COVER=ROOT/'cover.png'
SOURCE=ROOT/'seal_wide.mp4'
DEST=ROOT/'seal_bottom.mp4'
BASE=np.array(Image.open(COVER).convert('RGB'),dtype=np.uint8)
HEIGHT,WIDTH=BASE.shape[:2]
assert (WIDTH,HEIGHT)==(1054,1492),(WIDTH,HEIGHT)

# Erase the actual old cross at the BOTTOM of the artwork, not mid-page.
x1,y1,x2,y2=450,1210,614,1435
left=BASE[y1:y2,360:390].astype(float)
right=BASE[y1:y2,680:710].astype(float)
background=np.median(np.concatenate((left,right),axis=1),axis=1)
background=np.maximum(background,248)
y,x=np.mgrid[y1:y2,x1:x2]
edge=np.minimum.reduce((x-x1,x2-1-x,y-y1,y2-1-y)).astype(float)
alpha=np.clip(edge/13,0,1)[...,None]
BASE[y1:y2,x1:x2]=np.uint8(BASE[y1:y2,x1:x2]*(1-alpha)+background[:,None,:]*alpha)
CLEAN=Image.fromarray(BASE)
FONT_PATH='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
try: FONT=ImageFont.truetype(FONT_PATH,14)
except OSError: FONT=ImageFont.load_default()

START_Y=1140
FH=HEIGHT-START_Y
sw,sh=map(int,subprocess.check_output([
 'ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height',
 '-of','csv=p=0',str(SOURCE)
],text=True).strip().split(','))
fps=15
reader=subprocess.Popen([
 'ffmpeg','-hide_banner','-loglevel','error','-i',str(SOURCE),'-vf',f'fps={fps}',
 '-f','rawvideo','-pix_fmt','rgb24','pipe:1'
],stdout=subprocess.PIPE)
writer=subprocess.Popen([
 'ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo',
 '-pix_fmt','rgb24','-s',f'{WIDTH}x{FH}','-r',str(fps),'-i','pipe:0',
 '-an','-c:v','libx264','-preset','veryfast','-crf','24',
 '-pix_fmt','yuv420p','-movflags','+faststart',str(DEST)
],stdin=subprocess.PIPE)

preview=None
count=0
while True:
 raw=reader.stdout.read(sw*sh*3)
 if len(raw)<sw*sh*3: break
 frame=np.frombuffer(raw,dtype=np.uint8).reshape((sh,sw,3))
 # Isolate crimson pigment; remove source video's oversized grey rays.
 crop=frame[20:225,42:175].astype(np.float32)
 red,green,blue=crop[:,:,0],crop[:,:,1],crop[:,:,2]
 dominance=red-np.maximum(green,blue)
 fractional=dominance/np.maximum(red,1)
 mask=np.clip((dominance-12)/43,0,1)*np.clip((fractional-.065)/.23,0,1)
 mask*=np.clip((red-42)/90,0,1)
 mask*=1.7
 lum=np.clip((red-60)/160,0,1)
 rgb=np.stack((124+64*lum,22+25*lum,37+30*lum),axis=-1)
 rgba=np.dstack((np.clip(rgb,0,255).astype('uint8'),
                 (255*np.clip(mask,0,1)).astype('uint8')))
 emblem=Image.fromarray(rgba,'RGBA').resize((140,184),Image.Resampling.LANCZOS)
 img=CLEAN.crop((0,START_Y,WIDTH,HEIGHT)).convert('RGBA')
 img.alpha_composite(emblem,(457,1318-92-START_Y))
 pen=ImageDraw.Draw(img)
 for i,line in enumerate(('SEAL INTACT','NO DISRUPTION','OVERRIDE READY')):
  pen.text((636,1278-START_Y+25*i),line,font=FONT,fill=(134,34,42,255))
 writer.stdin.write(np.asarray(img.convert('RGB'),dtype=np.uint8).tobytes())
 if count==45: preview=img.copy()
 count+=1

reader.stdout.close()
writer.stdin.close()
writer_rc=writer.wait(timeout=120)
reader_rc=reader.wait(timeout=120)
if writer_rc!=0 or reader_rc!=0 or count<30 or preview is None:
 raise RuntimeError(f'Seal video processing failed: {reader_rc=}, {writer_rc=}, {count=}')
final=CLEAN.convert('RGBA')
final.alpha_composite(preview,(0,START_Y))
final.convert('RGB').save(COVER,optimize=True)
print(f'Built aligned seal: {count} frames, {DEST.stat().st_size} video bytes')

"""Create deterministic educational evidence; no real participants or personal data."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess
root=Path(__file__).resolve().parent
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
image=Image.new('RGB',(1400,900),'#faf7f0');draw=ImageDraw.Draw(image)
draw.text((70,50),'План внедрения импорта',fill='#252525',font=ImageFont.truetype(font,50))
draw.text((70,150),'Длительность этапов, дни',fill='#252525',font=ImageFont.truetype(font,32))
for i,(label,value) in enumerate([('Подготовка',2),('Проверка',1)]):
 y=250+i*190
 draw.text((70,y),label,fill='#252525',font=ImageFont.truetype(font,36))
 draw.rectangle((400,y,400+value*330,y+100),fill='#a84e40')
 draw.text((420+value*330,y+20),str(value),fill='#252525',font=ImageFont.truetype(font,40))
draw.text((70,720),'Срок запуска не согласован.',fill='#252525',font=ImageFont.truetype(font,36))
draw.text((70,795),'Учебный пример. Ответственные не назначены.',fill='#555555',font=ImageFont.truetype(font,26))
image.save(root/'implementation-chart.png')
subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-stream_loop','-1','-i',str(root/'meeting-audio-en.wav'),'-loop','1','-i',str(root/'implementation-chart.png'),'-t','120','-vf','scale=700:450','-r','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k',str(root/'educational-meeting-120s.mp4')],check=True)
print('Created synthetic 120-second video and a source chart with known values 2 and 1 day.')

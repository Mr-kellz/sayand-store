from pathlib import Path
import sys,json,subprocess,re
sys.path.insert(0,'/tmp/sayand-video-deps');import imageio_ffmpeg
p=Path(__file__).parent;ff=imageio_ffmpeg.get_ffmpeg_exe();dest=p/'SAYAND-customer-walkthrough.mp4';raw=p/'render'/'walkthrough-original.mp4'
if not raw.exists():dest.rename(raw)
factor=sum(json.loads((p/'timing.json').read_text()))/172
subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-i',str(raw),'-vf',f'setpts=PTS/{factor}', '-af',f'atempo={factor}', '-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-threads','4',str(dest)],check=True)
s=p/'SAYAND-customer-walkthrough.srt';content=s.read_text()
def convert(m):
 h,mi,se,ms=map(int,m.groups());v=round((h*3600000+mi*60000+se*1000+ms)/factor);return f'{v//3600000:02}:{v//60000%60:02}:{v//1000%60:02},{v%1000:03}'
s.write_text(re.sub(r'(\d\d):(\d\d):(\d\d),(\d\d\d)',convert,content))
probe=subprocess.run([ff,'-i',str(dest)],capture_output=True,text=True);print(probe.stderr)
subprocess.run([ff,'-hide_banner','-loglevel','error','-i',str(dest),'-f','null','-'],check=True)
print('FULL DECODE PASSED',dest.stat().st_size)

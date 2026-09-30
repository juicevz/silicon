from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parent
frames = sorted((root / 'frames').glob('*.png'))
if len(frames) != 200:
    raise RuntimeError(f'Expected 200 rendered frames, got {len(frames)}')

source = str(root / 'frames' / '%04d.png')
subprocess.run([
    'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', '25', '-i', source, '-c:v', 'libx264', '-threads', '4',
    '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', str(root / 'silicon-compute-loop.mp4'),
], check=True)
print('MP4 encoded', flush=True)

subprocess.run([
    'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', '25', '-i', source, '-filter_complex_threads', '2',
    '-filter_complex',
    'fps=20,scale=1280:720:flags=lanczos,split[a][b];'
    '[a]palettegen=max_colors=192:stats_mode=diff[p];'
    '[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
    '-loop', '0', str(root / 'silicon-compute-loop.gif'),
], check=True)
print('GIF encoded', flush=True)

for name in ['silicon-compute-loop.mp4', 'silicon-compute-loop.gif', 'silicon-article-diagram.png']:
    path = root / name
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
        '-show_entries', 'stream=codec_name,width,height,duration,nb_read_frames,avg_frame_rate',
        '-of', 'json', str(path),
    ], text=True, capture_output=True, check=True)
    print(json.dumps({'file': name, 'bytes': path.stat().st_size, **json.loads(result.stdout)}), flush=True)

"""Generate original Silicon editorial artwork through Ryan's requested Gemini API."""
import base64
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

PROMPT = '''Create a premium photorealistic industrial product photograph for a GPU compute trading terminal. One bare NVIDIA Hopper-style SXM GPU accelerator module, recognizable rectangular matte-black PCB with dense tiny capacitors, beautiful silver machined central processor package, a deep graphite die reflecting subtle lavender light, HBM memory chips around it, small gold edge contacts, polished mounting holes. Isometric view floating over a pure near-black #0a0b0f studio background, large object centered right at a 30 degree angle. Macro engineering photography, very crisp physical materials and precise solder detail, subtle muted purple rim light on left and pale gold light on right. No neon, no glowing circuitry, no sci-fi holograms, no fake fans. Keep the entire object in frame with 15 percent negative space on each side. Wide 16:9 composition. No text, no labels, no watermark, no UI, no logos. The board fills 72 percent width. Sophisticated real hardware, quiet and tactile, like an expensive industrial design catalogue.'''


def image_block(value):
    if isinstance(value, dict):
        if isinstance(value.get('data'), str) and (value.get('type') == 'image' or str(value.get('mime_type', value.get('mimeType', ''))).startswith('image/')):
            return value['data']
        for child in value.values():
            found = image_block(child)
            if found:
                return found
    if isinstance(value, list):
        for child in value:
            found = image_block(child)
            if found:
                return found
    return None


payload = {'model': 'gemini-3-pro-image', 'input': [{'type': 'text', 'text': PROMPT}],
           'response_format': {'type': 'image', 'mime_type': 'image/jpeg', 'aspect_ratio': '16:9', 'image_size': '2K'}}
request = Request('https://generativelanguage.googleapis.com/v1beta/interactions', data=json.dumps(payload).encode(),
                  headers={'Content-Type': 'application/json', 'x-goog-api-key': os.environ['GEMINI_API_KEY']}, method='POST')
with urlopen(request, timeout=300) as response:
    result = json.load(response)
image = image_block(result)
if not image:
    raise RuntimeError('Gemini returned no image')
output = Path('frontend/public/assets/gpu-editorial.jpg')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(base64.b64decode(image))
print(f'Generated {output} ({output.stat().st_size} bytes)')

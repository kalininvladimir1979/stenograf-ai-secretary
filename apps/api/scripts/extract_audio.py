#!/usr/bin/env python3
"""Extract every audio channel locally; no source video leaves the server."""

from pathlib import Path
import json
import subprocess
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: extract_audio.py INPUT_VIDEO OUTPUT_DIRECTORY", file=sys.stderr)
        return 2

    source = Path(sys.argv[1]).resolve()
    target = Path(sys.argv[2]).resolve()
    if not source.is_file():
        print("Video file is missing.", file=sys.stderr)
        return 2
    target.mkdir(parents=True, exist_ok=True)
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "a",
        "-show_entries", "stream=index,channels", "-of", "json", str(source),
    ], capture_output=True, text=True, timeout=30)
    streams = json.loads(probe.stdout or "{}").get("streams", [])
    if not streams:
        print("Video has no audio streams.", file=sys.stderr)
        return 2
    tracks = []
    for stream_order, stream in enumerate(streams):
        for channel in range(int(stream.get("channels", 1))):
            output = target / f"track-{stream_order + 1}-channel-{channel + 1}.mp3"
            command = [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-map",
        f"0:a:{stream_order}",
        "-vn",
        "-af",
        f"pan=mono|c0=c{channel}",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "48k",
        str(output),
            ]
            completed = subprocess.run(command, capture_output=True, text=True)
            if completed.returncode:
                print(completed.stderr.strip() or "FFmpeg could not extract audio.", file=sys.stderr)
                return completed.returncode
            tracks.append({"id": f"s{stream_order + 1}c{channel + 1}", "label": f"Дорожка {stream_order + 1} · канал {channel + 1}", "path": str(output), "selected": True})
    print(json.dumps({"tracks": tracks}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Render Dragon Rush's original result themes to MP3 with ffmpeg.

Only Python's standard library and an ffmpeg executable with libmp3lame are needed.
The note sequences and synth voices below are original; no samples are used.
"""

from array import array
from math import exp, pi, sin, tanh
from pathlib import Path
import subprocess
import tempfile
import wave


RATE = 44100
ROOT = Path(__file__).resolve().parents[2] / "public/assets/audio/bgm"


THEMES = {
    "victory": {
        "bpm": 120,
        "chords": [
            (48, 52, 55), (53, 57, 60), (55, 59, 62), (48, 52, 55),
            (45, 48, 52), (53, 57, 60), (50, 53, 57), (55, 59, 62),
        ],
        "melody": [
            [(0, 72, 1), (1, 76, 1), (2, 79, 1), (3, 84, 1)],
            [(0, 81, 1), (1, 79, 1), (2, 77, 1), (3, 72, 1)],
            [(0, 74, 1), (1, 79, 1), (2, 83, 1), (3, 86, 1)],
            [(0, 84, 2), (2, 79, 1), (3, 76, 1)],
            [(0, 81, 1), (1, 84, 1), (2, 88, 1), (3, 84, 1)],
            [(0, 81, 1), (1, 77, 1), (2, 72, 1), (3, 77, 1)],
            [(0, 74, 1), (1, 77, 1), (2, 81, 1), (3, 86, 1)],
            [(0, 83, 1), (1, 79, 1), (2, 74, 1), (3, 71, 0.8)],
        ],
        "voice": "brass",
    },
    "defeat": {
        "bpm": 88,
        "chords": [
            (45, 48, 52), (41, 45, 48), (38, 41, 45), (40, 44, 47),
            (45, 48, 52), (41, 45, 48), (38, 41, 45), (40, 44, 47),
        ],
        "melody": [
            [(0, 76, 2), (2, 72, 2)],
            [(0, 69, 2), (2, 72, 1), (3, 69, 1)],
            [(0, 65, 2), (2, 69, 2)],
            [(0, 68, 2), (2, 71, 2)],
            [(0, 72, 2), (2, 69, 2)],
            [(0, 65, 2), (2, 64, 2)],
            [(0, 62, 2), (2, 65, 2)],
            [(0, 68, 2), (2, 64, 1), (3, 59, 0.8)],
        ],
        "voice": "bell",
    },
    "draw": {
        "bpm": 104,
        "chords": [
            (48, 52, 55), (43, 48, 50), (45, 48, 52), (41, 45, 48),
            (50, 53, 57), (43, 48, 50), (41, 45, 48), (43, 48, 50),
        ],
        "melody": [
            [(0, 67, 1.5), (2, 72, 1), (3, 74, 1)],
            [(0, 72, 2), (2, 69, 2)],
            [(0, 69, 1.5), (2, 72, 1), (3, 76, 1)],
            [(0, 72, 2), (2, 69, 2)],
            [(0, 65, 1.5), (2, 69, 1), (3, 72, 1)],
            [(0, 74, 2), (2, 72, 2)],
            [(0, 69, 1.5), (2, 72, 1), (3, 76, 1)],
            [(0, 72, 2), (2, 67, 1), (3, 62, 0.8)],
        ],
        "voice": "bell",
    },
}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add_note(samples, beat_seconds, beat, length, midi, volume, voice):
    first = round(beat * beat_seconds * RATE)
    count = min(round(length * beat_seconds * RATE), len(samples) - first)
    frequency = hz(midi)
    for index in range(count):
        t = index / RATE
        remaining = (count - index) / RATE
        attack = min(1.0, t / (0.035 if voice == "pad" else 0.012))
        release = min(1.0, remaining / (0.22 if voice == "pad" else 0.1))
        if voice == "brass":
            body = (sin(2 * pi * frequency * t) + 0.35 * sin(4 * pi * frequency * t)
                    + 0.16 * sin(6 * pi * frequency * t)) * (0.7 + 0.3 * exp(-t * 2))
        elif voice == "bell":
            body = (sin(2 * pi * frequency * t) + 0.38 * sin(2 * pi * frequency * 2.01 * t)
                    + 0.12 * sin(2 * pi * frequency * 3.97 * t)) * exp(-t * 0.9)
        else:
            body = (sin(2 * pi * frequency * t) + 0.18 * sin(4 * pi * frequency * t))
        samples[first + index] += volume * attack * release * body


def render(name, theme):
    beat_seconds = 60 / theme["bpm"]
    total_seconds = 32 * beat_seconds
    samples = array("f", [0]) * round(total_seconds * RATE)
    for bar, chord in enumerate(theme["chords"]):
        beat = bar * 4
        for midi in chord:
            add_note(samples, beat_seconds, beat, 3.85, midi, 0.07, "pad")
        add_note(samples, beat_seconds, beat, 2.8, chord[0] - 12, 0.12, "pad")
        for step in (0, 1, 2, 3):
            add_note(samples, beat_seconds, beat + step, 0.72, chord[step % 3] + 12,
                     0.045 if name == "victory" else 0.025, "bell")
        for offset, midi, length in theme["melody"][bar]:
            add_note(samples, beat_seconds, beat + offset, length * 0.9, midi,
                     0.19 if name == "victory" else 0.115, theme["voice"])

    pcm = array("h")
    fade_start = len(samples) - round(RATE * 0.16)
    for i, sample in enumerate(samples):
        fade = min(1.0, i / (RATE * 0.02), (len(samples) - i) / (RATE * 0.16))
        pcm.append(round(32767 * tanh(sample * 1.25) * max(0.0, fade)))

    ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        wav_path = Path(directory) / f"{name}.wav"
        with wave.open(str(wav_path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(pcm.tobytes())
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
            "-codec:a", "libmp3lame", "-ac", "2", "-b:a", "192k",
            str(ROOT / f"result_{name}.mp3"),
        ], check=True)
    print(f"result_{name}.mp3: {total_seconds:.2f}s")


for theme_name, theme_score in THEMES.items():
    if theme_name == "victory":
        continue  # Keep the project owner's supplied triumph_of_the_hero.mp3.
    render(theme_name, theme_score)

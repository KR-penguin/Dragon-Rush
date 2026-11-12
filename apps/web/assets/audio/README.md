# Dragon Rush result music

`result_victory.mp3`, `result_defeat.mp3`, and `result_draw.mp3` in
`apps/web/public/assets/audio/bgm/` are original music made for Dragon Rush on
2026-11-12. Codex (OpenAI) wrote the note sequences and synthesized the sound
with `render_result_music.py`; no third-party melody, recording, or sample was
used. The score, generator, and rendered files are included in this project;
the project owner can choose their distribution license.

To regenerate, run `python apps/web/assets/audio/render_result_music.py` from the
repository root with an `ffmpeg` executable that supports `libmp3lame`. The
script uses only Python's standard library. Each MP3 is 44.1 kHz stereo,
192 kb/s and loops as a whole file. The victory theme is 16 seconds, defeat
21.8 seconds, and draw 18.5 seconds.

`dragon_foothills.mp3` predates these compositions and is **not** covered by
this CC0 dedication.

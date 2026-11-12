# Dragon Rush music

`menu.mp3`, `battle.mp3`, and `result_victory.mp3` in
`apps/web/public/assets/audio/bgm/` were provided by the project owner.
The victory track is `Triumph of the Hero.mp3` (119.736 seconds).
The menu track plays on the home, lobby, and board screens; the battle track
plays during live PvP, PvE, and dragon fights.
Their licensing terms were not supplied here.

## Result music

`result_defeat.mp3` and `result_draw.mp3` are original music made for Dragon Rush
on 2026-11-12. Codex (OpenAI) wrote the note sequences and synthesized the sound
with `render_result_music.py`; no third-party melody, recording, or sample was
used. The score, generator, and rendered files are included in this project;
the project owner can choose their distribution license.

To regenerate, run `python apps/web/assets/audio/render_result_music.py` from the
repository root with an `ffmpeg` executable that supports `libmp3lame`. The
script uses only Python's standard library. The generator leaves the supplied
victory file untouched and regenerates only defeat and draw. These files are
44.1 kHz stereo, 192 kb/s and loop as a whole file. Defeat lasts 21.8 seconds
and draw lasts 18.5 seconds.

`dragon_foothills.mp3` predates these compositions and is **not** covered by
this CC0 dedication.

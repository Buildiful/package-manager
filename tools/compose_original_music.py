"""Render 'Parcel Route', an original four-minute instrumental.

Requires numpy, soundfile, and ffmpeg (only for generating the supplied MP3).
The composition and recording are available under CC0-1.0.
"""
from pathlib import Path
import subprocess
import tempfile
import numpy as np
import soundfile as sf

SR = 32000
BEAT = 60 / 96
BARS = 96
DURATION = BARS * 4 * BEAT  # Exactly 240 seconds.
SIZE = int(DURATION * SR)
rng = np.random.default_rng(731)
left = np.zeros(SIZE, dtype=np.float32)
right = np.zeros(SIZE, dtype=np.float32)


def freq(midi):
    return 440.0 * (2 ** ((midi - 69) / 12))


def add_note(start, length, note, level=.1, sound='pluck', pan=0):
    tail = 1.3 if sound == 'pad' else (.30 if sound == 'bass' else .5)
    count = min(int((length + tail) * SR), SIZE - int(start * SR))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SR
    hz = freq(note)
    phase = 2 * np.pi * hz * t
    if sound == 'pad':
        core = (.76 * np.sin(phase) + .17 * np.sin(2*phase + .1) + .07 * np.sin(3*phase))
        core += .24 * np.sin(phase * 1.002 + .6)
        # Slow entrance and released end, airy and unobtrusive.
        attack = 1-np.exp(-t * 2.3)
        release = np.where(t <= length, 1, np.exp(-(t-length)*3.8))
        env = attack * release
    elif sound == 'bass':
        core = .82*np.sin(phase)+.18*np.sin(2*phase)
        env = np.minimum(t/.012,1) * np.exp(-t * 2.5) * np.where(t <= length, 1, np.exp(-(t-length)*10))
    elif sound == 'bell':
        core = .8*np.sin(phase) + .26*np.sin(phase*2.002) + .10*np.sin(phase*3.9)
        env = np.minimum(t/.006,1)*np.exp(-t*3.8)
    else:
        core = .85*np.sin(phase) + .28*np.sin(2*phase+.12) + .10*np.sin(3*phase)
        env = np.minimum(t/.009,1) * np.exp(-t*2.65) * np.where(t <= length, 1, np.exp(-(t-length)*8))
    wave = (core * env * level).astype(np.float32)
    index = int(start*SR)
    left[index:index+count] += wave * np.sqrt((1-pan)*.5)
    right[index:index+count] += wave * np.sqrt((1+pan)*.5)


def add_shaker(start, strength=.013):
    count = int(.085*SR)
    index = int(start*SR)
    if index + count > SIZE: return
    t = np.arange(count, dtype=np.float32)/SR
    raw = rng.normal(0,1,count).astype(np.float32)
    # Crisp high-frequency noise, faded to keep rhythm light.
    raw = np.r_[0, np.diff(raw)].astype(np.float32)
    raw *= (np.exp(-t*55)*strength)
    left[index:index+count] += raw*.64
    right[index:index+count] += raw*.55


# Six sections, each sixteen bars. Handwritten melodic phrases over eight original
# chord voicings. Timbral and motif variations keep the four minutes evolving.
chords = [
    ([48, 55, 59, 64], 36), # Cmaj7
    ([47, 55, 59, 62], 35), # G/B
    ([45, 52, 55, 60], 33), # Am7
    ([47, 52, 55, 59], 40), # Em7
    ([48, 53, 57, 64], 29), # Fmaj7
    ([48, 52, 55, 60], 40), # C/E
    ([50, 53, 57, 60], 38), # Dm7
    ([47, 53, 57, 62], 31), # G7
]
melodies = [
    [76,79,81,79,76,74,72,74,76,72,69,72,74,76,74,71],
    [79,76,74,76,79,81,83,79,76,74,72,69,74,72,71,67],
    [76,79,83,81,79,76,74,72,76,81,79,76,74,72,74,76],
    [83,81,79,76,74,76,79,81,83,79,76,74,72,74,71,72],
    [79,76,81,79,76,72,74,76,79,83,81,79,76,74,72,71],
    [76,74,72,76,79,76,74,72,76,72,69,72,74,71,67,72],
]

for section in range(6):
    start_bar = section * 16
    for chord_index, (notes, root) in enumerate(chords):
        bar_index = start_bar + chord_index * 2
        start = bar_index * 4 * BEAT
        for chord_tone_idx, chord_note in enumerate(notes):
            add_note(start, 8*BEAT-.15, chord_note, .026 + (section in (2,3))*.003,
                     'pad', [-.6, -.18, .20, .57][chord_tone_idx])
        for subdivision in range(8):
            t = start + subdivision*BEAT
            if subdivision % 2 == 0:
                add_note(t, BEAT*.72, root, .115, 'bass', -.10)
            if section != 0 or subdivision % 2 == 1:
                add_shaker(t+.5*BEAT, .0085 if section in (0,5) else .0105)
    for bar in range(16):
        start = (start_bar + bar)*4*BEAT
        current_note = melodies[section][bar]
        add_note(start + .48*BEAT, .8*BEAT, current_note, .102, 'pluck', -.24 if bar%2 else .32)
        # Answering notes; gradually less dense at the beginning and end.
        if bar % 4 != 3 and section in (1,2,3,4):
            answer = current_note + ([-2,2,-4,0][bar%4])
            add_note(start + 2.45*BEAT, .8*BEAT, answer, .061, 'bell', .46 if bar%2 else -.38)
        if bar % 2 == 1:
            passing = current_note + (-2 if section%2 else 2)
            add_note(start + 3.1*BEAT, .58*BEAT, passing, .042, 'pluck', -.36)

# Fade at both ends to prevent boundary clicks; musically resolves to opening C.
fader = np.ones(SIZE, dtype=np.float32)
n = int(.13*SR)
fader[:n] = np.linspace(0,1,n, dtype=np.float32)
n = int(.25*SR)
fader[-n:] = np.linspace(1,0,n, dtype=np.float32)
left *= fader
right *= fader
# Soft saturation retains transients and prevents peaks.
maximum = max(np.max(np.abs(left)),np.max(np.abs(right)))
scale = .74/max(maximum, .001)
left = np.tanh(left*scale*.80).astype(np.float32)
right = np.tanh(right*scale*.80).astype(np.float32)
combined = np.column_stack((left,right))
output = Path(__file__).resolve().parents[1]/'music'/'parcel-route.mp3'
with tempfile.TemporaryDirectory() as temp:
    wav = Path(temp)/'parcel-route.wav'
    sf.write(wav, combined, SR, subtype='PCM_16')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','128k',str(output)],check=True)
print(f'Wrote {output} ({DURATION:g}s, original composition)')

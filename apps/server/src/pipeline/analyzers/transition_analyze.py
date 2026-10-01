"""Phân tích một bài để chuyển bài liền mạch (pipeline/jobs/TransitionJob.js):

  trimStart / trimEnd   — bỏ im lặng đầu/cuối bài (ngưỡng SILENCE_DB)
  introEnd / outroStart — phần "đầu vào" và "đuôi nhỏ dần" theo đường năng lượng: crossfade
                          nên bắt đầu ở outroStart của bài trước chứ không phải giây cuối
  lufs / truePeak       — độ to tích hợp EBU R128 (ffmpeg ebur128) để cân âm lượng giữa các bài
  bpm / beatOffset / beatConfidence — nhịp và vị trí phách đầu, để canh crossfade theo phách

Chỉ cần numpy + ffmpeg (không librosa): giải mã về mono 22 050 Hz, tự tính đường năng lượng,
spectral flux, tự tương quan. Dùng:  python transition_analyze.py <tệp> | --self-check
"""
import json
import re
import subprocess
import sys

import numpy as np

VERSION = 1
SR = 22050
HOP = 512                # ~23 ms
SILENCE_DB = -50.0       # dưới mức này (RMS, dBFS) coi là im lặng
BODY_DROP_DB = 9.0       # intro/outro = đoạn năng lượng thấp hơn "thân bài" quá 9 dB
MIN_BPM, MAX_BPM = 60.0, 200.0


def decode(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def loudness(path):
    err = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
        capture_output=True, text=True,
    ).stderr
    summary = err[err.rfind('Summary:'):]
    lufs = re.search(r'I:\s+(-?[\d.]+|-inf) LUFS', summary)
    peak = re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS', summary)
    num = lambda m: None if not m or m.group(1) == '-inf' else float(m.group(1))
    return num(lufs), num(peak)


def frame_db(x):
    n = len(x) // HOP
    frames = x[: n * HOP].reshape(n, HOP)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-9))


def trim_points(db):
    loud = np.flatnonzero(db > SILENCE_DB)
    if not len(loud):
        return 0.0, len(db) * HOP / SR
    t = lambda i: i * HOP / SR
    return float(max(0.0, t(loud[0]) - 0.05)), float(min(len(db) * HOP / SR, t(loud[-1] + 1) + 0.15))


def intro_outro(db, trim_start, trim_end):
    # Smooth out 3 seconds so that the music/silence in the middle of the sentence doesn't count as "end of song".
    win = max(1, int(3 * SR / HOP))
    power = np.convolve(10 ** (db / 10), np.ones(win) / win, mode='same')
    smooth = 10 * np.log10(np.maximum(power, 1e-12))
    t = np.arange(len(db)) * HOP / SR
    body = smooth[(t >= trim_start) & (t <= trim_end)]
    if not len(body):
        return trim_start, trim_end
    ref = np.percentile(body, 75)
    strong = np.flatnonzero((smooth >= ref - BODY_DROP_DB) & (t >= trim_start) & (t <= trim_end))
    if not len(strong):
        return trim_start, trim_end
    return float(t[strong[0]]), float(t[strong[-1]])


def onset_envelope(x):
    n_fft = 1024
    n = 1 + (len(x) - n_fft) // HOP
    if n < 8:
        return np.zeros(0)
    idx = np.arange(n_fft)[None, :] + HOP * np.arange(n)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(n_fft), axis=1))
    logspec = np.log1p(100 * spec)
    flux = np.maximum(0.0, np.diff(logspec, axis=0)).sum(axis=1)
    local = np.convolve(flux, np.ones(22) / 22, mode='same')  # ~0,5 s
    return np.maximum(0.0, flux - local)


def tempo(env):
    """(bpm, beatOffset giây, độ tin cậy 0..1) — tự tương quan + ưu tiên quanh 120 BPM."""
    if len(env) < 200 or not env.any():
        return None, None, 0.0
    fps = SR / HOP
    # Smoothing ~3 frames: beat cycles rarely round frames (120 BPM = 21.5 frames); no smoothing
    # then the autocorrelation at the correct period is blurred, but at the double period (nearly circular) it wins → measures 60.
    g = np.exp(-0.5 * (np.arange(-4, 5) / 1.5) ** 2)
    env = np.convolve(env, g / g.sum(), mode='same')
    env = env - env.mean()
    ac = np.correlate(env, env, mode='full')[len(env) - 1:]
    ac /= ac[0] if ac[0] else 1.0
    lags = np.arange(len(ac))
    lo, hi = int(fps * 60 / MAX_BPM), min(len(ac) - 2, int(fps * 60 / MIN_BPM))
    bpm_at = 60 * fps / np.maximum(lags, 1)
    prior = np.exp(-0.5 * (np.log2(bpm_at / 120.0) / 1.0) ** 2)
    score = np.where((lags >= lo) & (lags <= hi), ac * prior, -np.inf)
    k = int(np.argmax(score))
    # Parabolic interpolation around the vertex for odd frame periods.
    a, b, c = ac[k - 1], ac[k], ac[k + 1]
    shift = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) else 0.0
    period = k + float(np.clip(shift, -0.5, 0.5))
    bpm = 60 * fps / period
    # Phase: position the first beat so that the total initial energy falling on the right beat is greatest.
    env_pos = np.maximum(env, 0)
    best, best_o = -1.0, 0
    for o in range(int(round(period))):
        pos = np.round(o + period * np.arange(int((len(env) - o) / period))).astype(int)
        s = env_pos[pos[pos < len(env)]].sum()
        if s > best:
            best, best_o = s, o
    return round(float(bpm), 2), round(best_o / fps, 3), round(float(max(0.0, ac[k])), 3)


def analyze_signal(x):
    db = frame_db(x)
    trim_start, trim_end = trim_points(db)
    intro_end, outro_start = intro_outro(db, trim_start, trim_end)
    # Tempo is calculated on a maximum of 120 seconds mid-song — stable enough, much faster.
    mid = len(x) // 2
    span = min(len(x), 120 * SR)
    start = max(0, mid - span // 2)
    bpm, offset, conf = tempo(onset_envelope(x[start:start + span]))
    if offset is not None and bpm:
        # Bring the beat to the time system of the whole song, then take the first beat after trimStart.
        period = 60.0 / bpm
        first = (start / SR + offset) % period
        while first < trim_start:
            first += period
        offset = round(first, 3)
    return {
        'version': VERSION,
        'duration': round(len(x) / SR, 3),
        'trimStart': round(trim_start, 3),
        'trimEnd': round(trim_end, 3),
        'introEnd': round(intro_end, 3),
        'outroStart': round(outro_start, 3),
        'bpm': bpm,
        'beatOffset': offset,
        'beatConfidence': conf,
    }


def self_check():
    rng = np.random.default_rng(0)
    lead, body, tail = 1.5, 30.0, 2.0
    x = np.zeros(int((lead + body + tail) * SR), dtype=np.float32)
    click = (np.hanning(200) * np.sin(np.arange(200) * 0.9)).astype(np.float32)
    beat = 0.5  # 120 BPM
    t = lead
    while t < lead + body - 0.05:
        i = int(t * SR)
        x[i:i + 200] += 0.8 * click
        t += beat
    x[int(lead * SR):int((lead + body) * SR)] += 0.01 * rng.standard_normal(int(body * SR)).astype(np.float32)
    r = analyze_signal(x)
    assert abs(r['trimStart'] - lead) < 0.12, r
    assert abs(r['trimEnd'] - (lead + body)) < 0.3, r
    assert abs(r['bpm'] - 120) < 2, r
    assert abs(((r['beatOffset'] - lead) + beat / 2) % beat - beat / 2) < 0.06, r
    silent = analyze_signal(np.zeros(SR * 3, dtype=np.float32))
    assert silent['bpm'] is None and silent['trimStart'] == 0.0, silent
    print('transition_analyze self-check: ok')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-check']:
        self_check()
    else:
        path = sys.argv[1]
        out = analyze_signal(decode(path))
        out['lufs'], out['truePeak'] = loudness(path)
        print(json.dumps(out))

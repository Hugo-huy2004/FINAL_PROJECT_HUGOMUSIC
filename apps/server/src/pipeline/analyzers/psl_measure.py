#!/usr/bin/env python3
"""PSL — đo điểm bão hoà cảm nhận của một tệp nhạc và suy ra thang bitrate.

In ra JSON: điểm MOS (ViSQOL) của từng mức ứng viên và thang được giữ.
Quy tắc (docs/PSL_TECHNIQUE.md §3.1):
  - chỉ xét mức THẤP HƠN bitrate nguồn — bậc cao nhất của thang luôn là tệp gốc;
  - luôn giữ mức thấp nhất; giữ mức tiếp theo chỉ khi nó hơn mức ĐÃ GIỮ gần nhất
    ít nhất TAU điểm MOS. TAU = 0.10, trên nhiễu đo của ViSQOL (0.032–0.061).

    python3 psl_measure.py <tệp> [--tiers 64,96,128] [--tau 0.10]
    python3 psl_measure.py --self-check
"""
import argparse, json, os, subprocess, sys, tempfile

DEFAULT_TIERS = [64, 96, 128, 160, 192, 256, 320]
# Test compression with the CORRECT encoder that pipeline/jobs/HlsJob.js uses to cut HLS (ffmpeg's AAC-LC, stereo,
# at the original sampling frequency). Measured with another codec (the old version uses MP3), the scale cannot be applied to HLS.
CODEC = "aac"
EXCERPT_SECONDS = 20        # một đoạn giữa bài là đủ đại diện (TN5)
VISQOL_RATE = 48000         # chế độ audio của ViSQOL bắt buộc 48 kHz


def ff(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def probe(path):
    """(thời lượng giây, bitrate kbps). Ưu tiên bitrate của luồng âm thanh để không tính ảnh bìa."""
    info = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-of", "json",
         "-show_entries", "stream=bit_rate:format=duration,bit_rate", path],
        capture_output=True, text=True, check=True).stdout)
    fmt = info.get("format", {})
    bps = (info.get("streams") or [{}])[0].get("bit_rate") or fmt.get("bit_rate")
    return float(fmt.get("duration") or 0), (round(int(bps) / 1000) if bps else None)


def candidates_for(tiers, source_kbps):
    return [t for t in tiers if source_kbps is None or t < source_kbps]


def apply_tau(candidates, mos, tau):
    """So với mức ĐÃ GIỮ gần nhất — mức client thật sự rơi xuống khi mạng yếu — không so với mức liền kề."""
    ladder, dropped = [candidates[0]], []
    for kbps in candidates[1:]:
        gain = mos[kbps] - mos[ladder[-1]]
        if gain >= tau:
            ladder.append(kbps)
        else:
            dropped.append({"kbps": kbps, "gain": round(gain, 3)})
    return ladder, dropped


def measure(path, tiers, tau):
    duration, source_kbps = probe(path)
    candidates = candidates_for(tiers, source_kbps)
    mos, ladder, dropped = {}, [], []
    if candidates:  # nguồn thấp hơn cả mức thấp nhất -> chỉ phục vụ tệp gốc
        from visqol.api import VisqolApi
        api = VisqolApi()
        api.create(mode="audio")
        start = max(0, duration / 2 - EXCERPT_SECONDS / 2)  # đoạn giữa bài, tránh phần mở đầu im lặng
        with tempfile.TemporaryDirectory(prefix="psl-") as work:
            src, ref = os.path.join(work, "src.wav"), os.path.join(work, "ref.wav")
            ff("-ss", str(start), "-t", str(EXCERPT_SECONDS), "-i", path, "-map", "0:a:0", "-ac", "2", src)
            ff("-i", src, "-ar", str(VISQOL_RATE), ref)
            for kbps in candidates:
                enc, dec = (os.path.join(work, f"t{kbps}.{ext}") for ext in ("m4a", "wav"))
                ff("-i", src, "-c:a", CODEC, "-b:a", f"{kbps}k", enc)
                ff("-i", enc, "-ar", str(VISQOL_RATE), "-ac", "2", dec)
                mos[kbps] = round(api.measure(ref, dec).moslqo, 3)
        ladder, dropped = apply_tau(candidates, mos, tau)
    return {
        "file": os.path.basename(path), "codec": CODEC, "declaredKbps": source_kbps,
        "durationSec": round(duration, 1) or None, "tau": tau,
        "mos": mos, "ladder": ladder, "dropped": dropped,
        "peakKbps": source_kbps,  # bậc cao nhất luôn là tệp gốc
        "savedPct": round((1 - sum(ladder) / sum(tiers)) * 100),  # so với dựng đủ mọi mức ứng viên
    }


def self_check():
    """Quy tắc thang, kiểm bằng số liệu ĐO THẬT ở docs/PSL_TECHNIQUE.md."""
    tiers = DEFAULT_TIERS
    a = {64: 2.646, 96: 3.445, 128: 4.132, 160: 4.320, 192: 4.513, 256: 4.635, 320: 4.688}  # §4.2 nguồn lossless
    assert apply_tau(tiers, a, 0.10)[0] == [64, 96, 128, 160, 192, 256]                     # 320k chỉ +0.053
    b = {64: 2.618, 96: 3.930, 128: 4.440, 160: 4.548, 192: 4.649, 256: 4.723, 320: 4.729}  # §4.2 nguồn đã nén
    assert apply_tau(tiers, b, 0.10)[0] == [64, 96, 128, 160, 192]
    ladder, dropped = apply_tau([64, 96, 128], {64: 3.00, 96: 3.06, 128: 3.12}, 0.10)
    assert ladder == [64, 128] and [d["kbps"] for d in dropped] == [96]                    # so với mức ĐÃ GIỮ
    assert apply_tau([64, 96, 128], {64: 3.00, 96: 3.03, 128: 3.05}, 0.10)[0] == [64]      # bão hoà thật
    assert candidates_for(tiers, 158) == [64, 96, 128]                                     # §7.4 không vượt nguồn
    assert candidates_for(tiers, 60) == [] and candidates_for(tiers, None) == tiers
    print("psl_measure self-check: ok")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        self_check()
        sys.exit(0)
    p = argparse.ArgumentParser()
    p.add_argument("path")
    p.add_argument("--tiers", default=",".join(map(str, DEFAULT_TIERS)))
    p.add_argument("--tau", type=float, default=0.10)
    a = p.parse_args()
    try:
        print(json.dumps(measure(a.path, sorted(int(t) for t in a.tiers.split(",")), a.tau), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "file": os.path.basename(a.path)}), file=sys.stderr)
        sys.exit(1)

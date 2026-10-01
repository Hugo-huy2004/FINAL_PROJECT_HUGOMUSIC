#!/usr/bin/env python3
"""So sánh codec ở cùng bitrate bằng ViSQOL, trên nhạc thật.

Câu hỏi cần trả lời: ở mỗi mức bitrate, codec nào cho chất lượng cảm nhận cao
nhất? Và cụ thể hơn: Opus ở bitrate thấp có bằng AAC/MP3 ở bitrate cao hơn không?
Nếu có thì tier thấp — tier quan trọng nhất với mạng yếu — có thể nhẹ đi đáng kể.

Dùng: python3 research/codec_compare.py <file...> [--bitrates 64,96,128]
"""
import argparse, json, os, subprocess, statistics, tempfile, shutil, sys

# 'aac' = bộ mã hoá AAC dựng sẵn trong ffmpeg. 'libopus' = Opus tham chiếu.
CODECS = {
    "mp3":  ["-c:a", "libmp3lame"],
    "aac":  ["-c:a", "aac"],
    "opus": ["-c:a", "libopus", "-vbr", "on"],
}
EXT = {"mp3": "mp3", "aac": "m4a", "opus": "opus"}
DEFAULT_BITRATES = [48, 64, 96, 128, 192]
EXCERPT_SECONDS = 20
VISQOL_SR = 48000


def ff(*a):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)


def duration_of(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path], capture_output=True, text=True)
    try:
        return float(r.stdout.strip().splitlines()[0])
    except Exception:
        return 0.0


def compare(api, src, bitrates, work):
    dur = duration_of(src)
    start = max(0, dur / 2 - EXCERPT_SECONDS / 2) if dur else 0
    ref = os.path.join(work, "ref.wav")
    ff("-ss", str(start), "-t", str(EXCERPT_SECONDS), "-i", src,
       "-ar", str(VISQOL_SR), "-ac", "2", ref)

    out = {}
    for codec, flags in CODECS.items():
        out[codec] = {}
        for kbps in bitrates:
            enc = os.path.join(work, f"{codec}_{kbps}.{EXT[codec]}")
            dec = os.path.join(work, f"{codec}_{kbps}.wav")
            ff("-i", ref, *flags, "-b:a", f"{kbps}k", "-vn", enc)
            # Giải mã về đúng 48 kHz stereo: Opus mã hoá nội bộ ở 48 kHz nhưng
            # phải chuẩn hoá lại để ViSQOL so sánh công bằng với các codec khác.
            ff("-i", enc, "-ar", str(VISQOL_SR), "-ac", "2", dec)
            out[codec][kbps] = round(api.measure(ref, dec).moslqo, 3)
            # Dung lượng thật, vì VBR không bám sát bitrate danh nghĩa.
            out[codec][f"{kbps}_bytes"] = os.path.getsize(enc)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("paths", nargs="+")
    p.add_argument("--bitrates", default=",".join(map(str, DEFAULT_BITRATES)))
    a = p.parse_args()
    bitrates = sorted(int(b) for b in a.bitrates.split(","))

    from visqol.api import VisqolApi
    api = VisqolApi(); api.create(mode="audio")

    per_file = []
    for src in a.paths:
        work = tempfile.mkdtemp(prefix="codec-")
        try:
            r = compare(api, src, bitrates, work)
            per_file.append({"file": os.path.basename(src), "mos": r})
            print(f"\n{os.path.basename(src)[:52]}")
            for codec in CODECS:
                row = "  ".join(f"{k}k={r[codec][k]:.2f}" for k in bitrates)
                print(f"  {codec:>4}: {row}", flush=True)
        except Exception as e:
            print(f"\n{os.path.basename(src)[:52]}  LỖI: {e}", flush=True)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    if per_file:
        print("\n=== TRUNG BÌNH TRÊN " + str(len(per_file)) + " BÀI ===")
        print("bitrate | " + " | ".join(f"{c:>6}" for c in CODECS))
        avg = {}
        for kbps in bitrates:
            avg[kbps] = {c: statistics.mean(f["mos"][c][kbps] for f in per_file) for c in CODECS}
            print(f"{kbps:>6}k | " + " | ".join(f"{avg[kbps][c]:>6.3f}" for c in CODECS))

        print("\n=== OPUS TIẾT KIỆM ĐƯỢC BAO NHIÊU ===")
        print("Với mỗi mức AAC, tìm bitrate Opus thấp nhất đạt MOS tương đương:")
        for kbps in bitrates:
            target = avg[kbps]["aac"]
            match = next((k for k in bitrates if avg[k]["opus"] >= target), None)
            if match is None:
                print(f"  AAC {kbps}k (MOS {target:.3f}) -> Opus không đạt trong dải đo")
            elif match < kbps:
                print(f"  AAC {kbps}k (MOS {target:.3f}) -> Opus {match}k đủ "
                      f"(nhẹ hơn {round((1-match/kbps)*100)}%)")
            else:
                print(f"  AAC {kbps}k (MOS {target:.3f}) -> Opus cần {match}k (không lợi)")

    # Kết quả vào DB, không ghi tệp:  … | node research/saveResult.js codec_compare
    print(json.dumps(per_file, indent=1))


if __name__ == "__main__":
    main()

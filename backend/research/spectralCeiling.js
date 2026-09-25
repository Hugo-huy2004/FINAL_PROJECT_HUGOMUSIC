// ĐO TRẦN THÔNG TIN THẬT CỦA FILE ÂM THANH ĐÃ QUA NÉN MẤT DỮ LIỆU
//
// ---------------------------------------------------------------------------
// BÀI TOÁN
// ---------------------------------------------------------------------------
// Bitrate ghi trong container KHÔNG nói lên chất lượng thật. Một file khai 320
// kbps có thể đã được chuyển mã lên từ bản 128 kbps: dung lượng gấp 2.5 lần
// nhưng lượng thông tin y hệt bản gốc 128 kbps. Kho cộng đồng (Internet Archive,
// netlabel, nội dung người dùng tải lên) đầy những file như vậy — đo trên 20 file
// FLAC trong kho này: 5 file là "lossless giả", tỉ lệ phình tới 10.6 lần.
//
// ---------------------------------------------------------------------------
// NGUYÊN LÝ
// ---------------------------------------------------------------------------
// Mọi bộ mã hoá mất dữ liệu đều cắt tần số cao để dồn bit cho dải tai nghe rõ.
// Điểm cắt tỉ lệ với bitrate và KHÔNG PHỤC HỒI ĐƯỢC — mã hoá lại ở bitrate cao
// hơn không tạo lại phần đã mất. Nên điểm cắt phổ là dấu vân tay của LẦN NÉN
// ĐẦU TIÊN, bất kể file bị mã hoá lại bao nhiêu lần sau đó.
//
// Đây là chỗ nối hai ngành vốn tách rời: giám định âm thanh (phát hiện nén nhiều
// lần, vốn dùng để xác thực bản ghi) nay dùng để QUYẾT ĐỊNH THANG BITRATE.
//
// Không cần bản gốc để đối chiếu (reference-free) — chỉ cần chính file đang có.
//
// ---------------------------------------------------------------------------
// HAI TIÊU CHÍ (cả hai đều cần — rút ra từ đo đạc, không phải giả định)
// ---------------------------------------------------------------------------
// Đo ba loại tín hiệu trong kho cho ba hồ sơ phổ khác hẳn nhau:
//
//   Lossless thật     -39.8 -> -48.7 dB    thoải ~0.9 dB/kHz   KHÔNG chạm sàn
//   Bị codec cắt      -84.3 -> -91.0 dB    dốc ~6 dB/kHz       CHẠM sàn im lặng
//   Thu tối tự nhiên  -64.5 -> -87.3 dB    thoải ~2.3 dB/kHz   KHÔNG chạm sàn
//
// Chỉ dùng ngưỡng năng lượng thì bản thu tối (giọng nói, guitar mộc) bị kết luận
// nhầm là đã qua nén. Phải cộng thêm điều kiện CHẠM SÀN IM LẶNG SỐ: bộ mã hoá
// ghi đúng số 0 lên dải đã cắt, còn âm thanh thật dù tối đến đâu vẫn còn dư âm.
//
// ---------------------------------------------------------------------------
// LẤY MẪU NHIỀU CỬA SỔ
// ---------------------------------------------------------------------------
// Đo một cửa sổ 30 giây duy nhất cho kết quả sai khi cửa sổ rơi trúng đoạn lặng
// hoặc đoạn nhạc tối — đã gặp thật khi thử: cùng một file cho hai kết luận khác
// nhau tuỳ vị trí cửa sổ. Nên lấy nhiều cửa sổ rồi lấy năng lượng LỚN NHẤT mỗi
// dải: đoạn to nhất mới bộc lộ đúng băng thông thật của bản thu.

const { execFileSync, spawnSync } = require('child_process');

// ffmpeg báo -91.0 dB cho im lặng số tuyệt đối ở 16-bit; cụm sàn đo được nằm ở
// [-91.0, -90.3]. Tín hiệu thật tối nhất đo được là -87.3. Lấy -89.5 nằm giữa.
const DIGITAL_SILENCE_DB = -89.5;


const BAND_WIDTH_HZ = 1000;
const LOWEST_PROBE_HZ = 10000;   // dưới mức này thì không còn là chuyện nén nữa
const WINDOW_SECONDS = 15;
const WINDOW_POSITIONS = [0.25, 0.5, 0.75];  // ba vị trí trong bài

/**
 * Năng lượng trung bình (dB) trong dải [loHz, hiHz] của một cửa sổ thời gian.
 * Chồng 2 tầng highpass + 2 tầng lowpass -> dốc ~24 dB/octave, đủ để năng lượng
 * dải bên cạnh không rò sang làm sai số đo.
 */
function bandEnergyDb(filePath, loHz, hiHz, startSeconds, seconds = WINDOW_SECONDS) {
  const chain = [
    `highpass=f=${loHz}:poles=2`,
    `highpass=f=${loHz}:poles=2`,
    `lowpass=f=${hiHz}:poles=2`,
    `lowpass=f=${hiHz}:poles=2`,
    'volumedetect',
  ].join(',');

  // ffmpeg ghi kết quả volumedetect ra STDERR chứ không phải stdout, nên phải
  // dùng spawnSync (execFileSync chỉ trả về stdout).
  const res = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats',
    '-ss', String(Math.max(0, startSeconds)), '-t', String(seconds),
    '-i', filePath,
    '-vn', '-af', chain, '-f', 'null', '-',
  ], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });

  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(res.stderr || '');
  return m ? parseFloat(m[1]) : null;
}

/** Tần số lấy mẫu, codec và bitrate khai báo trong container. */
function probeFormat(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,codec_name:format=bit_rate,duration',
    '-of', 'default=nw=1',
    filePath,
  ], { encoding: 'utf8', timeout: 60000 });

  const grab = (k) => {
    const m = new RegExp(`^${k}=(.+)$`, 'm').exec(out);
    return m ? m[1].trim() : null;
  };
  return {
    codec: grab('codec_name'),
    sampleRate: Number(grab('sample_rate')) || null,
    declaredKbps: Math.round(Number(grab('bit_rate')) / 1000) || null,
    durationSec: Number(grab('duration')) || null,
  };
}

/**
 * Hồ sơ phổ: với mỗi dải 1 kHz từ 10 kHz tới Nyquist, lấy năng lượng LỚN NHẤT
 * qua nhiều cửa sổ thời gian.
 */
function spectralProfile(filePath, sampleRate, durationSec) {
  const nyquist = (sampleRate || 44100) / 2;
  const starts = durationSec && durationSec > WINDOW_SECONDS * 2
    ? WINDOW_POSITIONS.map((p) => Math.floor(durationSec * p - WINDOW_SECONDS / 2))
    : [0];

  // Dừng TRƯỚC Nyquist một dải: dải sát Nyquist (22.0-22.05 kHz ở 44.1 kHz) chỉ
  // rộng vài chục Hz và luôn đọc ra sàn do bộ lọc chống chồng phổ của chính máy
  // thu, không liên quan tới nén. Đo nó vào là tự tạo dương tính giả.
  const topHz = Math.floor(nyquist / BAND_WIDTH_HZ) * BAND_WIDTH_HZ;

  const profile = [];
  for (let lo = LOWEST_PROBE_HZ; lo + BAND_WIDTH_HZ <= topHz; lo += BAND_WIDTH_HZ) {
    const hi = lo + BAND_WIDTH_HZ;
    let best = null;
    for (const s of starts) {
      const db = bandEnergyDb(filePath, lo, hi, s);
      if (db != null && (best == null || db > best)) best = db;
    }
    profile.push({ loHz: lo, hiHz: hi, db: best });
  }
  return profile;
}

/**
 * Tìm vách cắt của codec trong hồ sơ phổ.
 *
 * TIÊU CHÍ: từ vách trở lên, gần như TOÀN BỘ dải phải nằm ở im lặng số, và
 * vùng im lặng đó phải đủ rộng. Bộ mã hoá ghi đúng số 0 lên phần đã cắt nên
 * vùng câm trải dài tới hết phổ; suy giảm tự nhiên thì thoải dần và không bao
 * giờ chạm sàn.
 *
 * Vì sao KHÔNG dùng độ dốc: đo thật cho thấy độ dốc không tách được hai lớp.
 * File "Glass_Waltz" bị cắt rõ ở 14 kHz (9 dải liên tiếp câm) nhưng dốc chỉ
 * 3.3 dB/kHz, thấp hơn cả ngưỡng đặt ra — vì phần dưới vách vốn đã rất tối.
 * Ngược lại một file phổ đầy có thể dốc 12.7 dB/kHz ở mép Nyquist mà không hề
 * bị nén. Độ dốc vẫn được trả về làm số liệu tham khảo, nhưng không dùng để
 * quyết định.
 */
const MIN_SILENT_BANDS = 3;        // vùng câm phải rộng ít nhất 3 kHz
const SILENT_RATIO = 0.8;          // cho phép 20% dải lẻ nhô lên khỏi sàn
const NYQUIST_GUARD_HZ = 2000;     // vách phải thấp hơn Nyquist chừng này

function findCodecCliff(profile, sampleRate) {
  const nyquist = (sampleRate || 44100) / 2;
  const maxCutoffHz = nyquist - NYQUIST_GUARD_HZ;

  for (let i = 1; i < profile.length; i += 1) {
    const band = profile[i];
    if (band.db == null || band.db > DIGITAL_SILENCE_DB) continue;
    if (band.loHz > maxCutoffHz) break;

    const above = profile.slice(i);
    if (above.length < MIN_SILENT_BANDS) break;

    const silent = above.filter((b) => b.db != null && b.db <= DIGITAL_SILENCE_DB).length;
    if (silent / above.length < SILENT_RATIO) continue;

    // Độ dốc dẫn vào vách — chỉ để báo cáo, không dùng để quyết định.
    const from = Math.max(0, i - 3);
    const span = (band.loHz - profile[from].loHz) / 1000;
    const cliffDbPerKhz = span > 0 ? Number(((profile[from].db - band.db) / span).toFixed(1)) : null;

    return { cutoffHz: band.loHz, cliffDbPerKhz, silentBands: silent };
  }
  return null;
}

// Bảng tra điểm cắt -> trần bitrate thật. HIỆU CHUẨN BẰNG ĐO ĐẠC trên nhạc thật
// (research/calibrateCeiling.js), không lấy từ tài liệu. Mỗi mục là biên DƯỚI của
// điểm cắt ứng với hạng bitrate đó.
//
// Số liệu hiệu chuẩn (MP3, LAME, trung bình 3 bản nhạc thật):
//   64k -> 16.3 kHz | 96k -> 18.0 | 128k -> 18.3 | 160k -> 19.0 | 192k -> 19.7
// AAC cùng bitrate giữ được cao hơn MP3 khoảng 1 kHz.
const CALIBRATION = [
  { minCutoffHz: 20000, ceilingKbps: 320 },
  { minCutoffHz: 19000, ceilingKbps: 192 },
  { minCutoffHz: 18500, ceilingKbps: 160 },
  { minCutoffHz: 17500, ceilingKbps: 128 },
  { minCutoffHz: 16000, ceilingKbps: 96 },
  { minCutoffHz: 0,     ceilingKbps: 64 },
];

function ceilingFromCutoff(cutoffHz) {
  if (cutoffHz == null) return 1411;  // không có vách -> coi như phổ đầy
  const hit = CALIBRATION.find((c) => cutoffHz >= c.minCutoffHz);
  return hit ? hit.ceilingKbps : 64;
}

/**
 * Phân tích đầy đủ một file.
 *
 *   declaredKbps   - bitrate container KHAI BÁO
 *   cutoffHz       - vách cắt codec đo được (null = không có vách)
 *   ceilingKbps    - trần thông tin THẬT suy ra từ vách
 *   inflationRatio - khai báo / thật. >1.3 nghĩa là file đã bị chuyển mã lên:
 *                    tốn dung lượng mà không thêm một chút thông tin nào.
 */
function analyze(filePath) {
  const fmt = probeFormat(filePath);
  const profile = spectralProfile(filePath, fmt.sampleRate, fmt.durationSec);
  const cliff = findCodecCliff(profile, fmt.sampleRate);

  const ceilingKbps = ceilingFromCutoff(cliff ? cliff.cutoffHz : null);
  const effectiveCeiling = Math.min(ceilingKbps, fmt.declaredKbps || ceilingKbps);
  const inflationRatio = fmt.declaredKbps ? fmt.declaredKbps / ceilingKbps : null;

  return {
    ...fmt,
    cutoffHz: cliff ? cliff.cutoffHz : null,
    cliffDbPerKhz: cliff ? cliff.cliffDbPerKhz : null,
    silentBands: cliff ? cliff.silentBands : 0,
    ceilingKbps: effectiveCeiling,
    inflationRatio: inflationRatio ? Number(inflationRatio.toFixed(2)) : null,
    inflated: inflationRatio != null && inflationRatio > 1.3,
    profile,
  };
}

module.exports = {
  analyze, spectralProfile, findCodecCliff, bandEnergyDb, probeFormat, ceilingFromCutoff,
  DIGITAL_SILENCE_DB, CALIBRATION,
};

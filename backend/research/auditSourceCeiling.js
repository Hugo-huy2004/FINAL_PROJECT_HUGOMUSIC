// Chấm từng bài theo quy tắc: được phép giữ file dưới 1411 kbps CHỈ KHI nhà
// sản xuất/tác giả không hề phát hành bản nào tốt hơn. Nếu nguồn có sẵn bản
// tốt hơn mà ta lại đang giữ bản thấp (do trước đây mạng yếu nên tải bản nhẹ),
// thì bài đó phải tải lại — không được giữ nguyên.
//
// Cách làm: với mỗi item trên archive.org, đọc metadata để biết item đó thực sự
// phát hành những định dạng nào, rồi tìm bản tốt nhất ứng với ĐÚNG bản thu ta
// đang có (khớp theo tên file gốc lưu trong externalId, không phải khớp cả item
// — một item có thể chứa nhiều bài khác nhau).
//
// Chỉ đọc metadata (JSON nhẹ), không tải file nhạc.
//
// Kết quả phân loại:
//   KEEP_AT_CEILING  - ta đang giữ đúng bản tốt nhất nguồn có -> giữ, kể cả <1411
//   REFETCH          - nguồn có bản tốt hơn -> phải tải lại
//   NO_SOURCE        - không tra được nguồn -> cần quyết định riêng
//
// Dùng: node research/auditSourceCeiling.js

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Song = require('../models/Song');

const AUDIT_IN = path.join(__dirname, 'results', 'audio_quality_audit.json');
const OUT_PATH = path.join(__dirname, 'results', 'source_ceiling_audit.json');
const CONCURRENCY = 2;

// Xếp hạng định dạng archive.org theo chất lượng. Số lớn hơn = tốt hơn.
const FORMAT_RANK = {
  '24bit flac': 100,
  'flac': 90,
  'wave': 85,
  'wav': 85,
  'aiff': 85,
  'shorten': 80,
  'ogg vorbis': 50,
  'vbr mp3': 40,
  'mp3': 35,
  '64kbps mp3': 20,
  '32kbps mp3': 10,
};

function rankOf(format) {
  const f = (format || '').toLowerCase().trim();
  if (FORMAT_RANK[f] != null) return FORMAT_RANK[f];
  if (f.includes('24bit') && f.includes('flac')) return 100;
  if (f.includes('flac')) return 90;
  if (f.includes('wav') || f.includes('aiff')) return 85;
  if (f.includes('mp3')) return 35;
  return 0;
}

// "ia_The_Beautiful_Machine-16742_Josh_Woodward_-_03_-_Shot_Down.mp3"
// -> "Josh_Woodward_-_03_-_Shot_Down"  (tên bản thu, bỏ tiền tố item và đuôi)
function trackStemFromExternalId(externalId, identifier) {
  if (!externalId) return null;
  let s = externalId.replace(/^ia_/, '');
  if (identifier && s.startsWith(`${identifier}_`)) s = s.slice(identifier.length + 1);
  return s.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

function identifierFromSourceUrl(sourceUrl) {
  const m = /archive\.org\/details\/([^/?#]+)/.exec(sourceUrl || '');
  return m ? decodeURIComponent(m[1]) : null;
}

// Chuẩn hoá để so tên file giữa DB và archive.org: hai bên khác nhau ở dấu
// cách/gạch dưới/dấu câu nên phải bỏ hết ký tự không phải chữ-số mới khớp được.
function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchItem(identifier) {
  // Thử lại có giãn cách: archive.org khi quá tải/giới hạn tốc độ vẫn trả
  // HTTP 200 nhưng body rỗng. Nếu coi đó là "tra xong, không có file" thì sẽ
  // kết luận nhầm hàng loạt bài là không có nguồn — một item nhạc thật luôn
  // phải có ít nhất một file audio, nên body không có file = tra hỏng.
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const audioCount = (json.files || []).filter((f) => rankOf(f.format) > 0).length;
      if (audioCount === 0) throw new Error('metadata rỗng (nhiều khả năng bị giới hạn tốc độ)');
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function main() {
  if (!fs.existsSync(AUDIT_IN)) {
    console.error('Chạy trước: node research/auditBitrate.js');
    process.exit(1);
  }
  const bitrateById = new Map(
    JSON.parse(fs.readFileSync(AUDIT_IN, 'utf8')).map((a) => [a.id, a])
  );

  await connectDB();
  const songs = await Song.find({}).select('title artist sourceUrl externalId duration');
  console.log(`Đang tra nguồn cho ${songs.length} bài...\n`);

  // Gom theo item: một item chứa nhiều bài, chỉ cần gọi metadata một lần.
  const byIdentifier = new Map();
  const noSource = [];
  for (const song of songs) {
    const id = identifierFromSourceUrl(song.sourceUrl);
    if (!id) { noSource.push(song); continue; }
    if (!byIdentifier.has(id)) byIdentifier.set(id, []);
    byIdentifier.get(id).push(song);
  }
  console.log(`  ${byIdentifier.size} item cần tra (cho ${songs.length - noSource.length} bài)\n`);

  const results = [];
  for (const song of noSource) {
    results.push({
      id: song._id.toString(), title: song.title, artist: song.artist,
      verdict: 'NO_SOURCE', currentKbps: bitrateById.get(song._id.toString())?.kbps ?? null,
    });
  }

  const identifiers = [...byIdentifier.keys()];
  let done = 0;

  async function worker() {
    while (identifiers.length) {
      const identifier = identifiers.shift();
      if (!identifier) break;
      const group = byIdentifier.get(identifier);
      let meta = null;
      try {
        meta = await fetchItem(identifier);
      } catch (err) {
        for (const song of group) {
          results.push({
            id: song._id.toString(), title: song.title, artist: song.artist,
            verdict: 'NO_SOURCE', reason: `metadata: ${err.message}`,
            currentKbps: bitrateById.get(song._id.toString())?.kbps ?? null,
          });
        }
        done += 1;
        continue;
      }

      const files = (meta.files || []).filter((f) => rankOf(f.format) > 0);
      for (const song of group) {
        const cur = bitrateById.get(song._id.toString());
        const stem = trackStemFromExternalId(song.externalId, identifier);
        const stemNorm = normalize(stem);

        // Chỉ so với các file CÙNG bản thu, không so với cả item.
        const sameTrack = stemNorm
          ? files.filter((f) => {
              const fNorm = normalize(f.name.replace(/\.[a-z0-9]+$/i, ''));
              return fNorm.includes(stemNorm) || stemNorm.includes(fNorm);
            })
          : [];

        const pool = sameTrack.length ? sameTrack : [];
        const best = pool.reduce((a, b) => (rankOf(b.format) > rankOf(a?.format) ? b : a), null);

        if (!best) {
          results.push({
            id: song._id.toString(), title: song.title, artist: song.artist,
            identifier, verdict: 'NO_SOURCE', reason: 'không khớp được file gốc',
            currentKbps: cur?.kbps ?? null,
          });
          continue;
        }

        const bestKbps = song.duration && best.size
          ? Math.round((Number(best.size) * 8) / song.duration / 1000)
          : null;
        // Hơn 15% mới coi là "tốt hơn thật sự" — chênh vài phần trăm chỉ là
        // khác biệt do đóng gói, tải lại không đáng.
        const better = bestKbps && cur?.kbps ? bestKbps > cur.kbps * 1.15 : false;

        results.push({
          id: song._id.toString(), title: song.title, artist: song.artist,
          identifier,
          currentKbps: cur?.kbps ?? null,
          bestFormat: best.format,
          bestKbps,
          bestFileName: best.name,
          verdict: better ? 'REFETCH' : 'KEEP_AT_CEILING',
        });
      }
      done += 1;
      if (done % 25 === 0) console.log(`  ...đã tra ${done}/${byIdentifier.size} item`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

  const by = (v) => results.filter((r) => r.verdict === v);
  const keep = by('KEEP_AT_CEILING');
  const refetch = by('REFETCH');
  const none = by('NO_SOURCE');

  console.log('\n=== KẾT QUẢ THEO QUY TẮC "TRẦN CỦA NHÀ SẢN XUẤT" ===');
  console.log(`  GIỮ - đã là bản tốt nhất nguồn có : ${keep.length}`);
  console.log(`     trong đó dưới 1411 kbps        : ${keep.filter((r) => r.currentKbps && r.currentKbps < 1411).length}`);
  console.log(`  TẢI LẠI - nguồn có bản tốt hơn    : ${refetch.length}`);
  console.log(`     tải lại sẽ đạt >= 1411 kbps    : ${refetch.filter((r) => r.bestKbps >= 1411).length}`);
  console.log(`     tải lại vẫn < 1411 kbps        : ${refetch.filter((r) => r.bestKbps < 1411).length}`);
  console.log(`  KHÔNG TRA ĐƯỢC NGUỒN              : ${none.length}`);
  console.log(`\nĐã ghi: ${OUT_PATH}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

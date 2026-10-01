// Sửa ảnh bìa SAI: ảnh giữ chỗ (ảnh stock Unsplash, không liên quan tới bài) và ảnh đã mất trên R2 (DB trỏ
// tới tệp không còn). Ảnh thay thế lấy từ CHÍNH item nguồn trên archive.org (ảnh bìa của album đó); nguồn
// không có ảnh thì bỏ trống → ứng dụng tự vẽ ảnh theo tên bài (CoverArt), không gắn ảnh không liên quan.
// Ảnh mới lưu theo item (covers/ia/<item>.<ext>) nên các bài cùng album dùng chung một tệp.
//
//   node scripts/catalog/repairCovers.js            liệt kê bài ảnh sai
//   node scripts/catalog/repairCovers.js --apply    sửa (ghi R2 + DB, biên bản: research result 'cover_repair')
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Song = require('../../models/Song');
const redis = require('../../config/redis');
const { headR2, uploadToR2, keyFromR2Url } = require('../../utils/r2');
const { saveResult } = require('../../utils/researchStore');
const { identifierFromSourceUrl, fetchItem } = require('./backfillLicenses');

const IMAGE = new Set(['JPEG', 'PNG', 'GIF']);
const PLACEHOLDER = /images\.unsplash\.com/;

// Ảnh bìa ứng viên của item: ảnh gốc tên "cover/front/folder/artwork" trước, rồi ảnh gốc lớn nhất.
function imageCandidates(files) {
  const imgs = files.filter((f) => IMAGE.has(f.format) && f.source === 'original');
  return imgs.sort((a, b) => (/cover|front|folder|artwork/i.test(b.name) - /cover|front|folder|artwork/i.test(a.name)) || (Number(b.size) - Number(a.size)));
}

// archive.org đôi khi trả 500 tạm thời, có khi một tệp hỏng hẳn: thử lại 3 lần, rồi sang ảnh ứng viên kế tiếp.
async function download(identifier, candidates) {
  for (const img of candidates) {
    const url = `https://archive.org/download/${identifier}/${encodeURIComponent(img.name)}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt));
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) }).catch(() => null);
      if (res?.ok) return { img, url, res };
    }
  }
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const songs = await Song.find({}).select('title coverArt sourceUrl').lean();
  const missing = new Map();
  let i = 0;
  const keys = [...new Set(songs.map((s) => keyFromR2Url(s.coverArt)).filter(Boolean))];
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (i < keys.length) { const k = keys[i++]; try { await headR2(k); } catch { missing.set(k, true); } }
  }));
  const bad = songs.filter((s) => !s.coverArt || PLACEHOLDER.test(s.coverArt) || missing.has(keyFromR2Url(s.coverArt)));
  console.log(`${bad.length} bài ảnh sai (giữ chỗ: ${bad.filter((s) => PLACEHOLDER.test(s.coverArt || '')).length}, mất trên R2: ${bad.filter((s) => missing.has(keyFromR2Url(s.coverArt))).length})`);

  const log = [];
  const byItem = new Map();
  for (const s of bad) { const id = identifierFromSourceUrl(s.sourceUrl) || '(không nguồn)'; (byItem.get(id) || byItem.set(id, []).get(id)).push(s); }
  for (const [identifier, group] of byItem) {
    let url = null, source = null;
    if (identifier !== '(không nguồn)') {
      try {
        const meta = await fetchItem(identifier);
        const candidates = imageCandidates(meta.files || []);
        if (candidates.length) {
          if (apply) {
            const got = await download(identifier, candidates);
            if (!got) throw new Error('mọi ảnh của item đều tải lỗi');
            source = got.url;
            const ext = (got.img.name.match(/\.(jpe?g|png|gif)$/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
            url = await uploadToR2(Buffer.from(await got.res.arrayBuffer()), `covers/ia/${identifier}.${ext}`, got.res.headers.get('content-type') || 'image/jpeg');
          } else {
            source = `https://archive.org/download/${identifier}/${encodeURIComponent(candidates[0].name)}`;
          }
        }
      } catch (e) {
        console.log(`  BỎ QUA ${identifier}: ${e.message}`);
        continue;
      }
    }
    for (const s of group) {
      log.push({ id: String(s._id), title: s.title, before: s.coverArt, after: url, source, action: source ? 'ảnh nguồn' : 'bỏ trống (vẽ theo tên)' });
      if (apply) await Song.updateOne({ _id: s._id }, source ? { $set: { coverArt: url, coverSourceUrl: source } } : { $unset: { coverArt: 1 } });
    }
    console.log(`  ${source ? 'ẢNH NGUỒN' : 'BỎ TRỐNG'}  ${String(group.length).padStart(2)} bài  ${identifier}`);
  }
  if (apply) {
    await saveResult('cover_repair', log, { at: new Date().toISOString() });
    await redis.cacheDel('songs:all');
  }
  await redis.client.quit().catch(() => {});
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const Job = require('../Job');
const { PSL_CODEC } = require('./PslJob');
const { uploadToR2, deletePrefixFromR2 } = require('../../core/r2');

// Hash the card into multi-level HLS (4 second segment) and push it to R2. Level scale taken from PSL if measured (PslJob),
// If not, then deduce from the source bitrate. ND license does not run (transcoding may be considered derivative).
//
// 4 seconds: the first segment is ~60% lighter than 10 seconds, the total capacity only increases by <1%
// (research/segment_tradeoff.sh). All levels share the same length so that the boundaries overlap
// each other — the player switches levels between two segments without stuttering.
const SEGMENT_SECONDS = 4;
const UPLOAD_BATCH = 8;
const FIXED_NAMES = { 64: 'low', 128: 'mid', 256: 'high' };

// Level scale: prioritize the measured PSL scale; If you haven't measured it, then infer from the source bitrate. Never create a level ≥ source
// — the file is larger but no better than the original file.
function tiersFor(sourceKbps, psl) {
  if (psl) {
    if (!psl.length) throw new Error('PSL: nguồn quá thấp, chỉ phục vụ tệp gốc');
    const n = psl.length;
    return psl.map((kbps, i) => ({ kbps, name: i === 0 ? 'low' : i === n - 1 ? 'high' : n === 3 ? 'mid' : `t${i}` }));
  }
  if (!sourceKbps) throw new Error('không đọc được bitrate nguồn');
  return [64, 128, 256]
    .filter((kbps, i) => i === 0 || sourceKbps > kbps * 1.25) // It has to be far enough away from the source to be worth having
    .map((kbps) => ({ kbps, name: FIXED_NAMES[kbps] }));
}

// Bitrate of the audio stream; don't get file size/duration because that includes embedded cover art
// (376 kbps files used to be calculated as 1,046 kbps).
function audioKbps(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=bit_rate:format=bit_rate', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  const bps = out.split('\n').map(Number).find((n) => n > 0);
  return bps ? Math.round(bps / 1000) : 0;
}

// One call to FFmpeg for every level: decode the original file once, encode in parallel.
function encodeTiers(src, out, tiers) {
  const outputs = tiers.flatMap(({ kbps, name }) => [
    '-map', '0:a:0', '-c:a', 'aac', '-b:a', `${kbps}k`, '-ac', '2', // Just get the audio, leave out the cover art
    '-f', 'hls', '-hls_time', String(SEGMENT_SECONDS), '-hls_playlist_type', 'vod',
    '-hls_segment_filename', path.join(out, `${name}_%03d.ts`), path.join(out, `${name}.m3u8`),
  ]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, ...outputs], { timeout: 600000 });
}

// BANDWIDTH must be the PEAK bitrate (RFC 8216) — measured from the heaviest segment, not estimated.
function writeMaster(out, tiers) {
  const files = fs.readdirSync(out);
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const { name } of tiers) {
    const peak = Math.max(...files.filter((f) => f.startsWith(`${name}_`)).map((f) => fs.statSync(path.join(out, f)).size));
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${Math.round((peak * 8) / SEGMENT_SECONDS)},CODECS="mp4a.40.2"`, `${name}.m3u8`);
  }
  fs.writeFileSync(path.join(out, 'master.m3u8'), `${lines.join('\n')}\n`);
}

async function uploadAll(out, prefix) {
  const names = fs.readdirSync(out);
  for (let i = 0; i < names.length; i += UPLOAD_BATCH) {
    await Promise.all(names.slice(i, i + UPLOAD_BATCH).map((n) => uploadToR2(
      fs.readFileSync(path.join(out, n)), `${prefix}/${n}`,
      n.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
    )));
  }
}

class HlsJob extends Job {
  constructor() {
    super({ name: 'hls', label: 'Dựng HLS nhiều mức', needsAudio: true, select: 'hlsPath hlsTiers pslLadder pslCodec' });
  }

  pending({ redo } = {}) { return redo ? { status: 'published' } : { status: 'published', hlsPath: { $in: [null, undefined] } }; }

  needsRun(song) { return !song.hlsPath; }

  async run(song, ctx) {
    const src = await ctx.audio.path();
    const sourceKbps = audioKbps(src);
    const psl = song.pslCodec === PSL_CODEC ? song.pslLadder : null;
    const tiers = tiersFor(sourceKbps, psl);
    const out = await ctx.audio.workDir('hls');
    encodeTiers(src, out, tiers);
    writeMaster(out, tiers);

    // Each time you build a new directory: Worker caches files permanently by key, overwriting the same key will merge the chunks
    // old with new paragraph. The old version is only deleted after the database has pointed to the new version.
    const songPrefix = `hls/${song._id}/`;
    const prefix = `${songPrefix}${Date.now().toString(36)}`;
    await uploadAll(out, prefix);
    song.hlsPath = `${process.env.R2_PUBLIC_URL}/${prefix}/master.m3u8`;
    song.hlsTiers = tiers.map((t) => t.name);
    await song.save();
    await deletePrefixFromR2(songPrefix, (k) => k.startsWith(`${prefix}/`));
    return `${sourceKbps} kbps → ${tiers.map((t) => `${t.kbps}k`).join('/')} (${psl ? 'PSL' : 'suy từ nguồn'})`;
  }

  selfCheck() {
    const names = (t) => t.map((x) => `${x.name}:${x.kbps}`).join(' ');
    assert.strictEqual(names(tiersFor(376)), 'low:64 mid:128 high:256');
    assert.strictEqual(names(tiersFor(218)), 'low:64 mid:128');
    assert.strictEqual(names(tiersFor(128)), 'low:64', 'không tạo mức sát nguồn');
    assert.strictEqual(names(tiersFor(999, [64, 96, 192])), 'low:64 mid:96 high:192', 'PSL thắng suy đoán');
    assert.throws(() => tiersFor(999, []), /chỉ phục vụ tệp gốc/);
    assert.throws(() => tiersFor(0), /bitrate/);
  }
}

module.exports = HlsJob;

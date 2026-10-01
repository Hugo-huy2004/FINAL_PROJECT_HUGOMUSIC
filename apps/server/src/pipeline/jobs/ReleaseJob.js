const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const Job = require('../Job');
const { uploadToR2, readFromR2, keyFromR2Url } = require('../../core/r2');

// Information about the actual RELEASE of the song (album/EP/single) + cover image, taken from the source item above
// archive.org — not inferred from directory. Save to song.album: name, artist, year, original song number of the version
// release, article number. Cover photos are only taken when the article does not have a real photo (photo uploaded by the band).
// release, same CC license); scaled ≤ 600 px, keep proportions, no cropping (respects ND license).
// An item's metadata is read ONCE for all posts of that item (ctx.cache).
const RELEASE_VERSION = 2; // 2: add release description + cover art theme color
const DESCRIPTION_MAX = 600;
const IMAGE = /\.(jpe?g|png|gif|webp)$/i;
const AUDIO_FORMAT = /(mp3|flac|ogg|wave|wav|aiff|m4a|opus|vorbis)/i;
const PREFERRED = /(cover|front|folder|artwork|art\b|album)/i;
const ITEM_TILE = '__ia_thumb.jpg';
const MIN_PREFERRED_BYTES = 20000; // The image is called "cover" but is too small (eg. 100x100) and will be blurry → not prioritized
const COVER_MAX_PX = 600;

const itemIdOf = (song) => (song.sourceUrl || '').split('/details/')[1]?.split(/[/?#]/)[0] || null;
const hasRealCover = (song) => !!song.coverArt && !/images\.unsplash\.com/.test(song.coverArt);

// Cover image: only ORIGINAL image (remove self-generated archive.org image: .png image according to article, *_thumb), name preferred
// cover/front/folder/art is large enough, then the original image is the largest, and finally the item's representative image.
function pickCover(files) {
  const originals = files.filter((f) => f.source === 'original' && IMAGE.test(f.name) && f.name !== ITEM_TILE && !/_thumb\./i.test(f.name));
  const bySize = (a, b) => Number(b.size || 0) - Number(a.size || 0);
  const preferred = originals.filter((f) => PREFERRED.test(f.name) && Number(f.size || 0) >= MIN_PREFERRED_BYTES).sort(bySize);
  if (preferred.length) return preferred[0].name;
  if (originals.length) return [...originals].sort(bySize)[0].name;
  return files.some((f) => f.name === ITEM_TILE) ? ITEM_TILE : null;
}

// Number of ORIGINAL songs of the release (not counting self-generated archive.org transcodes) → ALBUM/EP/SINGLES in app.
const trackCountOf = (files) => files.filter((f) => f.source === 'original' && AUDIO_FORMAT.test(f.format || '')).length;

// Post number. Archive.org's `track` field is only reliable if the original articles in the item have a DIFFERENT number
// each other (with items marked "1" for every article); Otherwise, get the number in the filename ("Josh_Woodward_-_01_-_Ships.mp3",
// "04_-_the_transisters_-_...").
const trackField = (f) => parseInt(String(f?.track ?? '').split('/')[0], 10);
const numberInName = (name) => parseInt((name.match(/(?:^|[_\s.-])(\d{1,3})(?=[_\s.-])/) || [])[1], 10);
function trackNoOf(files, fileName) {
  const audio = files.filter((f) => f.source === 'original' && AUDIO_FORMAT.test(f.format || ''));
  const tracks = audio.map(trackField).filter(Number.isFinite);
  const trustTrack = tracks.length === audio.length && new Set(tracks).size === tracks.length;
  const f = files.find((x) => x.name === fileName);
  const n = (trustTrack && trackField(f)) || numberInName(fileName);
  return Number.isFinite(n) ? n : undefined;
}

// File name in item from externalId: form "item/file" or "ia_<item>_<file>".
function fileNameOf(song, id) {
  const ext = song.externalId || '';
  if (ext.includes('/')) return ext.split('/').slice(1).join('/');
  const prefix = `ia_${id}_`;
  return ext.startsWith(prefix) ? ext.slice(prefix.length) : '';
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

// Release description (archive.org allows HTML) → plain text.
function plainDescription(v) {
  const text = String(first(v) || '')
    .replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX).replace(/\s+\S*$/, '')}…` : text || undefined;
}

// The main color of the cover image (the album page has its background colored in this color, like Apple Music). Reduce the image to 16×16,
// weighted averaging prioritizes FRESH pixels (high saturation, medium brightness) to avoid a dull gray color.
function dominantColor(rgb) {
  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const [R, G, B] = [rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255];
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    const w = 0.05 + sat * (1 - Math.abs(2 * l - 1));
    r += R * w; g += G * w; b += B * w; total += w;
  }
  const hex = (x) => Math.round((x / total) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function colorOfImage(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=16:16', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { timeout: 30000, maxBuffer: 1 << 20 });
  return dominantColor(raw);
}
const yearOf = (m) => parseInt(String(first(m.year) || first(m.date) || '').slice(0, 4), 10) || undefined;

class ReleaseJob extends Job {
  constructor() {
    super({ name: 'release', label: 'Thông tin phát hành & ảnh bìa', allowNoDerivative: true, select: 'title artist sourceUrl externalId coverArt coverSourceUrl coverColor album' });
  }

  pending({ redo } = {}) {
    const base = { sourceUrl: /archive\.org\/details\// };
    return redo ? base : {
      ...base,
      $or: [{ 'album.version': { $ne: RELEASE_VERSION } }, { coverColor: { $in: [null, ''] } }, { coverArt: { $in: [null, ''] } }, { coverArt: /images\.unsplash\.com/ }],
    };
  }

  needsRun(song) { return !!itemIdOf(song) && (song.album?.version !== RELEASE_VERSION || !hasRealCover(song) || !song.coverColor); }

  async item(id, ctx) {
    if (!ctx.cache.has(id)) {
      ctx.cache.set(id, (async () => {
        const res = await fetch(`https://archive.org/metadata/${id}`, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`metadata ${res.status}`);
        return { meta: await res.json(), coverUrl: null };
      })());
    }
    return ctx.cache.get(id);
  }

  async run(song, ctx) {
    const id = itemIdOf(song);
    if (!id) return 'không có item nguồn';
    const item = await this.item(id, ctx);
    const { metadata: m = {}, files = [] } = item.meta;
    const fileName = fileNameOf(song, id);
    song.album = {
      version: RELEASE_VERSION,
      sourceId: id,
      title: String(first(m.title) || id).trim(),
      artist: String(first(m.creator) || song.artist).trim(),
      year: yearOf(m),
      trackCount: trackCountOf(files) || undefined,
      trackNo: fileName ? trackNoOf(files, fileName) : undefined,
      description: plainDescription(m.description),
      fetchedAt: new Date(),
    };
    let coverNote = '';
    let coverChanged = false;
    if (!hasRealCover(song)) {
      if (!item.coverUrl) item.coverUrl = this.fetchCover(id, files); // one promise for the whole item
      const cover = await item.coverUrl;
      if (cover) {
        song.coverArt = cover.url;
        song.coverSourceUrl = cover.sourceUrl;
        coverChanged = true;
        coverNote = ' · có ảnh bìa';
      } else coverNote = ' · item không có ảnh';
    }
    // Calculate color when not available, or when new cover photo has just been attached above.
    if (hasRealCover(song) && (!song.coverColor || coverChanged)) {
      try { song.coverColor = await this.coverColor(song, ctx); } catch { /* fallback to default color if extraction fails */ }
    }
    await song.save();
    const a = song.album;
    return `"${a.title}" — ${a.artist}${a.year ? ` (${a.year})` : ''} · bài ${a.trackNo ?? '?'}/${a.trackCount ?? '?'}${coverNote}`;
  }

  // The main color of the article's current cover image (image above R2); Posts that share the same photo are only counted once.
  async coverColor(song, ctx) {
    const key = keyFromR2Url(song.coverArt);
    if (!key) return undefined;
    const cacheKey = `color:${key}`;
    if (!ctx.cache.has(cacheKey)) {
      ctx.cache.set(cacheKey, (async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-'));
        try {
          const file = path.join(dir, `img${path.extname(key) || '.jpg'}`);
          fs.writeFileSync(file, await readFromR2(key));
          return colorOfImage(file);
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      })());
    }
    return ctx.cache.get(cacheKey);
  }

  async fetchCover(id, files) {
    const file = pickCover(files);
    if (!file) return null;
    const sourceUrl = `https://archive.org/download/${id}/${encodeURIComponent(file)}`;
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`tải ảnh ${res.status}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
    try {
      const src = path.join(dir, `src${path.extname(file) || '.jpg'}`);
      const out = path.join(dir, 'cover.jpg');
      fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-frames:v', '1',
        '-vf', `scale='min(${COVER_MAX_PX},iw)':'min(${COVER_MAX_PX},ih)':force_original_aspect_ratio=decrease`, '-q:v', '3', out], { timeout: 60000 });
      const url = await uploadToR2(fs.readFileSync(out), `covers/ia/${id}.jpg`, 'image/jpeg');
      return { url, sourceUrl };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  selfCheck() {
    // Real data from archive.org/metadata/afm022_thetransisters_undercontrol and diymVA09.
    const afm = [
      { name: '01_-_the_transisters_-_under_control.png', source: 'derivative', size: '6804' },
      { name: '__ia_thumb.jpg', source: 'original', size: '5360' },
      { name: 'afm022_thetranisters-undercontrol.jpg', source: 'original', size: '18755' },
      { name: 'the_tranisters-under_control.jpg', source: 'original', size: '128279' },
      { name: '04_-_the_transisters_-_electromagneticnewwave_vbr.mp3', source: 'original', format: 'VBR MP3', track: '04' },
      { name: '09_-_the_transisters_-_ultraviolet_on_you_vbr.mp3', source: 'original', format: 'VBR MP3', track: '9/9' },
      { name: '09_-_the_transisters_-_ultraviolet_on_you_vbr.ogg', source: 'derivative', format: 'Ogg Vorbis' },
    ];
    assert.strictEqual(pickCover(afm), 'the_tranisters-under_control.jpg', 'ảnh gốc lớn nhất, bỏ ảnh phổ .png');
    assert.strictEqual(pickCover([
      { name: 'x_image_01.png', source: 'original', size: '1000776' },
      { name: 'x_Cover_Art-1000x1000.jpg', source: 'original', size: '500000' },
    ]), 'x_Cover_Art-1000x1000.jpg', 'tên "cover" thắng ảnh lớn hơn');
    assert.strictEqual(pickCover([
      { name: 'aer004_coverart100x100.jpg', source: 'original', size: '4000' },
      { name: 'booklet.jpg', source: 'original', size: '300000' },
    ]), 'booklet.jpg', 'ảnh cover quá nhỏ → lấy ảnh gốc lớn nhất');
    assert.strictEqual(pickCover([{ name: 'a.mp3', source: 'original' }]), null);
    assert.strictEqual(trackCountOf(afm), 2, 'không đếm bản chuyển mã tự sinh');
    assert.strictEqual(trackNoOf(afm, '09_-_the_transisters_-_ultraviolet_on_you_vbr.mp3'), 9);
    assert.strictEqual(trackNoOf(afm, '04_-_the_transisters_-_electromagneticnewwave_vbr.mp3'), 4);
    assert.strictEqual(trackNoOf([], '07-song.mp3'), 7, 'không có trường track → số đầu tên tệp');
    // Real data (The_Simple_Life_Part_2_1667-16369): every song with track "1" → must have the number in the name.
    const jw = [
      { name: 'Josh_Woodward_-_01_-_Ships.mp3', source: 'original', format: 'VBR MP3', track: '1' },
      { name: 'Josh_Woodward_-_02_-_Ships_Instrumental.mp3', source: 'original', format: 'VBR MP3', track: '1' },
    ];
    assert.strictEqual(trackNoOf(jw, 'Josh_Woodward_-_02_-_Ships_Instrumental.mp3'), 2);
    assert.strictEqual(fileNameOf({ externalId: 'ia_The_Simple_Life_Part_2_1667-16369_Josh_Woodward_-_01_-_Ships.mp3' }, 'The_Simple_Life_Part_2_1667-16369'), 'Josh_Woodward_-_01_-_Ships.mp3');
    assert.strictEqual(fileNameOf({ externalId: 'afm022/04_-_x.mp3' }, 'afm022'), '04_-_x.mp3');
    assert.strictEqual(yearOf({ date: '2007-02-01' }), 2007);
    assert.strictEqual(plainDescription('<p>Hello&nbsp;<b>world</b></p><p>Two</p>'), 'Hello world\nTwo');
    assert.strictEqual(plainDescription(''), undefined);
    // Gray background + a bright green patch → the main color leans toward green, not gray.
    const px = Buffer.from([...Array(12).fill([128, 128, 128]).flat(), ...Array(4).fill([140, 220, 40]).flat()]);
    const c = dominantColor(px);
    assert.ok(parseInt(c.slice(3, 5), 16) > parseInt(c.slice(1, 3), 16), c);
  }
}

module.exports = ReleaseJob;

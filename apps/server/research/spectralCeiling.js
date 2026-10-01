// MEASURING THE TRUE INFORMATION OF A LOSTLY COMPRESSED AUDIO FILE
//
// ---------------------------------------------------------------------------
// MATH PROBLEM
// ---------------------------------------------------------------------------
// The bitrate listed in the container does NOT indicate the actual quality. A file declaring 320
// kbps may have been transcoded from the 128 kbps version: 2.5 times the capacity
// but the amount of information is exactly the same as the original 128 kbps. Community Archive (Internet Archive,
// netlabel, user-uploaded content) is full of such files — measuring over 20 files
// FLAC in this repository: 5 files are "fake lossless", the ratio increases to 10.6 times.
//
// ---------------------------------------------------------------------------
// PRINCIPLES
// ---------------------------------------------------------------------------
// All lossy encoders cut high frequencies to condense bits for the clear audible range.
// The cutoff is proportional to the bitrate and is NON-RECOVERING — re-encoded at high bitrate
// than not recreating the lost part. So the spectral cutoff point is the fingerprint of the COMPRESSION TIME
// FIRST, no matter how many times the file is re-encrypted afterward.
//
// This is where two separate disciplines connect: audio forensics (high compression detection).
// times, originally used to authenticate records) is now used to DECIDING BITRATE SCALE.
//
// No need for original reference (reference-free) — just the existing file itself.
//
// ---------------------------------------------------------------------------
// TWO CRITERIA (both necessary — derived from measurements, not assumptions)
// ---------------------------------------------------------------------------
// Measuring three types of stock signals gives three distinctly different spectrum profiles:
//
// Real lossless -39.8 -> -48.7 dB comfortable ~0.9 dB/kHz NOT touching the floor
// Codec cut -84.3 -> -91.0 dB steep ~6 dB/kHz TOUCHING the floor of silence
// Natural darkness -64.5 -> -87.3 dB comfortable ~2.3 dB/kHz NOT touching the floor
//
// Using only the energy threshold results in a dark recording (voice, acoustic guitar) being concluded
// mistakenly said it has been compressed. Must add the condition NUMBER SILENT FLOOR: encoder
// Record the correct number 0 on the cut strip, and the real sound, no matter how dark, still has an echo.
//
// ---------------------------------------------------------------------------
// MULTIPLE WINDOW SAMPLING
// ---------------------------------------------------------------------------
// Measuring a single 30-second window gives erroneous results when the window falls on a quiet period
// or dark music — actually encountered when trying: the same file gives two different conclusions
// different depending on window position. Should take multiple windows then get the BIGGEST energy each
// band: the loudest part accurately reveals the true bandwidth of the recording.

const { execFileSync, spawnSync } = require('child_process');

// ffmpeg reports -91.0 dB for absolute digital silence at 16-bit; The measured floor assembly is located at
// [-91.0, -90.3]. The darkest real signal measured is -87.3. Take -89.5 in the middle.
const DIGITAL_SILENCE_DB = -89.5;


const BAND_WIDTH_HZ = 1000;
const LOWEST_PROBE_HZ = 10000;   // Below this level, it is no longer a matter of compression
const WINDOW_SECONDS = 15;
const WINDOW_POSITIONS = [0.25, 0.5, 0.75];  // three positions in the article

/**
 * Average energy (dB) in the range [loHz, hiHz] of a time window.
 * Superimpose 2 highpass floors + 2 lowpass floors -> ~24 dB/octave slope, enough for power
 * The side strip does not leak to cause measurement errors.
 */
function bandEnergyDb(filePath, loHz, hiHz, startSeconds, seconds = WINDOW_SECONDS) {
  const chain = [
    `highpass=f=${loHz}:poles=2`,
    `highpass=f=${loHz}:poles=2`,
    `lowpass=f=${hiHz}:poles=2`,
    `lowpass=f=${hiHz}:poles=2`,
    'volumedetect',
  ].join(',');

  // ffmpeg writes volumedetect results to STDERR, not stdout, so yes
  // use spawnSync (execFileSync only returns stdout).
  const res = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats',
    '-ss', String(Math.max(0, startSeconds)), '-t', String(seconds),
    '-i', filePath,
    '-vn', '-af', chain, '-f', 'null', '-',
  ], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });

  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(res.stderr || '');
  return m ? parseFloat(m[1]) : null;
}

/** Sampling frequency, codec and bitrate declared in the container. */
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
 * Spectral profile: for each 1 kHz band from 10 kHz to Nyquist, take the BIGGEST energy
 * through multiple time windows.
 */
function spectralProfile(filePath, sampleRate, durationSec) {
  const nyquist = (sampleRate || 44100) / 2;
  const starts = durationSec && durationSec > WINDOW_SECONDS * 2
    ? WINDOW_POSITIONS.map((p) => Math.floor(durationSec * p - WINDOW_SECONDS / 2))
    : [0];

  // Stop one band BEFORE Nyquist: near-Nyquist band (22.0-22.05 kHz at 44.1 kHz) only
  // a few tens of Hz wide and always read out due to the machine's own anti-spectrum overlap filter
  // recording, no compression involved. Measuring it in is automatically creating a false positive.
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
 * Find the codec's clipping wall in the spectrum profile.
 *
 * CRITERION: from the wall up, almost the ENTIRE strip must be in digital silence, and
 * That area of silence must be large enough. The encoder writes the correct number 0 onto the cut part
 * The silent region extends to the end of the spectrum; Natural decline is gradual and permanent
 * now hit the floor.
 *
 * Why NOT use slope: actual measurements show that slope cannot separate the two layers.
 * File "Glass_Waltz" is clearly cut off at 14 kHz (9 consecutive silent bands) but the slope is only
 * 3.3 dB/kHz, lower than the set threshold — because the bottom of the wall is already very dark.
 * In contrast, a full spectrum file can slope 12.7 dB/kHz at the Nyquist edge without even noticing
 * compressed. The slope is still returned as a reference, but is not used
 * decide.
 */
const MIN_SILENT_BANDS = 3;        // The mute zone must be at least 3 kHz wide
const SILENT_RATIO = 0.8;          // Allow 20% of the odd strip to rise above the floor
const NYQUIST_GUARD_HZ = 2000;     // The wall must be this much lower than Nyquist

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

    // Slope leading to wall — for reporting only, not for decision making.
    const from = Math.max(0, i - 3);
    const span = (band.loHz - profile[from].loHz) / 1000;
    const cliffDbPerKhz = span > 0 ? Number(((profile[from].db - band.db) / span).toFixed(1)) : null;

    return { cutoffHz: band.loHz, cliffDbPerKhz, silentBands: silent };
  }
  return null;
}

// Cutoff point lookup table -> real bitrate ceiling. CALIBRATION BY MEASUREMENT on real music
// (research/calibrateCeiling.js), not taken from the documentation. Each entry is the LOWER boundary of
// cutoff point corresponding to that bitrate class.
//
// Calibration figures (MP3, LAME, average of 3 real music tracks):
//   64k -> 16.3 kHz | 96k -> 18.0 | 128k -> 18.3 | 160k -> 19.0 | 192k -> 19.7
// AAC with the same bitrate is about 1 kHz higher than MP3.
const CALIBRATION = [
  { minCutoffHz: 20000, ceilingKbps: 320 },
  { minCutoffHz: 19000, ceilingKbps: 192 },
  { minCutoffHz: 18500, ceilingKbps: 160 },
  { minCutoffHz: 17500, ceilingKbps: 128 },
  { minCutoffHz: 16000, ceilingKbps: 96 },
  { minCutoffHz: 0,     ceilingKbps: 64 },
];

function ceilingFromCutoff(cutoffHz) {
  if (cutoffHz == null) return 1411;  // no wall -> considered full spectrum
  const hit = CALIBRATION.find((c) => cutoffHz >= c.minCutoffHz);
  return hit ? hit.ceilingKbps : 64;
}

/**
 * Complete analysis of a file.
 *
 * declaredKbps - bitrate container DECLARE
 * cutoffHz - measured codec cutoff (null = no cutoff)
 * ceilingKbps - ceiling of REAL information inferred from the wall
 * inflationRatio - declared/true. >1.3 means the file has been transcoded:
 * wastes space without adding any information.
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

module.exports = { analyze };

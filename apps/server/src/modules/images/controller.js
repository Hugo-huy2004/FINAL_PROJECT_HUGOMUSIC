const { pipeline } = require('stream');
const asyncHandler = require('../../core/asyncHandler');
const { getR2Stream } = require('../../core/r2');

// GET /api/images/proxy?key=covers/xyz.jpg — cover art (unlike audio) was being
// linked straight to the raw R2 endpoint, which Chrome's Opaque Response Blocking
// rejects for a cross-origin fetch/XHR-loaded <Image> the same way it does for audio
// (see streamSong's R2 branch for the full ORB writeup) — same fix, same reason.
// `key` is restricted to our own covers/ prefix so this can't be used as an open
// proxy for arbitrary URLs.
const proxyImage = asyncHandler(async (req, res) => {
  const { key } = req.query;
  if (!key || typeof key !== 'string' || !/^covers\//.test(key) || key.includes('..')) {
    return res.status(400).json({ message: 'Invalid image key' });
  }

  try {
    const s3Res = await getR2Stream(key);
    res.setHeader('Content-Type', s3Res.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    pipeline(s3Res.Body, res, () => {}); // closes thread R2 if the client interrupts midstream
  } catch (err) {
    res.status(404).json({ message: 'Image not found' });
  }
});

module.exports = { proxyImage };

// All operations with Cloudflare R2 (S3 compatible API) go through this file — controller
// and the script does not create its own S3 client.
const {
  PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getClient, isConfigured, Bucket } = require('../config/storage');

// Push a buffer to R2 (without writing to disk) and return the URL stored in the DB.
const uploadToR2 = async (buffer, key, contentType) => {
  if (!isConfigured()) return null;
  await getClient().send(new PutObjectCommand({
    Bucket: Bucket(), Key: key, Body: buffer, ContentType: contentType || 'application/octet-stream',
  }));
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/${key}`;
};

// Stream reads an object, with HTTP Range support ("bytes=0-1023").
const getR2Stream = async (key, range) => {
  if (!isConfigured()) return null;
  return getClient().send(new GetObjectCommand({ Bucket: Bucket(), Key: key, ...(range ? { Range: range } : {}) }));
};

// Read an entire object into the buffer (used for audio processing scripts).
const readFromR2 = async (key) => {
  const res = await getR2Stream(key);
  if (!res) return null;
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return Buffer.concat(chunks);
};

// Content size and type, no data loaded.
const headR2 = async (key) => {
  const head = await getClient().send(new HeadObjectCommand({ Bucket: Bucket(), Key: key }));
  return { size: head.ContentLength, contentType: head.ContentType };
};

const deleteFromR2 = async (key) => {
  if (!isConfigured()) return false;
  await getClient().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: key }));
  return true;
};

// Delete all objects under a prefix (eg. hls/<songId>/), except for keys that
// `keep(key)` returns true. Returns the number of deleted objects.
const deletePrefixFromR2 = async (prefix, keep = () => false) => {
  if (!isConfigured()) return 0;
  let deleted = 0;
  let ContinuationToken;
  do {
    const page = await getClient().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix: prefix, ContinuationToken }));
    const keys = (page.Contents || []).map((o) => o.Key).filter((k) => !keep(k));
    if (keys.length) {
      await getClient().send(new DeleteObjectsCommand({
        Bucket: Bucket(), Delete: { Objects: keys.map((Key) => ({ Key })) },
      }));
      deleted += keys.length;
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return deleted;
};

// Saved R2 URL (endpoint S3 or R2_PUBLIC_URL) -> key in bucket.
const keyFromR2Url = (url) => {
  if (!url) return null;
  try {
    const k = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
    const bucket = `${Bucket()}/`;
    return k.startsWith(bucket) ? k.slice(bucket.length) : k;
  } catch {
    return null;
  }
};

module.exports = {
  uploadToR2, getR2Stream, readFromR2, headR2, deleteFromR2, deletePrefixFromR2, keyFromR2Url,
};

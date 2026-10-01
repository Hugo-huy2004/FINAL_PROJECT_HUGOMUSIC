const fs = require('fs');
const os = require('os');
const path = require('path');
const { readFromR2, keyFromR2Url } = require('../core/r2');

// The original audio file of a song, downloaded from R2 to a temporary folder when needed for the first task, is shared
// the following tasks, and delete when finished (cleanup). Never retain files after processing.
class SourceAudio {
  constructor(song) {
    this.song = song;
    this.dir = null;
    this.file = null;
  }

  async path() {
    if (this.file) return this.file;
    const key = keyFromR2Url(this.song.filePath);
    if (!key) throw new Error('bài không có tệp gốc trên R2');
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-'));
    this.file = path.join(this.dir, `src${path.extname(key) || '.mp3'}`);
    fs.writeFileSync(this.file, await readFromR2(key));
    return this.file;
  }

  // Temporary working directory for the task (e.g. HLS writes .ts chunks before uploading).
  async workDir(name) {
    if (!this.dir) this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-'));
    const dir = path.join(this.dir, name);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  cleanup() {
    if (this.dir) fs.rmSync(this.dir, { recursive: true, force: true });
    this.dir = null;
    this.file = null;
  }
}

module.exports = SourceAudio;

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readFromR2, keyFromR2Url } = require('../utils/r2');

// Tệp âm thanh gốc của một bài, tải từ R2 về thư mục tạm khi có tác vụ đầu tiên cần, dùng chung cho
// các tác vụ sau, và xoá khi xong bài (cleanup). Không bao giờ giữ lại tệp sau khi xử lý.
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

  // Thư mục làm việc tạm cho tác vụ (vd. HLS ghi các đoạn .ts trước khi tải lên).
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

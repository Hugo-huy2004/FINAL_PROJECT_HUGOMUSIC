// Hợp đồng chung của một tác vụ xử lý bài trong pipeline. Mỗi tác vụ (jobs/*) là một lớp riêng,
// giữ logic của nó; Pipeline chỉ biết hợp đồng này nên thêm/sửa/bỏ một tác vụ không đụng tác vụ khác.
//
//   name              tên dùng ở CLI và trong PipelineRun (vd. 'psl')
//   label             tên hiển thị cho admin
//   needsAudio        cần tệp âm thanh gốc (SourceAudio tải về MỘT lần cho mọi tác vụ cần)
//   allowNoDerivative chạy được với giấy phép ND (chỉ đọc/đo, không tạo bản phái sinh để phát)
//   select            các trường Song tác vụ cần đọc
//   pending(opts)     bộ lọc Mongo: bài nào còn cần chạy (dùng khi chạy hàng loạt)
//   needsRun(song)    cùng điều kiện đó cho MỘT bài (dùng khi duyệt bài)
//   run(song, ctx)    làm việc + lưu vào song; trả về một dòng mô tả kết quả
class Job {
  constructor({ name, label, needsAudio = false, allowNoDerivative = false, select = '' }) {
    Object.assign(this, { name, label, needsAudio, allowNoDerivative, select });
  }

  // eslint-disable-next-line no-unused-vars
  pending(opts) { throw new Error(`${this.name}: chưa định nghĩa pending()`); }

  // eslint-disable-next-line no-unused-vars
  needsRun(song) { throw new Error(`${this.name}: chưa định nghĩa needsRun()`); }

  // eslint-disable-next-line no-unused-vars
  async run(song, ctx) { throw new Error(`${this.name}: chưa định nghĩa run()`); }

  // Tự kiểm phần logic thuần của tác vụ (không cần DB/mạng). Mặc định không có gì để kiểm.
  selfCheck() {}
}

module.exports = Job;

// Danh mục tác vụ + chuỗi chạy khi admin duyệt bài. Thêm tác vụ mới: viết một lớp kế thừa Job trong
// jobs/, đăng ký ở JOBS, và (nếu cần chạy lúc duyệt) thêm vào APPROVAL theo đúng thứ tự phụ thuộc.
const Pipeline = require('./Pipeline');
const ReleaseJob = require('./jobs/ReleaseJob');
const PslJob = require('./jobs/PslJob');
const TransitionJob = require('./jobs/TransitionJob');
const HlsJob = require('./jobs/HlsJob');
const GlobalStatsJob = require('./jobs/GlobalStatsJob');

const JOBS = Object.fromEntries([new ReleaseJob(), new PslJob(), new TransitionJob(), new HlsJob(), new GlobalStatsJob()].map((j) => [j.name, j]));

// Thứ tự: thông tin phát hành/ảnh bìa + số liệu toàn cầu (không cần tệp) → PSL (HLS cần thang PSL) → chuyển bài → HLS.
const APPROVAL = ['release', 'global', 'psl', 'transition', 'hls'];
const approvalPipeline = () => new Pipeline(APPROVAL.map((n) => JOBS[n]));

module.exports = { JOBS, APPROVAL, approvalPipeline, Pipeline };

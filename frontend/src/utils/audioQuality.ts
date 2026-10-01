import type { Song } from '../store/useStore';

export interface AudioQualityInfo {
  tierName: 'Lossless' | 'Hi-Res Lossless' | 'High Quality' | 'Standard' | 'Data Saver';
  bitrateKbps: number;
  badgeLabel: string;
  codec: string;
  sampleRate: string;
  bitDepth: string;
  description: string;
  segmentIndex?: number;
  isHls: boolean;
}

/**
 * Tính toán và phân loại chất lượng âm thanh dựa trên bitrate thực tế của segment/stream,
 * codec và metadata của bài hát.
 *
 * Tiêu chuẩn phân hạng theo Apple Music / Hi-Fi Audio:
 *  - >= 320 kbps hoặc FLAC/ALAC: Lossless / Hi-Res Lossless
 *  - 256 kbps (AAC Master / High Tier): Lossless · 256 kbps (hoặc HQ Lossless)
 *  - 160 – 224 kbps: High Quality · {kbps} kbps
 *  - 128 kbps: Standard · 128 kbps
 *  - < 128 kbps: Data Saver · {kbps} kbps
 */
export function getAudioQualityInfo(options: {
  song?: Song | null;
  bitrate?: number | null;
  codec?: string | null;
  segmentIndex?: number | null;
  isHls?: boolean;
}): AudioQualityInfo {
  const { song, isHls = false, segmentIndex } = options;

  let codec = (options.codec || 'AAC').toUpperCase();
  if (codec.includes('MP4A') || codec.includes('AAC')) codec = 'AAC';
  else if (codec.includes('FLAC')) codec = 'FLAC';
  else if (codec.includes('MP3')) codec = 'MP3';

  // 1. Xác định bitrate: ưu tiên số đo thực từ player/segment
  let kbps = options.bitrate || 0;

  // Nếu player chưa đo được bitrate (hoặc stream tĩnh), ước lượng từ metadata
  if (!kbps && song) {
    // Nếu là file FLAC
    if (song.filePath?.toLowerCase().endsWith('.flac')) {
      codec = 'FLAC';
      kbps = 921;
    } else if (song.hlsTiers && song.hlsTiers.length > 0) {
      // Ví dụ: ['64', '128', '256'] hoặc ['low', 'mid', 'high']
      const lastTier = song.hlsTiers[song.hlsTiers.length - 1];
      const matchNum = parseInt(lastTier, 10);
      kbps = !isNaN(matchNum) && matchNum > 0 ? matchNum : 256;
    } else if ((song as any).bitrate) {
      kbps = (song as any).bitrate;
    } else {
      // Mặc định chuẩn catalogue Hugo Music là AAC 256 kbps
      kbps = 256;
    }
  }

  // Đảm bảo có một giá trị kbps hợp lệ
  if (!kbps || kbps <= 0) kbps = 256;

  // 2. Xác định Tier và Nhãn (Label)
  let tierName: AudioQualityInfo['tierName'] = 'Lossless';
  let bitDepth = '16-bit';
  let sampleRate = '44.1 kHz';
  let description = 'Âm thanh chất lượng phòng thu với dải động cao và chi tiết sắc nét.';

  if (codec === 'FLAC' || kbps >= 900) {
    tierName = 'Hi-Res Lossless';
    bitDepth = '24-bit';
    sampleRate = '48.0 kHz';
    description = 'Âm thanh độ phân giải cao Hi-Res không nén (Lossless Master), giữ trọn từng hài âm.';
  } else if (kbps >= 256) {
    // 256 kbps - 320 kbps: Lossless chất lượng chuẩn (chuẩn AAC của Apple Music)
    tierName = 'Lossless';
    bitDepth = '16-bit';
    sampleRate = '44.1 kHz';
    description = 'Âm thanh độ nét cao chuẩn Lossless (AAC 256 kbps), mang lại độ chi tiết hoàn hảo.';
  } else if (kbps >= 160) {
    tierName = 'High Quality';
    bitDepth = '16-bit';
    sampleRate = '44.1 kHz';
    description = 'Âm thanh chất lượng cao tối ưu cho trải nghiệm mượt mà trên đường truyền di động.';
  } else if (kbps >= 128) {
    tierName = 'Standard';
    bitDepth = '16-bit';
    sampleRate = '44.1 kHz';
    description = 'Chất lượng tiêu chuẩn cân bằng giữa băng thông mạng và độ trong trẻo.';
  } else {
    tierName = 'Data Saver';
    bitDepth = '16-bit';
    sampleRate = '22.05 kHz';
    description = 'Chế độ tiết kiệm dữ liệu tối ưu dung lượng cho kết nối mạng yếu.';
  }

  // Nhãn hiển thị: ví dụ "Lossless · 256 kbps"
  const badgeLabel = `${tierName} · ${kbps} kbps`;

  return {
    tierName,
    bitrateKbps: kbps,
    badgeLabel,
    codec,
    sampleRate,
    bitDepth,
    description,
    segmentIndex: segmentIndex ?? undefined,
    isHls,
  };
}

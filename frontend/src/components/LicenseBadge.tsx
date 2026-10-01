import { Text, StyleSheet } from 'react-native';
import { Song } from '../store/useStore';

// Ghi nhỏ giấy phép ngay dưới tên bài hát. Toàn bộ nhạc trong app là nhạc
// Creative Commons hoặc thuộc phạm vi công cộng, và các giấy phép này đều
// BẮT BUỘC phải ghi công/nêu rõ giấy phép khi phổ biến lại — nên đây không
// phải chi tiết trang trí mà là nghĩa vụ pháp lý.
//
// Nhãn lấy từ `licenseType` (bắt buộc khi admin tải lên, xem
// backend/utils/songReview.js), không phải chuỗi mô tả tự đặt.
export const LICENSE_LABELS: Record<string, string> = {
  'public-domain': 'Public Domain',
  'cc-by': 'CC BY',
  'cc-by-sa': 'CC BY-SA',
  'cc-by-nc': 'CC BY-NC',
  'cc-by-nd': 'CC BY-ND',
  'cc-by-nc-sa': 'CC BY-NC-SA',
  'cc-by-nc-nd': 'CC BY-NC-ND',
  'cc-other': 'Creative Commons',
};

export default function LicenseBadge({
  song,
  color,
}: {
  song: Pick<Song, 'licenseType'>;
  color: string;
}) {
  const label = song.licenseType ? LICENSE_LABELS[song.licenseType] : null;
  // Chưa tra được giấy phép thì không hiện gì — thà thiếu còn hơn ghi sai
  // một giấy phép mà bài đó không thực sự mang.
  if (!label) return null;

  return (
    <Text style={[styles.badge, { color }]} numberOfLines={1}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.2,
    marginTop: 1,
    opacity: 0.55,
  },
});


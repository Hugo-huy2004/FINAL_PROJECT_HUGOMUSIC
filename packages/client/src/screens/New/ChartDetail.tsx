import CollectionDetail from '../../components/CollectionDetail/CollectionDetail';
import { useTopSongs } from '../../lib/songOrder';
import ChartArt from './ChartArt';
import { Chart, chartTitle } from './charts';

// Page one ranking: song order = ranking (lists on Hugo + global popularity).
export default function ChartDetail({ chart, onBack }: { chart: Chart; onBack: () => void }) {
  const { top, ready } = useTopSongs(chart.days, chart.size, chart.group);
  return (
    <CollectionDetail
      kind="BẢNG XẾP HẠNG"
      title={chartTitle(chart)}
      subtitle="Hugo Music"
      heroArt={(size) => <ChartArt chart={chart} size={size} />}
      tint={chart.colors[0]}
      about="Những bài được nghe nhiều nhất trên Hugo Music và trên toàn cầu, cập nhật liên tục."
      songs={top.map((t) => t.song)}
      emptyText={ready ? 'Chưa có số liệu cho bảng này.' : 'Đang tải…'}
      onBack={onBack}
    />
  );
}

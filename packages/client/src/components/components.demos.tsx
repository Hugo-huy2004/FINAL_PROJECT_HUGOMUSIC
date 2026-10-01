import { useState } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../ui/theme';
import { useSampleSongs } from '../screens/Developer/useSampleSongs';
import type { DemoMap } from '../screens/Developer/types';
import CoverArt from './CoverArt';
import SeekBar from './Player/SeekBar';
import LicenseBadge from './LicenseBadge';
import { UserAvatar } from './UserAvatar';

// Live demos for app components — picked up by scripts/gen-component-docs.mjs.
const noop = () => {};
const row = { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' } as const;

const demos: DemoMap = {
  CoverArt: () => {
    const sample = useSampleSongs();
    return (
      <View style={row}>
        {sample.map((s) => <CoverArt key={s._id} uri={s.coverArt} title={s.title} size={72} radius={10} />)}
        <CoverArt title="No artwork" size={72} radius={10} />
      </View>
    );
  },
  SeekBar: () => {
    const { colors } = useAppTheme();
    const [p, setP] = useState(0.35);
    return (
      <>
        <SeekBar progress={p} onSeek={setP} trackColor={colors.fill} fillColor={colors.accent} label="Example progress" />
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{Math.round(p * 100)}% — drag or tap the bar</Text>
      </>
    );
  },
  LicenseBadge: () => {
    const { colors } = useAppTheme();
    return (
      <View style={{ gap: 4 }}>
        {(['cc-by', 'cc-by-sa', 'public-domain'] as const).map((l) => <LicenseBadge key={l} song={{ licenseType: l }} color={colors.textSecondary} />)}
      </View>
    );
  },
  UserAvatar: () => (
    <View style={row}>
      <UserAvatar nickname="Hugo" size={48} />
      <UserAvatar username="listener" size={36} />
    </View>
  ),
};

export default demos;

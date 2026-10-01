import { useMemo } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/api';
import { useTranslation } from '../i18n/i18n';

// Reference data owned by the server (GET /api/meta — apps/server/src/modules/meta): genre groups, licenses,
// preference genres, song statuses. Nothing here is hard-coded: the last good copy is cached on the device so
// the next launch renders instantly, then refreshed from the API (ETag → 304 when unchanged).
export type GenreGroup = { key: string; label: string; labelEn: string; colors: [string, string]; match: RegExp | null };
export type Meta = {
  genreGroups: GenreGroup[];
  licenses: { key: string; label: string; noDerivatives: boolean }[];
  preferenceGenres: string[];
  songStatuses: string[];
};
type RawMeta = Omit<Meta, 'genreGroups'> & { genreGroups: (Omit<GenreGroup, 'match'> & { match: { source: string; flags: string } | null })[] };

const CACHE_KEY = 'hugo_meta_v1';
const EMPTY: Meta = { genreGroups: [], licenses: [], preferenceGenres: [], songStatuses: [] };

function hydrate(raw: RawMeta): Meta {
  return { ...raw, genreGroups: raw.genreGroups.map((g) => ({ ...g, match: g.match ? new RegExp(g.match.source, g.match.flags) : null })) };
}

export const useMeta = create<Meta & { loaded: boolean }>(() => ({ ...EMPTY, loaded: false }));

let loading: Promise<void> | null = null;
export function loadMeta(): Promise<void> {
  return (loading ||= (async () => {
    const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
    if (cached) try { useMeta.setState({ ...hydrate(JSON.parse(cached)), loaded: true }); } catch {}
    try {
      const raw: RawMeta = await api.getMeta();
      useMeta.setState({ ...hydrate(raw), loaded: true });
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(raw)).catch(() => {});
    } catch {
      loading = null; // offline: keep the cached copy, retry on the next call
    }
  })());
}

/** Genre groups a listener can browse (the server's catch-all "all" group is not a genre). */
export function useGenreGroups(): (GenreGroup & { match: RegExp })[] {
  const all = useMeta((s) => s.genreGroups);
  return useMemo(() => all.filter((g): g is GenreGroup & { match: RegExp } => !!g.match), [all]);
}
export function useLicenseLabels(): Record<string, string> {
  const licenses = useMeta((s) => s.licenses);
  return useMemo(() => Object.fromEntries(licenses.map((l) => [l.key, l.label])), [licenses]);
}
/** License keys the server will not transcode (ND licenses): such songs play from the original file. */
export function useNoDerivativeLicenses(): string[] {
  const licenses = useMeta((s) => s.licenses);
  return useMemo(() => licenses.filter((l) => l.noDerivatives).map((l) => l.key), [licenses]);
}
export const usePreferenceGenres = () => useMeta((s) => s.preferenceGenres);
/** Label of a genre group in the current UI language. */
export function useGroupLabel() {
  const { language: lang } = useTranslation();
  return (g: Pick<GenreGroup, 'label' | 'labelEn'>) => (lang === 'en' ? g.labelEn : g.label);
}

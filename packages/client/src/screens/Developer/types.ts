import type { ComponentType } from 'react';

// Shapes of the generated component docs (scripts/gen-component-docs.mjs → generated/*.ts).
export type PropDoc = { name: string; type: string; required: boolean; default: string | null; description: string };
export type ComponentDoc = {
  id: string;
  name: string;
  group: string;
  /** npm package the component ships in (null = part of the app). */
  package: string | null;
  description: string;
  props: PropDoc[];
  /** Props inherited from React Native types, summarised per declaring type. */
  inherited: { from: string; count: number }[];
  /** When to use it (@usage). */
  usage: string;
  /** How it works (@remarks). */
  remarks: string;
  /** Accessibility notes (@a11y). */
  a11y: string;
  examples: string[];
  file: string;
  importFrom: string;
  importStyle: 'default' | 'named';
  /** Platform-specific implementations next to the default one (e.g. ['default', 'ios']). */
  platforms: string[];
};
/** GET /api/docs/components — generated from the UI source by scripts/gen-component-docs.mjs. */
export type PackageInfo = { name: string; version: string; description: string; license: string; peerDependencies: Record<string, string> };
export type ComponentDocs = { package: PackageInfo; intro: string; guide: { title: string; body: string }[]; components: ComponentDoc[] };
/** Live demos, keyed by component name. Any *.demos.tsx file under src/ default-exports one of these. */
export type DemoMap = Record<string, ComponentType>;

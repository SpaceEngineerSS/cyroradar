/* Documentation table of contents. Pages are MDX, loaded one at a time. */

import type { ComponentType } from 'react';
import type { MDXProps } from 'mdx/types';
import RAW from 'virtual:docs-sources';

type Loader = () => Promise<{ default: ComponentType<MDXProps> }>;

export interface DocPage {
  slug: string;
  title: string;
  group: string;
  summary: string;
  load: Loader;
}

export const DOC_PAGES: DocPage[] = [
  { slug: '', title: 'Getting started', group: 'Using CryoRadar', summary: 'What it does and the quickest way in.', load: () => import('./pages/getting-started.mdx') },
  { slug: 'reading-radargrams', title: 'Reading a radargram', group: 'Using CryoRadar', summary: 'Axes, echoes, clutter, the views.', load: () => import('./pages/reading-radargrams.mdx') },
  { slug: 'depth-model', title: 'Depth and layers', group: 'Using CryoRadar', summary: 'Turning delay into depth.', load: () => import('./pages/depth-model.mdx') },
  { slug: 'detection', title: 'Bright basal reflections', group: 'Using CryoRadar', summary: 'The detector and the three hypotheses.', load: () => import('./pages/detection.mdx') },
  { slug: 'uncertainty', title: 'Uncertainty', group: 'Using CryoRadar', summary: 'Monte Carlo on every input.', load: () => import('./pages/uncertainty.mdx') },
  { slug: 'processing', title: 'Processing', group: 'Using CryoRadar', summary: 'Statics, ionosphere, migration.', load: () => import('./pages/processing.mdx') },
  { slug: 'inversion', title: 'Waveform inversion', group: 'Using CryoRadar', summary: 'Experimental envelope FWI.', load: () => import('./pages/inversion.mdx') },
  { slug: 'polarimetry', title: 'Polarimetry (simulated)', group: 'Using CryoRadar', summary: 'A what-if, clearly labelled.', load: () => import('./pages/polarimetry.mdx') },
  { slug: 'data', title: 'Data, files and exports', group: 'Data', summary: 'Scenes, the PDS archive, sessions.', load: () => import('./pages/data.mdx') },
  { slug: 'physics', title: 'Physics reference', group: 'Reference', summary: 'Every equation the app uses.', load: () => import('./pages/physics.mdx') },
  { slug: 'architecture', title: 'How it is built', group: 'Reference', summary: 'Store, workers, renderers.', load: () => import('./pages/architecture.mdx') },
  { slug: 'limitations', title: 'Limits and validation', group: 'Reference', summary: 'What is tested, what is not.', load: () => import('./pages/limitations.mdx') },
  { slug: 'references', title: 'References', group: 'Reference', summary: 'Papers and datasets.', load: () => import('./pages/references.mdx') },
  { slug: 'changelog', title: 'Changelog', group: 'Reference', summary: 'What changed in each release.', load: () => import('./pages/changelog.mdx') },
];


export interface SearchEntry {
  slug: string;
  page: string;
  heading: string;
  anchor: string;
  text: string;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

export function buildSearchIndex(): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const p of DOC_PAGES) {
    const src = RAW[p.slug || 'getting-started'] ?? '';
    out.push({ slug: p.slug, page: p.title, heading: p.title, anchor: '', text: p.summary });
    let current: SearchEntry | null = null;
    for (const line of src.split('\n')) {
      const m = line.match(/^(##|###)\s+(.+)$/);
      if (m) {
        current = { slug: p.slug, page: p.title, heading: m[2], anchor: slugify(m[2]), text: '' };
        out.push(current);
      } else if (current && current.text.length < 400 && line && !line.startsWith('<') && !line.startsWith('import')) {
        current.text += ` ${line.replace(/[*_`$\\]/g, '')}`;
      }
    }
  }
  return out;
}

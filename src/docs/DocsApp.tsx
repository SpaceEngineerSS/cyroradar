import { Suspense, createElement, lazy, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { motion } from 'motion/react';
import 'katex/dist/katex.min.css';
import { DOC_PAGES, buildSearchIndex, slugify } from './pages';
import { useApp } from '../store/app';
import { Icon, LogoMark } from '../ui/icons';
import { IconButton, Progress } from '../ui/controls';
import { cx } from '../ui/cx';
import { SoundingGeometry, TimeToDepth, FresnelCurves, AttenuationCurves, DetectionChain, Architecture, FwiLoop, SceneModels, ColourTables, Shot, Figure, Aside } from './figures';
import './docs.css';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return '';
}

function Heading({ level, children }: { level: 2 | 3; children?: ReactNode }) {
  const id = slugify(textOf(children));
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <Tag id={id} className="group scroll-mt-20">
      {children}
      <a href={`#${id}`} className="ml-2 text-faint no-underline opacity-0 group-hover:opacity-100" aria-label="Link to this section">
        #
      </a>
    </Tag>
  );
}

const components = {
  h2: (p: { children?: ReactNode }) => <Heading level={2}>{p.children}</Heading>,
  h3: (p: { children?: ReactNode }) => <Heading level={3}>{p.children}</Heading>,
  a: ({ href = '', children, ...rest }: ComponentProps<'a'>) =>
    href.startsWith('/') ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noreferrer" {...rest}>
        {children}
      </a>
    ),
  table: (p: ComponentProps<'table'>) => (
    <div className="my-6 overflow-x-auto">
      <table {...p} />
    </div>
  ),
  SoundingGeometry, TimeToDepth, FresnelCurves, AttenuationCurves, DetectionChain, Architecture, FwiLoop, SceneModels, ColourTables, Shot, Figure, Aside,
};

const pageComponents = new Map(DOC_PAGES.map(p => [p.slug, lazy(p.load)]));

function Search({ onPick }: { onPick: () => void }) {
  const [q, setQ] = useState('');
  const index = useMemo(() => buildSearchIndex(), []);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return index
      .map(e => ({ e, s: (e.heading.toLowerCase().includes(t) ? 3 : 0) + (e.text.toLowerCase().includes(t) ? 1 : 0) }))
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
  }, [q, index]);
  return (
    <div className="relative">
      <div className="flex h-8 items-center gap-2 border border-line-strong bg-sunken px-2">
        <Icon name="search" size={14} className="text-faint" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the docs" aria-label="Search the documentation" className="w-full bg-transparent text-sm outline-none placeholder:text-faint" />
      </div>
      {results.length > 0 && (
        <ul className="absolute inset-x-0 top-9 z-20 border border-line-strong bg-raised shadow-[0_8px_24px_rgb(0_0_0/0.35)]">
          {results.map(({ e }) => (
            <li key={`${e.slug}#${e.anchor}`}>
              <Link
                href={`/docs${e.slug ? `/${e.slug}` : ''}${e.anchor ? `#${e.anchor}` : ''}`}
                onClick={() => {
                  setQ('');
                  onPick();
                }}
                className="block px-3 py-2 hover:bg-hover"
              >
                <span className="block text-sm text-ink">{e.heading}</span>
                <span className="block text-2xs text-faint">{e.page}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Nav({ current, onPick }: { current: string; onPick: () => void }) {
  const groups = [...new Set(DOC_PAGES.map(p => p.group))];
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      {groups.map(g => (
        <div key={g}>
          <p className="label mb-2">{g}</p>
          <ul className="flex flex-col">
            {DOC_PAGES.filter(p => p.group === g).map(p => {
              const active = p.slug === current;
              return (
                <li key={p.slug}>
                  <Link
                    href={`/docs${p.slug ? `/${p.slug}` : ''}`}
                    onClick={onPick}
                    aria-current={active ? 'page' : undefined}
                    className={cx('relative block py-1 pl-3 text-sm transition-colors', active ? 'text-ink' : 'text-dim hover:text-ink')}
                  >
                    {active && <motion.span layoutId="doc-nav" className="absolute top-1 bottom-1 left-0 w-[2px] bg-accent" />}
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function OnThisPage({ slug }: { slug: string }) {
  const [items, setItems] = useState<{ id: string; text: string; level: number }[]>([]);
  const [active, setActive] = useState('');
  useEffect(() => {
    let obs: IntersectionObserver | null = null;
    const read = () => {
      const hs = Array.from(document.querySelectorAll<HTMLElement>('.doc-body h2, .doc-body h3'));
      setItems(hs.map(h => ({ id: h.id, text: h.firstChild?.textContent ?? '', level: h.tagName === 'H2' ? 2 : 3 })));
      obs?.disconnect();
      obs = new IntersectionObserver(entries => {
        const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      }, { rootMargin: '0px 0px -70% 0px' });
      hs.forEach(h => obs!.observe(h));
    };
    const t = setTimeout(read, 150);
    const mo = new MutationObserver(() => setTimeout(read, 50));
    const body = document.querySelector('.doc-body');
    if (body) mo.observe(body, { childList: true });
    return () => {
      clearTimeout(t);
      obs?.disconnect();
      mo.disconnect();
    };
  }, [slug]);
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="flex flex-col gap-1.5">
      <p className="label mb-1">On this page</p>
      {items.map(i => (
        <a key={i.id} href={`#${i.id}`} className={cx('text-xs leading-5 transition-colors', i.level === 3 && 'pl-3', active === i.id ? 'text-ink' : 'text-faint hover:text-dim')}>
          {i.text}
        </a>
      ))}
    </nav>
  );
}

export default function DocsApp() {
  const [, params] = useRoute('/docs/:slug');
  const [location] = useLocation();
  const slug = params?.slug ?? '';
  const page = DOC_PAGES.find(p => p.slug === slug);
  const pageComponent = page ? pageComponents.get(page.slug) : undefined;
  const idx = DOC_PAGES.findIndex(p => p.slug === slug);
  const prev = idx > 0 ? DOC_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < DOC_PAGES.length - 1 ? DOC_PAGES[idx + 1] : null;
  const theme = useApp(s => s.theme);
  const set = useApp(s => s.set);
  const [menu, setMenu] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = page ? `${page.title} · CryoRadar docs` : 'CryoRadar docs';
    if (!location.includes('#')) window.scrollTo(0, 0);
    // Jump to an anchor once the lazy page has rendered.
    const hash = window.location.hash.slice(1);
    if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView(), 250);
  }, [page, location]);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-raised/95 px-4 backdrop-saturate-150">
        <IconButton icon="menu" label="Contents" className="lg:hidden" tip={false} onClick={() => setMenu(!menu)} />
        <Link href="/docs" className="flex items-center gap-2 text-ink">
          <LogoMark />
          <span className="text-[15px] font-semibold">CryoRadar</span>
          <span className="text-sm text-faint">docs</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <span className="num hidden text-2xs text-faint sm:inline">v{__APP_VERSION__}</span>
          <a href="https://github.com/SpaceEngineerSS/cyroradar" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 px-2 text-sm text-dim hover:text-ink">
            <Icon name="code" size={16} />
            <span className="hidden sm:inline">Source</span>
          </a>
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => set('theme', theme === 'dark' ? 'light' : 'dark')} />
          <Link href="/" className="ml-1 inline-flex h-8 items-center gap-1.5 border border-line-strong px-2.5 text-sm whitespace-nowrap hover:bg-hover">
            <span className="hidden sm:inline">Open the app</span>
            <span className="sm:hidden">App</span>
            <Icon name="chevronRight" size={14} />
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_190px]">
        <aside className={cx('lg:sticky lg:top-12 lg:block lg:h-[calc(100dvh-48px)] lg:overflow-y-auto lg:py-8', menu ? 'block py-6' : 'hidden')}>
          <div className="flex flex-col gap-6">
            <Search onPick={() => setMenu(false)} />
            <Nav current={slug} onPick={() => setMenu(false)} />
          </div>
        </aside>

        <main ref={mainRef} className="min-w-0 py-10">
          {page && pageComponent ? (
            <article className="doc-body">
              <p className="label mb-3">{page.group}</p>
              <Suspense fallback={<Progress value={null} label="Loading page" />}>
                <motion.div key={slug} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  {createElement(pageComponent, { components })}
                </motion.div>
              </Suspense>
              <div className="mt-16 grid grid-cols-2 gap-4 border-t border-line pt-6">
                {prev ? (
                  <Link href={`/docs${prev.slug ? `/${prev.slug}` : ''}`} className="group flex flex-col">
                    <span className="label">Previous</span>
                    <span className="text-sm text-dim group-hover:text-ink">{prev.title}</span>
                  </Link>
                ) : <span />}
                {next && (
                  <Link href={`/docs/${next.slug}`} className="group flex flex-col items-end text-right">
                    <span className="label">Next</span>
                    <span className="text-sm text-dim group-hover:text-ink">{next.title}</span>
                  </Link>
                )}
              </div>
            </article>
          ) : (
            <div className="flex flex-col gap-3">
              <h1 className="text-2xl font-semibold">Page not found</h1>
              <p className="text-dim">There is no documentation page at this address.</p>
              <Link href="/docs" className="text-accent">Back to the start</Link>
            </div>
          )}
        </main>

        <aside className="hidden py-10 xl:block">
          <div className="sticky top-20">
            <OnThisPage slug={slug} />
          </div>
        </aside>
      </div>
    </div>
  );
}

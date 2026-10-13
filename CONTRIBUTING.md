# Contributing

Thanks for taking the time. CryoRadar is small and maintained by one person, so the most useful contributions are focused ones: a bug with a way to reproduce it, a physics correction with a reference, or a pull request that does one thing.

## Setting up

```bash
git clone https://github.com/<you>/cyroradar.git
cd cyroradar
npm install
npm run dev
```

Node 20.19 or newer. The dev server proxies `/pds-data` to the PDS archive, so real SHARAD tracks load locally.

Before opening a pull request:

```bash
npm run lint
npm test
npm run build
```

## Where things live

| Folder | Holds | Rules |
| --- | --- | --- |
| `src/core` | physics, analysis, data pipeline, exports | No React. Pure functions where possible. Every module starts with a short comment giving the equations it implements and their references. |
| `src/workers` | compute worker, job protocol | Anything that can take more than a few milliseconds runs here. |
| `src/store` | Zustand store and derived values | Components select narrow slices. |
| `src/features` | the interface | One folder per area. |
| `src/ui` | building blocks and icons | Accessible by default: labels, roles, focus rings. |
| `src/docs` | MDX pages and SVG figures | Figures that show physics compute it with `src/core`. |

## Physics changes

If a change alters a number the app reports, include:

- the reference (with DOI) that supports it;
- a test in `src/core` that pins the new behaviour, ideally against a value you can work out by hand;
- an update to the matching docs page under `src/docs/pages`.

Say plainly what the change leaves out. The docs already list the approximations; new ones belong there too.

## Interface changes

Keep to the existing design language: warm graphite surfaces, hairline rules, one accent colour for things you can act on, mono tabular numbers. No new colours, gradients, blur or emoji. New icons go in `src/ui/icons.tsx`, drawn on the 20 × 20 grid with a 1.5 px stroke.

Check the change at phone width (390 px) as well as desktop, and with the keyboard alone.

If the change is visible in the docs or README, run `npm run build && npm run preview`, then `npm run screenshots` in another terminal to regenerate the images.

## Commits and pull requests

Short imperative subject lines ("Fix depth contours under static correction"), a body when the why is not obvious. One topic per pull request. Screenshots help for anything visual.

## Reporting problems

Open an issue with the dataset (scene name or PDS product id), the settings you used, what you expected and what you got. For security issues see [SECURITY.md](SECURITY.md).

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

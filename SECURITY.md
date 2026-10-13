# Security

## Supported versions

| Version | Supported |
| --- | --- |
| 2.x | yes |
| 1.x | no |

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's [private vulnerability reporting](https://github.com/SpaceEngineerSS/cyroradar/security/advisories/new) and include what you found, how to reproduce it, and what you think the impact is. I aim to reply within a week.

## What there is to attack

CryoRadar is a static site. There is no backend of its own, no accounts, no database and no secrets in the repository.

- **Network.** The app talks to NASA's ODE search service (`oderest.rsl.wustl.edu`) directly, and to the PDS Geosciences archive through a same-origin rewrite (`/pds-data` in `vercel.json`, and in `vite.config.ts` for development). Both are public, read-only and unauthenticated.
- **Files you open.** TIFF, CSV and session files are parsed in the browser, in a worker for the radargrams. Nothing is uploaded.
- **Storage.** The discovery log and a few display preferences are kept in `localStorage` in your browser. A service worker caches the built app for offline use; it never caches PDS responses.
- **No telemetry.** There are no analytics or trackers.

## Dependencies

Runtime dependencies are React, Zustand, wouter, Motion, three.js, jsPDF (which pulls in html2canvas and DOMPurify), KaTeX and the IBM Plex font packages. Versions are locked in `package-lock.json`, and Dependabot opens update pull requests weekly. `npm audit` is worth running before a release.

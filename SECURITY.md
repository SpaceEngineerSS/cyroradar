# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x (current) | ✅ Active |
| 5.x | ⚠️ Critical fixes only |
| < 5.0 | ❌ End of life |

## Reporting a Vulnerability

If you discover a security vulnerability in CRYORADAR, please report it responsibly:

1. **Do NOT open a public issue.** Security vulnerabilities must be reported privately.
2. **Contact:** Open a [private security advisory](https://github.com/SpaceEngineerSS/cyroradar/security/advisories/new) on GitHub, or reach out via the maintainer's [GitHub profile](https://github.com/SpaceEngineerSS).
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Security Architecture

CRYORADAR is designed with a **Zero Trust, client-side-only** architecture. There is no backend server, database, or authentication system to compromise.

### Threat Model

| Attack Surface | Mitigation |
|---|---|
| **No backend/server** | 100% static SPA deployed to Vercel. No server-side code execution. |
| **No authentication** | No user accounts, sessions, tokens, or credentials stored anywhere. |
| **No database** | All state is in-memory or in browser `localStorage`. No remote data store. |
| **No secrets in code** | No API keys, tokens, or credentials in the repository. External APIs (NASA PDS) are public and unauthenticated. |
| **No `eval()` or dynamic code** | Physics equations use strictly typed TypeScript functions. No string-to-code execution. |
| **Third-party dependencies** | Minimal dependency tree (React, Three.js, Tailwind). Dependencies are locked via `package-lock.json` and auditable with `npm audit`. |
| **Web Worker isolation** | Heavy computation runs in Web Workers with `ArrayBuffer` transfer — no shared memory race conditions. |

### Data Privacy

- **Discovery Log** data is stored exclusively in the user's browser `localStorage`. It never leaves the client.
- **CSV/JSON exports** are generated entirely in the browser sandbox and downloaded as local files.
- **No telemetry, analytics, or tracking** of any kind.

### External API Usage

CRYORADAR queries NASA's Planetary Data System (PDS) Orbital Data Explorer REST API:
- Endpoint: `https://oderest.rsl.wustl.edu/live2`
- This is a **public, unauthenticated** scientific data API maintained by Washington University in St. Louis.
- In development, requests are proxied through Vite's dev server to avoid CORS restrictions. In production, these calls go directly to the PDS servers.

### Dependency Security

We recommend periodically running:

```bash
npm audit
```

To check for known vulnerabilities in the dependency tree. The project maintains a minimal dependency footprint to reduce supply chain risk.

## Scope

The following are **out of scope** for CRYORADAR security:

- Vulnerabilities in the NASA PDS API itself (report to [PDS](https://pds.nasa.gov/))
- Browser-level vulnerabilities (report to the browser vendor)
- Vulnerabilities requiring physical access to the user's machine
- Social engineering attacks

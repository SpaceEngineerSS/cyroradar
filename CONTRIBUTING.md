# Contributing to CRYORADAR

First off, thank you for considering contributing to CRYORADAR! It's people like you that make out-of-the-box scientific simulations possible.

As a scientific tool, we enforce strict standards for mathematical fidelity and performance. Please follow these guidelines.

---

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Project Architecture](#project-architecture)
- [Scientific & Architectural Guidelines](#-scientific--architectural-guidelines)
- [Testing Guide](#-testing-guide)
- [Branch Naming Convention](#-branch-naming-convention)
- [Commit Message Format](#-commit-message-format)
- [Pull Request Process](#-pull-request-process)
- [Code Style](#-code-style)
- [Code Review Criteria](#-code-review-criteria)
- [Issue Labels](#-issue-labels)

---

## Development Environment Setup

### Prerequisites

- **Node.js** >= 20.x ([download](https://nodejs.org/))
- **npm** >= 10.x (included with Node.js)
- **Git** ([download](https://git-scm.com/))

### Step-by-Step Setup

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/cyroradar.git
cd cyroradar

# 2. Add the upstream remote
git remote add upstream https://github.com/SpaceEngineerSS/cyroradar.git

# 3. Install dependencies
npm install

# 4. Start the development server
npm run dev
```

The dev server starts at `http://localhost:5173` with hot module replacement and NASA PDS API proxies pre-configured in `vite.config.ts`.

### Useful Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm test` | Run all Vitest tests |
| `npx vitest` | Run tests in watch mode |
| `npm run lint` | Run ESLint across the project |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build locally |

---

## Project Architecture

CRYORADAR follows a clean separation between UI, state management, and core scientific computation:

```
src/
├── components/     # React UI components (one folder per component)
├── context/        # Global state management (CryoRadarContext with useReducer)
├── core/           # Pure computational modules (no React dependencies)
│   ├── analysis/   # SAR migration, anomaly detection, hypothesis engine, CRISM fusion
│   ├── colormaps/  # Geophysical colormap palettes (Seismic, GPR, etc.)
│   ├── export/     # CSV, JSON, PNG export utilities
│   ├── physics/    # Radar physics: dielectric, Fresnel, Dix velocity, attenuation
│   ├── pipeline/   # Data pipeline: PDS API client, synthetic radargram generator
│   └── three/      # Three.js 3D scene: Mars surface, radargram slice, clutter model
└── types/          # TypeScript type definitions
```

### Key Principles

- **`src/core/`** contains zero React imports — these are pure TypeScript modules testable in isolation.
- **`src/components/`** each component gets its own folder with `.tsx` and optional `.css` files.
- **`src/context/CryoRadarContext.tsx`** is the single source of truth for application state, using `useReducer` for predictable state transitions.
- **Heavy computation** is offloaded to Web Workers (see `src/core/analysis/sar-worker.ts`) via zero-copy `ArrayBuffer` transfer.

---

## 🔬 Scientific & Architectural Guidelines

1. **Test-Driven Development (TDD):** Every physics utility (e.g., migration, velocity calculation, hypothesis evaluation) MUST have an accompanying test file placed alongside the source (e.g., `dix-velocity.ts` → `dix-velocity.test.ts`). We check against first-principles (e.g., $c = 299,792,458$ m/s).

2. **References Required:** Any new equation must be documented with a DOI or reference to a peer-reviewed paper in the method's JSDoc. Example:
   ```typescript
   /**
    * Computes RMS velocity using the Dix (1955) equation.
    * @see Dix, C.H. (1955). Geophysics 20(1), 68–86. DOI: 10.1190/1.1438126
    */
   ```

3. **Zero-Trust & Stateless Architecture:** Do not introduce dependencies that require an active backend script (PHP, Python server) or a database (PostgreSQL, MongoDB). CRYORADAR must remain 100% client-side (Zero-Trust sandbox). Use Web Workers for heavy lifting.

4. **Performance (Zero-Copy):** Heavy matrices in computational modules must use `Float32Array` or `Uint16Array` and be passed via `ArrayBuffer.transfer()` to prevent heap memory bloat from garbage collection.

5. **No Blind Copies:** Do not add code you do not mathematically understand. Document your logic.

---

## 🧪 Testing Guide

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npx vitest

# Run a specific test file
npx vitest run src/core/physics/dix-velocity.test.ts
```

### Writing Tests

Tests live **alongside their source files**, not in a separate `test/` directory:

```
src/core/physics/
├── dix-velocity.ts           # Source
├── dix-velocity.test.ts      # Test ← same directory
├── fresnel.ts
└── ...
```

#### Test Conventions

- Use **Vitest** (`describe`, `it`, `expect`) — the syntax is Jest-compatible.
- Test against **physical constants** and **known analytical solutions**, not arbitrary magic numbers.
- Verify **energy conservation** where applicable (signal energy in = signal energy out).
- Verify **boundary conditions**: V_water <= V_RMS <= V_vacuum, 0 <= R <= 1, etc.

#### Example Test

```typescript
import { describe, it, expect } from 'vitest';
import { computeDixRMS } from './dix-velocity';
import { SPEED_OF_LIGHT } from './constants';

describe('Dix RMS Velocity', () => {
  it('should not exceed vacuum speed of light', () => {
    const vrms = computeDixRMS(layers);
    expect(vrms).toBeLessThanOrEqual(SPEED_OF_LIGHT);
  });

  it('should equal interval velocity for a single layer', () => {
    const single = [{ epsilon: 3.15, thickness: 1000 }];
    const vrms = computeDixRMS(single);
    const expected = SPEED_OF_LIGHT / Math.sqrt(3.15);
    expect(vrms).toBeCloseTo(expected, 2);
  });
});
```

---

## 🌿 Branch Naming Convention

Use prefixes that match conventional commit types:

| Prefix | Use Case | Example |
|---|---|---|
| `feature/` | New features or capabilities | `feature/crism-band-ratio` |
| `fix/` | Bug fixes | `fix/fresnel-nan-edge-case` |
| `docs/` | Documentation only | `docs/add-migration-equations` |
| `refactor/` | Code restructuring (no behavior change) | `refactor/extract-dix-module` |
| `test/` | Adding or updating tests | `test/attenuation-coverage` |
| `perf/` | Performance optimizations | `perf/worker-pool-migration` |

---

## 📝 Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `chore`, `ci`

**Examples:**
```
feat(physics): add temperature-dependent dielectric model
fix(migration): correct aperture boundary for edge traces
docs(readme): add architecture diagram and project structure
test(fresnel): validate R=0 for matched impedance
perf(worker): switch to ArrayBuffer.transfer() for zero-copy
```

---

## 📥 Pull Request Process

1. **Fork** the repository and create a new branch (see [Branch Naming Convention](#-branch-naming-convention)).
2. **Sync** with upstream before submitting:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
3. **Test** the code:
   ```bash
   npm test
   npm run lint
   npm run build
   ```
   Your branch must pass all tests and lint checks without warnings.
4. Make sure any visual components comply with our Tailwind Glassmorphism / Deep Space Dark theme.
5. Document any new features in `README.md`.
6. Submit a PR using the [PR template](https://github.com/SpaceEngineerSS/cyroradar/blob/main/.github/pull_request_template.md), emphasizing:
   - **Scientific justification** (if modifying physics logic)
   - **Performance metrics** (if optimizing rendering or computation)
   - **Before/after screenshots** (if changing UI)

---

## 💬 Code Style

- Use **strict TypeScript**. No `any` types.
- Follow **functional programming** paradigms where possible. Avoid mutating `Float32Array` buffers unless absolutely required for `O(N)` algorithmic optimizations.
- Use **explicit return types** on all exported functions.
- Components: one component per folder, with co-located `.css` if needed.
- Imports: group by external → internal → types, separated by blank lines.

---

## 🔍 Code Review Criteria

Reviewers will evaluate PRs against:

| Criterion | What We Look For |
|---|---|
| **Correctness** | Does the physics match the referenced paper? Are edge cases handled? |
| **Tests** | Are new functions covered? Do tests check physical invariants? |
| **Performance** | Does it use typed arrays for heavy data? Is it O(N) or better where possible? |
| **Type Safety** | No `any`, proper generics, explicit return types |
| **Documentation** | JSDoc with DOI references for equations, clear parameter descriptions |
| **UI Consistency** | Follows the Deep Space Dark theme, responsive layout |

---

## 🏷️ Issue Labels

| Label | Description |
|---|---|
| `bug` | Something isn't working correctly |
| `enhancement` | New feature or improvement request |
| `scientific` | Involves physics models, equations, or data pipelines |
| `documentation` | Documentation improvements |
| `good first issue` | Suitable for newcomers |
| `help wanted` | Community input or contribution needed |
| `performance` | Optimization opportunity |
| `question` | Needs discussion or clarification |

---

*"Equipped with his five senses, man explores the universe around him and calls the adventure Science."* – Edwin Hubble

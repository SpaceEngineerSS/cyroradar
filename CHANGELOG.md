# Changelog

All notable changes to CryoRadar. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## 2.0.0 — 2026-10-13

A rewrite. Most of the physics was corrected, several features that only looked finished now work, and the interface was rebuilt from scratch.

### Fixed

- Dielectric loss was twice too high everywhere (the power attenuation coefficient was multiplied by 8.686). Simulated scenes, detection and the link budget all change.
- The link budget used a scattering cross-section in metres instead of square metres and counted noise twice. It now uses the image-source equation for a specular surface.
- The bright-reflection detector divided dB values as if they were linear power, so it found nothing in simulated scenes, and it could only ever report liquid water. It now works in dB, corrects for surface reflection, transmission and loss, and reports four classes.
- Monte Carlo uncertainty perturbed the reflector's permittivity instead of the overburden's.
- Clay evidence raised the probability of water in the hypothesis engine.
- Static correction filled gaps with 0 dB, the brightest possible value.
- Region-of-interest boxes were only drawn when a layer had picks.
- The ice permittivity model gave negative losses above 248 K.
- Discovery log entries were duplicated each time the log was opened.
- Loading indicators never appeared because heavy work blocked the frame they were drawn in.
- Mouse-wheel zoom also scrolled the page; there was no touch support.
- Elevations for archive tracks used a sphere and were kilometres off near the poles.
- PDS file paths were hard-coded to one archive volume.

### Changed

- **Waveform inversion is real.** The previous version filled a rectangle with rising permittivity and reported a random misfit. It is now an envelope adjoint-state inversion with a WebGPU backend and a CPU fallback, labelled experimental.
- **Migration, static correction, the TEC setting, the anomaly, polarimetry and confidence overlays, and the measure tool** used to change settings nothing read. They now all do what they say.
- The synthetic scenes are rebuilt: surface Fresnel reflection, transmission losses, roughness-dependent coherence, bandwidth-matched pulses, off-nadir clutter, lateral brine patches and receiver noise added after the ionosphere. SHARAD scenes use the archive's 0.0375 µs sampling.
- Archive tracks can be loaded as calibrated power (RGRAM.IMG) as well as browse images, with the real geometry table and an automatic surface pick.
- Polarimetry is presented as a simulation, because SHARAD and MARSIS are single-polarisation instruments.
- The CRISM context is presented as simulated.
- Explorer mode is a guided tour built from the scene's own layer model, replacing fixed decorative bands.
- New interface: design system, icons, layout for desktop, tablet and phone, keyboard shortcuts and a command palette.
- The radargram is drawn with WebGL 2 (Canvas 2D fallback). Pan, zoom and contrast no longer re-render the interface.
- All heavy computation runs in cancellable workers.
- Documentation moved into the app at `/docs`, with figures computed from the app's own code.

### Added

- Depth model with picked horizons, fit-to-picks, Dix RMS velocity and an ice temperature model.
- Segments of detections with averaged hypotheses, and a 90 % interval of basal permittivity with P(ε ≥ 25).
- Link budget panel with the deepest detectable basal echo.
- Side-by-side comparison of raw and migrated images.
- Track map with a polar projection and the surface profile; 3D curtain view.
- Session files, shareable links, PNG export with caption and scale, a PDF report.
- Opening TIFF and CSV radargrams from disk.
- Offline support for the app and simulated scenes.
- Light theme.

### Removed

- Achievement badges.
- The volumetric view, which extruded a single track sideways and implied data that does not exist.
- Unused modules and assets left from the project template.

## 1.0.0 — 2026-04-28

First public release.

# CUTORA

<p align="center">
  <strong>A browser-based video editor built with vanilla web technologies.</strong>
  <br />
  Import media, arrange clips on a multitrack timeline, adjust visuals, and experiment with editing workflows directly in your browser.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.3-64748b?style=flat-square" />
  <img alt="Built with" src="https://img.shields.io/badge/built%20with-HTML%20%7C%20CSS%20%7C%20JavaScript-f59e0b?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" />
  <img alt="Status" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
</p>

---

## About

**CUTORA v1.0.3** is the first published development snapshot of an experimental, desktop-style video editor for the web. The project explores how media management, timeline editing, preview controls, and project persistence can be built with standard browser APIs—without a frontend framework.

This is an **early development release**, not a production-ready editor. Development is ongoing, and some workflows may be incomplete or unreliable.

## v1.0.3 update

- Fixed preview source switching so new videos wait for their own metadata before seeking.
- Added a dedicated still-image layer for images placed on the primary video track.
- Stabilized preview-frame sizing and overlay stacking.
- Made the empty-preview state depend on visible visual clips rather than audio-only timeline content.

- Fixed transport-button state updates when timeline duration changes.
- Improved hidden-track playback handling and animated overlay refresh cadence.
- Restored secondary tracks and their clips when loading saved projects.
- Improved export media playback synchronization and removed the invalid native-controls attribute.
- Added document metadata and visible keyboard-focus styling.

## Features

- **Media library** — Import local video, audio, and image files.
- **Multitrack timeline** — Organize clips across video, overlay, text, and audio tracks.
- **Clip editing** — Select, move, trim, split, duplicate, and delete clips.
- **Preview monitor** — Preview media and navigate the timeline.
- **Visual adjustments** — Experiment with position, scale, rotation, opacity, and visual filters.
- **Text overlays** — Create and customize text elements.
- **Transitions and keyframes** — Explore clip fades, transitions, and animated properties.
- **Undo and redo** — Reverse and restore supported editing actions.
- **Project files** — Export and restore project structure using JSON.
- **Browser-based export experiments** — Rendering and recording depend on browser API and codec support.

> Feature availability and reliability can vary in this version. See [Development status](#development-status) for known limitations.

## Technology

CUTORA is built with:

- **HTML5** for the application structure
- **CSS3** for layout and styling
- **Vanilla JavaScript (ES6+)** for editor logic
- **Canvas API** for compositing experiments
- **MediaRecorder API** and **Web Audio API** for browser-based recording and audio processing

No frontend framework or package installation is required for the current project.

## Run locally

### Requirements

- A modern desktop browser
- Python 3, or another local static HTTP server

### 1. Clone the repository

```bash
git clone https://github.com/cyber-rover-ion/CUTORA.git
cd CUTORA
```

### 2. Start a local server

```bash
python -m http.server 8000
```

### 3. Open CUTORA

Visit [http://localhost:8000](http://localhost:8000) in your browser.

A local server is recommended because some browser features may behave differently when opening the HTML file directly from disk.

## Project structure

```text
CUTORA/
├── index.html   # Application interface and layout
├── style.css    # Design system, layout, and styling
├── app.js       # Editor state, timeline, media, and interactions
├── README.md    # Project documentation
└── LICENSE      # Apache License 2.0
```

## Development status

Version **1.0.3** is a starting point for continued development. The current focus is improving playback reliability, making the editing workflow easier to understand, and testing the existing features more thoroughly.

Known limitations include:
- Full simultaneous compositing across multiple video tracks and true mixed-track audio rendering remain incomplete.

- Browser-level playback validation is still required across supported video codecs and browsers.
- Browser support for media formats and export codecs varies. MP4 output is not guaranteed; the actual format depends on what the browser supports.
- Project JSON stores editing structure, but local media files may need to be selected again when reopening a project.
- Large files and complex timelines may affect performance.
- This version has not been established as suitable for professional or production workflows.

Please keep backups of important media and project files while testing.

## Roadmap

- [ ] Fix and verify play/pause and timeline synchronization.
- [ ] Refine the workspace layout and make common actions easier to discover.
- [ ] Improve project save/restore reliability.
- [ ] Test media import, clip editing, and undo/redo across common workflows.
- [ ] Improve export compatibility and report supported output formats accurately.
- [ ] Optimize performance for larger projects.
- [ ] Add repeatable tests for core editing operations.

## Reporting issues

If you find a bug, please include:

1. Your browser and operating system.
2. The steps needed to reproduce the issue.
3. What you expected to happen.
4. What actually happened.
5. Any relevant browser-console errors.

Constructive suggestions and feedback are welcome as the project evolves.

## License

CUTORA is distributed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for the complete license terms.

## Author

Created and maintained by **cyber-rover-ion**.

- GitHub: [@cyber-rover-ion](https://github.com/cyber-rover-ion)
- Repository: [cyber-rover-ion/CUTORA](https://github.com/cyber-rover-ion/CUTORA)

---

<p align="center">
  <strong>CUTORA v1.0.3</strong><br />
  An evolving experiment in browser-based video editing.
</p>

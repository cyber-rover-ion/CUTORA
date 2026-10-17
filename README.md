# CUTORA

<p align="center">
  <strong>A browser-based video editor built with vanilla web technologies.</strong>
  <br />
  Import media, arrange clips on a multitrack timeline, adjust visuals, and experiment with editing workflows directly in your browser.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.1.0-64748b?style=flat-square" />
  <img alt="Built with" src="https://img.shields.io/badge/built%20with-HTML%20%7C%20CSS%20%7C%20JavaScript-f59e0b?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" />
  <img alt="Status" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
</p>

<p align="center">
  <a href="https://cutora-ten.vercel.app"><strong>▶ Open CUTORA — Use the live editor</strong></a>
  &nbsp; · &nbsp;
  <a href="https://github.com/cyber-rover-ion/CUTORA">View source on GitHub</a>
</p>

---

## About

**CUTORA v1.1.0** is an experimental development snapshot of an experimental, desktop-style video editor for the web. The project explores how media management, timeline editing, preview controls, and project persistence can be built with standard browser APIs—without a frontend framework.

This is an **early development release**, not a production-ready editor. Development is ongoing, and some workflows may be incomplete or unreliable.

## Version and upgrade history

The history below is reconstructed from the repository's commit messages, source comments, and documentation. Version labels without a dedicated release tag are identified as development refinements rather than confirmed published releases.

### v1.1.0 — Customizable appearance

- Added ten selectable color themes: Midnight, Ocean, Emerald, Sunset, Ruby, Amber, Rose, Arctic, Cyber, and Monochrome.
- Added an Appearance picker in the editor toolbar with visual swatches and a clear selected-state indicator.
- Themes recolor editor surfaces, panels, borders, accents, and interface details while keeping text contrast in mind.
- Saves the selected preset locally and restores it when CUTORA is reopened.
- Added a one-click reset to the default Midnight theme and a responsive picker layout for narrow screens.

### v1.0.9 — Playback, export, and mobile refinements

- Improved track mute/lock state feedback and corrected mute handling for active tracks.
- Added direct drag-to-reposition for preview text, with lock protection and undo support.
- Improved text sizing relative to the preview frame.
- Expanded export compositing for active image and text clips across secondary overlay/text tracks, and cached image objects between frames.
- Throttled timeline UI updates during playback while retaining per-frame media synchronization.
- Added a best-effort 120 FPS export option; actual output frame rate depends on browser, device, and recording performance.
- Hardened small-screen layout, wrapping controls, and touch-scrollable timeline behavior.
- Added the live editor link to the README and toolbar.
- Documented remaining export limitations: audio mixing and complete multi-video-track compositing are not yet implemented.

### v1.0.8 — No separate release record found

No dedicated v1.0.8 release note or release tag was identified in the inspected repository history. This README does not assign unverified features to a formal v1.0.8 release.

### v1.0.7-era development refinements

- Added clearer visual states for muted and locked tracks.
- Added draggable text overlays in the preview.
- Improved preview text sizing and track interaction feedback.

These changes are present in source history, but a separate v1.0.7 release tag was not confirmed.

### v1.0.6 — Preview performance and responsive workspace

- Reduced repeated preview-overlay DOM rebuilding during playback.
- Removed duplicate per-frame rendering work to improve playback responsiveness.
- Added a responsive mobile layout and larger, easier-to-use touch controls.
- Added a prominent link to open the live editor.

### v1.0.5 — Controls and visual polish

- Fixed the Open Project toolbar button so it opens the project-file picker, matching Ctrl+O.
- Refreshed interface accents, clip-type styling, active states, hover feedback, and keyboard-focus styling.

### v1.0.4 — Preview initialization and media synchronization

- Fixed preview initialization issues that could leave the monitor empty or stale.
- Improved media preloading and synchronization when switching video sources.
- Stabilized preview layers and still-image handling.
- Improved hidden-track playback and preview empty-state behavior.

### v1.0.3 — Preview and saved-track fixes

- Waited for new video metadata before seeking after a source switch.
- Added a dedicated still-image layer for images placed on the primary video track.
- Stabilized preview-frame sizing, overlay stacking, and empty-preview logic.
- Improved transport controls, hidden-track playback, and export media synchronization.
- Restored secondary tracks and their clips when loading saved projects.
- Added document metadata and visible keyboard-focus styling.

### v1.0.2 — No separate release record found

No dedicated v1.0.2 release note or release tag was identified in the inspected repository history. The documented history moves from v1.0.1 to v1.0.3; this gap is kept explicit rather than inventing changes.

### v1.0.1 — Core stability and accessibility

- Improved playback and transport state synchronization when clips are added, moved, or removed.
- Stabilized track rendering and restoration for secondary tracks.
- Improved secondary-track ID validation and saved-project restoration.
- Refined preview markup, metadata, and keyboard-focus/accessibility states.
- Stabilized early playback and export workflows.

### v1.0.0 — Initial development snapshot

- Established the vanilla HTML, CSS, and JavaScript editor structure.
- Introduced local media import, a multitrack timeline, preview playback, clip editing, text overlays, visual adjustments, transitions/keyframes, undo/redo, project JSON save/load, and experimental browser-based export.

## Current release status

CUTORA is currently documented as **v1.0.9**. It remains an experimental editor; the version history describes implemented development work, not a guarantee that every workflow has passed end-to-end browser testing.

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

Version **1.0.9** includes the improvements listed in [Version and upgrade history](#version-and-upgrade-history). It remains an experimental editor; browser-level testing is still needed before treating these workflows as reliable.

Known limitations include:
- Export does not yet mix audio tracks into the rendered file; audio mixing remains incomplete.
- Export uses real-time browser capture. A requested 120 FPS setting is best-effort and does not guarantee 120 encoded frames per second.
- Full simultaneous compositing of multiple video tracks remains incomplete.

- Browser-level playback validation is still required across supported video codecs and browsers.
- Browser support for media formats and export codecs varies. MP4 output is not guaranteed; the actual format depends on what the browser supports.
- Project JSON stores editing structure, but local media files may need to be selected again when reopening a project.
- Large files and complex timelines may affect performance.
- This version has not been established as suitable for professional or production workflows.

Please keep backups of important media and project files while testing.

## Roadmap

- [ ] Verify play/pause and timeline synchronization across real local media files and supported browsers.
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
  <strong>CUTORA v1.1.0</strong><br />
  An evolving experiment in browser-based video editing.
</p>

# CUTORA — Complete Project Summary

**Current documented version:** v1.1.8  
**Repository:** https://github.com/cyber-rover-ion/CUTORA  
**Live editor:** https://cutora-ten.vercel.app  
**Hosting:** Vercel (latest deployment was confirmed READY)  
**License:** Apache License 2.0  
**Status:** Early development / experimental

---

## 1. Project overview

CUTORA is a browser-based video editor built with standard HTML, CSS, and JavaScript. It aims to provide a desktop-style editing workspace with a media library, multitrack timeline, preview monitor, clip properties, text overlays, visual adjustments, project save/load, and browser-based export experiments.

The current application is a static web app with no frontend framework and no backend media-rendering service. Users select local media through the browser. CUTORA is an evolving development snapshot, not yet a production-grade replacement for professional desktop editors.

## 2. Main goals

- Make common editing actions available directly in a browser.
- Keep hosting simple and static-site friendly.
- Support local media rather than requiring a cloud media service.
- Provide desktop and touch-oriented mobile layouts.
- Improve timeline reliability, preview synchronization, project persistence, and export behavior.
- Offer a dark editor UI with customizable color themes.
- Keep the core implementation understandable and lightweight.

## 3. Technology stack

| Technology | Purpose |
|---|---|
| HTML5 | Editor structure, controls, panels, dialogs |
| CSS3 | Layout, themes, responsive/mobile styling, visual states |
| Vanilla JavaScript (ES6+) | Application state, media handling, timeline, interactions |
| DOM APIs | Timeline rendering, media cards, property controls, preview layers |
| Canvas API | Compositing and export-frame rendering experiments |
| MediaRecorder API | Recording canvas output when supported |
| HTML media elements | Video/audio metadata and playback |
| Object URLs | Temporary references to local user-selected media |
| Browser storage | Local UI preferences and recovery-related state where implemented |
| GitHub | Source repository and version history |
| Vercel | Hosting and production deployment |

No frontend framework or package installation is required for the current codebase.

## 4. Repository structure

```text
CUTORA/
├── index.html          # Editor markup, toolbar, panels, dialogs, controls
├── style.css           # Theme system, layout, responsive rules, UI styling
├── app.js              # State, media, timeline, playback, properties,
│                       # project save/load, recovery, export
├── README.md           # Setup, features, status, roadmap, version notes
├── LICENSE             # Apache License 2.0
└── PROJECT_SUMMARY.md  # This detailed overview
```

The current implementation is concentrated in `index.html`, `style.css`, and `app.js`. The editor has not yet been separated into dedicated modules such as `timeline.js`, `preview.js`, or `export.js`.

## 5. Feature inventory

### Media library and import
- Imports local video, audio, and image files.
- Detects common media types using MIME types and file extensions.
- Reads duration and dimensions when browser metadata is available.
- Attempts to create small video thumbnails, with fallback behavior if extraction fails.
- Displays imported media in the library and supports panel-scoped searching/filtering.
- Skips unsupported/empty files and reports import failures.
- Supports re-importing local files to relink media after loading a project.

**Limitations:** Browser codec support varies. Some files may not decode or provide metadata. Large batches can take time and consume memory.

### Multitrack timeline
Track categories:
- **Video**
- **Overlay**
- **Text**
- **Audio**

The editor supports primary tracks and secondary tracks with IDs such as `video-2` and `audio-2`. Track state includes hidden/visible, muted, locked, and exists flags.

Implemented timeline workflows include clip rendering, selection, movement, trimming, splitting, duplication, deletion, ruler/slider seeking, zoom and duration calculations, track controls, undo/redo for supported actions, and restoration of missing track DOM elements.

Track removal/recovery behavior is designed to preserve clips in project state, and track operations have received undo/history refinements.

**Limitations:** Complex track combinations and long editing sessions still need end-to-end tests.

### Preview and playback
- Preview monitor for active media and overlays.
- Timeline-based video/audio synchronization.
- Still-image preview handling.
- Text overlays and visual properties.
- Seeking through playback controls and the timeline ruler.
- Play/pause and transport-state updates.
- Throttled playback UI refreshes to avoid unnecessary repeated DOM work.
- Media synchronization when the active clip changes.

**Limitations:** Real-media playback, rapid seeking, long timelines, codecs, and complex overlays still require browser testing. Frame-perfect preview is not guaranteed.

### Clip properties and visual adjustments
Supported property workflows include:
- Position (X/Y), scale, rotation, and opacity.
- Brightness, contrast, saturation, temperature/tint-style adjustment, grayscale, and blur.
- Volume and fades.
- Playback speed where supported.
- Transitions and animated/keyframed properties in the existing editing workflow.

Available controls depend on the selected clip type and active properties panel.

### Text tools
Current font choices:
- Modern Sans
- Arial
- Georgia
- Impact
- Monospace
- Classic Serif
- Rounded
- Condensed

Current text effects:
- Clean
- Soft shadow
- Outline
- Neon glow
- Caption label
- Retro

Text styling is applied in the preview renderer and has corresponding canvas-rendering logic for supported export paths. Text can be repositioned directly in the preview; interaction is intended to respect track/clip lock behavior and undo support.

**Limitations:** Font availability depends on the device/browser. Preview and export text rendering can differ and must be tested with different fonts, sizes, effects, and resolutions.

### Video look presets
Current presets:
- Original
- Cinematic
- Vivid
- Black & white
- Vintage
- Cool tone
- Dreamy soft
- High-contrast noir
- Warm film
- Faded matte
- Bright & clean

Presets update existing visual properties and use the editor's current filter-processing path. They are starting points, not a full professional color-grading system.

### Appearance and themes
The documented appearance picker includes ten themes:
- Midnight
- Ocean
- Emerald
- Sunset
- Ruby
- Amber
- Rose
- Arctic
- Cyber
- Monochrome

Theme preference persistence and a reset to Midnight are documented.

### Undo/redo and recovery
- Undo/redo stacks cover supported editing operations.
- Successful media imports are marked as project changes.
- Recovery saving is scheduled after supported changes, including imports.
- Track creation/removal/restoration has received history and recovery fixes.
- Project state can be exported as JSON and loaded again.

**Important:** Project JSON stores edit structure and metadata; it does not package all original video/audio/image files. Reopening a project may require selecting the original local files again. Keep backups of the project and media.

### Project save/load
Projects use a JSON representation of editor state. The loader validates the project before replacing current state. v1.1.8 strengthened checks for duplicate clip/asset IDs, invalid timing, unsupported asset types, malformed properties, and malformed track records.

Assets loaded without local URLs are marked missing until matching media is re-imported/relinked.

### Browser-based export
The current export experiment uses:
- Canvas rendering
- `canvas.captureStream()`
- `MediaRecorder`
- Browser-supported recording codecs
- A real-time rendering loop and progress feedback
- Temporary object URLs for the downloaded file

Settings include resolution, frame rate, quality, and requested output format, subject to browser capabilities. Export now tracks its animation-frame request and has additional guards around recorder startup and rendering failures.

**Known limitations:**
- Export runs in real time; it is not an offline render engine.
- A 120 FPS selection is best-effort and does not guarantee 120 encoded FPS.
- Audio-track mixing into the exported video is incomplete/not implemented in the documented workflow.
- Full simultaneous compositing of multiple video tracks remains incomplete.
- Actual output format depends on browser codec support; MP4 is not guaranteed.
- Backgrounding the tab, device performance, memory pressure, and decode speed can affect output.

### Responsive/mobile workspace
Documented mobile work includes:
- Mobile navigation for Preview, Media, Properties, and Timeline.
- Safe-area spacing for cutouts and home-indicator areas.
- Touch-scrollable toolbar actions, media panels, and timeline.
- Larger touch targets.
- Responsive dialogs and export settings.
- Portrait, landscape, and small-screen adjustments.
- Reduced backdrop blur on selected mobile surfaces.
- Pointer-mode detection for touch/coarse input versus precise pointer input.

**Limitations:** Responsive CSS does not prove stable mobile editing. Physical-device tests are still needed for playback, gestures, memory usage, and export.

## 6. v1.1.8 stability changes

### Import hardening
- Handles each supported file within an error guard so one unexpected failure should not abort an entire batch.
- Releases temporary object URLs if an import fails.
- Successful imports refresh the UI, mark the project dirty, and schedule recovery saving.

### Project-file validation
- Checks required top-level fields and array structures.
- Limits total clip and asset entries.
- Checks unique clip and asset IDs.
- Validates media types, timing, optional in-points, asset IDs, clip properties, track IDs, and track records.
- Rejects malformed data before applying it to the editor state.

### Export lifecycle protection
- Tracks the active export animation-frame request.
- Cancels a scheduled frame during cleanup.
- Pauses preview video/audio elements during cleanup.
- Handles recorder startup errors.
- Catches exceptions in initial-frame and later frame rendering.
- Avoids continuing the normal rendering loop after a detected failure.

These are defensive code improvements, not proof that every export or playback issue is resolved.

## 7. Version history overview

The existing README's version history is reconstructed from repository history, comments, and documentation. Not every label corresponds to a dedicated release tag, and the documented labels are not a perfectly chronological release ledger.

- **v1.0.0:** Initial vanilla editor; media import, timeline, preview, text, visual adjustments, transitions/keyframes, undo/redo, JSON save/load, experimental export.
- **v1.0.1:** Core stability, track restoration, transport synchronization, accessibility refinements.
- **v1.0.3:** Preview initialization, still-image handling, secondary-track restoration, media synchronization.
- **v1.0.4:** Preview and media-switch synchronization fixes.
- **v1.0.5:** Toolbar control fixes and visual polish.
- **v1.0.6:** Preview performance and responsive workspace improvements.
- **v1.0.7-era refinements:** Track-state feedback, draggable text, preview text sizing; no separate formal release tag confirmed.
- **v1.0.9:** Playback/export/mobile refinements, text repositioning, overlay export work, UI update throttling.
- **v1.1.2:** Theme picker and mobile workspace changes are documented under this label; version labels in the README are not strictly chronological.
- **v1.1.3:** Duplicate audio-card prevention, scoped search, import dirty-state/recovery, empty-export guard, mobile safe-area refinements.
- **v1.1.4:** Mobile portrait/landscape layout and touch interaction refinements.
- **v1.1.5:** Timeline track recovery, track-operation history, safer secondary-track ID handling.
- **v1.1.6:** Touch targets, toolbar scrolling, safe areas, mobile dialogs, lighter mobile surfaces.
- **v1.1.7:** Text font/effect choices and video look presets.
- **v1.1.8:** Additional video looks, stronger project validation, safer import handling, export lifecycle/render-error guards.

## 8. Current status and verification

**Current documented version:** v1.1.8  
**Source of truth:** GitHub `main` branch  
**Hosting:** Vercel production  
**Release maturity:** Experimental / early development

Static/basic checks performed during the latest update:
- JavaScript parsed successfully using a syntax check.
- HTML opening and closing `div` counts matched.
- CSS opening and closing brace counts matched.
- New video preset options and JavaScript mappings were present.
- Text control IDs and JavaScript references were present.
- Stability guard code and v1.1.8 documentation were present.
- Vercel reported the production deployment as READY.

Not completed in the latest update:
- Full browser interaction test of every toolbar, property, and timeline control.
- Real video/audio/image import and playback matrix.
- End-to-end export tests across browsers and codecs.
- Long-timeline or memory-pressure tests.
- Physical-device mobile tests.
- Crash/reload recovery tests.
- Automated regression test suite.

## 9. Known limitations and risks

1. **Export is incomplete:** audio mixing and full multi-video-track compositing are not complete.
2. **Codec support varies:** a file or output format may work in one browser and fail in another.
3. **Real-time export is performance-dependent:** output cadence and quality depend on the browser and device.
4. **Projects do not bundle media:** original assets may need to be reselected.
5. **Large projects may be slow:** high-resolution media and many clips can consume CPU and memory.
6. **Preview/export parity is not guaranteed:** canvas text, filters, fonts, and media timing can differ.
7. **Mobile behavior needs device testing:** responsive CSS is not equivalent to physical-device validation.
8. **Not production-ready:** critical workflows need end-to-end verification.

## 10. Recommended roadmap

### Priority 1 — Core editing stability
- [ ] Test importing video, audio, and images in realistic batches.
- [ ] Test play, pause, seek, source switching, and end-of-timeline behavior.
- [ ] Test clip move, trim, split, duplicate, delete, undo, and redo.
- [ ] Test track add, remove, hide, mute, lock, and restore.
- [ ] Test save, reload, relinking, malformed-file rejection, and recovery.
- [ ] Fix reproducible bugs before adding more complexity.

### Priority 2 — Export reliability
- [ ] Test supported WebM/MP4 output and report the actual output format.
- [ ] Test each resolution and quality setting.
- [ ] Verify cleanup after success, recorder failure, and render exceptions.
- [ ] Decide and document audio-mixing behavior.
- [ ] Complete or clearly constrain multi-video-track compositing.
- [ ] Compare preview and exported frames for text, filters, transforms, and overlays.

### Priority 3 — Performance
- [ ] Profile large imports and long timelines.
- [ ] Reduce avoidable DOM rebuilding and repeated media decoding.
- [ ] Keep object URL, media-element, canvas, and listener cleanup predictable.
- [ ] Measure expensive effects before adding more.
- [ ] Add regression tests for timeline timing and state changes.

### Priority 4 — Mobile and accessibility
- [ ] Test on real Android/iOS devices where available.
- [ ] Verify touch gestures, timeline scrolling, dialogs, and safe areas.
- [ ] Check keyboard navigation, focus visibility, and accessible labels.
- [ ] Ensure controls remain reachable on narrow and landscape screens.

### Priority 5 — Documentation and maintainability
- [ ] Keep README and this summary aligned with actual code.
- [ ] Record changes and known limitations for each update.
- [ ] Do not call a feature fixed until a reproducible test passes.
- [ ] Consider splitting large code sections into modules only when it improves maintainability without risking existing behavior.

## 11. Run locally

Requirements: a modern browser and Python 3 (or another static HTTP server).

From the project directory, run in Windows Command Prompt:

```cmd
python -m http.server 8000
```

Then open http://localhost:8000 in your browser. Stop the server with Ctrl+C in the same terminal. A local server is recommended instead of opening `index.html` directly from disk.

## 12. Bug reporting checklist

Include:
1. Browser and operating system/device.
2. CUTORA version or commit.
3. Steps to reproduce.
4. Expected result.
5. Actual result.
6. Whether it happens every time.
7. Relevant browser-console errors.
8. A small sample project/media file only if safe and appropriate to share.

## 13. Project links

- **Live editor:** https://cutora-ten.vercel.app
- **GitHub repository:** https://github.com/cyber-rover-ion/CUTORA
- **README:** https://github.com/cyber-rover-ion/CUTORA/blob/main/README.md
- **License:** https://github.com/cyber-rover-ion/CUTORA/blob/main/LICENSE

## 14. Final summary

CUTORA is a vanilla HTML/CSS/JavaScript browser editor with a media library, multitrack timeline, preview, clip properties, text styling, video looks, themes, project JSON persistence, mobile-responsive layout, and experimental browser export.

The latest documented version, v1.1.8, adds three video looks and strengthens project validation, media-import failure handling, and export cleanup/error handling. Basic static checks passed and the production deployment was confirmed READY. Full browser, real-media, export, mobile-device, and regression testing remains outstanding.

**Recommended next step:** test and stabilize core editing workflows and export before adding many more features.

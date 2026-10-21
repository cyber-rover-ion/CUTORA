/**
 * CUTORA — Video Editor Application
 * Vanilla JS editor engine: state, media import, multitrack timeline,
 * playback, clip editing, properties, undo/redo, save/load, export.
 */

(() => {
  'use strict';

  // ======================================================================
  // SECTION: Constants & helpers
  // ======================================================================

  const IMAGE_DEFAULT_DURATION = 5; // seconds an image clip lasts by default
  const MIN_CLIP_DURATION = 0.1;
  const MAX_UNDO = 60;

  const TRACK_TYPES = ['video', 'overlay', 'text', 'audio'];
  // Which tracks a given media/clip type may live on
  const COMPATIBLE_TRACKS = {
    video: ['video', 'overlay'],
    image: ['video', 'overlay'],
    text: ['text'],
    audio: ['audio']
  };
  const TRACK_FOR_TYPE = { video: 'video', image: 'overlay', text: 'text', audio: 'audio' };

  const el = {};

  // Keep input-mode information available to CSS without user-agent sniffing.
  // Coarse pointers cover phones/tablets; hybrid devices can still switch modes.
  const coarsePointerQuery = window.matchMedia('(pointer: coarse)');
  function syncInputMode() {
    document.documentElement.dataset.inputMode = coarsePointerQuery.matches ? 'touch' : 'precise';
  }
  syncInputMode();
  if (typeof coarsePointerQuery.addEventListener === 'function') {
    coarsePointerQuery.addEventListener('change', syncInputMode);
  } else if (typeof coarsePointerQuery.addListener === 'function') {
    coarsePointerQuery.addListener(syncInputMode);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds % 3600) / 60);
    const h = Math.floor(seconds / 3600);
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  function formatClock(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text == null ? '' : text);
    return div.innerHTML;
  }

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getTrackBaseType(trackId) {
    if (!trackId) return 'video';
    if (state.tracks && state.tracks[trackId] && state.tracks[trackId].type) {
      return state.tracks[trackId].type;
    }
    if (trackId.startsWith('video')) return 'video';
    if (trackId.startsWith('overlay')) return 'overlay';
    if (trackId.startsWith('text')) return 'text';
    if (trackId.startsWith('audio')) return 'audio';
    return trackId;
  }

  function isTrackCompatible(clipType, trackId) {
    const base = getTrackBaseType(trackId);
    const compat = COMPATIBLE_TRACKS[clipType] || [];
    return compat.includes(base);
  }

  const fileIsEmpty = (f) => !f || f.size === 0;

  // ======================================================================
  // SECTION: Central state
  // ======================================================================

  const state = {
    projectName: 'Untitled Project',
    aspect: '16:9',
    // assets: source media (independent of timeline clips)
    assets: [],
    // tracks: fixed model of the 4 tracks (existence / flags)
    tracks: {},
    // clips: timeline instances referencing assets
    clips: [],
    selectedClipId: null,
    selectedAssetId: null,
    // playback
    playing: false,
    currentTime: 0,
    timelineDuration: 0,
    volume: 1,
    muted: false,
    // zoom: 1..100 slider value
    zoom: 50,
    // history
    undoStack: [],
    redoStack: [],
    dirty: false
  };

  state.tracks = {
    video: { type: 'video', name: 'Video 1', hidden: false, muted: false, locked: false, exists: true },
    overlay: { type: 'overlay', name: 'Overlay 1', hidden: false, muted: false, locked: false, exists: true },
    text: { type: 'text', name: 'Text 1', hidden: false, muted: false, locked: false, exists: true },
    audio: { type: 'audio', name: 'Audio 1', hidden: false, muted: false, locked: false, exists: true }
  };

  function assetById(id) {
    return state.assets.find((a) => a.id === id) || null;
  }

  function clipById(id) {
    return state.clips.find((c) => c.id === id) || null;
  }

  function selectedClip() {
    return state.selectedClipId ? clipById(state.selectedClipId) : null;
  }

  function recomputeTimelineDuration() {
    let end = 0;
    for (const c of state.clips) {
      if (!state.tracks[c.trackType] || !state.tracks[c.trackType].exists) continue;
      end = Math.max(end, c.start + c.duration);
    }
    state.timelineDuration = end;
    if (state.currentTime > end) {
      state.currentTime = end;
    }
    // Keep the transport controls in sync whenever clips are added, moved, or removed.
    updatePlayPauseButton();
    updateTimeDisplay();
    updateSeekSlider();
  }

  function markDirty() {
    state.dirty = true;
  }

  function defaultProps(type) {
    if (type === 'text') {
      return { opacity: 100, x: 0, y: 0, scale: 100, rotation: 0, content: 'Your text', fontSize: 48, color: '#ffffff', align: 'center', fontFamily: 'system', textEffect: 'shadow', keyframes: {} };
    }
    if (type === 'audio') {
      return { volume: 100, fadeIn: 0, fadeOut: 0, speed: 1, keyframes: {} };
    }
    return {
      x: 0, y: 0, scale: 100, rotation: 0, opacity: 100,
      volume: 100,
      speed: 1,
      fadeIn: 0, fadeOut: 0,
      brightness: 0, contrast: 0, saturation: 0, temperature: 0,
      grayscale: 0, blur: 0, lookPreset: 'none',
      transition: { type: 'none', duration: 0 },
      keyframes: {}
    };
  }

  // ======================================================================
  // SECTION: Keyframes (add/remove/interpolate at playhead)
  // ======================================================================

  const KEYFRAMABLE = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'];

  function keyframeValue(clip, prop, localTime) {
    const kf = (clip.props && clip.props.keyframes && clip.props.keyframes[prop]) || null;
    if (!kf || kf.length === 0) return null;
    const sorted = kf;
    if (localTime <= sorted[0].t) return sorted[0].v;
    if (localTime >= sorted[kf.length - 1].t) return sorted[kf.length - 1].v;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (localTime >= a.t && localTime <= b.t) {
        const span = b.t - a.t;
        if (span <= 0) return b.v;
        const f = (localTime - a.t) / span;
        return a.v + (b.v - a.v) * f;
      }
    }
    return null;
  }

  function effectiveProp(clip, prop, t) {
    // Keyframed value if any keyframes exist, else static value
    const local = t - clip.start;
    const kfv = clip.props.keyframes ? keyframeValue(clip, prop, local) : null;
    if (kfv !== null) return kfv;
    return clip.props[prop];
  }

  function addKeyframeAtPlayhead(prop) {
    const clip = selectedClip();
    if (!clip) { showToast('Select a clip first'); return; }
    if (!KEYFRAMABLE.includes(prop)) return;
    const t = state.currentTime;
    if (t < clip.start || t > clip.start + clip.duration) {
      showToast('Move the playhead inside the clip');
      return;
    }
    const local = t - clip.start;
    const before = snapshot();
    if (!clip.props.keyframes) clip.props.keyframes = {};
    const list = clip.props.keyframes[prop] || (clip.props.keyframes[prop] = []);
    // replace keyframe within ~1/30s, else insert sorted
    const existing = list.findIndex((k) => Math.abs(k.t - local) < 0.05);
    const v = prop === 'opacity' ? clamp(clip.props.opacity != null ? clip.props.opacity : 100, 0, 100)
      : prop === 'scale' ? clamp(clip.props.scale || 100, 0, 1000)
      : prop === 'volume' ? clamp(clip.props.volume != null ? clip.props.volume : 100, 0, 200)
      : clamp(clip.props[prop] || 0, -4000, 4000);
    if (existing >= 0) {
      list[existing].v = v;
    } else {
      list.push({ t: local, v });
      list.sort((a, b) => a.t - b.t);
    }
    commitChange(before, 'keyframe added');
    refreshPropertiesPanel();
    renderOverlaysForTime();
    applyActiveClipProcessing();
    showToast(`Keyframe added at ${formatTime(t)}`);
  }

  const keyframeKeyboardMapByProp = (() => {
    const kv = {};
    for (const p of KEYFRAMABLE) kv[p] = null;
    return kv;
  })();
  keyframeKeyboardMapByProp['opacity'] = addKeyframeAtPlayhead.bind(null, 'opacity');
  keyframeKeyboardMapByProp['volume'] = addKeyframeAtPlayhead.bind(null, 'volume');

  function removeKeyframeAtPlayhead(prop) {
    const clip = selectedClip();
    if (!clip || !clip.props.keyframes) return;
    const t = state.currentTime;
    const local = t - clip.start;
    const list = clip.props.keyframes[prop];
    if (!list || !list.length) return;
    const before = snapshot();
    let removed = false;
    for (let i = 0; i < list.length; i++) {
      if (Math.abs(list[i].t - local) <= 0.15) {
        list.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (removed) {
      if (!list.length) delete clip.props.keyframes[prop];
      commitChange(before, 'keyframe removed');
      refreshPropertiesPanel();
      renderOverlaysForTime();
      applyActiveClipProcessing();
      showToast('Keyframe removed');
    } else {
      showToast('No keyframe at the playhead');
    }
  }

  // ======================================================================
  // SECTION: Toast notifications (#notifications)
  // ======================================================================

  let toastStylesInjected = false;

  function injectToastStyles() {
    if (toastStylesInjected) return;
    toastStylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .toast{color:var(--text-primary)}
      .toast--exiting{opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease}
      .cutora-clip-handle{position:absolute;top:0;bottom:0;width:7px;cursor:ew-resize;z-index:3;opacity:0;transition:opacity .12s ease}
      .cutora-clip-handle::after{content:"";position:absolute;top:20%;bottom:20%;left:3px;width:2px;border-radius:1px;background:rgba(255,255,255,.75)}
      .cutora-clip-handle--start{left:0}
      .cutora-clip-handle--end{right:0}
      .clip:hover .cutora-clip-handle,.cutora-clip-handle:active{opacity:1}
      .cutora-frame{position:relative;max-width:100%;max-height:100%;box-shadow:0 0 0 1px var(--border-subtle);border-radius:var(--radius-sm);background:#000}
      .cutora-frame video{width:100%;height:100%;object-fit:contain;border-radius:inherit}
      .cutora-frame .preview-overlay{position:absolute;inset:0;border-radius:inherit;overflow:hidden}
      .cutora-overlay-item{position:absolute;transform-origin:center;pointer-events:none;max-width:100%}
      .cutora-overlay-item img{display:block;max-width:100%;max-height:100%}
      .cutora-lib-add{margin-top:2px}
      .cutora-progress{min-width:140px;text-align:center;font-variant-numeric:tabular-nums}
    `;
    document.head.appendChild(style);
  }

  function showToast(message, type = 'info', duration = 3600) {
    if (!el.notifications) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.type = type;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    el.notifications.appendChild(toast);
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('toast--exiting');
        setTimeout(() => toast.remove(), 200);
      }, duration);
    }
  }

  // Progress toasts for long operations (export) — allow updating text
  function makeProgressToast(label) {
    if (!el.notifications) {
      return { update() {}, finish() {} };
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.type = 'info';
    const span = document.createElement('span');
    span.className = 'cutora-progress';
    span.textContent = label;
    toast.appendChild(span);
    el.notifications.appendChild(toast);
    return {
      update(text) { span.textContent = text; },
      finish(text, type = 'success') {
        toast.dataset.type = type;
        span.textContent = text;
        setTimeout(() => {
          toast.classList.add('toast--exiting');
          setTimeout(() => toast.remove(), 200);
        }, 3000);
      }
    };
  }

  // ======================================================================
  // SECTION: Dialogs
  // ======================================================================

  let activeDialog = null;

  function openDialog(dialog) {
    if (!dialog) return;
    if (activeDialog && activeDialog !== dialog) closeDialog(activeDialog);
    dialog.hidden = false;
    activeDialog = dialog;
    const focusable = dialog.querySelector('button, input, select, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    dialog.hidden = true;
    if (activeDialog === dialog) activeDialog = null;
  }

  function isTypingTarget(target) {
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target.isContentEditable) {
      const t = target.type || '';
      return t !== 'range' && t !== 'color' && !target.disabled;
    }
    return tag === 'select';
  }

  // ======================================================================
  // SECTION: Undo / redo (snapshots of project editing state)
  // ======================================================================

  function snapshot() {
    return JSON.stringify({
      tracks: state.tracks,
      clips: state.clips,
      selectedClipId: state.selectedClipId,
      timelineDuration: state.timelineDuration
    });
  }

  function pushUndo() {
    const snap = snapshot();
    if (state.undoStack.length && state.undoStack[state.undoStack.length - 1] === snap) return;
    state.undoStack.push(snap);
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
    updateUndoRedoButtons();
    markDirty();
    scheduleRecoverySave();
  }

  // Snapshot state BEFORE an operation and push after it changed
  function commitChange(beforeSnapshot, description) {
    const after = snapshot();
    if (after === beforeSnapshot) return;
    state.undoStack.push(beforeSnapshot);
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
    updateUndoRedoButtons();
    markDirty();
    scheduleRecoverySave();
  }

  function applySnapshot(snap) {
    try {
      const data = JSON.parse(snap);
      state.tracks = data.tracks || state.tracks;
      state.clips = data.clips || [];
      state.selectedClipId = data.selectedClipId && clipById(data.selectedClipId) ? data.selectedClipId : null;
      recomputeTimelineDuration();
      renderAllClips();
      syncSelectionUI();
      refreshPropertiesPanel();
      syncTrackControls();
      updatePreviewEmptyState();
      syncPlaybackToPlayhead();
      renderOverlaysForTime();
      updateTimeDisplay();
      updateSeekSlider();
      scheduleRecoverySave();
    } catch (err) {
      showToast('Could not restore history entry', 'error');
    }
  }

  function undo() {
    if (!state.undoStack.length) {
      showToast('Nothing to undo');
      return;
    }
    const current = snapshot();
    const snap = state.undoStack.pop();
    state.redoStack.push(current);
    applySnapshot(snap);
    updateUndoRedoButtons();
    markDirty();
  }

  function redo() {
    if (!state.redoStack.length) {
      showToast('Nothing to redo');
      return;
    }
    const current = snapshot();
    const snap = state.redoStack.pop();
    state.undoStack.push(current);
    applySnapshot(snap);
    updateUndoRedoButtons();
    markDirty();
  }

  function updateUndoRedoButtons() {
    if (el.btnUndo) el.btnUndo.disabled = state.undoStack.length === 0;
    if (el.btnRedo) el.btnRedo.disabled = state.redoStack.length === 0;
  }

  // ======================================================================
  // SECTION: Timeline scale (zoom -> pixels per second)
  // ======================================================================

  function pxPerSecond() {
    // zoom 1..100 -> 18..96 px/s
    return 12 + (state.zoom / 100) * 84;
  }

  function contentOffsetX() {
    // Left offset of the track lane area (after the sticky track header)
    const content = firstTrackContent();
    if (!content || !el.timelineScroll) return 0;
    const cRect = content.getBoundingClientRect();
    const sRect = el.timelineScroll.getBoundingClientRect();
    return Math.max(0, cRect.left - sRect.left);
  }

  function firstTrackContent() {
    for (const type of TRACK_TYPES) {
      const track = getTrackElement(type);
      if (track && track.isConnected) {
        const content = track.querySelector('.track-content');
        if (content) return content;
      }
    }
    return null;
  }

  function timeToX(t) {
    return contentOffsetX() + t * pxPerSecond();
  }

  function xToTime(x) {
    return clamp((x - contentOffsetX()) / pxPerSecond(), 0, Math.max(state.timelineDuration, 1e6));
  }

  function getTrackElement(type) {
    if (!type) return null;
    const map = { video: 'track-video', overlay: 'track-overlay', text: 'track-text', audio: 'track-audio' };
    return byId(map[type]) || byId(`track-${type}`) || (el.timelineTracks ? el.timelineTracks.querySelector(`.timeline-track[data-track-type="${type}"]`) : null);
  }

  // ======================================================================
  // SECTION: Media import
  // ======================================================================

  function probeAsset(file, type, url) {
    return new Promise((resolve) => {
      const base = {
        id: generateId(),
        name: file.name,
        type,
        size: file.size,
        url,
        duration: type === 'image' ? IMAGE_DEFAULT_DURATION : 0,
        width: 0,
        height: 0,
        thumbnail: null,
        ready: false
      };

      if (type === 'image') {
        const img = new Image();
        img.onload = () => {
          base.width = img.naturalWidth;
          base.height = img.naturalHeight;
          base.ready = true;
          resolve(base);
        };
        img.onerror = () => resolve(base);
        img.src = url;
        return;
      }

      if (type === 'video') {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.muted = true;
        vid.src = url;
        const finish = () => {
          if (base.ready) return;
          base.ready = true;
          resolve(base);
        };
        vid.addEventListener('loadedmetadata', () => {
          base.duration = isFinite(vid.duration) ? vid.duration : 0;
          base.width = vid.videoWidth;
          base.height = vid.videoHeight;
          // Thumbnail from an early frame
          const seekTo = Math.min(0.1, (base.duration || 1) / 2);
          const grab = () => {
            try {
              const canvas = document.createElement('canvas');
              const w = Math.min(240, vid.videoWidth || 240);
              const h = Math.round((vid.videoHeight || 135) * (w / (vid.videoWidth || 240)) ) || 135;
              canvas.width = w;
              canvas.height = h;
              canvas.getContext('2d').drawImage(vid, 0, 0, w, h);
              base.thumbnail = canvas.toDataURL('image/jpeg', 0.6);
            } catch (err) {
              /* tainted canvas or decode failure — icon fallback */
            }
            finish();
          };
          vid.addEventListener('seeked', grab, { once: true });
          try { vid.currentTime = seekTo; } catch (err) { finish(); }
          setTimeout(finish, 2500); // safety net
        }, { once: true });
        vid.addEventListener('error', finish, { once: true });
        return;
      }

      if (type === 'audio') {
        const aud = new Audio();
        aud.preload = 'metadata';
        aud.src = url;
        aud.addEventListener('loadedmetadata', () => {
          base.duration = isFinite(aud.duration) ? aud.duration : 0;
          base.ready = true;
          resolve(base);
        }, { once: true });
        aud.addEventListener('error', () => resolve(base), { once: true });
        setTimeout(() => { if (!base.ready) resolve(base); }, 2500);
        return;
      }

      resolve(base);
    });
  }

  function detectMediaType(file) {
    const t = (file.type || '').toLowerCase();
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('image/')) return 'image';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg'].includes(ext)) return 'image';
    return null;
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    let imported = 0;
    let rejected = 0;
    let failed = 0;

    for (const file of files) {
      if (fileIsEmpty(file)) { rejected++; continue; }
      const type = detectMediaType(file);
      if (!type) {
        rejected++;
        continue;
      }
      let url = null;
      try {
        url = URL.createObjectURL(file);
        const asset = await probeAsset(file, type, url);
        state.assets.push(asset);
        imported++;
      } catch (err) {
        failed++;
        if (url) {
          try { URL.revokeObjectURL(url); } catch (revokeError) { /* noop */ }
        }
      }
    }
    if (imported > 0) {
      rebuildMissingLinks();
      renderMediaLibrary();
      renderAllClips();
      updatePreviewEmptyState();
      markDirty();
      scheduleRecoverySave();
    }

    if (imported > 0) {
      showToast(imported === 1 ? `Imported: ${state.assets[state.assets.length - 1]?.name || 'file'}` : `Imported ${imported} files`, 'success');
    }
    if (rejected > 0) {
      showToast(`${rejected} unsupported or empty file${rejected > 1 ? 's were' : ' was'} skipped (video, audio or image only)`, 'error');
    }
    if (failed > 0) {
      showToast(`Could not import ${failed} file${failed > 1 ? 's' : ''}. Try a supported media format.`, 'error', 5000);
    }
  }

  // When a project with saved asset metadata is loaded, media files must be
  // reimported. Match reimported files to saved assets by file name.
  function rebuildMissingLinks() {
    for (const asset of state.assets) {
      if (asset.missing) {
        const match = state.assets.find(
          (a) => !a.missing && a !== asset && a.name === asset.name
        );
        if (match) {
          asset.url = match.url;
          asset.duration = match.duration || asset.duration;
          asset.width = match.width || asset.width;
          asset.height = match.height || asset.height;
          asset.thumbnail = match.thumbnail || asset.thumbnail;
          asset.missing = false;
          asset.ready = match.ready;
          // De-dupe: drop the duplicate real entry
          const idx = state.assets.indexOf(match);
          if (idx >= 0) {
            state.assets.splice(idx, 1);
          }
        }
      }
    }
    for (const clip of state.clips) {
      const asset = assetById(clip.assetId);
      if (asset) clip.missing = !!asset.missing;
    }
  }

  function removeAsset(assetId) {
    const idx = state.assets.findIndex((a) => a.id === assetId);
    if (idx < 0) return;
    const asset = state.assets[idx];
    const before = snapshot();
    // Remove clips that use this asset
    state.clips = state.clips.filter((c) => c.assetId !== assetId);
    // Also remove duplicate missing placeholder pointing to the same name
    state.assets.splice(idx, 1);
    try { URL.revokeObjectURL(asset.url); } catch (err) { /* noop */ }
    if (state.selectedClipId && !clipById(state.selectedClipId)) state.selectedClipId = null;
    if (state.selectedAssetId === assetId) state.selectedAssetId = null;
    recomputeTimelineDuration();
    commitChange(before, 'asset removed');
    renderMediaLibrary();
    renderAllClips();
    refreshPropertiesPanel();
    showToast(`Removed "${asset.name}" and its clips`, 'info');
  }

  // ----- Media library rendering -----

  function typeIcon(type) {
    const icons = {
      video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>',
      audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
      image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    };
    return icons[type] || icons.video;
  }

  function renderMediaLibrary() {
    if (!el.mediaLibrary) return;
    // Audio assets are mirrored into a second library; clear every copy before rebuilding.
    document.querySelectorAll('.media-library .media-item').forEach((n) => n.remove());

    const empty = el.mediaEmpty;
    if (state.assets.length === 0) {
      if (empty) empty.hidden = false;
      const audioEmpty = el.panelAudio ? el.panelAudio.querySelector('.media-empty') : null;
      if (audioEmpty) audioEmpty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    // Assets are shown in all type-appropriate panels: filter per tab.
    const mediaLib = el.panelMedia ? el.panelMedia.querySelector('.media-library') : el.mediaLibrary;
    const audioLib = el.panelAudio ? el.panelAudio.querySelector('.media-library') : null;

    for (const asset of state.assets) {
      if (mediaLib) mediaLib.appendChild(buildMediaItem(asset));
      if (asset.type === 'audio' && audioLib) audioLib.appendChild(buildMediaItem(asset));
    }
    const audioEmpty = el.panelAudio ? el.panelAudio.querySelector('.media-empty') : null;
    if (audioEmpty) {
      audioEmpty.hidden = state.assets.some((a) => a.type === 'audio');
    }
  }

  function buildMediaItem(asset) {
    const item = document.createElement('div');
    item.className = 'media-item';
    item.dataset.mediaId = asset.id;
    item.draggable = true;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-selected', state.selectedAssetId === asset.id ? 'true' : 'false');
    if (state.selectedAssetId === asset.id) item.classList.add('is-selected');
    if (asset.missing) item.setAttribute('title', 'Media file missing — re-import a file with the same name');

    const thumb = document.createElement('div');
    thumb.className = 'media-thumb';
    if (asset.thumbnail) {
      const img = document.createElement('img');
      img.src = asset.thumbnail;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = typeIcon(asset.missing ? 'image' : asset.type);
    }

    const name = document.createElement('div');
    name.className = 'media-name';
    name.textContent = asset.missing ? `${asset.name} (missing)` : asset.name;
    name.title = asset.name;

    const meta = document.createElement('div');
    meta.className = 'media-meta';
    const metaParts = [asset.type.charAt(0).toUpperCase() + asset.type.slice(1)];
    if (asset.width && asset.height) metaParts.push(`${asset.width}×${asset.height}`);
    if (asset.duration && asset.duration > 0) metaParts.push(formatTime(asset.duration));
    if (asset.size && asset.size > 0) metaParts.push(formatFileSize(asset.size));
    meta.textContent = metaParts.join(' · ');
    meta.title = meta.textContent;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'media-add-btn';
    addBtn.title = 'Add to timeline';
    addBtn.setAttribute('aria-label', `Add ${asset.name} to timeline`);
    addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add to track</span>';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addAssetToTimeline(asset, null);
    });

    item.appendChild(thumb);
    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(addBtn);

    item.addEventListener('click', () => {
      state.selectedAssetId = asset.id;
      renderMediaLibrary();
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        state.selectedAssetId = asset.id;
        renderMediaLibrary();
      }
    });
    item.addEventListener('dblclick', () => addAssetToTimeline(asset, null));
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-cutora-asset', asset.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      removeAsset(asset.id);
    });
    return item;
  }

  // ======================================================================
  // SECTION: Adding clips to the timeline
  // ======================================================================

  function addClipAt(trackType, asset, startTime, opts = {}) {
    const track = state.tracks[trackType];
    if (!track || !track.exists) {
      showToast('That track is not available', 'error');
      return null;
    }
    if (asset && asset.missing) {
      showToast('That media file is missing — re-import it first', 'error');
      return null;
    }
    // Text clips carry no asset (asset === null means text path)
    const isText = !asset || opts.type === 'text';
    const before = snapshot();
    const duration = clamp(
      opts.duration != null ? opts.duration : (
        !isText ? (asset.duration > 0 ? asset.duration : IMAGE_DEFAULT_DURATION) : 4
      ),
      MIN_CLIP_DURATION,
      1e6
    );
    const clip = {
      id: generateId(),
      assetId: isText ? null : asset.id,
      name: isText ? (opts.name || 'Text') : asset.name,
      type: isText ? 'text' : asset.type,
      trackType: trackType || (isText ? 'text' : 'video'),
      start: Math.max(0, startTime || 0),
      inPoint: 0,
      duration,
      missing: isText ? false : !!asset.missing,
      props: Object.assign(
        defaultProps(isText ? 'text' : asset.type),
        isText ? { content: (opts.name || 'Text').replace(/\s+/g, ' ').trim() || 'Text' } : {}
      )
    };
    // Place after existing clips on the lane if requested
    if (opts.append) {
      let end = 0;
      for (const c of state.clips) {
        if (c.trackType === trackType) end = Math.max(end, c.start + c.duration);
      }
      clip.start = end;
    }
    if (opts.snapTo) clip.start = nearestFreeStart(trackType, clip.start, clip.duration);
    state.clips.push(clip);
    recomputeTimelineDuration();
    commitChange(before, 'clip added');
    renderAllClips();
    selectClip(clip.id, { silent: true });
    return clip;
  }

  function nearestFreeStart(trackType, desired, duration) {
    // Avoid stacking clips on top of each other: push to the first free slot.
    const lane = state.clips
      .filter((c) => c.trackType === trackType)
      .sort((a, b) => a.start - b.start);
    let candidate = Math.max(0, desired);
    for (const c of lane) {
      const cEnd = c.start + c.duration;
      if (candidate < cEnd && candidate + duration > c.start) {
        candidate = cEnd;
      }
    }
    return candidate;
  }

  function addAssetToTimeline(asset, trackType) {
    if (!asset) return;
    const target = trackType && COMPATIBLE_TRACKS[asset.type] && COMPATIBLE_TRACKS[asset.type].includes(trackType)
      ? trackType
      : TRACK_FOR_TYPE[asset.type];
    addClipAt(target, asset, state.currentTime, { snapTo: true });
  }

  // ======================================================================
  // SECTION: Timeline rendering
  // ======================================================================

  function trackTypeFromElement(node) {
    const track = node && node.closest ? node.closest('.timeline-track') : null;
    if (!track) return null;
    return track.dataset.trackType || null;
  }

  function renderRuler() {
    if (!el.timelineRuler) return;
    el.timelineRuler.innerHTML = '';
    const pps = pxPerSecond();
    const totalPx = contentOffsetX() + Math.max(state.timelineDuration, 30) * pps;

    // Choose a tick interval so labels stay legible (~90px apart minimum)
    const intervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    let interval = intervals[intervals.length - 1];
    for (const iv of intervals) {
      if (iv * pps >= 90) { interval = iv; break; }
    }

    el.timelineRuler.style.width = `${totalPx}px`;

    const labelEvery = interval < 1 ? 4 : interval < 5 ? 2 : 1;
    let i = 0;
    for (let t = 0; t * pps <= totalPx; t += interval, i++) {
      const tick = document.createElement('div');
      tick.className = 'ruler-tick';
      tick.style.left = `${t * pps}px`;
      tick.style.flex = '0 0 auto';
      tick.style.position = 'absolute';
      tick.style.bottom = '0';
      if (i % labelEvery === 0) {
        tick.textContent = formatTime(t);
      }
      el.timelineRuler.appendChild(tick);
      if (t * pps > 20000) break; // hard safety limit
    }
  }

  function renderAllClips() {
    for (const [trackId, trackState] of Object.entries(state.tracks)) {
      if (!trackState || !trackState.exists) continue;
      let live = getTrackElement(trackId);

      // Recreate missing track DOM from the base track template, including secondary tracks.
      if (!live && el.timelineTracks) {
        const baseType = getTrackBaseType(trackId);
        const template = trackTemplates[baseType];
        if (template) {
          const holder = document.createElement('div');
          holder.innerHTML = template.trim();
          live = holder.firstElementChild;
          if (live) {
            live.id = `track-${trackId}`;
            live.dataset.trackType = trackId;
            const nameNode = live.querySelector('.track-name');
            if (nameNode) nameNode.textContent = trackState.name || trackId;
            el.timelineTracks.appendChild(live);
            initTrackControlsForType(trackId);
          }
        }
      }
      if (!live) continue;

      live.style.display = trackState.hidden ? 'none' : '';
      live.style.opacity = '';
      const content = live.querySelector('.track-content');
      if (!content) continue;
      content.querySelectorAll('.clip').forEach((node) => node.remove());

      const laneClips = state.clips.filter((clip) => clip.trackType === trackId);
      const pps = pxPerSecond();
      const needed = contentOffsetX() + state.timelineDuration * pps + 400;
      content.style.width = `${Math.max(needed, 100)}px`;
      content.style.minHeight = 'var(--track-h)';
      for (const clip of laneClips) {
        content.appendChild(buildClipElement(clip));
      }
    }
    renderRuler();
    updateTimelineEmptyState();
    updatePreviewEmptyState();
    updateClipPlayheadPosition();
    updatePlayPauseButton();
  }

  function buildClipElement(clip) {
    const pps = pxPerSecond();
    const node = document.createElement('div');
    node.className = 'clip';
    node.dataset.clipId = clip.id;
    node.style.left = `${clip.start * pps}px`;
    node.style.width = `${Math.max(clip.duration * pps, 10)}px`;
    if (state.selectedClipId === clip.id) node.classList.add('is-selected');
    if (clip.missing) node.classList.add('clip--missing');

    const label = document.createElement('div');
    label.className = 'clip-label';
    label.textContent = clip.missing ? `${clip.name} (missing)` : clip.name;

    const meta = document.createElement('div');
    meta.className = 'clip-meta';
    meta.textContent = `${formatTime(clip.duration)}${clip.type !== 'video' && clip.type !== 'audio' ? '' : ''}`;

    node.appendChild(label);
    if (clip.duration * pps > 46) node.appendChild(meta);

    if (!clip.missing) {
      const hStart = document.createElement('div');
      hStart.className = 'cutora-clip-handle cutora-clip-handle--start';
      hStart.dataset.handle = 'start';
      const hEnd = document.createElement('div');
      hEnd.className = 'cutora-clip-handle cutora-clip-handle--end';
      hEnd.dataset.handle = 'end';
      node.appendChild(hStart);
      node.appendChild(hEnd);
    }

    node.addEventListener('pointerdown', (e) => onClipPointerDown(e, clip.id));
    node.addEventListener('dblclick', () => selectClip(clip.id));
    return node;
  }

  function updateClipPlayheadPosition() {
    if (!el.timelinePlayhead) return;
    el.timelinePlayhead.style.left = `${Math.round(timeToX(state.currentTime) - 1)}px`;
  }

  function updateTimelineEmptyState() {
    if (!el.timelineEmpty) return;
    const hasClips = state.clips.length > 0;
    el.timelineEmpty.hidden = hasClips;
  }

  // ======================================================================
  // SECTION: Clip interactions (select / move / trim) — pointer events
  // ======================================================================

  const drag = {
    active: false,
    mode: null, // 'move' | 'trim-start' | 'trim-end'
    clipId: null,
    startX: 0,
    startY: 0,
    threshold: 4,
    moved: false,
    before: null,
    orig: null,
    ghost: null
  };

  function onClipPointerDown(event, clipId) {
    if (event.button !== 0) return;
    const clip = clipById(clipId);
    if (!clip) return;
    const trackState = state.tracks[clip.trackType];
    if (trackState && trackState.locked) {
      showToast('Track is locked — unlock to edit clips');
      selectClip(clipId);
      event.preventDefault();
      return;
    }

    const handle = event.target.closest ? event.target.closest('.cutora-clip-handle') : null;
    selectClip(clipId);

    if (handle) {
      drag.active = true;
      drag.mode = handle.dataset.handle === 'start' ? 'trim-start' : 'trim-end';
    } else {
      drag.active = true;
      drag.mode = 'move';
    }
    drag.clipId = clipId;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.moved = false;
    drag.before = snapshot();
    drag.orig = {
      start: clip.start,
      duration: clip.duration,
      inPoint: clip.inPoint,
      trackType: clip.trackType
    };

    event.target.setPointerCapture && event.target.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', onClipPointerMove);
    window.addEventListener('pointerup', onClipPointerUp, { once: true });
    event.preventDefault();
  }

  function onClipPointerMove(event) {
    if (!drag.active) return;
    const clip = clipById(drag.clipId);
    if (!clip) return;

    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < drag.threshold && drag.mode === 'move' && Math.abs(event.clientY - drag.startY) < drag.threshold) {
      return; // click without drag: selection only
    }
    drag.moved = true;
    const dSec = dx / pxPerSecond();
    const pps = pxPerSecond();

    if (drag.mode === 'move') {
      const newStart = Math.max(0, drag.orig.start + dSec);
      clip.start = Math.max(0, Math.round(newStart * 100) / 100);
      // Vertical track change for compatible types
      const hoveredTrack = trackAtClientY(event.clientY);
      if (hoveredTrack && hoveredTrack !== clip.trackType) {
        if (isTrackCompatible(clip.type, hoveredTrack)) {
          moveClipToTrack(clip, hoveredTrack, { keepSnapshot: true });
        }
      }
    } else if (drag.mode === 'trim-start') {
      const minShift = Math.max(-drag.orig.start, -drag.orig.inPoint);
      const maxShift = drag.orig.duration - MIN_CLIP_DURATION;
      const shift = clamp(dSec, minShift, maxShift);
      clip.inPoint = Math.max(0, Math.round((drag.orig.inPoint + shift) * 100) / 100);
      clip.start = Math.max(0, Math.round((drag.orig.start + shift) * 100) / 100);
      clip.duration = Math.max(MIN_CLIP_DURATION, Math.round((drag.orig.duration - shift) * 100) / 100);
      setPlayheadTime(clip.start, { seekMedia: true });
    } else if (drag.mode === 'trim-end') {
      const asset = assetById(clip.assetId);
      let dur = drag.orig.duration + dSec;
      if (asset && asset.type !== 'image' && !clip.missing && isFinite(asset.duration) && asset.duration > 0) {
        dur = Math.min(dur, asset.duration - clip.inPoint);
      }
      dur = clamp(dur, MIN_CLIP_DURATION, 1e6);
      clip.duration = Math.round(dur * 100) / 100;
      setPlayheadTime(clip.start + clip.duration, { seekMedia: true });
    }

    // Live update of the dragged clip element only
    const node = findClipNode(clip.id);
    if (node) {
      node.style.left = `${clip.start * pps}px`;
      node.style.width = `${Math.max(clip.duration * pps, 10)}px`;
    }
    recomputeTimelineDuration();
    renderRuler();
  }

  function findClipNode(clipId) {
    if (!el.timelineTracks) return null;
    return el.timelineTracks.querySelector(`.clip[data-clip-id="${clipId}"]`);
  }

  function trackAtClientY(y) {
    if (!el.timelineTracks) return null;
    const trackEls = el.timelineTracks.querySelectorAll('.timeline-track');
    for (const track of trackEls) {
      if (!track.isConnected) continue;
      const trackId = track.dataset.trackType || track.id.replace(/^track-/, '');
      const ts = state.tracks[trackId];
      if (ts && (ts.hidden || ts.locked || !ts.exists)) continue;
      const rect = track.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return trackId;
    }
    return null;
  }

  function moveClipToTrack(clip, newTrack, opts = {}) {
    if (clip.trackType === newTrack) return;
    const node = findClipNode(clip.id);
    const track = getTrackElement(newTrack);
    if (node && track) {
      const content = track.querySelector('.track-content');
      if (content) {
        content.appendChild(node);
        clip.trackType = newTrack;
        if (content.firstElementChild === node) {
          // fine
        }
      }
    } else {
      clip.trackType = newTrack;
      renderAllClips();
    }
    if (!opts.keepSnapshot) {
      commitChange(drag.before, 'clip moved');
    }
  }  function onClipPointerUp() {
    window.removeEventListener('pointermove', onClipPointerMove);
    if (!drag.active) return;
    const wasMoved = drag.moved;
    drag.active = false;
    if (wasMoved) {
      recomputeTimelineDuration();
      commitChange(drag.before, drag.mode === 'move' ? 'clip moved' : 'clip trimmed');
      renderAllClips();
      syncPlaybackToPlayhead();
    }
    drag.before = null;
    drag.orig = null;
  }

  // ======================================================================
  // SECTION: Drag & drop from library to timeline
  // ======================================================================

  function initDragDrop() {
    if (!el.timelineScroll) return;
    el.timelineScroll.addEventListener('dragover', (e) => {
      if (e.dataTransfer && (e.dataTransfer.types.includes('application/x-cutora-asset'))) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    el.timelineScroll.addEventListener('drop', (e) => {
      if (!e.dataTransfer) return;
      const assetId = e.dataTransfer.getData('application/x-cutora-asset');
      if (!assetId) return;
      e.preventDefault();
      const asset = assetById(assetId);
      if (!asset) return;

      const trackType = trackTypeFromElement(e.target) || TRACK_FOR_TYPE[asset.type];
      if (!state.tracks[trackType] || !state.tracks[trackType].exists) {
        showToast('That track is not available', 'error');
        return;
      }
      if (!isTrackCompatible(asset.type, trackType)) {
        showToast(`A ${asset.type} clip cannot go on that track`, 'error');
        return;
      }
        const rect = el.timelineScroll.getBoundingClientRect();
      const x = e.clientX - rect.left - contentOffsetX();
      const time = clamp(x / pxPerSecond(), 0, 1e6);
      addClipAt(trackType, asset, time, { snapTo: true });
    });
  }

  // ======================================================================
  // SECTION: Playhead, seeking, zoom
  // ======================================================================

  function setPlayheadTime(t, { seekMedia = true } = {}) {
    state.currentTime = clamp(t, 0, Math.max(state.timelineDuration, 0));
    updateClipPlayheadPosition();
    if (seekMedia) syncPlaybackToPlayhead();
    updateTimeDisplay();
    updateSeekSlider();
  }

  function updateTimeDisplay() {
    if (el.currentTime) el.currentTime.textContent = formatTime(state.currentTime);
    if (el.totalDuration) el.totalDuration.textContent = formatTime(Math.max(state.timelineDuration, 0));
    if (el.timelineDuration) el.timelineDuration.textContent = formatClock(state.timelineDuration);
  }

  function updateSeekSlider() {
    if (!el.playbackSeek) return;
    const dur = Math.max(state.timelineDuration, 0.0001);
    el.playbackSeek.value = String(clamp((state.currentTime / dur) * 100, 0, 100));
  }

  function initSeek() {
    if (!el.playbackSeek) return;
    el.playbackSeek.addEventListener('input', (e) => {
      const dur = state.timelineDuration;
      if (dur <= 0) return;
      const pct = parseFloat(e.target.value) || 0;
      setPlayheadTime((pct / 100) * dur, { seekMedia: !state.playing });
    });
  }

  function initRulerSeek() {
    if (!el.timelineScroll || !el.timelineRuler) return;
    let scrubbing = false;
    const seekFromEvent = (e) => {
      const rect = el.timelineScroll.getBoundingClientRect();
      const t = xToTime(e.clientX - rect.left);
      setPlayheadTime(t, { seekMedia: !state.playing });
    };
    el.timelineRuler.addEventListener('pointerdown', (e) => {
      scrubbing = true;
      seekFromEvent(e);
      const move = (ev) => { if (scrubbing) seekFromEvent(ev); };
      const up = () => {
        scrubbing = false;
        window.removeEventListener('pointermove', move);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
      e.preventDefault();
    });
  }

  function initZoomControls() {
    if (el.timelineZoom) {
      el.timelineZoom.addEventListener('input', (e) => {
        state.zoom = clamp(parseInt(e.target.value, 10) || 50, 1, 100);
        renderAllClips();
      });
      el.timelineZoom.value = String(state.zoom);
    }
    if (el.timelineZoomIn) {
      el.timelineZoomIn.addEventListener('click', () => adjustZoom(+10));
    }
    if (el.timelineZoomOut) {
      el.timelineZoomOut.addEventListener('click', () => adjustZoom(-10));
    }
  }

  function adjustZoom(delta) {
    state.zoom = clamp(state.zoom + delta, 1, 100);
    if (el.timelineZoom) el.timelineZoom.value = String(state.zoom);
    renderAllClips();
  }

  // ======================================================================
  // SECTION: Playback engine
  // ======================================================================

  let rafId = 0;
  let lastTickTime = 0;
  // Keep media/overlay playback synced on every animation frame, but update
  // timeline chrome at a bounded rate to reduce layout work on large projects.
  let lastPlaybackUiUpdate = 0;
  const PLAYBACK_UI_INTERVAL_MS = 1000 / 30;

  function togglePlayPause() {
    if (state.playing) {
      pausePlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    if (state.timelineDuration <= 0) {
      showToast('Timeline is empty — add clips first');
      return;
    }
    if (state.currentTime >= state.timelineDuration - 0.01) {
      state.currentTime = 0;
    }
    state.playing = true;
    lastTickTime = performance.now();
    lastPlaybackUiUpdate = 0;
    updatePlayPauseButton();
    syncPlaybackToPlayhead();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function pausePlayback() {
    state.playing = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    if (el.previewVideo) el.previewVideo.pause();
    if (el.previewAudio) el.previewAudio.pause();
    updatePlayPauseButton();
    // Snap to exact position
    syncPlaybackToPlayhead();
    updateSeekSlider();
  }

  function tick(now) {
    if (!state.playing) return;
    const dt = (now - lastTickTime) / 1000;
    lastTickTime = now;
    state.currentTime += dt;

    if (state.currentTime >= state.timelineDuration) {
      state.currentTime = state.timelineDuration;
      updateClipPlayheadPosition();
      updateTimeDisplay();
      updateSeekSlider();
      pausePlayback();
      return;
    }

    // Native video/audio playback runs at the browser's own cadence. Reconcile
    // clip changes, overlay transforms and timeline chrome at a bounded 30 Hz
    // instead of rescanning every clip on every 60/120 Hz animation frame.
    if (now - lastPlaybackUiUpdate >= PLAYBACK_UI_INTERVAL_MS) {
      lastPlaybackUiUpdate = now;
      syncPlaybackToPlayhead();
      updateClipPlayheadPosition();
      updateTimeDisplay();
      updateSeekSlider();
    }

    rafId = requestAnimationFrame(tick);
  }

  function activeClipAt(trackType, t) {
    for (const c of state.clips) {
      if (c.trackType !== trackType) continue;
      const ts = state.tracks[trackType];
      if (ts && (ts.hidden || !ts.exists)) continue;
      if (t >= c.start && t < c.start + c.duration) return c;
    }
    return null;
  }

  function activeHumanClipAt(trackType, t) {
    // Resolve the active clip only on an existing, visible track.
    for (const c of state.clips) {
      if (c.trackType !== trackType) continue;
      const track = state.tracks[c.trackType];
      if (track && (!track.exists || track.hidden)) continue;
      if (t >= c.start && t < c.start + c.duration) return c;
    }
    return null;
  }

  function activeHumanClipAtBaseType(baseType, t) {
    // Resolve clips on the base track and any secondary tracks of that type.
    for (const c of state.clips) {
      if (getTrackBaseType(c.trackType) !== baseType) continue;
      const track = state.tracks[c.trackType];
      if (!track || !track.exists || track.hidden) continue;
      if (t >= c.start && t < c.start + c.duration) return c;
    }
    return null;
  }

  function syncPlaybackToPlayhead() {
    const t = state.currentTime;
    const videoClip = activeHumanClipAtBaseType('video', t);
    const overlayMediaClip = !videoClip ? activeHumanClipAtBaseType('overlay', t) : null;
    const primary = videoClip || overlayMediaClip;
    const audioClip = activeHumanClipAtBaseType('audio', t);

    // Render stills on either the primary video track or an overlay track.
    const primaryStill = primary && primary.type === 'image' ? primary : null;
    syncPreviewStill(primaryStill);
    syncMediaElement(el.previewVideo, primary && primary.type === 'video' ? primary : null, t);
    syncMediaElement(el.previewAudio, audioClip, t);
    renderOverlaysForTime();
    applyActiveClipProcessing();
  }

  function syncPreviewStill(clip) {
    if (!previewStill) return;
    if (!clip || clip.missing || !clip.assetId) {
      previewStill.hidden = true;
      previewStill.removeAttribute('src');
      if (el.previewVideo) el.previewVideo.hidden = false;
      return;
    }
    const asset = assetById(clip.assetId);
    if (!asset || asset.missing || !asset.url) {
      previewStill.hidden = true;
      if (el.previewVideo) el.previewVideo.hidden = false;
      return;
    }
    if (previewStill.getAttribute('src') !== asset.url) previewStill.src = asset.url;
    previewStill.hidden = false;
    if (el.previewVideo) el.previewVideo.hidden = true;
  }

  function syncMediaElement(element, clip, t) {
    if (!element) return;
    const isAudioElement = element === el.previewAudio;
    const expectedType = isAudioElement ? 'audio' : 'video';
    if (!clip || clip.type !== expectedType || clip.missing || !clip.assetId) {
      if (!element.paused) element.pause();
      if (element.hasAttribute('data-cutora-src')) {
        element.removeAttribute('data-cutora-src');
        element.removeAttribute('src');
        element.load();
      }
      return;
    }

    const asset = assetById(clip.assetId);
    if (!asset || asset.missing || !asset.url) {
      if (!element.paused) element.pause();
      return;
    }

    const speed = clamp(clip.props && clip.props.speed || 1, 0.25, 4);
    const localTime = clip.inPoint + Math.max(0, t - clip.start) * speed;
    const sourceChanged = element.getAttribute('data-cutora-src') !== asset.url;

    if (sourceChanged) {
      element.setAttribute('data-cutora-src', asset.url);
      element.dataset.cutoraLoadingSrc = asset.url;
      element.src = asset.url;
      const sourceForListener = asset.url;
      const onReady = () => {
        if (element.getAttribute('data-cutora-src') !== sourceForListener) return;
        delete element.dataset.cutoraLoadingSrc;
        applyTime(true);
      };
      element.addEventListener('loadedmetadata', onReady, { once: true });
      element.addEventListener('canplay', onReady, { once: true });
      element.addEventListener('error', () => {
        if (element.getAttribute('data-cutora-src') !== sourceForListener) return;
        delete element.dataset.cutoraLoadingSrc;
        if (element === el.previewVideo) showToast('This video format could not be decoded by your browser', 'error');
      }, { once: true });
      // Explicitly request buffering; metadata alone may not be enough to paint a frame.
      try { element.load(); } catch (err) { /* The browser will continue loading the assigned source. */ }
    }

    function applyTime(force = false) {
      if (element.getAttribute('data-cutora-src') !== asset.url || element.dataset.cutoraLoadingSrc === asset.url) return;
      if (element.readyState < 1 || !isFinite(element.duration) || element.duration <= 0) return;
      const target = clamp(localTime, 0, Math.max(0, element.duration - 0.01));
      const drift = Math.abs(element.currentTime - target);
      const threshold = state.playing ? 0.08 : 0.001;
      if (force || drift > threshold) {
        try { element.currentTime = target; } catch (err) { /* Wait until the media element is seekable. */ }
      }
    }

    // Ignore old metadata until the newly assigned source has loaded.
    if (!sourceChanged) applyTime();
    if (state.playing && element.paused) {
      const p = element.play();
      if (p && p.catch) p.catch(() => {
        if (element === el.previewVideo && state.playing) showToast('Playback was blocked or the media format is unsupported', 'warning');
      });
    }
    if (!state.playing && !element.paused) element.pause();
  }

  function applyActiveClipProcessing() {
    // Volume + fades for the preview video element
    if (!el.previewVideo) return;
    const t = state.currentTime;
    const vClip = activeHumanClipAtBaseType('video', t) || activeHumanClipAtBaseType('overlay', t);
    let vol = state.muted ? 0 : state.volume;
    if (vClip) {
      const p = vClip.props || {};
      const eVol = effectiveProp(vClip, 'volume', t);
      vol *= clamp((eVol != null ? eVol : (p.volume != null ? p.volume : 100)) / 100, 0, 2);
      vol *= fadeEnvelope(vClip, t);
      // playbackRate maps source media speed
      if (el.previewVideo && isFinite(p.speed) && p.speed > 0) {
        const rate = clamp(p.speed, 0.25, 4);
        if (Math.abs(el.previewVideo.playbackRate - rate) > 0.01) {
          try { el.previewVideo.playbackRate = rate; } catch (err) { /* unsupported */ }
        }
      }
    }
    el.previewVideo.volume = clamp(vol, 0, 1);
    const videoTrackState = vClip && state.tracks[vClip.trackType];
    el.previewVideo.muted = state.muted || !!(videoTrackState && videoTrackState.muted);

    if (el.previewAudio) {
      let aVol = state.muted ? 0 : state.volume;
      const aClip = activeHumanClipAtBaseType('audio', t);
      const audioTrackState = aClip && state.tracks[aClip.trackType];
      if (aClip) {
        const p = aClip.props || {};
        const eVol = effectiveProp(aClip, 'volume', t);
        aVol *= clamp((eVol != null ? eVol : (p.volume != null ? p.volume : 100)) / 100, 0, 2);
        aVol *= fadeEnvelope(aClip, t);
        if (isFinite(p.speed) && p.speed > 0) {
          const rate = clamp(p.speed, 0.25, 4);
          if (Math.abs(el.previewAudio.playbackRate - rate) > 0.01) {
            try { el.previewAudio.playbackRate = rate; } catch (err) { /* unsupported */ }
          }
        }
      }
      el.previewAudio.volume = clamp(aVol, 0, 1);
      el.previewAudio.muted = state.muted || !!(audioTrackState && audioTrackState.muted);
    }
    // Apply transforms and filters to the currently visible primary media layer.
    const visualTarget = previewStill && !previewStill.hidden ? previewStill : el.previewVideo;
    if (vClip && vClip.props) {
      visualTarget.style.filter = buildFilterCSS(vClip.props, vClip, t) || '';

      const ex = effectiveProp(vClip, 'x', t) || 0;
      const ey = effectiveProp(vClip, 'y', t) || 0;
      const esc = effectiveProp(vClip, 'scale', t) || 100;
      const erot = effectiveProp(vClip, 'rotation', t) || 0;
      const eop = effectiveProp(vClip, 'opacity', t);
      const baseOp = clamp((eop != null ? eop : 100) / 100, 0, 1) * fadeEnvelope(vClip, t);
      const tx = ex * 0.05;
      const ty = ey * 0.05;
      visualTarget.style.transform = `translate(${clamp(tx, -50, 50)}%, ${clamp(ty, -50, 50)}%) scale(${clamp(esc / 100, 0, 10)}) rotate(${clamp(erot, -360, 360)}deg)`;

      let op = 1;
      const tr = vClip.props.transition || { type: 'none', duration: 0 };
      const local = t - vClip.start;
      const dur = clamp(tr.duration || 0, 0, vClip.duration);
      if (tr.type === 'fadetoblack' && dur > 0) {
        if (local < dur) op = local / dur;
        else if (local > vClip.duration - dur) op = Math.max(0, (vClip.duration - local) / dur);
      } else if ((tr.type === 'fade' || tr.type === 'crossfade') && dur > 0 && local < dur) {
        op = local / dur;
      }
      visualTarget.style.opacity = String(clamp(baseOp * op, 0, 1));
    } else {
      for (const target of [el.previewVideo, previewStill]) {
        if (!target) continue;
        target.style.filter = '';
        target.style.opacity = '';
        target.style.transform = '';
      }
    }
  }

  function fadeEnvelope(clip, t) {
    const p = clip.props || {};
    const local = t - clip.start;
    let env = 1;
    const fin = Math.max(0, p.fadeIn || 0);
    const fout = Math.max(0, p.fadeOut || 0);
    if (fin > 0 && local < fin) env = local / fin;
    if (fout > 0 && local > clip.duration - fout) {
      env = Math.min(env, Math.max(0, (clip.duration - local) / fout));
    }
    return clamp(env, 0, 1);
  }

  function buildFilterCSS(p, clip, t) {
    let p2 = p;
    if (clip && t != null && clip.props.keyframes) {
      p2 = Object.assign({}, p);
      for (const kfProp of ['grayscale', 'brightness', 'contrast', 'saturation']) {
        const v = keyframeValue(clip, kfProp, t - clip.start);
        if (v !== null) p2[kfProp] = v;
      }
    }
    const parts = [];
    const bright = clamp(p2.brightness || 0, -100, 100);
    if (bright) parts.push(`brightness(${100 + bright}%)`);
    const contr = clamp(p2.contrast || 0, -100, 100);
    if (contr) parts.push(`contrast(${100 + contr}%)`);
    const sat = clamp(p2.saturation || 0, -100, 100);
    if (sat) parts.push(`saturate(${100 + sat}%)`);
    const temp = clamp(p2.temperature || 0, -100, 100);
    if (temp > 0) parts.push(`sepia(${Math.round(temp * 0.4)}%)`);
    if (temp < 0) parts.push(`hue-rotate(${Math.round(temp * 0.2)}deg)`);
    const gray = clamp(p2.grayscale || 0, 0, 100);
    if (gray) parts.push(`grayscale(${gray}%)`);
    const blur = clamp(p2.blur || 0, 0, 20);
    if (blur) parts.push(`blur(${blur}px)`);
    return parts.join(' ');
  }

  // ======================================================================
  // SECTION: Overlay rendering (text/image) in the preview
  // ======================================================================

  const overlayDrag = { active: false, clipId: null, startX: 0, startY: 0, startPropX: 0, startPropY: 0, width: 0, height: 0, before: null };

  function beginTextOverlayDrag(event, clipId) {
    if (event.button !== 0 || event.isPrimary === false) return;
    const clip = clipById(clipId);
    if (!clip || clip.type !== 'text') return;
    const track = state.tracks[clip.trackType];
    if (track && track.locked) {
      showToast('Track is locked — unlock it to move text');
      event.preventDefault();
      return;
    }
    const bounds = el.previewOverlay.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    selectClip(clipId);
    overlayDrag.active = true;
    overlayDrag.clipId = clipId;
    overlayDrag.startX = event.clientX;
    overlayDrag.startY = event.clientY;
    overlayDrag.startPropX = Number(clip.props.x) || 0;
    overlayDrag.startPropY = Number(clip.props.y) || 0;
    overlayDrag.width = bounds.width;
    overlayDrag.height = bounds.height;
    overlayDrag.before = snapshot();
    event.preventDefault();
    event.stopPropagation();
    const move = (ev) => {
      if (!overlayDrag.active || overlayDrag.clipId !== clipId) return;
      const current = clipById(clipId);
      if (!current) return;
      current.props.x = clamp(overlayDrag.startPropX + (ev.clientX - overlayDrag.startX) * 2000 / overlayDrag.width, -4000, 4000);
      current.props.y = clamp(overlayDrag.startPropY + (ev.clientY - overlayDrag.startY) * 2000 / overlayDrag.height, -4000, 4000);
      renderOverlaysForTime();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!overlayDrag.active || overlayDrag.clipId !== clipId) return;
      overlayDrag.active = false;
      overlayDrag.clipId = null;
      const before = overlayDrag.before;
      overlayDrag.before = null;
      if (before) commitChange(before, 'text overlay moved');
      refreshPropertiesPanel();
      markDirty();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function renderOverlaysForTime() {
    if (!el.previewOverlay) return;
    const t = state.currentTime;
    const wanted = [];
    const primaryVideoClip = activeHumanClipAtBaseType('video', t);
    const primaryOverlayClip = !primaryVideoClip ? activeHumanClipAtBaseType('overlay', t) : null;
    const primaryClip = primaryVideoClip || primaryOverlayClip;

    // Collect every active overlay image and text clip, including secondary tracks.
    // The primary still image is already rendered by the dedicated preview image layer.
    for (const clip of state.clips) {
      const baseType = getTrackBaseType(clip.trackType);
      if (clip.type === 'text' && baseType !== 'text') continue;
      if (clip.type === 'image' && baseType !== 'overlay') continue;
      if (clip.type !== 'text' && clip.type !== 'image') continue;
      const track = state.tracks[clip.trackType];
      if (!track || !track.exists || track.hidden) continue;
      if (t < clip.start || t >= clip.start + clip.duration) continue;
      if (clip.type === 'image' && primaryClip && primaryClip.id === clip.id) continue;
      wanted.push(clip);
    }

    // Rebuild DOM only when active clips change, not on every animation frame.
    const sig = wanted.map((c) => c.id).join('|');
    if (el.previewOverlay.dataset.sig !== sig) {
      el.previewOverlay.dataset.sig = sig;
      el.previewOverlay.replaceChildren();
      for (const clip of wanted) {
        if (clip.type === 'video') continue;
        const item = document.createElement('div');
        item.className = 'cutora-overlay-item';
        item.dataset.clipId = clip.id;
        if (clip.type === 'image') {
          const asset = assetById(clip.assetId);
          if (asset && !asset.missing && asset.url) {
            const img = document.createElement('img');
            img.src = asset.url;
            img.alt = '';
            img.decoding = 'async';
            item.appendChild(img);
          }
        } else if (clip.type === 'text') {
          item.appendChild(document.createElement('div'));
          item.addEventListener('pointerdown', (event) => beginTextOverlayDrag(event, clip.id));
          item.setAttribute('role', 'button');
          item.setAttribute('aria-label', 'Drag text overlay to reposition');
          item.title = 'Drag to reposition text';
        }
        el.previewOverlay.appendChild(item);
      }
    }

    // Update animated properties in-place without allocating new DOM nodes.
    for (const clip of wanted) {
      const item = el.previewOverlay.querySelector('[data-clip-id="' + clip.id + '"]');
      if (!item) continue;
      const p = clip.props || {};
      if (clip.type === 'text') {
        const track = state.tracks[clip.trackType];
        item.style.pointerEvents = track && track.locked ? 'none' : 'auto';
        item.style.cursor = track && track.locked ? 'not-allowed' : 'grab';
        item.style.touchAction = 'none';
        item.style.userSelect = 'none';
        const span = item.firstElementChild;
        if (span) {
          span.textContent = p.content || '';
          span.style.color = p.color || '#ffffff';
          // Match the 1080p-relative typography scale used by the export renderer.
          const frameHeight = el.previewOverlay.clientHeight || 1080;
          span.style.fontSize = `${clamp(p.fontSize || 48, 8, 400) * frameHeight / 1080}px`;
          const fontFamilies = { system: 'Inter, system-ui, sans-serif', arial: 'Arial, Helvetica, sans-serif', georgia: 'Georgia, serif', impact: 'Impact, Haettenschweiler, sans-serif', mono: 'Courier New, monospace', serif: 'Georgia, Times New Roman, serif', rounded: 'Trebuchet MS, Arial Rounded MT Bold, sans-serif', condensed: 'Arial Narrow, Roboto Condensed, Impact, sans-serif' };
          span.style.fontFamily = fontFamilies[p.fontFamily] || fontFamilies.system;
          span.style.fontWeight = p.fontFamily === 'impact' ? '900' : '700';
          span.style.letterSpacing = p.textEffect === 'retro' ? '.04em' : 'normal';
          span.style.textAlign = p.align || 'center';
          span.style.padding = p.textEffect === 'label' ? '.18em .42em' : '0';
          span.style.borderRadius = p.textEffect === 'label' ? '.22em' : '0';
          span.style.background = p.textEffect === 'label' ? 'rgba(0,0,0,.62)' : 'transparent';
          span.style.webkitTextStroke = p.textEffect === 'outline' ? '1.5px rgba(0,0,0,.95)' : '0 transparent';
          const textShadows = { none: 'none', shadow: '0 2px 8px rgba(0,0,0,.65)', outline: '0 2px 4px rgba(0,0,0,.8)', neon: `0 0 5px ${p.color || '#fff'}, 0 0 14px ${p.color || '#fff'}, 0 0 28px ${p.color || '#fff'}`, label: 'none', retro: '3px 3px 0 rgba(255,80,100,.8), -2px -2px 0 rgba(70,190,255,.65)' };
          span.style.textShadow = textShadows[p.textEffect || 'shadow'] || textShadows.shadow;
        }
      }
      const ex = effectiveProp(clip, 'x', t) || 0;
      const ey = effectiveProp(clip, 'y', t) || 0;
      const esc = effectiveProp(clip, 'scale', t) || 100;
      const erot = effectiveProp(clip, 'rotation', t) || 0;
      const eop = effectiveProp(clip, 'opacity', t);
      const opacity = clamp((eop != null ? eop : 100) / 100, 0, 1) * fadeEnvelope(clip, t);
      item.style.opacity = String(clamp(opacity, 0, 1));
      item.style.filter = buildFilterCSS(p, clip, t) || '';
      item.style.left = `${50 + clamp(ex * 0.05, -50, 50)}%`;
      item.style.top = `${50 + clamp(ey * 0.05, -50, 50)}%`;
      item.style.transform = `translate(-50%,-50%) scale(${clamp(esc / 100, 0, 10)}) rotate(${clamp(erot, -360, 360)}deg)`;
    }
  }

  // ======================================================================
  // SECTION: Playback control buttons
  // ======================================================================

  function updatePlayPauseButton() {
    if (!el.btnPlayPause || !el.playIcon || !el.pauseIcon) return;
    el.playIcon.style.display = state.playing ? 'none' : 'block';
    el.pauseIcon.style.display = state.playing ? 'block' : 'none';
    el.btnPlayPause.setAttribute('aria-label', state.playing ? 'Pause video' : 'Play or pause video');
    el.btnPlayPause.disabled = state.timelineDuration <= 0;
  }

  function updateMuteButton() {
    if (!el.btnMute || !el.volumeOnIcon || !el.volumeOffIcon) return;
    const muted = state.muted;
    el.volumeOnIcon.style.display = muted ? 'none' : 'block';
    el.volumeOffIcon.style.display = muted ? 'block' : 'none';
    el.btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  function toggleMute() {
    state.muted = !state.muted;
    if (!state.muted && state.volume === 0) state.volume = 1;
    if (el.volumeSlider) el.volumeSlider.value = String(state.muted ? 0 : state.volume);
    applyActiveClipProcessing();
    updateMuteButton();
  }

  function initVolumeControl() {
    if (!el.volumeSlider) return;
    el.volumeSlider.addEventListener('input', (e) => {
      state.volume = clamp(parseFloat(e.target.value) || 0, 0, 1);
      if (state.volume > 0 && state.muted) {
        state.muted = false;
        updateMuteButton();
      }
      applyActiveClipProcessing();
    });
  }

  function initFullscreen() {
    if (!el.btnFullscreen) return;
    const updateIcons = () => {
      const fs = !!document.fullscreenElement;
      if (el.fullscreenEnterIcon) el.fullscreenEnterIcon.style.display = fs ? 'none' : 'block';
      if (el.fullscreenExitIcon) el.fullscreenExitIcon.style.display = fs ? 'block' : 'none';
    };
    el.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        const target = el.previewContainer || el.previewStage;
        if (target && target.requestFullscreen) {
          target.requestFullscreen().catch(() => showToast('Fullscreen was blocked by the browser', 'error'));
        } else {
          showToast('Fullscreen is not supported in this browser', 'error');
        }
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', updateIcons);
    // SVG icon boot state: HTML markup for the video shows both icons; force one
    if (el.fullscreenEnterIcon) el.fullscreenEnterIcon.style.display = 'block';
    if (el.fullscreenExitIcon) el.fullscreenExitIcon.style.display = 'none';
  }

  function initAspectRatio() {
    if (!el.aspectRatioSelect) return;
    const applyAspect = (value) => {
      state.aspect = value;
      const ratios = {
        '16:9': '16 / 9', '9:16': '9 / 16', '4:3': '4 / 3',
        '3:4': '3 / 4', '1:1': '1 / 1', '21:9': '21 / 9', '4:5': '4 / 5'
      };
      if (previewFrame) {
        if (value === 'Original') {
          previewFrame.style.aspectRatio = '';
        } else {
          const r = ratios[value] || '16 / 9';
          previewFrame.style.aspectRatio = r;
          previewFrame.style.width = 'auto';
          previewFrame.style.height = 'auto';
          previewFrame.style.maxWidth = '100%';
          previewFrame.style.maxHeight = '100%';
          // Fit: constrain the larger dimension
          const stage = el.previewStage;
          if (stage) {
            const [rw, rh] = r.split('/').map((n) => parseFloat(n));
            const sr = stage.clientWidth / stage.clientHeight;
            const fr = rw / rh;
            if (fr > sr) {
              previewFrame.style.width = '96%';
              previewFrame.style.height = 'auto';
            } else {
              previewFrame.style.height = '92%';
              previewFrame.style.width = 'auto';
            }
          }
        }
      }
    };
    el.aspectRatioSelect.addEventListener('change', (e) => applyAspect(e.target.value));
    applyAspect(el.aspectRatioSelect.value || '16:9');
  }

  // Wrap the video element and overlay in a sized frame so the aspect
  // control can letterbox without touching the HTML.
  let previewFrame = null;
  let previewStill = null;

  function buildPreviewFrame() {
    if (!el.previewStage || !el.previewVideo || previewFrame) return;
    previewFrame = document.createElement('div');
    previewFrame.className = 'cutora-frame';
    previewFrame.setAttribute('aria-label', 'Project preview frame');

    previewStill = document.createElement('img');
    previewStill.className = 'cutora-preview-still';
    previewStill.alt = '';
    previewStill.hidden = true;
    previewStill.draggable = false;

    el.previewStage.insertBefore(previewFrame, el.previewVideo);
    previewFrame.appendChild(previewStill);
    previewFrame.appendChild(el.previewVideo);
    if (el.previewOverlay) previewFrame.appendChild(el.previewOverlay);
    previewFrame.style.aspectRatio = '16 / 9';
  }

  // ======================================================================
  // SECTION: Preview empty state
  // ======================================================================

  function updatePreviewEmptyState() {
    if (!el.previewEmpty || !el.previewStage) return;
    const hasVisualContent = state.clips.some((clip) => {
      if (!clip || clip.missing || !['video', 'image', 'text'].includes(clip.type)) return false;
      const track = state.tracks[clip.trackType];
      return !track || (track.exists && !track.hidden);
    });
    el.previewEmpty.hidden = hasVisualContent;
    if (previewFrame) previewFrame.style.visibility = hasVisualContent ? 'visible' : 'hidden';
  }

  // ======================================================================
  // SECTION: Clip selection & properties panel
  // ======================================================================

  function selectClip(clipId, opts = {}) {
    state.selectedClipId = clipId || null;
    syncSelectionUI();
    refreshPropertiesPanel();
    const clip = selectedClip();
    if (clip) {
      if (!opts.silent) showToast(`Selected: ${clip.name}`);
      if (!state.playing && (state.currentTime < clip.start || state.currentTime >= clip.start + clip.duration)) {
        setPlayheadTime(clip.start, { seekMedia: true });
      } else {
        syncPlaybackToPlayhead();
      }
    }
  }

  function deselectAll() {
    state.selectedClipId = null;
    syncSelectionUI();
    refreshPropertiesPanel();
  }

  function syncSelectionUI() {
    document.querySelectorAll('.clip.is-selected').forEach((n) => n.classList.remove('is-selected'));
    const clip = selectedClip();
    if (clip) {
      const node = findClipNode(clip.id);
      if (node) node.classList.add('is-selected');
    }
  }

  function showSection(node, show) {
    if (!node) return;
    node.hidden = !show;
  }

  function refreshPropertiesPanel() {
    const clip = selectedClip();
    showSection(el.propertiesEmpty, !clip);
    const isVisual = clip && (clip.type === 'video' || clip.type === 'image');
    const isAudio = clip && clip.type === 'audio';
    const isText = clip && clip.type === 'text';
    const isMediaWithVideoProps = clip && clip.type === 'video' && clip.trackType === 'video';
    syncTransitionControl();

    showSection(el.propertiesTransform, !!clip && (isVisual || isText));
    showSection(el.propertiesVideo, !!isMediaWithVideoProps);
    showSection(el.propertiesAudio, !!clip && (isAudio || clip.type === 'video'));
    showSection(el.propertiesText, !!isText);

    if (!clip) return;
    const p = clip.props || {};

    const set = (node, v) => { if (node) node.value = String(v); };
    set(el.propPositionX, Math.round(p.x || 0));
    set(el.propPositionY, Math.round(p.y || 0));
    set(el.propScale, clamp(Math.round(p.scale || 100), 0, 1000));
    set(el.propRotation, Math.round(p.rotation || 0));
    set(el.propOpacity, clamp(Math.round(p.opacity != null ? p.opacity : 100), 0, 100));
    set(el.propOpacitySlider, clamp(Math.round(p.opacity != null ? p.opacity : 100), 0, 100));

    set(el.adjBrightness, clamp(p.brightness || 0, -100, 100));
    set(el.adjBrightnessValue, clamp(p.brightness || 0, -100, 100));
    set(el.adjContrast, clamp(p.contrast || 0, -100, 100));
    set(el.adjContrastValue, clamp(p.contrast || 0, -100, 100));
    set(el.adjSaturation, clamp(p.saturation || 0, -100, 100));
    set(el.adjSaturationValue, clamp(p.saturation || 0, -100, 100));
    set(el.adjTemperature, clamp(p.temperature || 0, -100, 100));
    set(el.adjTemperatureValue, clamp(p.temperature || 0, -100, 100));
    set(el.adjGrayscale, clamp(p.grayscale || 0, 0, 100));
    set(el.adjGrayscaleValue, clamp(p.grayscale || 0, 0, 100));
    set(el.adjBlur, clamp(p.blur || 0, 0, 20));
    set(el.adjBlurValue, clamp(p.blur || 0, 0, 20));

    set(el.adjVolume, clamp(p.volume != null ? p.volume : 100, 0, 200));
    set(el.adjVolumeValue, clamp(p.volume != null ? p.volume : 100, 0, 200));
    set(el.adjFadeIn, Math.max(0, p.fadeIn || 0));
    set(el.adjFadeOut, Math.max(0, p.fadeOut || 0));
    set(el.adjSpeed, clamp(p.speed || 1, 0.25, 4));
    set(el.adjSpeedValue, clamp(p.speed || 1, 0.25, 4));

    set(el.adjTextContent, p.content || '');
    set(el.adjTextFontSize, clamp(p.fontSize || 48, 8, 400));
    if (el.adjTextFontFamily) el.adjTextFontFamily.value = p.fontFamily || 'system';
    if (el.adjTextEffect) el.adjTextEffect.value = p.textEffect || 'shadow';
    if (el.adjVideoLook) el.adjVideoLook.value = p.lookPreset || 'none';
    const color = p.color || '#ffffff';
    set(el.adjTextColor, color);
    set(el.adjTextColorValue, color.toUpperCase());
    if (el.adjTextAlign) el.adjTextAlign.value = p.align || 'center';
  }  function bindPropInput(node, apply, linked) {
    if (!node) return;
    node.addEventListener('input', () => {
      const clip = selectedClip();
      if (!clip) return;
      apply(clip, node);
      if (linked && linked !== node) linked.value = node.value;
      applyActiveClipProcessing();
      renderOverlaysForTime();
    });

    node.addEventListener('change', () => {
      // A numeric commit counts as an undo point
      pushUndo();
    });
  }

  function numericUpdater(key, { min = -1e9, max = 1e9 } = {}) {
    return (clip, node) => {
      let v = parseFloat(node.value);
      if (isNaN(v)) v = 0;
      v = clamp(v, min, max);
      clip.props[key] = v;
      node.value = String(v);
    };
  }  function initPropertiesPanel() {
    bindPropInput(el.propPositionX, numericUpdater('x', { min: -4000, max: 4000 }));
    bindPropInput(el.propPositionY, numericUpdater('y', { min: -4000, max: 4000 }));
    bindPropInput(el.propScale, numericUpdater('scale', { min: 0, max: 1000 }));
    bindPropInput(el.propRotation, numericUpdater('rotation', { min: -360, max: 360 }));
    if (el.propOpacity) bindPropInput(el.propOpacity, numericUpdater('opacity', { min: 0, max: 100 }), el.propOpacitySlider);
    if (el.propOpacitySlider) bindPropInput(el.propOpacitySlider, numericUpdater('opacity', { min: 0, max: 100 }), el.propOpacity);
    if (el.adjBrightness) bindPropInput(el.adjBrightness, numericUpdater('brightness', { min: -100, max: 100 }), el.adjBrightnessValue);
    if (el.adjBrightnessValue) bindPropInput(el.adjBrightnessValue, numericUpdater('brightness', { min: -100, max: 100 }), el.adjBrightness);
    if (el.adjContrast) bindPropInput(el.adjContrast, numericUpdater('contrast', { min: -100, max: 100 }), el.adjContrastValue);
    if (el.adjContrastValue) bindPropInput(el.adjContrastValue, numericUpdater('contrast', { min: -100, max: 100 }), el.adjContrast);
    if (el.adjSaturation) bindPropInput(el.adjSaturation, numericUpdater('saturation', { min: -100, max: 100 }), el.adjSaturationValue);
    if (el.adjSaturationValue) bindPropInput(el.adjSaturationValue, numericUpdater('saturation', { min: -100, max: 100 }), el.adjSaturation);
    if (el.adjTemperature) bindPropInput(el.adjTemperature, numericUpdater('temperature', { min: -100, max: 100 }), el.adjTemperatureValue);
    if (el.adjTemperatureValue) bindPropInput(el.adjTemperatureValue, numericUpdater('temperature', { min: -100, max: 100 }), el.adjTemperature);
    if (el.adjGrayscale) bindPropInput(el.adjGrayscale, numericUpdater('grayscale', { min: 0, max: 100 }), el.adjGrayscaleValue);
    if (el.adjGrayscaleValue) bindPropInput(el.adjGrayscaleValue, numericUpdater('grayscale', { min: 0, max: 100 }), el.adjGrayscale);
    if (el.adjBlur) bindPropInput(el.adjBlur, numericUpdater('blur', { min: 0, max: 20 }), el.adjBlurValue);
    if (el.adjBlurValue) bindPropInput(el.adjBlurValue, numericUpdater('blur', { min: 0, max: 20 }), el.adjBlur);
    
    if (el.adjVolume) bindPropInput(el.adjVolume, numericUpdater('volume', { min: 0, max: 200 }), el.adjVolumeValue);
    if (el.adjVolumeValue) bindPropInput(el.adjVolumeValue, numericUpdater('volume', { min: 0, max: 200 }), el.adjVolume);
    if (el.adjFadeIn) bindPropInput(el.adjFadeIn, numericUpdater('fadeIn', { min: 0, max: 60 }));
    if (el.adjFadeOut) bindPropInput(el.adjFadeOut, numericUpdater('fadeOut', { min: 0, max: 60 }));
    
    // speed
    bindPropInput(el.adjSpeedValue, (clip, node) => {
      const before = snapshot();
      let s = parseFloat(node.value);
      if (isNaN(s) || s <= 0) s = 1;
      s = clamp(s, 0.25, 4);
      const oldSpeed = clip.props.speed || 1;
      if (Math.abs(s - oldSpeed) > 0.001) {
        const asset = assetById(clip.assetId);
        const sourceLen = asset && isFinite(asset.duration) && asset.duration > 0 ? asset.duration : clip.duration * oldSpeed;
        const newDur = clamp(sourceLen / s, MIN_CLIP_DURATION, 1e6);
        clip.props.speed = s;
        clip.duration = newDur;
        recomputeTimelineDuration();
        renderAllClips();
      }
      node.value = String(s);
      if (el.adjSpeed) el.adjSpeed.value = String(s);
    }, el.adjSpeed);

    bindPropInput(el.adjTextContent, (clip, node) => {
      clip.props.content = node.value;
    });
    bindPropInput(el.adjTextFontSize, numericUpdater('fontSize', { min: 8, max: 400 }));
    const bindTextChoice = (node, prop) => {
      if (!node) return;
      node.addEventListener('change', () => {
        const clip = selectedClip();
        if (!clip || clip.type !== 'text') return;
        const before = snapshot();
        clip.props[prop] = node.value;
        renderOverlaysForTime();
        commitChange(before, prop + ' changed');
        markDirty();
      });
    };
    bindTextChoice(el.adjTextFontFamily, 'fontFamily');
    bindTextChoice(el.adjTextEffect, 'textEffect');
    if (el.adjVideoLook) {
      el.adjVideoLook.addEventListener('change', () => {
        const clip = selectedClip();
        if (!clip || (clip.type !== 'video' && clip.type !== 'image')) return;
        const presets = {
          none: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, grayscale: 0, blur: 0 },
          cinematic: { brightness: -4, contrast: 22, saturation: -18, temperature: 8, grayscale: 0, blur: 0 },
          vivid: { brightness: 5, contrast: 12, saturation: 42, temperature: 0, grayscale: 0, blur: 0 },
          mono: { brightness: 0, contrast: 16, saturation: -100, temperature: 0, grayscale: 100, blur: 0 },
          vintage: { brightness: 4, contrast: -8, saturation: -28, temperature: 34, grayscale: 0, blur: 0 },
          cool: { brightness: 2, contrast: 8, saturation: 5, temperature: -45, grayscale: 0, blur: 0 },
          dreamy: { brightness: 8, contrast: -18, saturation: 12, temperature: 12, grayscale: 0, blur: 1.5 },
          noir: { brightness: -8, contrast: 48, saturation: -100, temperature: 0, grayscale: 100, blur: 0 }
        };
        const before = snapshot();
        const look = el.adjVideoLook.value || 'none';
        Object.assign(clip.props, presets[look] || presets.none, { lookPreset: look });
        refreshPropertiesPanel();
        applyActiveClipProcessing();
        renderOverlaysForTime();
        commitChange(before, 'video look changed');
        markDirty();
      });
    }
    if (el.adjTextAlign) {
      el.adjTextAlign.addEventListener('change', () => {
        const clip = selectedClip();
        if (!clip) return;
        clip.props.align = el.adjTextAlign.value;
        renderOverlaysForTime();
        pushUndo();
      });
    }
    bindPropInput(el.adjTextColor, (clip, node) => {
      clip.props.color = node.value;
      if (el.adjTextColorValue) el.adjTextColorValue.value = node.value.toUpperCase();
    });
    // Hex text <-> color picker pair
    if (el.adjTextColorValue) {
      el.adjTextColorValue.addEventListener('input', () => {
        const clip = selectedClip();
        if (!clip) return;
        const v = el.adjTextColorValue.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          clip.props.color = v;
          if (el.adjTextColor) el.adjTextColor.value = v;
          renderOverlaysForTime();
        } else if (el.adjTextColor && /^#[0-9a-fA-F]{3}$/.test(v)) {
          const c = v.slice(1).split('').map((ch) => ch + ch).join('');
          clip.props.color = '#' + c;
          el.adjTextColor.value = '#' + c;
          renderOverlaysForTime();
        }
      });
    }

    if (el.btnContextClear) {
      el.btnContextClear.addEventListener('click', deselectAll);
    }
  }  // ======================================================================
  // SECTION: Clip operations (delete / duplicate / split)
  // ======================================================================
  
  function deleteSelectedClip() {
    const clip = selectedClip();
    if (!clip) {
      showToast('Select a clip to delete');
      return;
    }
    const before = snapshot();
    state.clips = state.clips.filter((c) => c.id !== clip.id);
    state.selectedClipId = null;
    recomputeTimelineDuration();

    commitChange(before, 'clip deleted');
    renderAllClips();
    refreshPropertiesPanel();
    showToast('Clip deleted');
  }

  function duplicateSelectedClip() {
    const clip = selectedClip();
    if (!clip) {
      showToast('Select a clip to duplicate');
      return;
    }
    const before = snapshot();
    const copy = JSON.parse(JSON.stringify(clip));
    copy.id = generateId();
    copy.start = clip.start + clip.duration;
    state.clips.push(copy);
    recomputeTimelineDuration();
    commitChange(before, 'clip duplicated');
    renderAllClips();
    selectClip(copy.id, { silent: true });
    showToast('Clip duplicated');
  }

  function splitSelectedClip() {
    let clip = selectedClip();
    if (!clip) {
      clip = activeHumanClipAtBaseType('video', state.currentTime) ||
             activeHumanClipAtBaseType('overlay', state.currentTime) ||
             activeHumanClipAtBaseType('text', state.currentTime) ||
             activeHumanClipAtBaseType('audio', state.currentTime);
      if (clip) selectClip(clip.id, { silent: true });
    }
    if (!clip) {
      showToast('Select a clip or move the playhead over a clip to split');
      return;
    }
    const t = state.currentTime;
    if (t <= clip.start + MIN_CLIP_DURATION || t >= clip.start + clip.duration - MIN_CLIP_DURATION) {
      showToast('Move the playhead inside the clip to split it');
      return;
    }
    const before = snapshot();
    const cut = Math.round((t - clip.start) * 100) / 100;
    const right = JSON.parse(JSON.stringify(clip));
    right.id = generateId();
    right.start = Math.round(t * 100) / 100;
    right.duration = Math.round((clip.duration - cut) * 100) / 100;
    right.inPoint = Math.round((clip.inPoint + cut) * 100) / 100;
    clip.duration = cut;
    state.clips.push(right);
    recomputeTimelineDuration();
    commitChange(before, 'clip split');
    renderAllClips();
    selectClip(right.id, { silent: true });
    showToast('Clip split at playhead');
  }

  // ======================================================================
  // SECTION: Track controls
  // ======================================================================

  const trackTemplates = {};

  function cacheTrackTemplates() {
    for (const type of TRACK_TYPES) {
      const node = getTrackElement(type);
      if (node) trackTemplates[type] = node.outerHTML;
    }
  }

  function initTrackControlsForType(trackId) {
    const track = getTrackElement(trackId);
    if (!track || track.dataset.cutoraBound === '1') return;
    track.dataset.cutoraBound = '1';
    const vis = track.querySelector('.track-btn--visibility');
    const mute = track.querySelector('.track-btn--mute');
    const lock = track.querySelector('.track-btn--lock');
    const del = track.querySelector('.track-btn--delete');
    if (vis) vis.addEventListener('click', () => toggleTrackFlag(trackId, 'hidden'));
    if (mute) mute.addEventListener('click', () => toggleTrackFlag(trackId, 'muted'));
    if (lock) lock.addEventListener('click', () => toggleTrackFlag(trackId, 'locked'));
    if (del) del.addEventListener('click', () => deleteTrack(trackId));
  }

  function initTrackControls() {
    for (const id of Object.keys(state.tracks)) {
      initTrackControlsForType(id);
    }
    const btnAddVideo = byId('btn-add-track-video');
    const btnAddOverlay = byId('btn-add-track-overlay');
    const btnAddText = byId('btn-add-track-text');
    const btnAddAudio = byId('btn-add-track-audio');
    if (btnAddVideo) btnAddVideo.addEventListener('click', () => addNewTrack('video'));
    if (btnAddOverlay) btnAddOverlay.addEventListener('click', () => addNewTrack('overlay'));
    if (btnAddText) btnAddText.addEventListener('click', () => addNewTrack('text'));
    if (btnAddAudio) btnAddAudio.addEventListener('click', () => addNewTrack('audio'));
  }

  function addNewTrack(type) {
    if (!TRACK_TYPES.includes(type) || !trackTemplates[type] || !el.timelineTracks) {
      showToast('This track type is not available', 'error');
      return;
    }

    // The four named rows (Video, Overlay, Text, Audio) are primary tracks.
    // Repair a missing primary row before creating any secondary track. This
    // also handles DOM loss when state still incorrectly says exists=true.
    const baseTrack = state.tracks[type];
    const primaryElement = byId(`track-${type}`);
    if (baseTrack && (!baseTrack.exists || !primaryElement || !primaryElement.isConnected)) {
      const before = snapshot();
      baseTrack.exists = true;
      baseTrack.hidden = false;
      baseTrack.muted = false;
      baseTrack.locked = false;
      renderAllClips();
      initTrackControlsForType(type);
      syncTrackControls();
      commitChange(before, 'primary track restored');
      showToast(`${baseTrack.name} restored`, 'success');
      return;
    }

    // Never reuse an ID belonging to a deleted secondary track; its clips and
    // history still refer to that ID and must remain recoverable.
    let nextIdx = 2;
    while (Object.prototype.hasOwnProperty.call(state.tracks, `${type}-${nextIdx}`)) nextIdx++;
    const newId = `${type}-${nextIdx}`;
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    const newName = `${typeLabel} ${nextIdx}`;
    const before = snapshot();

    state.tracks[newId] = {
      id: newId,
      type,
      name: newName,
      hidden: false,
      muted: false,
      locked: false,
      exists: true
    };

    renderAllClips();
    initTrackControlsForType(newId);
    syncTrackControls();
    commitChange(before, 'track added');
    showToast(`${newName} added to timeline`, 'success');
  }

  function toggleTrackFlag(trackId, flag) {
    const ts = state.tracks[trackId];
    if (!ts) return;
    ts[flag] = !ts[flag];
    syncTrackControls();
    if (flag === 'hidden') {
      renderAllClips();
      renderOverlaysForTime();
    }
    if (flag === 'muted') applyActiveClipProcessing();
  }

  function syncTrackControls() {
    for (const trackId of Object.keys(state.tracks)) {
      const track = getTrackElement(trackId);
      const ts = state.tracks[trackId];
      if (!track || !ts) continue;
      track.style.opacity = ts.hidden ? '0.55' : '';
      track.classList.toggle('is-locked', !!ts.locked);
      track.classList.toggle('is-muted', !!ts.muted);
      const vis = track.querySelector('.track-btn--visibility');
      const mute = track.querySelector('.track-btn--mute');
      const lock = track.querySelector('.track-btn--lock');
      if (vis) {
        vis.setAttribute('aria-pressed', ts.hidden ? 'false' : 'true');
        vis.title = ts.hidden ? 'Show track' : 'Hide track';
      }
      if (mute) {
        mute.setAttribute('aria-pressed', ts.muted ? 'true' : 'false');
        mute.classList.toggle('is-active', !!ts.muted);
        mute.title = ts.muted ? 'Unmute track' : 'Mute track';
      }
      if (lock) {
        lock.setAttribute('aria-pressed', ts.locked ? 'true' : 'false');
        lock.classList.toggle('is-active', !!ts.locked);
        lock.title = ts.locked ? 'Unlock track' : 'Lock track';
      }
      // Keep clips selectable on locked tracks; onClipPointerDown blocks edits.
      const content = track.querySelector('.track-content');
      if (content) content.style.pointerEvents = '';
    }
  }

  function deleteTrack(trackId) {
    const ts = state.tracks[trackId];
    if (!ts || !ts.exists) return;
    const hasClips = state.clips.some((c) => c.trackType === trackId);
    if (hasClips && !ts.hidden) {
      showToast('Track has clips — hide it first to remove it without losing clips', 'error');
      return;
    }

    const before = snapshot();
    ts.exists = false;
    if (state.selectedClipId && state.clips.some((clip) => clip.id === state.selectedClipId && clip.trackType === trackId)) {
      state.selectedClipId = null;
    }
    const track = getTrackElement(trackId);
    if (track) track.remove();
    recomputeTimelineDuration();
    renderAllClips();
    syncSelectionUI();
    refreshPropertiesPanel();
    syncTrackControls();
    commitChange(before, 'track removed');
    showToast(`${ts.name} removed — use the + ${ts.type || getTrackBaseType(trackId)} button to restore it`);
  }

  // ======================================================================
  // SECTION: Dynamic timeline edit buttons (split / duplicate / delete)
  // ======================================================================

  // ======================================================================
  // SECTION: Transition control (dynamic select in the properties panel)
  // ======================================================================

  let transitionRow = null;

  function addTransitionControl() {
    const host = el.propertiesVideo || el.propertiesPanel;
    if (!host || host.querySelector('.cutora-transition-row')) return;
    const row = document.createElement('div');
    row.className = 'properties-adjust-field cutora-transition-row';
    row.style.marginTop = '12px';
    row.innerHTML = `
      <label class="properties-label" title="Transition applied at clip boundaries">Transition</label>
      <div class="properties-input-row">
        <select class="properties-select cutora-transition-type" aria-label="Transition type">
          <option value="none">None</option>
          <option value="crossfade">Crossfade in</option>
          <option value="fade">Fade in</option>
          <option value="fadetoblack">Fade from/to black</option>
        </select>
        <input type="number" class="properties-input cutora-transition-duration" min="0" max="5" step="0.1" value="0" style="width:58px" aria-label="Transition duration in seconds" />
        <span class="properties-unit">s</span>
      </div>
    `;
    const typeSel = row.querySelector('.cutora-transition-type');
    const durInput = row.querySelector('.cutora-transition-duration');
    typeSel.addEventListener('change', () => {
      const clip = selectedClip();
      if (!clip) return;
      pushUndo();
      clip.props.transition = { type: typeSel.value, duration: clamp(parseFloat(durInput.value) || 0, 0, 5) };
      applyActiveClipProcessing();
      showToast(`Transition: ${typeSel.value === 'none' ? 'none' : typeSel.value}`);
    });
    durInput.addEventListener('change', () => {
      const clip = selectedClip();
      if (!clip) return;
      pushUndo();
      clip.props.transition = {
        type: typeSel.value,
        duration: clamp(parseFloat(durInput.value) || 0, 0, 5)
      };
      applyActiveClipProcessing();
    });
    host.appendChild(row);
    transitionRow = row;
  }

  function syncTransitionControl() {
    if (!transitionRow) return;
    const clip = selectedClip();
    const applicable = clip && (clip.type === 'video' || clip.type === 'image' || clip.type === 'text');
    transitionRow.style.display = applicable ? '' : 'none';
    if (!applicable) return;
    const tr = (clip.props && clip.props.transition) || { type: 'none', duration: 0 };
    transitionRow.querySelector('.cutora-transition-type').value = tr.type || 'none';
    transitionRow.querySelector('.cutora-transition-duration').value = String(tr.duration || 0);
  }

  function addTimelineEditButtons() {
    const group = document.querySelector('.timeline-add-tracks');
    if (!group || group.querySelector('.cutora-edit-group')) return;
    const wrap = document.createElement('div');
    wrap.className = 'cutora-edit-group timeline-add-tracks';
    wrap.style.display = 'inline-flex';
    wrap.style.gap = '8px';

    const mk = (label, iconPath, handler) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'timeline-add-btn';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPath}</svg><span>${label}</span>`;
      b.addEventListener('click', handler);
      wrap.appendChild(b);
    };

    mk('Split', '<polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/>', splitSelectedClip);
    mk('Duplicate', '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', duplicateSelectedClip);
    mk('Delete', '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', deleteSelectedClip);

    const parent = group.parentElement;
    if (parent && !parent.querySelector('.cutora-edit-group')) {
      parent.appendChild(wrap);
    }
  }

  // ======================================================================
  // SECTION: Text clips (dynamic add button in Text panel)
  // ======================================================================

  function addTextPanelControl() {
    const section = el.panelText;
    if (!section || section.querySelector('.cutora-text-add')) return;
    const library = section.querySelector('.media-library');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-import-btn cutora-text-add';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/></svg><span>Add text clip</span>';
    btn.addEventListener('click', () => {
      const text = window.prompt('Text content:', 'Your text');
      if (text == null || !text.trim()) return;
      addClipAt('text', null, state.currentTime, {
        type: 'text', snapTo: true, name: text.trim().slice(0, 24)
      });
    });
    if (library) section.insertBefore(btn, library);
  }

  // ======================================================================
  // SECTION: Keyboard shortcuts (single global handler)
  // ======================================================================

  function initKeyboard() {
    document.addEventListener('keydown', (event) => {
      const key = event.key || '';
      const mod = event.ctrlKey || event.metaKey;

      // Dialog escape
      if (key === 'Escape' && activeDialog) {
        closeDialog(activeDialog);
        event.preventDefault();
        return;
      }

      // Exporting guard — avoid interfering mid-export
      if (exportState.running) return;

      // Keyboard keyframe shortcuts at playhead: + adds, - removes (opacity)
      if (!isTypingTarget(event.target) && (key === '=' || key === '+')) {
        event.preventDefault();
        addKeyframeAtPlayhead('opacity');
        return;
      }
      if (!isTypingTarget(event.target) && key === '-') {
        event.preventDefault();
        removeKeyframeAtPlayhead('opacity');
        return;
      }

      // Show shortcuts
      if (key === '?' || (event.shiftKey && key === '/')) {
        if (el.dialogShortcuts && activeDialog !== el.dialogShortcuts) {
          openDialog(el.dialogShortcuts);
          event.preventDefault();
        }
        return;
      }

      if (activeDialog) {
        if (key === 'Enter' && activeDialog === el.dialogNewProject) {
          closeDialog(el.dialogNewProject);
          performNewProject();
        }
        return;
      }

      // Save / open / undo / redo
      if (mod && !event.shiftKey && key.toLowerCase() === 's') { event.preventDefault(); saveProjectJSON(); return; }
      if (mod && !event.shiftKey && key.toLowerCase() === 'o') { event.preventDefault(); openProjectPicker(); return; }
      if (mod && !event.shiftKey && key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
      if (mod && (event.shiftKey && key.toLowerCase() === 'z' || key.toLowerCase() === 'y')) { event.preventDefault(); redo(); return; }
      if (mod && key.toLowerCase() === 'e') { event.preventDefault(); openExportDialog(); return; }
      if (mod && key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelectedClip(); return; }
      if (mod) return;


      if (isTypingTarget(event.target)) return;

      switch (key) {
        case ' ':
          event.preventDefault();
          togglePlayPause();
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          deleteSelectedClip();
          break;
        case 's':
        case 'S':
          splitSelectedClip();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          if (el.btnFullscreen) el.btnFullscreen.click();
          break;
        case 'j':
        case 'J':
          setPlayheadTime(state.currentTime - 5);
          break;
        case 'l':
        case 'L':
          setPlayheadTime(state.currentTime + 5);
          break;
        case 'k':
        case 'K':
          pausePlayback();
          break;
        case 'Home':
          event.preventDefault();
          setPlayheadTime(0);
          break;
        case 'End':
          event.preventDefault();
          setPlayheadTime(state.timelineDuration);
          break;
        case '=':
        case '+':
          event.preventDefault();
          if (event.shiftKey) {
            addKeyframeAtPlayhead('opacity');
          } else {
            addKeyframeAtPlayhead(selectedClip() && selectedClip().type === 'audio' ? 'volume' : 'opacity');
          }
          break;

        case 'ArrowLeft': {
          const fine = event.shiftKey ? -1 : -1 / pxPerSecond() * 10;
          event.preventDefault();
          setPlayheadTime(state.currentTime + (event.shiftKey ? -1 : fine));
          break;
        }
        case 'ArrowRight': {
          const fine = event.shiftKey ? 1 : 1 / pxPerSecond() * 10;
          event.preventDefault();
          setPlayheadTime(state.currentTime + (event.shiftKey ? 1 : fine));
          break;
        }
        default:
          break;
      }
    });
  }

  // ======================================================================
  // SECTION: Dialog wiring (new project / export / shortcuts)
  // ======================================================================

  function initDialogs() {
    document.querySelectorAll('[data-dialog-close]').forEach((node) => {
      node.addEventListener('click', (e) => {
        const host = e.target.closest('.dialog');
        if (host) closeDialog(host);
      });
    });
    if (el.dialogNewProjectConfirm) {
      el.dialogNewProjectConfirm.addEventListener('click', () => {
        closeDialog(el.dialogNewProject);
        performNewProject();
      });
    }
    if (el.dialogShortcutsClose) {
      el.dialogShortcutsClose.addEventListener('click', () => closeDialog(el.dialogShortcuts));
    }
    if (el.dialogExportStart) {
      el.dialogExportStart.addEventListener('click', startExport);
    }
  }

  function newProjectFlow() {
    if (state.dirty) {
      openDialog(el.dialogNewProject);
    } else {
      performNewProject();
    }
  }

  const RECOVERY_KEY = 'cutora-recovery-v1';

  function performNewProject() {
    for (const asset of state.assets) {
      try { URL.revokeObjectURL(asset.url); } catch (err) { /* noop */ }
    }
    state.assets = [];
    state.clips = [];
    state.selectedAssetId = null;
    state.selectedClipId = null;
    state.timelineDuration = 0;
    state.currentTime = 0;
    state.undoStack = [];
    state.redoStack = [];
    state.dirty = false;
    state.projectName = 'Untitled Project';
    if (el.projectName) el.projectName.value = state.projectName;
    try { if (window.localStorage) window.localStorage.removeItem(RECOVERY_KEY); } catch (err) { /* noop */ }

    // Restore all four track shells
    for (const type of TRACK_TYPES) {
      if (!state.tracks[type].exists && trackTemplates[type] && el.timelineTracks) {
        const frag = document.createElement('table');
        frag.innerHTML = `<tr><td>${trackTemplates[type]}</td></tr>`;
        const restored = frag.firstChild.firstChild.firstChild;
        el.timelineTracks.appendChild(restored);
        state.tracks[type] = { type, name: restored.querySelector('.track-name') ? restored.querySelector('.track-name').textContent : type, hidden: false, muted: false, locked: false, exists: true };
      }
    }
    if (el.previewVideo) {
      el.previewVideo.removeAttribute('src');
      el.previewVideo.removeAttribute('data-cutora-src');
      el.previewVideo.load();
    }
    if (el.previewAudio) {
      el.previewAudio.removeAttribute('src');
      el.previewAudio.removeAttribute('data-cutora-src');
      el.previewAudio.load();
    }
    renderMediaLibrary();
    renderAllClips();
    refreshPropertiesPanel();
    updatePreviewEmptyState();
    updateUndoRedoButtons();
    updatePlayPauseButton();
    updateTimeDisplay();
    updateSeekSlider();
    showToast('New project created', 'success');
  }

  // ======================================================================
  // SECTION: Project save / load (JSON download + file picker)
  // ======================================================================

  function projectData() {
    return {
      app: 'CUTORA',
      version: 4,
      name: state.projectName,
      aspect: state.aspect,
      zoom: state.zoom,
      savedAt: new Date().toISOString(),
      tracks: state.tracks,
      clips: state.clips,
      assets: state.assets.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        duration: a.duration,
        width: a.width,
        height: a.height,
        ready: a.ready,
        missing: a.missing || false
      }))
    };
  }

  // Lightweight crash/session recovery via localStorage (metadata + timeline only).
  // Media blob: URLs never survive a restart — clips relink when files are re-imported.
  let recoverySaveTimer = null;

  function scheduleRecoverySave() {
    if (recoverySaveTimer) clearTimeout(recoverySaveTimer);
    recoverySaveTimer = setTimeout(() => {
      recoverySaveTimer = null;
      try {
        if (!window.localStorage) return;
        if (state.clips.length === 0 && state.assets.length === 0) {
          window.localStorage.removeItem(RECOVERY_KEY);
          return;
        }
        const slim = projectData();
        slim.assets = slim.assets.map((a) => ({ id: a.id, name: a.name, type: a.type, duration: 0, missing: true }));
        slim.clips = slim.clips.map((c) => ({
          id: c.id, assetId: c.assetId, name: c.name, type: c.type, trackType: c.trackType,
          start: c.start, inPoint: c.inPoint, duration: c.duration, missing: true,
          props: c.props
        }));
        window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(slim));
      } catch (err) {
        /* storage full or blocked — recovery silently unavailable, saving still works */
      }
    }, 1200);
  }

  function tryRecoverOnBoot() {
    try {
      if (!window.localStorage) return false;
      const raw = window.localStorage.getItem(RECOVERY_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!isValidProject(data)) {
        window.localStorage.removeItem(RECOVERY_KEY);
        return false;
      }
      const recovered = data;
      const ok = window.confirm(
        `An unsaved CUTORA session from ${new Date(data.savedAt).toLocaleString()} was found.\n\n` +
        'Restore it? (Media files are not saved — re-import files with the same names to relink.)'
      );
      if (ok) {
        loadProjectData(recovered, { silentDirty: true });
        showToast('Session recovered — re-import your media files to relink clips', 'success', 7000);
        return true;
      }
      window.localStorage.removeItem(RECOVERY_KEY);
      return false;
    } catch (err) {
      try { window.localStorage.removeItem(RECOVERY_KEY); } catch (err2) { /* noop */ }
      return false;
    }
  }

  function saveProjectJSON() {
    try {
      const data = JSON.stringify(projectData(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (state.projectName || 'project').replace(/[^\w\-]+/g, '_').slice(0, 60);
      a.href = url;
      a.download = `${safeName}.cutora.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      state.dirty = false;
      try { if (window.localStorage) window.localStorage.removeItem(RECOVERY_KEY); } catch (err) { /* noop */ }
      showToast('Project saved as JSON (media files are not embedded — re-import them after reopening)', 'success', 6000);
    } catch (err) {
      showToast('Saving the project failed', 'error');
    }
  }

  let projectInput = null;

  function openProjectPicker() {
    if (!projectInput) {
      projectInput = document.createElement('input');
      projectInput.type = 'file';
      projectInput.accept = '.json,application/json';
      projectInput.addEventListener('change', async () => {
        const file = projectInput.files && projectInput.files[0];
        projectInput.value = '';
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          isValidProject(data) ? loadProjectData(data) : showToast('That file is not a valid CUTORA project', 'error');
        } catch (err) {
          showToast('That file is not a valid CUTORA project', 'error');
        }
      });
    }
    if (!projectInput) return;
    projectInput.click();
  }

  function isValidProject(data) {
    try {
      return !!data
        && data.app === 'CUTORA'
        && typeof data.name === 'string'
        && Array.isArray(data.clips)
        && Array.isArray(data.assets)
        && data.clips.length + data.assets.length <= 5000
        && data.clips.every((c) => {
          if (!c || typeof c.id !== 'string' || typeof c.start !== 'number' || typeof c.duration !== 'number') return false;
          if (!isFinite(c.start) || !isFinite(c.duration) || c.start < 0 || c.duration <= 0) return false;
          if (c.trackType && !/^(video|overlay|text|audio)(-\d+)?$/.test(c.trackType)) return false;
          if (c.trackType && data.tracks && !Object.prototype.hasOwnProperty.call(data.tracks, c.trackType)
            && !TRACK_TYPES.includes(c.trackType)) return false;
          return true;
        })
        && (data.assets.every((a) => a && typeof a.name === 'string' && ['video', 'audio', 'image'].includes(a.type)));
    } catch (err) {
      return false;
    }
  }

  function loadProjectData(data, opts = {}) {
    if (!isValidProject(data)) {
      const reason = !data || data.app !== 'CUTORA'
        ? 'not a CUTORA project file'
        : 'clip timing or structure is invalid';
      showToast(`Project file failed validation (${reason}) — not applied`, 'error', 6000);
      return;
    }
    if (!opts.silentDirty && state.dirty) {
      const ok = window.confirm('Load this project? Unsaved changes to the current project will be lost.');
      if (!ok) return;
    }
    for (const asset of state.assets) {
      try { URL.revokeObjectURL(asset.url); } catch (err) { /* noop */ }
    }

    // Assets without local media are marked missing; re-import matching file names to relink
    state.assets = data.assets.map((a) => ({
      id: a.id, name: a.name, type: a.type, duration: a.duration || 0,
      width: a.width || 0, height: a.height || 0, thumbnail: a.thumbnail || null,
      url: null, ready: false, missing: true, size: 0
    }));
    state.clips = data.clips.map((c) => ({
      id: c.id || generateId(),
      assetId: c.assetId || null,
      name: c.name || 'Clip',
      type: c.type || 'video',
      trackType: (c.trackType && data.tracks && Object.prototype.hasOwnProperty.call(data.tracks, c.trackType)) ? c.trackType : (TRACK_TYPES.includes(c.trackType) ? c.trackType : 'video'),
      start: Math.max(0, c.start || 0),
      inPoint: Math.max(0, c.inPoint || 0),
      duration: Math.max(MIN_CLIP_DURATION, c.duration || MIN_CLIP_DURATION),
      missing: !!c.missing,
      props: Object.assign(defaultProps(c.type || 'video'), c.props || {})
    }));
    for (const clip of state.clips) {
      const asset = assetById(clip.assetId);
      clip.missing = !asset || !!asset.missing;
    }
    const baseTracks = {};
    for (const type of TRACK_TYPES) {
      baseTracks[type] = { type, name: type, hidden: false, muted: false, locked: false, exists: true };
    }
    state.tracks = Object.assign(baseTracks, data.tracks || {});
    for (const [trackId, track] of Object.entries(state.tracks)) {
      track.type = track.type || getTrackBaseType(trackId);
      track.name = track.name || trackId;
      track.hidden = !!track.hidden;
      track.muted = !!track.muted;
      track.locked = !!track.locked;
      track.exists = track.exists !== false;
    }
    state.projectName = data.name;
    state.aspect = data.aspect || '16:9';
    state.zoom = clamp(data.zoom || 50, 1, 100);
    state.currentTime = 0;
    state.undoStack = [];
    state.redoStack = [];
    state.dirty = true;

    // Rebuild missing track shells
    for (const type of TRACK_TYPES) {
      if (!getTrackElement(type) && trackTemplates[type] && el.timelineTracks) {
        const frag = document.createElement('table');
        frag.innerHTML = `<tr><td>${trackTemplates[type]}</td></tr>`;
        const restored = frag.firstChild.firstChild.firstChild;
        el.timelineTracks.appendChild(restored);
      }
    }

    if (el.projectName) el.projectName.value = state.projectName;
    if (el.timelineZoom) el.timelineZoom.value = String(state.zoom);
    if (el.aspectRatioSelect) el.aspectRatioSelect.value = state.aspect;
    for (const type of TRACK_TYPES) {
      initTrackControlsForType(type);
    }
    recomputeTimelineDuration();
    renderMediaLibrary();
    renderAllClips();
    syncTrackControls();
    refreshPropertiesPanel();
    updatePreviewEmptyState();
    updatePlayPauseButton();
    updateTimeDisplay();
    updateSeekSlider();
    const missingCount = state.assets.filter((a) => a.missing).length;
    showToast(missingCount > 0
      ? `Project loaded. ${missingCount} media file${missingCount > 1 ? 's' : ''} must be re-imported (file names are matched automatically).`
      : 'Project loaded', 'success', 6000);
  }

  function initTrackControlsForType(type) {
    const track = getTrackElement(type);
    if (!track || track.dataset.cutoraBound === '1') return;
    track.dataset.cutoraBound = '1';
    const vis = track.querySelector('.track-btn--visibility');
    const mute = track.querySelector('.track-btn--mute');
    const lock = track.querySelector('.track-btn--lock');
    const del = track.querySelector('.track-btn--delete');
    if (vis) vis.addEventListener('click', () => toggleTrackFlag(type, 'hidden'));
    if (mute) mute.addEventListener('click', () => toggleTrackFlag(type, 'muted'));
    if (lock) lock.addEventListener('click', () => toggleTrackFlag(type, 'locked'));
    if (del) del.addEventListener('click', () => deleteTrack(type));
  }

  // ======================================================================
  // SECTION: Open-project dynamic topbar control
  // ======================================================================

  function addOpenProjectButton() {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || byId('btn-open-project')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-open-project';
    btn.type = 'button';
    btn.className = 'topbar-btn';
    btn.title = 'Open project (Ctrl+O)';
    btn.setAttribute('aria-label', 'Open project');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span>Open</span>';
    btn.addEventListener('click', openProjectPicker);
    actions.insertBefore(btn, actions.firstChild);
  }

  // ======================================================================
  // SECTION: Export (canvas + MediaRecorder — real rendering)
  // ======================================================================

  const exportState = {
    running: false,
    canvas: null,
    ctx: null,
    recorder: null,
    stream: null,
    raf: 0,
    startAt: 0
  };

  function pickRecorderMimetype(preferredFormat) {
    if (!window.MediaRecorder) return null;
    const candidatesByFormat = {
      webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
      mov: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'],
      mp4: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
    };
    if (preferredFormat === 'webm' && !(window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported('video/webm'))) {
      return null;
    }
    const list = candidatesByFormat[preferredFormat] || candidatesByFormat.webm;
    for (const type of list) {
      if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(type)) return type;
    }
    // any-op fallbacks
    for (const type of ['video/webm', 'video/mp4']) {
      try {
        const probe = new MediaRecorder(new MediaStream(), { mimeType: type });
        probe.stop();
        return type;
      } catch (err) { /* not supported */ }
    }
    return null;
  }

  // Cache decoded image objects across export frames; creating Image() on every
  // frame prevents images from reliably becoming ready before the draw call.
  const exportImageCache = new Map();

  function drawSceneToCanvas(ctx, t, W, H) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const drawVisual = (clip, useVideoEl) => {
      if (!clip) return;
      const p = clip.props || {};
      let source = null, sw = 0, sh = 0;
      if (clip.type === 'video') {
        const asset = assetById(clip.assetId);
        const el2 = el.previewVideo;
        if (asset && el2 && el2.readyState >= 2 && el2.videoWidth) {
          source = el2; sw = el2.videoWidth; sh = el2.videoHeight;
        } else return;
      } else if (clip.type === 'image') {
        const asset = assetById(clip.assetId);
        if (!asset || asset.missing || !asset.url) return;
        let img = exportImageCache.get(asset.id);
        if (!img) {
          img = new Image();
          img.decoding = 'async';
          img.src = asset.url;
          exportImageCache.set(asset.id, img);
        }
        if (!img.complete || !img.naturalWidth) return;
        source = img; sw = img.naturalWidth; sh = img.naturalHeight;
      }
      if (!source) return;      // Keyframe-aware effective values for export rendering
      const ex = effectiveProp(clip, 'x', t) || 0;
      const ey = effectiveProp(clip, 'y', t) || 0;
      const esc = effectiveProp(clip, 'scale', t) || 100;
      const erot = effectiveProp(clip, 'rotation', t) || 0;
      const eop = effectiveProp(clip, 'opacity', t);
      const opacity = clamp((eop != null ? eop : 100) / 100, 0, 1) * fadeEnvelope(clip, t);
      ctx.save();
      ctx.globalAlpha = opacity;
      // fit and letterbox source into frame
      const scaleFit = Math.min(W / sw, H / sh) * clamp(esc / 100, 0.01, 10);
      const dw = sw * scaleFit;
      const dh = sh * scaleFit;
      const dx = (W - dw) / 2 + ((ex || 0) * 0.05 / 100) * W;
      const dy = (H - dh) / 2 + ((ey || 0) * 0.05 / 100) * H;
      ctx.translate(dx + dw / 2, dy + dh / 2);
      ctx.rotate((clamp(erot, -360, 360) * Math.PI) / 180);

      if (clip.type === 'video') {
        const filter = buildFilterCSS(p, clip, t);
        // canvas filter is supported in Chromium/Firefox for drawImage
        try { ctx.filter = filter || 'none'; } catch (err) { /* unsupported */ }
      }
      ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
      try { ctx.filter = 'none'; } catch (err) { /* noop */ }
      ctx.restore();
    };

    // Render the active visual clip from any existing video-family track.
    // The preview uses one media element, so the same resolved clip is drawn here.
    const videoClip = activeHumanClipAtBaseType('video', t);
    if (videoClip) {
      const track = state.tracks[videoClip.trackType];
      if (!track || (!track.hidden && track.exists)) drawVisual(videoClip, true);
    } else {
      const overlayVideoClip = activeHumanClipAtBaseType('overlay', t);
      if (overlayVideoClip && overlayVideoClip.type === 'video') drawVisual(overlayVideoClip, true);
    }

    // Composite every active image overlay, including secondary overlay tracks.
    for (const imageClip of state.clips) {
      if (imageClip.type !== 'image' || getTrackBaseType(imageClip.trackType) !== 'overlay') continue;
      const track = state.tracks[imageClip.trackType];
      if (!track || !track.exists || track.hidden) continue;
      if (t >= imageClip.start && t < imageClip.start + imageClip.duration) drawVisual(imageClip);
    }

    // Composite every active text clip instead of silently dropping all but the first.
    for (const textClip of state.clips) {
      if (textClip.type !== 'text' || getTrackBaseType(textClip.trackType) !== 'text') continue;
      const track = state.tracks[textClip.trackType];
      if (!track || !track.exists || track.hidden) continue;
      if (t < textClip.start || t >= textClip.start + textClip.duration) continue;
      const p = textClip.props || {};
      const ex = effectiveProp(textClip, 'x', t) || 0;
      const ey = effectiveProp(textClip, 'y', t) || 0;
      const esc = effectiveProp(textClip, 'scale', t) || 100;
      const eop = effectiveProp(textClip, 'opacity', t);
      const opacity = clamp((eop != null ? eop : 100) / 100, 0, 1) * fadeEnvelope(textClip, t);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = p.color || '#ffffff';
      const fontSize = clamp(p.fontSize || 48, 8, 400) * (H / 1080) * clamp(esc / 100, 0.05, 10);
      const exportFonts = { system: 'Arial, sans-serif', arial: 'Arial, Helvetica, sans-serif', georgia: 'Georgia, serif', impact: 'Impact, sans-serif', mono: '"Courier New", monospace', serif: 'Georgia, "Times New Roman", serif', rounded: '"Trebuchet MS", Arial, sans-serif', condensed: '"Arial Narrow", Impact, sans-serif' };
      ctx.font = `${p.fontFamily === 'impact' ? '900' : '700'} ${fontSize}px ${exportFonts[p.fontFamily] || FONT_STACK_RESOLVED || 'sans-serif'}`;
      ctx.textAlign = p.align === 'left' ? 'left' : p.align === 'right' ? 'right' : 'center';
      ctx.textBaseline = 'middle';
      const effect = p.textEffect || 'shadow';
      const tx = p.align === 'left' ? W * 0.08 + ex * 0.05 / 100 * W : p.align === 'right' ? W * 0.92 + ex * 0.05 / 100 * W : W / 2 + ex * 0.05 / 100 * W;
      const ty = H / 2 + ey * 0.05 / 100 * H;
      if (effect === 'label') {
        const metrics = ctx.measureText(p.content || '');
        const padX = fontSize * .22, padY = fontSize * .12;
        const width = metrics.width + padX * 2, height = fontSize * 1.35 + padY * 2;
        const left = p.align === 'left' ? tx - padX : p.align === 'right' ? tx - width + padX : tx - width / 2;
        ctx.fillStyle = 'rgba(0,0,0,.62)';
        ctx.fillRect(left, ty - height / 2, width, height);
        ctx.fillStyle = p.color || '#ffffff';
      }
      if (effect === 'outline') {
        ctx.lineWidth = Math.max(1, fontSize * .045);
        ctx.strokeStyle = 'rgba(0,0,0,.95)';
        ctx.strokeText(p.content || '', tx, ty);
      }
      if (effect === 'neon') {
        ctx.shadowColor = p.color || '#ffffff';
        ctx.shadowBlur = Math.max(8, fontSize * .28);
      } else if (effect === 'retro') {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,80,100,.8)';
        ctx.fillText(p.content || '', tx + fontSize * .035, ty + fontSize * .035);
        ctx.fillStyle = 'rgba(70,190,255,.7)';
        ctx.fillText(p.content || '', tx - fontSize * .025, ty - fontSize * .025);
        ctx.fillStyle = p.color || '#ffffff';
        ctx.shadowColor = 'transparent';
      } else if (effect === 'shadow') {
        ctx.shadowColor = 'rgba(0,0,0,.7)';
        ctx.shadowBlur = Math.max(4, fontSize * .18);
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
      ctx.fillText(p.content || '', tx, ty);
      ctx.restore();
    }

    // fade-to-black overlay across transitions (matches preview opacity behavior)
    const videoClipAt = activeHumanClipAt('video', t);
    if (videoClipAt && videoClipAt.props && videoClipAt.props.transition) {
      const tr = videoClipAt.props.transition;
      const dur = clamp(tr.duration || 0, 0, videoClipAt.duration);
      const local = t - videoClipAt.start;
      if (tr.type === 'fadetoblack' && dur > 0) {
        let dim = 0;
        if (local < dur) dim = 1 - local / dur;
        else if (local > videoClipAt.duration - dur) dim = 1 - (videoClipAt.duration - local) / dur;
        if (dim > 0) {
          ctx.fillStyle = `rgba(0,0,0,${clamp(dim, 0, 1)})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
    }
  }

  function openExportDialog() {
    if (state.timelineDuration <= 0) {
      showToast('Nothing to export — the timeline is empty', 'error');
      return;
    }
    if (!window.MediaRecorder) {
      showToast('This browser cannot record video exports (MediaRecorder not supported by this browser)', 'error', 6000);
      return;
    }
    if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      showToast('This browser cannot record video exports (canvas.captureStream is not supported)', 'error', 6000);
      return;
    }
    if (el.dialogExport) openDialog(el.dialogExport);
    else showToast('Export dialog is not available in this build', 'error', 6000);
  }

  function startExport() {
    if (exportState.running) return;
    const duration = state.timelineDuration;
    if (!state.clips.length || !Number.isFinite(duration) || duration <= 0) {
      showToast('Add a clip to the timeline before exporting', 'error', 5000);
      return;
    }
    const [rw, rh] = (el.exportResolution ? el.exportResolution.value : '1920x1080').split('x').map((n) => parseInt(n, 10));
    const W = clamp(rw || 1920, 16, 4096);
    const H = clamp(rh || 1080, 16, 4096);
    const fps = clamp(parseInt(el.exportFramerate ? el.exportFramerate.value : '30', 10) || 30, 1, 120);
    const quality = el.exportQuality ? el.exportQuality.value : 'medium';
    const bits = { high: 12e6, medium: 8e6, low: 4e6 }[quality] || 8e6;
    
    const requestedFormat = el.exportFormat ? el.exportFormat.value : 'webm';
    const mimeType = pickRecorderMimetype(requestedFormat);
    closeDialog(el.dialogExport);
    
    if (!mimeType) {
      showToast('No supported recording codec in this browser — export unavailable', 'error', 6000);
      return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') {
      showToast('Canvas capture is not supported — export unavailable', 'error', 6000);
      return;
    }
    const stream = canvas.captureStream(fps);
    
    exportState.running = true;
    exportState.canvas = canvas;
    exportImageCache.clear();
    
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bits });
    } catch (err) {
      exportState.running = false;
      stream.getTracks().forEach((track) => track.stop());
      exportState.stream = null;
      exportState.canvas = null;
      showToast(`Export failed to start: ${err.message || 'recorder error'}`, 'error', 6000);
      return;
    }
    exportState.recorder = recorder;
    exportState.stream = stream;
    
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    
    const prevTime = state.currentTime;
    const wasPlaying = state.playing;
    if (wasPlaying) pausePlayback();
    
    const progress = makeProgressToast('Exporting 0%');
    state.currentTime = 0;
    state.playing = true;
    updatePlayPauseButton();
    updateClipPlayheadPosition();
    syncPlaybackToPlayhead();
    
    recorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = String(state.projectName || 'export').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'export';
        a.href = url;
        a.download = `${safeName}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 8000);
        progress.finish(`Export finished (${(blob.size / 1e6).toFixed(1)} MB, ${ext.toUpperCase()})`);
      } catch (err) {
        progress.finish('Export failed while writing the file', 'error');
      }
      cleanupExport(prevTime, wasPlaying);
      state.currentTime = prevTime;
      setPlayheadTime(prevTime);
    };
    recorder.onerror = (e) => {
      progress.finish(`Export error: ${e.error && e.error.name ? e.error.name : 'recorder failure'}`, 'error');
      cleanupExport(prevTime, wasPlaying);
      state.currentTime = prevTime;
      setPlayheadTime(prevTime);
    };

    try {
      recorder.start(1000);
    } catch (err) {
      progress.finish('Export could not start recording', 'error');
      cleanupExport(prevTime, wasPlaying, false);
      setPlayheadTime(prevTime);
      showToast(`Export failed to start: ${err.message || 'recording error'}`, 'error', 6000);
      return;
    }

    // Real-time playback drives both the preview and the export canvas.
    let last = performance.now();
    const step = (now) => {
      if (!exportState.running) return;
      const dt = (now - last) / 1000;
      last = now;
      state.currentTime += dt;
      if (state.currentTime >= duration) {
        try { recorder.stop(); } catch (err) { cleanupExport(prevTime, wasPlaying); }
        return;
      }
      syncPlaybackToPlayhead();
      updateClipPlayheadPosition();
      drawSceneToCanvas(ctx, state.currentTime, W, H);
      progress.update(`Exporting ${Math.round((state.currentTime / duration) * 100)}% — renders the video/overlay tracks in real time`);
      exportState.raf = requestAnimationFrame(step);
    };
    drawSceneToCanvas(ctx, 0, W, H);
    exportState.raf = requestAnimationFrame(step);
    showToast('Export started — playback runs in real time; keep this tab visible', 'info', 5000);
  }

  function cleanupExport(prevTime, wasPlaying, showLimitNote = true) {
    exportState.running = false;
    if (exportState.raf) {
      cancelAnimationFrame(exportState.raf);
      exportState.raf = 0;
    }
    if (el.previewVideo && !el.previewVideo.paused) el.previewVideo.pause();
    if (el.previewAudio && !el.previewAudio.paused) el.previewAudio.pause();
    if (exportState.stream) {
      exportState.stream.getTracks().forEach((t) => t.stop());
      exportState.stream = null;
    }
    exportImageCache.clear();
    exportState.canvas = null;
    exportState.ctx = null;
    exportState.recorder = null;
    state.playing = false;
    updatePlayPauseButton();
    setPlayheadTime(prevTime);
    if (showLimitNote) {
      showToast('Note: export renders base video/image/text layers; audio mixing and multi-layer video overlays are not part of the export', 'info', 7000);
    }
  }

  // ======================================================================
  // SECTION: Hidden audio element for audio-only clips
  // ======================================================================

  function ensurePreviewAudio() {
    if (el.previewAudio) return;
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.style.display = 'none';
    audio.setAttribute('aria-hidden', 'true');
    (el.previewStage || document.body).appendChild(audio);
    el.previewAudio = audio;
  }

  // ======================================================================
  // SECTION: Media import wiring
  // ======================================================================

  function initImportControls() {
    if (el.fileInput) {
      el.fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        importFiles(files);
        el.fileInput.value = '';
      });
    }
    if (el.btnImportMedia && el.fileInput) {
      el.btnImportMedia.addEventListener('click', () => el.fileInput.click());
    }
  }

  // ======================================================================
  // SECTION: Media library search filter
  // ======================================================================

  function initSearchFilters() {
    document.querySelectorAll('.panel-search-input').forEach((input) => {
      input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        const panel = input.closest('.side-panel-content');
        const library = panel ? panel.querySelector('.media-library') : null;
        if (!panel || !library) return;

        const items = Array.from(library.querySelectorAll('.media-item'));
        let visibleCount = 0;
        items.forEach((item) => {
          const asset = assetById(item.dataset.mediaId);
          const matches = !!asset && asset.name.toLowerCase().includes(query);
          item.hidden = !matches;
          if (matches) visibleCount++;
        });

        const empty = library.querySelector('.media-empty');
        if (!empty) return;
        const hasAssets = items.length > 0;
        empty.hidden = hasAssets && (!query || visibleCount > 0);
        if (panel === el.panelMedia) {
          const title = empty.querySelector('.media-empty-title');
          const subtitle = empty.querySelector('.media-empty-subtitle');
          if (title) title.textContent = query && visibleCount === 0 ? 'No matching media' : 'No media imported';
          if (subtitle) subtitle.textContent = query && visibleCount === 0
            ? 'Try another file name or clear the search.'
            : 'Click Import media to add clips, images, or audio.';
        }
      });
    });
  }

  // ======================================================================
  // SECTION: Misc UI wiring
  // ======================================================================

  function initPanelTabs() {
    const tabs = document.querySelectorAll('.side-panel-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const list = Array.from(tabs);
          const i = list.indexOf(tab);
          const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
          activateTab(next);
          next.focus();
          e.preventDefault();
        }
      });
    });
  }

  function activateTab(tab) {
    document.querySelectorAll('.side-panel-tab').forEach((t) => {
      const active = t === tab;
      t.classList.toggle('side-panel-tab--active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.tabIndex = active ? 0 : -1;
    });
    const panel = document.getElementById(tab.dataset.panel);
    document.querySelectorAll('.side-panel-content').forEach((content) => {
      const active = content === panel;
      content.classList.toggle('side-panel-content--active', active);
      content.hidden = !active;
    });
  }

  function initTopbar() {
    if (el.btnNewProject) el.btnNewProject.addEventListener('click', newProjectFlow);
    if (el.btnUndo) el.btnUndo.addEventListener('click', undo);
    if (el.btnRedo) el.btnRedo.addEventListener('click', redo);
    if (el.btnOpenProject) el.btnOpenProject.addEventListener('click', openProjectPicker);
    if (el.btnSave) el.btnSave.addEventListener('click', saveProjectJSON);
    if (el.btnExport) el.btnExport.addEventListener('click', openExportDialog);
    if (el.projectName) {
      el.projectName.addEventListener('input', () => {
        const v = el.projectName.value.trim();
        state.projectName = v || 'Untitled Project';
        markDirty();
      });
    }
    if (el.btnPlayPause) el.btnPlayPause.addEventListener('click', togglePlayPause);
    if (el.btnMute) el.btnMute.addEventListener('click', toggleMute);
  }

  function initVideoEvents() {
    if (!el.previewVideo) return;
    // The master clock is the rAF loop; element events only guard end states.
    el.previewVideo.addEventListener('ended', () => {
      if (state.playing && !activeHumanClipAt('video', state.currentTime)) {
        // natural end of the active clip; the loop will pick the next one
      }
    });
    el.previewVideo.addEventListener('error', () => {
      const src = el.previewVideo.getAttribute('data-cutora-src');
      if (src) showToast('The selected media could not be played in this browser', 'error');
    });
  }

  const FONT_STACK_RESOLVED = (function () {
    try {
      const s = getComputedStyle(document.body);
      return s ? s.fontFamily || 'var(--font-stack)' : 'var(--font-stack)';
    } catch (err) {
      return 'var(--font-stack)';
    }
  })();

  // ======================================================================
  // SECTION: Init
  // ======================================================================


  // ======================================================================
  // SECTION: Appearance presets
  // ======================================================================
  const APPEARANCE_KEY = 'cutora-appearance-v1';
  const APPEARANCE_PRESETS = new Set(['midnight', 'ocean', 'emerald', 'sunset', 'ruby', 'amber', 'rose', 'arctic', 'cyber', 'mono']);

  function applyAppearanceTheme(theme, persist = true) {
    const selected = APPEARANCE_PRESETS.has(theme) ? theme : 'midnight';
    document.documentElement.dataset.cutoraTheme = selected;
    document.querySelectorAll('[data-theme-preset]').forEach((button) => {
      const active = button.dataset.themePreset === selected;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      const colors = { midnight:'#0b0d12', ocean:'#09151d', emerald:'#0b1712', sunset:'#1b1115', ruby:'#1a0d12', amber:'#19140b', rose:'#1a101b', arctic:'#10151d', cyber:'#100d1c', mono:'#111315' };
      themeColor.setAttribute('content', colors[selected] || colors.midnight);
    }
    if (persist) {
      try { window.localStorage.setItem(APPEARANCE_KEY, selected); } catch (err) { /* storage may be disabled */ }
    }
  }

  function initAppearance() {
    const openButton = document.getElementById('btn-appearance');
    const dialog = document.getElementById('dialog-appearance');
    const presets = document.getElementById('appearance-presets');
    const reset = document.getElementById('appearance-reset');
    if (openButton && dialog) openButton.addEventListener('click', () => openDialog(dialog));
    if (presets) {
      presets.addEventListener('click', (event) => {
        const button = event.target.closest('[data-theme-preset]');
        if (!button || !presets.contains(button)) return;
        applyAppearanceTheme(button.dataset.themePreset);
      });
    }
    if (reset) reset.addEventListener('click', () => applyAppearanceTheme('midnight'));
    let saved = 'midnight';
    try {
      const candidate = window.localStorage.getItem(APPEARANCE_KEY);
      if (APPEARANCE_PRESETS.has(candidate)) saved = candidate;
    } catch (err) { /* storage may be disabled */ }
    applyAppearanceTheme(saved, false);
  }

  function assertNoDuplicateListener() {
    try {
      const x = document.querySelectorAll('.editor-layout')[0];
      if (!x) return;
      x.addEventListener('click', function __dbgl1() { x.removeEventListener('click', __dbgl1); });
    } catch (err) {}
  }

  function cacheElements() {
    // Topbar
    el.topbar = byId('topbar');
    el.projectName = byId('project-name');
    el.btnNewProject = byId('btn-new-project');
    el.btnUndo = byId('btn-undo');
    el.btnRedo = byId('btn-redo');
    el.btnOpenProject = byId('btn-open-project');
    el.btnSave = byId('btn-save');
    el.btnExport = byId('btn-export');

    // Left panel
    el.leftPanel = byId('left-panel');
    el.panelMedia = byId('panel-media');
    el.panelAudio = byId('panel-audio');
    el.panelText = byId('panel-text');
    el.btnImportMedia = byId('btn-import-media');
    el.fileInput = byId('file-input');
    el.mediaLibrary = byId('media-library');
    el.mediaEmpty = byId('media-empty');

    // Preview
    el.previewContainer = byId('preview-container');
    el.previewStage = el.previewContainer ? el.previewContainer.querySelector('.preview-stage') : null;
    el.previewVideo = byId('preview-video');
    el.previewOverlay = byId('preview-overlay');
    el.previewEmpty = byId('preview-empty');
    el.btnPlayPause = byId('btn-play-pause');
    el.playIcon = byId('play-icon');
    el.pauseIcon = byId('pause-icon');
    el.playbackSeek = byId('playback-seek');
    el.currentTime = byId('current-time');
    el.totalDuration = byId('total-duration');
    el.volumeSlider = byId('volume-slider');
    el.btnMute = byId('btn-mute');
    el.volumeOnIcon = byId('volume-on-icon');
    el.volumeOffIcon = byId('volume-off-icon');
    el.btnFullscreen = byId('btn-fullscreen');
    el.fullscreenEnterIcon = byId('fullscreen-enter-icon');
    el.fullscreenExitIcon = byId('fullscreen-exit-icon');
    el.aspectRatioSelect = byId('aspect-ratio-select');

    // Timeline
    el.timeline = byId('timeline');
    el.timelineScroll = byId('timeline-scroll');
    el.timelineRuler = byId('timeline-ruler');
    el.timelineTracks = byId('timeline-tracks');
    el.timelinePlayhead = byId('timeline-playhead');
    el.timelineEmpty = byId('timeline-empty');
    el.timelineZoom = byId('timeline-zoom');
    el.timelineZoomIn = byId('timeline-zoom-in');
    el.timelineZoomOut = byId('timeline-zoom-out');
    el.timelineDuration = byId('timeline-duration');

    // Properties
    el.propertiesPanel = byId('properties-panel');
    el.propertiesEmpty = byId('properties-empty');
    el.propertiesTransform = byId('properties-transform');
    el.propertiesVideo = byId('properties-video');
    el.propertiesAudio = byId('properties-audio');
    el.propertiesText = byId('properties-text');
    el.btnContextClear = byId('btn-context-clear');

    el.propPositionX = byId('prop-position-x');
    el.propPositionY = byId('prop-position-y');
    el.propScale = byId('prop-scale');
    el.propRotation = byId('prop-rotation');
    el.propOpacity = byId('prop-opacity');
    el.propOpacitySlider = byId('prop-opacity-slider');

    el.adjBrightness = byId('adj-brightness');
    el.adjBrightnessValue = byId('adj-brightness-value');
    el.adjContrast = byId('adj-contrast');
    el.adjContrastValue = byId('adj-contrast-value');
    el.adjSaturation = byId('adj-saturation');
    el.adjSaturationValue = byId('adj-saturation-value');
    el.adjTemperature = byId('adj-temperature');
    el.adjTemperatureValue = byId('adj-temperature-value');
    el.adjGrayscale = byId('adj-grayscale');
    el.adjGrayscaleValue = byId('adj-grayscale-value');
    el.adjBlur = byId('adj-blur');
    el.adjBlurValue = byId('adj-blur-value');
    el.adjVolume = byId('adj-volume');
    el.adjVolumeValue = byId('adj-volume-value');
    el.adjFadeIn = byId('adj-fade-in');
    el.adjFadeOut = byId('adj-fade-out');
    el.adjSpeed = byId('adj-speed');
    el.adjSpeedValue = byId('adj-speed-value');
    el.adjTextContent = byId('adj-text-content');
    el.adjTextFontSize = byId('adj-text-font-size');
    el.adjTextColor = byId('adj-text-color');
    el.adjTextColorValue = byId('adj-text-color-value');
    el.adjTextAlign = byId('adj-text-align');
    el.adjTextFontFamily = byId('adj-text-font-family');
    el.adjTextEffect = byId('adj-text-effect');
    el.adjVideoLook = byId('adj-video-look');

    // Dialogs
    el.dialogNewProject = byId('dialog-new-project');
    el.dialogExport = byId('dialog-export');
    el.dialogShortcuts = byId('dialog-shortcuts');
    el.dialogNewProjectConfirm = byId('dialog-new-project-confirm');
    el.dialogExportStart = byId('dialog-export-start');
    el.dialogShortcutsClose = byId('dialog-shortcuts-close');
    el.exportResolution = byId('export-resolution');
    el.exportFramerate = byId('export-framerate');
    el.exportFormat = byId('export-format');
    el.exportQuality = byId('export-quality');

    // Notifications
    el.notifications = byId('notifications');
  }


  function initMobileNavigation() {
    const nav = document.getElementById('mobile-navigation');
    if (!nav) return;
    const items = Array.from(nav.querySelectorAll('[data-mobile-target]'));
    const applyView = (view) => {
      document.body.dataset.mobileView = view;
      items.forEach((item) => {
        const active = item.dataset.mobileTarget === view;
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
    };
    items.forEach((item) => {
      item.addEventListener('click', () => applyView(item.dataset.mobileTarget));
    });
    const mediaQuery = window.matchMedia('(max-width: 820px)');
    if (mediaQuery.matches) applyView('preview');
    const handleViewportChange = (event) => {
      if (event.matches) applyView('preview');
      else {
        delete document.body.dataset.mobileView;
        items.forEach((item) => {
          item.classList.remove('is-active');
          item.removeAttribute('aria-current');
        });
      }
    };
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleViewportChange);
    else if (mediaQuery.addListener) mediaQuery.addListener(handleViewportChange);
  }

  function init() {
    cacheElements();
    injectToastStyles();

    if (el.previewVideo) {
      el.previewVideo.muted = state.muted;
    }
    ensurePreviewAudio();
    buildPreviewFrame();

    cacheTrackTemplates();
    initPanelTabs();
    initMobileNavigation();
    initTopbar();
    initAppearance();
    initImportControls();
    initSearchFilters();
    addTextPanelControl();
    addOpenProjectButton();
    addTimelineEditButtons();

    initSeek();
    initRulerSeek();
    initZoomControls();
    initTrackControls();
    initVolumeControl();
    initFullscreen();
    initAspectRatio();
    initDialogs();
    initKeyboard();
    initVideoEvents();
    initDragDrop();
    initPropertiesPanel();
    // Do not call legacy property helpers that are not defined in this build.
    addTransitionControl();
    tryRecoverOnBoot();


    document.addEventListener('click', (e) => {
      // Click on empty lane background deselects (not while dragging)
      if (drag.active) return;
      const clipNode = e.target.closest ? e.target.closest('.clip') : null;
      const ln = e.target.closest ? e.target.closest('.timeline-track .track-header') : null;
      if (!clipNode && !ln && e.target.closest && e.target.closest('.timeline-scroll')
        && !e.target.closest('.timeline-ruler')) {
        const trackType = trackTypeFromElement(e.target);
        if (trackType) deselectAll();
      }
    });

    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(rafId);
      scheduleRecoverySave();
    });
    window.addEventListener('resize', debounce(() => renderAllClips(), 200));

    // Initial paint
    renderMediaLibrary();
    renderAllClips();
    refreshPropertiesPanel();
    updatePreviewEmptyState();
    updateUndoRedoButtons();
    updatePlayPauseButton();
    updateMuteButton();
    updateTimeDisplay();
    updateSeekSlider();
    syncTrackControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

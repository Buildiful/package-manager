/* Package Manager — local-first, no backend or package-detail telemetry. */
(() => {
  'use strict';

  const KEY = 'buildiful.packageManager.v1';
  const CURRENT_VERSION = 1;
  const STATUSES = new Set(['waiting', 'received', 'to_return', 'lost', 'returned', 'custom']);
  const RETENTIONS = new Set([0, 7, 30, 90, 365, -1]);
  const MAX_ENTRIES = 5000;
  const LENGTHS = {name: 160, sender: 160, carrier: 100, tracking: 160, trackingUrl: 700, notes: 1800, customStatus: 70};
  const byId = id => document.getElementById(id);
  const now = () => Date.now();
  let activeView = 'open';
  let searchTerm = '';
  let saveTimer = 0;
  let toastTimer = 0;
  let storeBroken = false;
  let audioContext = null;
  let backgroundTrack = null;
  let musicOn = false;
  const expandedDetails = new Set();

  function newId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `pkg-${now()}-${Math.random().toString(36).slice(2)}`;
  }

  function makeEntry() {
    return {id:newId(), name:'', sender:'', carrier:'', tracking:'', trackingUrl:'', eta:'', notes:'',
      status:'waiting', customStatus:'', customOpen:true, createdAt:now(), updatedAt:now(), completedAt:null};
  }

  const defaults = () => ({version:CURRENT_VERSION, entries:[makeEntry(), makeEntry()], settings:{retentionDays:30, soundEffects:true}});

  function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
  }
  function cleanTimestamp(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 8640000000000000 ? value : fallback;
  }
  function dateIsValid(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T12:00:00`);
    return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === value;
  }
  function completed(entry) {
    return entry.status === 'received' || entry.status === 'returned' || (entry.status === 'custom' && !entry.customOpen);
  }
  function isWaiting(entry) {return entry.status === 'waiting';}
  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const entry = makeEntry();
    if (typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{5,100}$/.test(raw.id)) entry.id = raw.id;
    for (const [key, limit] of Object.entries(LENGTHS)) entry[key] = cleanText(raw[key], limit);
    entry.eta = dateIsValid(raw.eta) ? raw.eta : '';
    entry.status = STATUSES.has(raw.status) ? raw.status : 'waiting';
    entry.customOpen = raw.customOpen !== false;
    entry.createdAt = cleanTimestamp(raw.createdAt, now());
    entry.updatedAt = cleanTimestamp(raw.updatedAt, entry.createdAt);
    entry.completedAt = completed(entry) ? cleanTimestamp(raw.completedAt, entry.updatedAt) : null;
    return entry;
  }
  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries) || raw.entries.length > MAX_ENTRIES || raw.version !== CURRENT_VERSION) throw new Error('Invalid backup format');
    const ids = new Set();
    const entries = raw.entries.map(normalizeEntry);
    if (entries.some(v => !v)) throw new Error('Invalid package data');
    entries.forEach(entry => {if (ids.has(entry.id)) entry.id = newId(); ids.add(entry.id);});
    const settingRaw = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    return {version:CURRENT_VERSION, entries, settings:{retentionDays:RETENTIONS.has(settingRaw.retentionDays) ? settingRaw.retentionDays : 30, soundEffects:settingRaw.soundEffects !== false}};
  }
  function readState() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null) return normalizeState(JSON.parse(saved));
    } catch (error) {
      console.warn('Package Manager could not read saved data:', error);
      storeBroken = true;
    }
    return defaults();
  }
  let state = readState();

  function storageWarning() { byId('storageWarning').hidden = !storeBroken; }
  function persist() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storeBroken = false;
    } catch (error) {
      console.warn('Package Manager could not save:', error);
      storeBroken = true;
    }
    storageWarning();
  }
  function saveSoon() {window.clearTimeout(saveTimer); saveTimer = window.setTimeout(persist, 350);}
  function applyRetention() {
    const days = state.settings.retentionDays;
    if (days < 0) return 0;
    const previous = state.entries.length;
    const instant = now();
    state.entries = state.entries.filter(entry => !completed(entry) || (days !== 0 && instant - (entry.completedAt || entry.updatedAt || instant) < days * 86400000));
    return previous - state.entries.length;
  }
  function track(eventName) {window.BuildifulAnalytics?.track(eventName);}
  function showToast(message) {
    const toast = byId('toast');
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  function playFeedback(kind) {
    if (!state.settings.soundEffects) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!audioContext) audioContext = new Context();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const at = audioContext.currentTime + .006;
      const notes = kind === 'add' ? [[523,.0,.08],[659,.085,.1]]
        : kind === 'remove' ? [[440,0,.075],[330,.08,.105]]
        : kind === 'done' ? [[523,0,.07],[784,.09,.12]]
        : [[587,0,.09]];
      notes.forEach(([freq,offset,duration]) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(.0001, at+offset);
        gain.gain.exponentialRampToValueAtTime(.045, at+offset+.013);
        gain.gain.exponentialRampToValueAtTime(.0001, at+offset+duration);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(at+offset); osc.stop(at+offset+duration+.02);
      });
    } catch (_) {/* Audio is optional and must never interfere with package editing. */}
  }

  function updateMusicButton() {
    byId('musicToggle').setAttribute('aria-pressed', String(musicOn));
    byId('musicToggle').setAttribute('aria-label', `Turn background music ${musicOn ? 'off' : 'on'}`);
    byId('musicLabel').textContent = musicOn ? 'Music on' : 'Music off';
    byId('musicIcon').textContent = musicOn ? '♫' : '♪';
  }
  async function toggleMusic() {
    if (musicOn) {
      backgroundTrack?.pause();
      musicOn = false;
      updateMusicButton();
      track('music_toggled');
      return;
    }
    if (!backgroundTrack) {
      backgroundTrack = new Audio('./music/parcel-route.mp3');
      backgroundTrack.loop = true;
      backgroundTrack.preload = 'none';
      backgroundTrack.volume = .4;
      backgroundTrack.addEventListener('error', () => {
        musicOn = false; updateMusicButton(); showToast('Music is unavailable.');
      });
    }
    try {
      await backgroundTrack.play();
      // The music is cached only after the visitor opts in to playing it.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => registration.active?.postMessage({type:'CACHE_MUSIC'})).catch(() => {});
      }
      musicOn = true;
      updateMusicButton();
      track('music_toggled');
    } catch (_) {
      musicOn = false;
      updateMusicButton();
      showToast('Tap again to enable music.');
    }
  }

  function statusName(entry) {
    switch (entry.status) {
      case 'waiting': return 'Waiting for delivery';
      case 'received': return 'Received';
      case 'to_return': return 'To be returned';
      case 'lost': return 'Lost · action needed';
      case 'returned': return 'Returned';
      default: return entry.customStatus.trim() || 'Custom status';
    }
  }
  function etaBadge(entry) {
    if (!entry.eta || completed(entry) || !dateIsValid(entry.eta)) return null;
    const [y,m,d] = entry.eta.split('-').map(Number);
    const day = Math.round((Date.UTC(y,m-1,d) - Date.UTC(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()))/86400000);
    if (day < 0) return {label:'Overdue', cls:''};
    if (day === 0) return {label:'Due today', cls:'today'};
    if (day === 1) return {label:'Due tomorrow', cls:'today'};
    return null;
  }
  function safeTrackingLink(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed.href : null;
    } catch (_) {return null;}
  }
  function hasData(entry) {
    return ['name','sender','carrier','tracking','trackingUrl','eta','notes','customStatus'].some(key => entry[key].trim()) || entry.status !== 'waiting';
  }
  function matchesSearch(entry) {
    if (!searchTerm) return true;
    return [entry.name,entry.sender,entry.carrier,entry.tracking,entry.notes,entry.customStatus,entry.eta,statusName(entry)]
      .some(value => value.toLocaleLowerCase().includes(searchTerm));
  }
  function visibleEntries() {
    let list = state.entries.filter(entry => (activeView === 'all' || (activeView === 'history' ? completed(entry) : !completed(entry))) && matchesSearch(entry));
    return list.sort((a,b) => {
      const aClosed = completed(a), bClosed = completed(b);
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      if (aClosed) return (b.completedAt || 0) - (a.completedAt || 0);
      if (!!a.eta !== !!b.eta) return a.eta ? -1 : 1;
      if (a.eta && b.eta && a.eta !== b.eta) return a.eta.localeCompare(b.eta);
      return a.createdAt - b.createdAt;
    });
  }

  function renderStats() {
    const open = state.entries.filter(e => !completed(e));
    const history = state.entries.length - open.length;
    const openWithDetails = open.filter(hasData);
    byId('waitingCount').textContent = String(openWithDetails.filter(isWaiting).length);
    byId('attentionCount').textContent = String(openWithDetails.filter(e => !isWaiting(e)).length);
    byId('completedCount').textContent = String(history);
    byId('tabOpenCount').textContent = String(openWithDetails.length);
    byId('tabHistoryCount').textContent = String(history);
    document.querySelectorAll('.tab').forEach(tab => {
      const selected = tab.dataset.view === activeView;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
  }
  function createCard(entry) {
    const card = document.createElement('article');
    card.className = `package-card ${completed(entry) ? 'completed' : (isWaiting(entry) ? '' : 'action')}`;
    card.dataset.id = entry.id;
    card.innerHTML = `
      <div class="card-top"><div class="status-indicator"></div><div class="card-top-right"><span class="date-badge" hidden></span><button type="button" class="remove-button" aria-label="Remove package">Remove ×</button></div></div>
      <div class="fields-grid">
        <label class="field"><span class="field-label">Package / item</span><input data-field="name" maxlength="160" placeholder="What’s arriving?" autocomplete="off"></label>
        <label class="field"><span class="field-label">From</span><input data-field="sender" maxlength="160" placeholder="Store or sender" autocomplete="off"></label>
        <label class="field"><span class="field-label">Expected</span><input data-field="eta" type="date"></label>
        <label class="field"><span class="field-label">Status</span><select data-field="status">
          <option value="waiting">Waiting for delivery</option><option value="received">Received</option><option value="to_return">To be returned</option>
          <option value="lost">Lost · action needed</option><option value="returned">Returned</option><option value="custom">Custom…</option>
        </select></label>
      </div>
      <div class="custom-fields" hidden>
        <label class="field"><span class="field-label">Custom status</span><input data-field="customStatus" maxlength="70" placeholder="E.g. Held at customs" autocomplete="off"></label>
        <label class="field short"><span class="field-label">Count as</span><select data-field="customOpen"><option value="open">Open / action needed</option><option value="completed">Completed</option></select></label>
      </div>
      <details class="extra-details"><summary>More details</summary><div class="details-fields">
        <label class="field"><span class="field-label">Carrier</span><input data-field="carrier" maxlength="100" placeholder="E.g. USPS" autocomplete="off"></label>
        <label class="field"><span class="field-label">Tracking number</span><input data-field="tracking" maxlength="160" placeholder="Optional" autocomplete="off"></label>
        <label class="field"><span class="field-label">Tracking URL (https)</span><input data-field="trackingUrl" maxlength="700" inputmode="url" placeholder="https://…" autocomplete="off"><a class="tracking-link" target="_blank" rel="noopener noreferrer" hidden>Open tracking page</a></label>
        <label class="field" style="grid-column:1/-1"><span class="field-label">Notes</span><textarea data-field="notes" maxlength="1800" rows="2" placeholder="Optional"></textarea></label>
      </div></details>`;
    card.querySelector('.status-indicator').textContent = statusName(entry);
    const badge = etaBadge(entry);
    if (badge) {
      const element = card.querySelector('.date-badge');
      element.hidden = false; element.classList.toggle('today', badge.cls === 'today'); element.textContent = badge.label;
    }
    card.querySelectorAll('[data-field]').forEach(element => {
      const field = element.dataset.field;
      element.value = field === 'customOpen' ? (entry.customOpen ? 'open' : 'completed') : entry[field];
      if (element.matches('input:not([type="date"]),textarea')) element.addEventListener('input', () => modifyField(entry.id, field, element.value, false));
      element.addEventListener('change', () => modifyField(entry.id, field, element.value, true));
    });
    card.querySelector('.custom-fields').hidden = entry.status !== 'custom';
    const details = card.querySelector('.extra-details');
    details.open = expandedDetails.has(entry.id);
    details.addEventListener('toggle', () => {if (details.open) expandedDetails.add(entry.id); else expandedDetails.delete(entry.id);});
    const link = card.querySelector('.tracking-link');
    const href = safeTrackingLink(entry.trackingUrl);
    if (href) {link.hidden = false; link.href = href;}
    card.querySelector('.remove-button').addEventListener('click', () => removeEntry(entry.id));
    return card;
  }
  function render() {
    renderStats();
    const entries = visibleEntries();
    byId('packageList').replaceChildren(...entries.map(createCard));
    const empty = !entries.length;
    byId('emptyState').hidden = !empty;
    byId('packageList').hidden = empty;
    if (empty) byId('emptyMessage').textContent = searchTerm ? 'No packages match your search.' : (activeView === 'history' ? 'No completed packages.' : 'No packages here yet.');
  }

  function modifyField(id, field, value, shouldRender) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    const wasComplete = completed(entry);
    if (field === 'customOpen') entry.customOpen = value !== 'completed';
    else if (field === 'status') {
      if (!STATUSES.has(value)) return;
      if (entry.status === value) return;
      entry.status = value;
      if (value === 'custom') entry.customOpen = true;
    } else if (field === 'eta') entry.eta = dateIsValid(value) ? value : '';
    else if (Object.hasOwn(LENGTHS, field)) entry[field] = cleanText(value, LENGTHS[field]);
    else return;
    entry.updatedAt = now();
    const nowComplete = completed(entry);
    if (nowComplete && !wasComplete) entry.completedAt = now();
    if (!nowComplete) entry.completedAt = null;
    if (shouldRender) {
      if (field === 'status' || field === 'customOpen') {
        track('package_status_changed');
        playFeedback(nowComplete ? 'done' : 'change');
      }
      const deleted = applyRetention();
      persist();
      render();
      if (deleted && state.settings.retentionDays === 0) showToast('Completed package removed (no history).');
    } else saveSoon();
  }
  function addEntry() {
    if (state.entries.length >= MAX_ENTRIES) {showToast('Package limit reached.'); return;}
    const entry = makeEntry();
    state.entries.push(entry);
    activeView = 'open';
    searchTerm = '';
    byId('searchInput').value = '';
    persist();
    render();
    const card = [...byId('packageList').children].find(el => el.dataset.id === entry.id);
    card?.querySelector('[data-field="name"]')?.focus();
    card?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    playFeedback('add');
    track('package_added');
  }
  function removeEntry(id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    if (hasData(entry) && !window.confirm('Remove this package? This cannot be undone.')) return;
    state.entries = state.entries.filter(e => e.id !== id);
    expandedDetails.delete(id);
    persist(); render();
    showToast('Package removed.');
    playFeedback('remove');
    track('package_removed');
  }
  function setView(view) {
    if (!['open','history','all'].includes(view)) return;
    activeView = view;
    render();
  }

  function exportBackup() {
    persist();
    try {
      const blob = new Blob([JSON.stringify({...state, exportedAt:new Date().toISOString()}, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `package-manager-backup-${new Date().toLocaleDateString('en-CA')}.json`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 6000);
      showToast('Backup exported.');
      track('backup_exported');
    } catch (_) {showToast('Could not export backup.');}
  }
  async function importBackup(file) {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {showToast('Backup file is too large.'); return;}
    try {
      const parsed = JSON.parse(await file.text());
      const imported = normalizeState(parsed);
      if (!window.confirm(`Replace the current list with ${imported.entries.length} packages from this backup?`)) return;
      state = imported;
      applyRetention();
      activeView = 'open'; searchTerm = ''; byId('searchInput').value = '';
      byId('retentionSelect').value = String(state.settings.retentionDays);
      byId('soundEffects').checked = state.settings.soundEffects;
      expandedDetails.clear();
      persist(); render();
      showToast(`Imported ${state.entries.length} packages.`);
      playFeedback('done');
      track('backup_imported');
    } catch (error) {
      console.warn('Package Manager import failed:', error);
      showToast('Invalid or unsupported backup file.');
    } finally {byId('backupFile').value = '';}
  }
  function updateRetention() {
    const chosen = Number(byId('retentionSelect').value);
    if (!RETENTIONS.has(chosen)) return;
    if (chosen === 0 && state.entries.some(completed) && !window.confirm('Delete all completed packages now, and remove future completed packages immediately?')) {
      byId('retentionSelect').value = String(state.settings.retentionDays);
      return;
    }
    if (state.settings.retentionDays === chosen) return;
    state.settings.retentionDays = chosen;
    const count = applyRetention();
    persist(); render();
    showToast(count ? `Removed ${count} expired package${count === 1 ? '' : 's'}.` : 'Retention updated.');
    track('retention_changed');
  }
  function clearAll() {
    if (!state.entries.length) {showToast('There are no packages to delete.'); return;}
    if (!window.confirm('Delete every package, including open packages? This cannot be undone.')) return;
    state.entries = [];
    expandedDetails.clear();
    activeView = 'open'; searchTerm = ''; byId('searchInput').value = '';
    persist(); render();
    showToast('All packages deleted.');
    playFeedback('remove');
  }

  function init() {
    const cleaned = applyRetention();
    persist();
    render();
    if (cleaned) showToast(`Removed ${cleaned} expired package${cleaned === 1 ? '' : 's'}.`);
    byId('addPackage').addEventListener('click', addEntry);
    byId('musicToggle').addEventListener('click', toggleMusic);
    byId('settingsOpen').addEventListener('click', () => {byId('retentionSelect').value = String(state.settings.retentionDays);byId('soundEffects').checked = state.settings.soundEffects;byId('settingsDialog').showModal();});
    byId('settingsClose').addEventListener('click', () => byId('settingsDialog').close());
    byId('settingsDialog').addEventListener('click', event => {if (event.target === byId('settingsDialog')) byId('settingsDialog').close();});
    byId('retentionSelect').addEventListener('change', updateRetention);
    byId('soundEffects').addEventListener('change', event => {state.settings.soundEffects = event.target.checked;persist();if (state.settings.soundEffects) playFeedback('change');});
    byId('exportBackup').addEventListener('click', exportBackup);
    byId('importBackup').addEventListener('click', () => byId('backupFile').click());
    byId('backupFile').addEventListener('change', event => importBackup(event.target.files?.[0]));
    byId('clearAll').addEventListener('click', clearAll);
    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));
    byId('searchInput').addEventListener('input', event => {searchTerm = event.target.value.trim().toLocaleLowerCase();render();});
    window.addEventListener('pagehide', () => {if (saveTimer) persist();});
    window.addEventListener('storage', event => {
      if (event.key !== KEY || !event.newValue) return;
      try {state = normalizeState(JSON.parse(event.newValue));if (saveTimer) window.clearTimeout(saveTimer);saveTimer=0;render();showToast('Packages updated in another tab.');} catch (_) {/* Ignore invalid external changes. */}
    });
    document.addEventListener('visibilitychange', () => {if (!document.hidden) {const removed=applyRetention();if (removed){persist();render();}}});
    window.setInterval(() => {const removed=applyRetention();if (removed){persist();render();}}, 60*60*1000);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  }
  init();
})();

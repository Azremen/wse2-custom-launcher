'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_REMOTE_URL = 'http://gokberkalkis.com:8080/';
const REMOTE_URL_KEY     = 'remoteUrl';
const LOCALE_KEY         = 'locale';
const THEME_KEY          = 'theme';
const DEFAULT_LOCALE     = 'en';

// ── State ────────────────────────────────────────────────────────────────────
let REMOTE_URL = localStorage.getItem(REMOTE_URL_KEY) || DEFAULT_REMOTE_URL;
let localModules = [];
let remoteModules = [];
let activeModule = null;
let currentLocale = DEFAULT_LOCALE;
let translations = {};

// ── Download Queue ────────────────────────────────────────────────
let downloadQueue = [];
let isDownloading = false;

// Config window state
let _configData = null;

// Cached app version (fetched once, reused by applyTranslations)
let appVersion = null;

// Cached progress bar DOM elements (set on first use)
let $progressBar = null;
let $downloadStatus = null;

function getProgressBar() {
    if (!$progressBar) $progressBar = $('.progress-bar');
    return $progressBar;
}

function getDownloadStatus() {
    if (!$downloadStatus || $downloadStatus.length === 0) {
        $downloadStatus = $('#download-status');
        if ($downloadStatus.length === 0) {
            $downloadStatus = $('<div id="download-status" class="text-center small text-muted mt-1"></div>');
            getProgressBar().parent().after($downloadStatus);
        }
    }
    return $downloadStatus;
}

// ── Utilities ────────────────────────────────────────────────
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function showDialog(message, { isConfirm = false } = {}) {
    return new Promise(resolve => {
        let settled = false;
        const settle = val => { if (!settled) { settled = true; resolve(val); } };

        const el = document.getElementById('appModal');
        if (!el) {
            // Fallback for windows without appModal (e.g. config window)
            if (isConfirm) {
                settle(window.confirm(message));
            } else {
                window.alert(message);
                settle(undefined);
            }
            return;
        }
        const bsModal = bootstrap.Modal.getOrCreateInstance(el);

        $('#appModalBody').text(message);
        $('#appModalOk').text(t('ui.ok')).off('click').on('click', () => { bsModal.hide(); settle(true); });

        if (isConfirm) {
            $('#appModalCancel').text(t('ui.cancel')).removeClass('d-none')
                .off('click').on('click', () => { bsModal.hide(); settle(false); });
        } else {
            $('#appModalCancel').addClass('d-none');
        }

        el.addEventListener('hidden.bs.modal', () => settle(isConfirm ? false : undefined), { once: true });
        bsModal.show();
    });
}

const showAlert   = msg => showDialog(msg, { isConfirm: false });
const showConfirm = msg => showDialog(msg, { isConfirm: true });

function syncThemeText() {
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    $('#theme-source').text(isDark ? t('ui.dark') : t('ui.light'));
}

async function enqueueDownload(url, meta) {
    downloadQueue.push({ url, meta });
    await processDownloadQueue();
}

async function processDownloadQueue() {
    if (isDownloading || downloadQueue.length === 0) return;
    isDownloading = true;
    const next = downloadQueue.shift();
    $('#btn-cancel-download').removeClass('d-none');
    try {
        await window.api.modules.download(next.url, next.meta);
    } catch (err) {
        console.error('[Download] Failed to start download:', err);
        isDownloading = false;
        $('#btn-cancel-download').addClass('d-none');
        await showAlert(t('msg_download_failed') + String(err));
        // Continue with next item in queue
        processDownloadQueue();
    }
}

// ── Renderer-side console overrides ──────────────────────────────────────────
// These run immediately so errors before initMainWindow are also captured.
let unreadLogCount = 0;

function appendLogEntry(level, message, time) {
    const entriesEl = document.getElementById('log-entries');
    if (!entriesEl) return;
    const ts = time ? new Date(time).toLocaleTimeString() : new Date().toLocaleTimeString();
    const cssClass = level === 'ERROR' ? 'log-error' : 'log-warn';
    const label = level === 'ERROR' ? '\u2716' : '\u26a0';
    const el = document.createElement('div');
    el.className = `log-entry ${cssClass}`;
    el.textContent = `[${ts}] ${label} ${message}`;
    entriesEl.appendChild(el);
    entriesEl.scrollTop = entriesEl.scrollHeight;
}

function bumpLogBadge() {
    unreadLogCount++;
    $('#btn-log-panel').removeClass('d-none');
    $('#log-badge').removeClass('d-none').text(unreadLogCount > 99 ? '99+' : unreadLogCount);
}

const _rWarn  = console.warn.bind(console);
const _rError = console.error.bind(console);
console.warn = (...args) => {
    _rWarn(...args);
    const msg = args.map(a => (a && typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    appendLogEntry('WARN', msg, null);
    if (!document.getElementById('logPanel')?.classList.contains('show')) bumpLogBadge();
};
console.error = (...args) => {
    _rError(...args);
    const msg = args.map(a => (a && typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    appendLogEntry('ERROR', msg, null);
    if (!document.getElementById('logPanel')?.classList.contains('show')) bumpLogBadge();
};

$(document).ready(async () => {
    // Offline Detection
    function updateOnlineStatus() {
        if (navigator.onLine) {
            $('#offline-warning').addClass('d-none');
        } else {
            $('#offline-warning').removeClass('d-none');
        }

        // Refresh buttons if a module is selected to reflect online status
        if (activeModule) {
            updateModuleButtons(activeModule);
        }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // Load Locale
    try {
        const storedLocale = localStorage.getItem(LOCALE_KEY);
        if (storedLocale) {
            currentLocale = storedLocale;
        } else {
            const userLang = navigator.language || navigator.userLanguage;
            if (userLang.startsWith('tr')) currentLocale = 'tr';
            else if (userLang.startsWith('ru')) currentLocale = 'ru';
            else currentLocale = 'en'; // Strict default
        }

        // Wait for translation load
        await loadTranslations(currentLocale);

        // Set dropdown value
        if ($('#locale-select').length > 0) {
            $('#locale-select').val(currentLocale);

            // Bind Change Event
            $('#locale-select').on('change', async function () {
                const newLang = $(this).val();
                if (newLang !== currentLocale) {
                    currentLocale = newLang;
                    localStorage.setItem(LOCALE_KEY, newLang);
                    document.documentElement.lang = newLang;
                    await loadTranslations(currentLocale);
                    // Refresh Main Window Logic if active to re-render buttons
                    renderList();
                    if (activeModule) {
                        updateModuleButtons(activeModule);
                    }

                    syncThemeText();
                }
            });
        }

    } catch (e) {
        console.warn("Translation load failed, fallback to en", e);
        await loadTranslations('en');
    }

    // Determine if we are in Main Window or Config Window
    if ($('#config-sidebar').length > 0) {
        await initConfigWindow();

        // Listen to storage changes to sync locale if changed in main window
        if (window.api && typeof window.addEventListener === 'function') {
            window.addEventListener('storage', async (e) => {
                if (e.key === LOCALE_KEY) {
                    currentLocale = e.newValue || 'en';
                    await loadTranslations(currentLocale);
                    // Refresh Config Form with new locale
                    // We need the data again, or just re-render with stored schema
                    if (typeof renderConfigForm === 'function' && _configData) {
                        applyTranslations();

                        // Preserve current user input before re-rendering
                        const currentValues = collectFormData(_configData.schema);
                        _configData.values = currentValues;

                        renderConfigForm(_configData.schema, currentValues);
                    }
                } else if (e.key === THEME_KEY) {
                    // Sync theme change
                    const newTheme = e.newValue || 'light';
                    document.documentElement.setAttribute('data-bs-theme', newTheme);
                    syncThemeText();
                }
            });
        }
    } else {
        await initMainWindow();
    }

    initTheme();

    // Theme toggle is handled in initMainWindow; config window has no toggle.
});

async function loadTranslations(lang) {
    try {
        const res = await fetch(`locales/${lang}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        translations = await res.json();
    } catch (e) {
        console.error(`Failed to load locale ${lang}`, e);
        if (lang !== 'en') {
            try {
                const res = await fetch('locales/en.json');
                if (res.ok) translations = await res.json();
                else translations = {};
            } catch { translations = {}; }
        } else {
            translations = {};
        }
    }
    applyTranslations();
}

function t(key, params = {}) {
    // Fast path: key with no dot notation
    let value = translations[key];
    // Slow path: dot notation (e.g. "ui.install")
    if (value === undefined && key.includes('.')) {
        value = key.split('.').reduce((obj, part) => obj && obj[part], translations);
    }
    let str = (value !== undefined && value !== null) ? String(value) : key;
    for (const prop in params) {
        str = str.replaceAll(`{${prop}}`, params[prop]);
    }
    return str;
}

function applyTranslations() {
    // Text and Placeholder — native querySelectorAll is faster than jQuery each
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const text = t(key);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else {
            el.textContent = text;
        }
    });

    // Tooltips / Titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });

    // Re-render version line using cached value (no IPC round-trip)
    if (appVersion) {
        const el = document.getElementById('version');
        if (el) {
            el.textContent = '';
            const strong = document.createElement('strong');
            strong.textContent = t('heading.version');
            el.appendChild(strong);
            el.appendChild(document.createTextNode(': ' + appVersion));
        }
    }

    syncThemeText();
}


function initTheme() {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme) {
        document.documentElement.setAttribute('data-bs-theme', storedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-bs-theme', 'light');
    }
    syncThemeText();
}

// ── Main Window Logic ───────────────────────────────────────────────────────

async function initMainWindow() {
    // 1. Setup Data
    await refreshModuleList();

    // 2. UI Event Bindings
    $('#toggle-dark-mode').on('click', async () => {
        const currentTheme = document.documentElement.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-bs-theme', newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
        syncThemeText();

        // Notify main process if needed (though with BS5 client-side is often enough unless we persist it)
        await window.api.darkMode.toggle();
    });

    $('#btn-install').on('click', () => {
        if (activeModule && activeModule.url) {
            startDownload(activeModule.url);
        }
    });

    $('#btn-cancel-download').on('click', async () => {
        await window.api.launcher.cancelDownload();
        downloadQueue = [];
        isDownloading = false;
        $('#btn-cancel-download').addClass('d-none');
        updateProgressBar(0);
    });

    $('#btn-remove').on('click', async () => {
        if (activeModule && activeModule.path) {
            if (await showConfirm(t("msg_confirm_remove", { name: activeModule.name }))) {
                await window.api.modules.remove(activeModule.path);
                activeModule = null;
                $('#module-img').addClass('d-none').attr('src', '');
                $('#module-info').addClass('d-none');
                $('#btn-remove, #btn-configure, #play-btn').addClass('disabled').prop('disabled', true);
                $('#btn-install').text(t('ui.install')).prop('disabled', true)
                    .removeClass('btn-success btn-secondary').addClass('btn-primary');
                await refreshModuleList();
            }
        }
    });

    $('#btn-configure').on('click', () => {
        if (activeModule && activeModule.path) {
            window.api.config.open(activeModule.path);
        }
    });

    $('#play-btn').on('click', async () => {
        if (activeModule && activeModule.isInstalled) {
            window.api.launcher.launch(activeModule.name);
        } else {
            await showAlert(t("ui.not_installed"));
        }
    });

    $('#settings').on('click', () => {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('settingsModal')).show();
    });

    // Wine settings — only relevant on non-Windows
    (async () => {
        const isWindows = window.api.wine.isWindows();
        if (!isWindows) {
            $('#wine-settings-section').removeClass('d-none');
            const wineSettings = await window.api.wine.getSettings();
            $('#wine-path-input').val(wineSettings.winePath || 'wine');
            $('#wine-prefix-input').val(wineSettings.winePrefix || '');
        }
    })();

    $('#btn-browse-wine').on('click', async () => {
        const selected = await window.api.wine.browse();
        if (selected) $('#wine-path-input').val(selected);
    });

    $('#btn-save-wine').on('click', async () => {
        const winePath = $('#wine-path-input').val().trim();
        const winePrefix = $('#wine-prefix-input').val().trim();

        if (!winePath) {
            await showAlert(t('ui.wine.path_required') || 'Wine executable path is required.');
            return;
        }

        const settings = {
            winePath: winePath,
            winePrefix: winePrefix,
        };
        const ok = await window.api.wine.setSettings(settings);
        if (ok) {
            $('#btn-save-wine').removeClass('btn-primary').addClass('btn-success');
            setTimeout(() => $('#btn-save-wine').removeClass('btn-success').addClass('btn-primary'), 1500);
        }
    });

    $('#btn-open-folder').on('click', () => {
        window.api.launcher.openFolder();
    });

    $('#btn-check-updates').on('click', async () => {
        const $btn = $('#btn-check-updates');
        const $feedback = $('#update-check-feedback');
        $btn.prop('disabled', true);
        $btn.find('i').addClass('fa-spin');
        $feedback.removeClass('d-none text-success text-danger').addClass('text-muted').text(t('ui.checking_updates'));
        const result = await window.api.launcher.checkForUpdates();
        $btn.prop('disabled', false);
        $btn.find('i').removeClass('fa-spin');
        if (result?.error) {
            $feedback.removeClass('text-muted text-success').addClass('text-danger').text(t('ui.update_check_error'));
        } else if (!result?.hasUpdate) {
            $feedback.removeClass('text-muted text-danger').addClass('text-success').text(t('ui.up_to_date'));
        }
        // If hasUpdate, the onUpdateAvailable event will fire automatically
    });

    // Server URL
    $('#server-url-input').val(REMOTE_URL);
    $('#btn-save-server-url').on('click', () => {
        const url = $('#server-url-input').val().trim();
        const $feedback = $('#server-url-feedback');
        if (!url) return;

        // Ensure trailing slash
        const normalized = url.endsWith('/') ? url : url + '/';

        const isInsecure = normalized.startsWith('http://');

        REMOTE_URL = normalized;
        localStorage.setItem(REMOTE_URL_KEY, normalized);
        $('#server-url-input').val(normalized);

        if (isInsecure) {
            $feedback.removeClass('d-none text-success text-danger').addClass('text-warning')
                .text('⚠ Insecure URL (http). Consider using https.');
            setTimeout(() => $feedback.addClass('d-none'), 5000);
        } else {
            $feedback.removeClass('d-none text-danger text-warning').addClass('text-success')
                .text(t('ui.server_url_saved'));
            setTimeout(() => $feedback.addClass('d-none'), 2000);
        }

        refreshModuleList();
    });

    // 3. Event Listeners
    window.api.events.onDownloadProgress((perc) => {
        updateProgressBar(perc);
    });

    window.api.events.onDownloadComplete(async () => {
        isDownloading = false;
        $('#btn-cancel-download').addClass('d-none');
        getProgressBar().addClass('bg-success').text(t('ui.done'));
        getProgressBar().removeClass('progress-bar-striped progress-bar-animated');
        getDownloadStatus().text(t('msg_download_success'));
        await delay(1000);
        updateProgressBar(0);
        await showAlert(t('msg_download_complete'));
        await refreshModuleList();
        await processDownloadQueue();
    });

    window.api.events.onDownloadError(async (err) => {
        isDownloading = false;
        $('#btn-cancel-download').addClass('d-none');
        downloadQueue = [];
        await showAlert(t("msg_download_failed") + String(err));
        updateProgressBar(0);
    });

    window.api.events.onUpdateAvailable(async () => {
        if (await showConfirm(t("msg_launcher_update"))) {
            window.api.launcher.update();
            $('#updater-progress-wrap').removeClass('d-none');
        }
    });

    window.api.events.onUpdateProgress((pct) => {
        $('#updater-progress-bar').css('width', pct + '%').text(pct + '%');
    });

    window.api.events.onUpdateDownloaded(async () => {
        $('#updater-progress-wrap').addClass('d-none');
        if (await showConfirm(t("msg_restart_now"))) {
            window.api.launcher.restart();
        }
    });

    // ── Diagnostic Log Panel ─────────────────────────────────────────────────

    // Reset badge when panel opens
    document.getElementById('logPanel')?.addEventListener('shown.bs.offcanvas', () => {
        unreadLogCount = 0;
        $('#log-badge').addClass('d-none').text('');
    });

    // Clear log
    $('#btn-clear-log').on('click', () => {
        $('#log-entries').empty();
        unreadLogCount = 0;
        $('#log-badge').addClass('d-none').text('');
    });

    // Receive WARN/ERROR from main process
    window.api.events.onAppLog((entry) => {
        appendLogEntry(entry.level, entry.message, entry.time);
        const offcanvasEl = document.getElementById('logPanel');
        const isOpen = offcanvasEl?.classList.contains('show');
        if (!isOpen) bumpLogBadge();
    });

    // Receive launch / non-download errors from main process
    window.api.events.onAppError(async (msg) => {
        await showAlert(msg);
    });

    // Initial Render
    appVersion = await window.api.launcher.getVersion();
    (() => {
        const el = document.getElementById('version');
        if (el) {
            el.textContent = '';
            const strong = document.createElement('strong');
            strong.textContent = t('heading.version');
            el.appendChild(strong);
            el.appendChild(document.createTextNode(': ' + appVersion));
        }
    })();

    // Initial State of Play Button
    $('#play-btn').addClass('disabled');

    // Auto-launch toggle
    try {
        const autoLaunch = await window.api.launcher.getAutoLaunch();
        $('#chk-auto-launch').prop('checked', !!autoLaunch);
    } catch { /* ignore on unsupported platforms */ }
    $('#chk-auto-launch').on('change', async function () {
        await window.api.launcher.setAutoLaunch($(this).is(':checked'));
    });
}

async function refreshModuleList() {
    // Get Local
    try {
        localModules = await window.api.modules.list();
    } catch (e) {
        console.error("Could not fetch local modules", e);
        localModules = [];
    }

    // Get Remote
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
            const res = await fetch(REMOTE_URL + 'index.php', { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            remoteModules = await res.json();
            if (!Array.isArray(remoteModules)) remoteModules = [];
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (e) {
        console.warn("Could not fetch remote modules", e);
        remoteModules = [];
    }

    renderList();

    // Sync activeModule with refreshed data so buttons/state stay accurate
    if (activeModule) {
        const freshLocal  = localModules.find(m => m.name === activeModule.name);
        const freshRemote = Array.isArray(remoteModules) ? remoteModules.find(m => m.name === activeModule.name) : null;

        if (!freshLocal && !freshRemote) {
            // Module no longer exists at all — clear selection
            activeModule = null;
            $('#list-pos .active').removeClass('active');
            $('#module-img').addClass('d-none').attr('src', '');
            $('#module-info').addClass('d-none');
        } else {
            // Rebuild the merged mod object with latest data so buttons are correct
            const installed = freshLocal || null;
            const remote    = freshRemote || null;
            activeModule = {
                ...activeModule,
                localVersion:  installed ? installed.version  : null,
                path:          installed ? installed.path     : null,
                img:           installed ? installed.imagePath : null,
                configExists:  installed ? installed.configExists : false,
                isInstalled:   !!installed,
                remoteVersion: remote    ? remote.version     : activeModule.remoteVersion,
                url:           remote    ? (activeModule.url  || null) : null,
            };
            updateModuleButtons(activeModule);
        }
    }
}

function renderList() {
    const $list = $("#list-pos");
    $list.empty();

    // Merge lists
    const displayList = [];

    // Add all remote modules
    if (remoteModules && Array.isArray(remoteModules)) {
        remoteModules.forEach(rm => {
            const installed = localModules.find(lm => lm.name === rm.name);

            let modUrl = null;
            if (rm.url) {
                if (rm.url.startsWith('http://') || rm.url.startsWith('https://')) {
                    modUrl = rm.url;
                } else {
                    // Relative URL - append to base config
                    // For now, if you use relative paths, they must be relative to the specific REMOTE_URL set above.
                    // If you want to host files elsewhere, put the FULL URL in modules.json
                    modUrl = REMOTE_URL + rm.url;
                }
            }

            displayList.push({
                name: rm.name,
                remoteVersion: rm.version,
                localVersion: installed ? installed.version : null,
                path: installed ? installed.path : null,
                url: modUrl,
                md5: rm.md5 || null,
                size: rm.size || null,
                description: rm.description || null,
                img: installed ? installed.imagePath : null,
                configExists: installed ? installed.configExists : false,
                isInstalled: !!installed
            });
        });
    }

    // Add local modules not in remote
    localModules.forEach(lm => {
        const inRemote = Array.isArray(remoteModules) && remoteModules.find(rm => rm.name === lm.name);
        if (!inRemote) {
            displayList.push({
                name: lm.name,
                remoteVersion: null,
                localVersion: lm.version,
                path: lm.path,
                url: null,
                img: lm.imagePath,
                configExists: lm.configExists,
                isInstalled: true
            });
        }
    });

    displayList.forEach(mod => {
        let $badge;
        if (mod.isInstalled) {
            if (mod.remoteVersion && mod.localVersion && mod.localVersion !== mod.remoteVersion) {
                $badge = $('<span class="badge bg-warning float-end text-dark">').text(`${mod.localVersion} -> ${mod.remoteVersion}`);
            } else if (mod.localVersion && mod.localVersion === mod.remoteVersion) {
                $badge = $('<span class="badge bg-success float-end">').text(mod.localVersion);
            } else if (mod.localVersion) {
                $badge = $('<span class="badge bg-secondary float-end">').text(mod.localVersion);
            } else {
                $badge = $('<span class="badge bg-dark float-end">').text('?');
            }
        } else {
            $badge = $('<span class="badge bg-secondary float-end">').text(t('ui.not_installed'));
        }

        const $btn = $('<button class="list-group-item list-group-item-action">')
            .append($('<span class="name fw-bold">').text(mod.name))
            .append($badge);

        $btn.on('click', () => selectModule(mod, $btn));

        // Restore active highlight if this module was selected
        if (activeModule && mod.name === activeModule.name) {
            $btn.addClass('active');
        }

        $list.append($btn);
    });
}

function selectModule(mod, $btn) {
    activeModule = mod;
    $('#list-pos .active').removeClass('active');
    $btn.addClass('active');

    // Smart Default for Clean Install
    // If installed and URL suggests patch -> Default OFF
    // If installed and URL suggests full -> Default ON (safer to wipe old version usually)
    // If not installed -> Default OFF (doesn't matter)
    let defaultClean = false;
    if (mod.isInstalled && mod.url) {
        const urlLower = mod.url.toLowerCase();
        const isPatch = urlLower.includes('update') || urlLower.includes('patch');
        defaultClean = !isPatch;
    }
    $('#chk-clean-install').prop('checked', defaultClean);

    // Update Image
    if (mod.img) {
        $('#module-img').attr('src', mod.img).removeClass('d-none');
    } else {
        $('#module-img').addClass('d-none');
    }

    // Module Detail Panel
    const $info = $('#module-info');
    $info.removeClass('d-none');
    $('#module-info-name').text(mod.name);

    const $badges = $('#module-info-badges').empty();

    if (mod.isInstalled && mod.localVersion) {
        const isOutdated = mod.remoteVersion && mod.localVersion !== mod.remoteVersion;
        const badgeCls = isOutdated ? 'bg-warning text-dark' : 'bg-success';
        $badges.append($('<span class="badge">').addClass(badgeCls).text(`${t('ui.installed')}: v${mod.localVersion}`));
    } else if (!mod.isInstalled) {
        $badges.append($('<span class="badge bg-secondary">').text(t('ui.not_installed')));
    }

    if (mod.remoteVersion) {
        $badges.append($('<span class="badge bg-primary">').text(`${t('ui.latest')}: v${mod.remoteVersion}`));
    }

    if (mod.md5) {
        const $md5Badge = $('<span class="badge bg-secondary">').text(t('ui.checksum_ok'));
        $md5Badge.attr('title', `MD5: ${mod.md5}`);
        $md5Badge.prepend($('<i class="fas fa-shield-alt me-1">'));
        $badges.append($md5Badge);
    }

    if (mod.size) {
        const sizeMb = (mod.size / 1024 / 1024).toFixed(1);
        $badges.append($('<span class="badge bg-secondary">').text(`${sizeMb} MB`));
    }

    if (mod.description) {
        $('#module-info-desc').text(mod.description).removeClass('d-none');
    } else {
        $('#module-info-desc').addClass('d-none');
    }

    // Buttons
    updateModuleButtons(mod);
}

function updateModuleButtons(mod) {
    const installBtn = $('#btn-install');
    const removeBtn  = $('#btn-remove');
    const configBtn  = $('#btn-configure');
    const playBtn    = $('#play-btn');

    if (mod.isInstalled) {
        removeBtn.prop('disabled', false).text(t('ui.remove'));
        playBtn.removeClass('disabled').prop('disabled', false);
        configBtn.prop('disabled', false).text(t('ui.configure'));

        if (mod.remoteVersion && mod.localVersion && mod.remoteVersion !== mod.localVersion) {
            installBtn.text(t('ui.update')).prop('disabled', false)
                .removeClass('btn-primary btn-secondary').addClass('btn-success');
        } else {
            installBtn.text(t('ui.reinstall')).prop('disabled', false)
                .removeClass('btn-primary btn-success').addClass('btn-secondary');
        }
    } else {
        removeBtn.prop('disabled', true).text(t('ui.remove'));
        configBtn.prop('disabled', true).text(t('ui.configure'));
        playBtn.addClass('disabled').prop('disabled', true);
        installBtn.text(t('ui.install'))
            .prop('disabled', !mod.url || !navigator.onLine)
            .removeClass('btn-success btn-secondary').addClass('btn-primary');
    }
}

function startDownload(url) {
    if (!activeModule) return;

    const isCleanInstall = $('#chk-clean-install').is(':checked');

    enqueueDownload(url, {
        name: activeModule.name,
        version: activeModule.remoteVersion,
        md5: activeModule.md5 || null,
        cleanInstall: isCleanInstall
    });
}

function updateProgressBar(perc) {
    const $bar = getProgressBar();
    const $status = getDownloadStatus();

    if (perc === 0) {
        $bar.css('width', '0%').text('');
        $bar.removeClass('bg-success progress-bar-striped progress-bar-animated');
        $status.text('');
        return;
    }

    $bar.addClass('progress-bar-striped progress-bar-animated');
    $bar.removeClass('bg-success');

    if (perc >= 99.9) {
        $bar.css('width', '100%').text('100%');
        $status.text(t('ui.verifying_extracting'));
    } else {
        $bar.css('width', perc + '%').text(Math.round(perc) + '%');
        $status.text(t('msg_downloading'));
    }
}

// Config Window Logic ──────────────────────────────────────────────────────

async function initConfigWindow() {
    let currentConfig = null;
    let modulePath = null;

    initTheme();

    $('#config-back').on('click', () => {
        window.api.config.close();
    });

    $('#config-save').on('click', async () => {
        // Collect data
        if (!currentConfig || !modulePath) return;

        const newData = collectFormData(currentConfig.schema);
        const success = await window.api.config.save(modulePath, newData);
        if (success) {
            await showAlert(t("msg_config_saved"));
            window.api.config.close();
        } else {
            await showAlert(t("msg_config_failed"));
        }
    });

    // Load Data
    const data = await window.api.config.get(); // Main process remembers the path
    if (data.error) {
        await showAlert('Error loading config: ' + data.error);
        return;
    }

    if (!data.schema || Object.keys(data.schema).length === 0) {
        await showAlert('Configuration Schema is empty! Check config.json.');
    }

    currentConfig = data;
    modulePath = data.modulePath;

    if (!modulePath) {
        console.warn('Module Path missing in config load!');
    }

    // Store for re-rendering on locale change
    _configData = data;

    renderConfigForm(data.schema, data.values);
}

function renderConfigForm(schema, values) {

    const $sidebar = $('#config-sidebar');
    const $tabContent = $('#configTabsContent');

    $sidebar.empty();
    $tabContent.empty();

    const sections = Object.keys(schema).sort();

    sections.forEach((section, index) => {
        const paneId = section.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(); // CamelCase to kebab-case
        const tabId = `${paneId}-tab`;
        const sectionLabel = t(`ui.tab.${paneId.replace(/-/g, '_')}`) || section;

        const isActive = index === 0;

        // Sidebar Item
        const $link = $('<a>')
            .addClass(`list-group-item list-group-item-action${isActive ? ' active' : ''}`)
            .attr({ id: tabId, 'data-bs-toggle': 'list', href: `#${paneId}`, role: 'tab', 'aria-controls': paneId })
            .text(sectionLabel);
        $sidebar.append($link);

        // Tab Pane
        const $pane = $('<div>')
            .addClass(`tab-pane fade${isActive ? ' show active' : ''}`)
            .attr({ id: paneId, role: 'tabpanel', 'aria-labelledby': tabId });
        $tabContent.append($pane);

        // Fields
        const fields = schema[section];
        const $form = $('<form>');

        if (!fields) { console.warn("No fields for", section); return; }

        for (const [key, fieldDef] of Object.entries(fields)) {
            // Check if value exists, else default, else empty
            let val = fieldDef['default-value'];
            if (values && values[section] && values[section][key] !== undefined) {
                val = values[section][key];
            }

            const $group = $('<div class="row mb-3">'); // BS5 mb-3
            const labelKey = fieldDef.name || key;
            const labelText = t(labelKey);
            const $label = $('<label>')
                .addClass('col-sm-4 col-form-label')
                .attr({ 'data-i18n': labelKey, for: `field-${section}-${key}` })
                .text(labelText);

            // Set title (tooltip)
            if (fieldDef.description) {
                $label.attr('title', t(fieldDef.description));
                $label.attr('data-i18n-title', fieldDef.description);
            } else {
                $label.attr('title', t("no_description"));
                $label.attr('data-i18n-title', "no_description");
            }

            const $col = $('<div class="col-sm-8">');
            let $input;

            if (typeof fieldDef['default-value'] === 'boolean' || fieldDef.type === 'checkbox') {
                $input = $('<div class="form-check"><input type="checkbox" class="form-check-input"></div>');
                $input.find('input').prop('checked', val === true || val === 'true');
                // adjust variable to point to actual input
                $input = $input.find('input');


            } else if (fieldDef.inputType === 'range') {
                // Wrapper for range + value display
                const $rangeWrapper = $('<div class="d-flex align-items-center"></div>');
                // Create inputs
                const $rangeInput = $('<input type="range" class="form-range flex-grow-1 me-2">');
                const $valDisplay = $('<span class="badge bg-secondary range-value-badge"></span>');

                // Attributes
                if (fieldDef.min !== undefined) $rangeInput.attr('min', fieldDef.min);
                if (fieldDef.max !== undefined) $rangeInput.attr('max', fieldDef.max);
                if (fieldDef.step) $rangeInput.attr('step', fieldDef.step); else $rangeInput.attr('step', 1);

                $rangeInput.val(val);
                $valDisplay.text(val);

                // Event listener for display update
                $rangeInput.on('input', function () {
                    $valDisplay.text($(this).val());
                });

                // Append to wrapper
                $rangeWrapper.append($rangeInput);
                $rangeWrapper.append($valDisplay);

                // Append wrapper to column
                $col.append($rangeWrapper);

                // Data binding for saving
                $rangeInput.data('section', section).data('key', key);

                // IMPORTANT: We need to ensure collectFormData can find this input.
                // It searches for '#configTabsContent input'.
                // We don't need to append $rangeInput again.

                // However, we need to ensure the standard logic below doesn't try to append generic $input.
                // So we keep $input null.
                $input = null;

            } else if ((typeof fieldDef['default-value'] === 'number' || fieldDef.type === 'number') && (!fieldDef.options || fieldDef.options.length <= 1)) {
                $input = $('<input type="number" class="form-control">');
                $input.val(val);

                if (fieldDef.min !== undefined) $input.attr('min', fieldDef.min);
                if (fieldDef.max !== undefined) $input.attr('max', fieldDef.max);

                if (fieldDef.min !== undefined || fieldDef.max !== undefined) {
                    $input.on('input', function () {
                        let v = parseFloat($(this).val());
                        if (isNaN(v)) return;

                        if (fieldDef.max !== undefined && v > fieldDef.max) {
                            $(this).val(fieldDef.max);
                        }
                    });

                    $input.on('blur', function () {
                        let v = parseFloat($(this).val());
                        if (isNaN(v)) return;

                        if (fieldDef.min !== undefined && v < fieldDef.min) {
                            $(this).val(fieldDef.min);
                        }
                        // Re-check max just in case
                        if (fieldDef.max !== undefined && v > fieldDef.max) {
                            $(this).val(fieldDef.max);
                        }
                    });
                }

                if (fieldDef.step) {
                    $input.attr('step', fieldDef.step);
                } else if (fieldDef.inputType === 'float' || !Number.isInteger(fieldDef['default-value'])) {
                    $input.attr('step', '0.01');
                } else {
                    $input.attr('step', '1');
                }

            } else if (fieldDef.options && fieldDef.options.length > 1) {
                $input = $('<select class="form-select"></select>');

                // Add Options
                if (fieldDef.options) {
                    fieldDef.options.forEach(opt => {
                        const $option = $('<option>');
                        $option.val(opt.value);

                        // Determine Label
                        let label = opt.label;
                        $option.text(t(label));

                        if (String(opt.value) === String(val)) {
                            $option.prop('selected', true);
                        }
                        $input.append($option);
                    });
                }

                // If no options defined but type is select (shouldn't happen with our merge script), 
                // we might add a fallback or just leave it empty.

            } else if (fieldDef.inputType === 'color' || fieldDef.inputType === 'color-hex') {
                $input = $('<input type="color" class="form-control form-control-color">');

                let colorVal = val;
                // Handle decimal number (e.g. from INI parse)
                if (typeof colorVal === 'number') {
                    colorVal = '0x' + colorVal.toString(16).toUpperCase();
                }
                colorVal = String(colorVal);

                if (colorVal.startsWith('0x') || colorVal.startsWith('0X')) {
                    // Normalize 0xRRGGBB -> #RRGGBB
                    let hex = colorVal.substring(2);
                    // Padding to 6 chars
                    while (hex.length < 6) hex = '0' + hex;
                    colorVal = '#' + hex;
                }
                // Ensure valid 7-char hex for color input
                if (!colorVal.startsWith('#') || colorVal.length !== 7) {
                    // Fallback or attempt fix? 
                    // If it's just "FF" (blue), it needs to be #0000FF?
                    // Assuming standard format. If invalid, browser displays black.
                }

                $input.val(colorVal);

            } else {
                $input = $('<input type="text" class="form-control">');
                $input.val(val);
            }

            if ($input) {
                // Store metadata on input for saving
                $input.data('section', section);
                $input.data('key', key);

                // Wrappers for checkboxes need special handling for append
                if ($input.parent().hasClass('form-check')) {
                    $col.append($input.parent());
                } else {
                    $col.append($input);
                }
            }

            $group.append($label).append($col);
            $form.append($group);
        }
        $pane.append($form);
    });

    // Update Title on Tab Change
    const triggerTabList = [].slice.call(document.querySelectorAll('#config-sidebar a[data-bs-toggle="list"]'))
    triggerTabList.forEach(function (triggerEl) {
        triggerEl.addEventListener('shown.bs.tab', function (event) {
            const text = $(event.target).text(); // Use jQuery for easy text extraction
            $('#config-section-title').text(text);
        })
    });

    // Set Initial Title and Active State
    if (sections.length > 0) {
        const firstSection = sections[0];
        const paneId = firstSection.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        const tabId = `#${paneId}-tab`;

        // Force bootstrap to recognize the active tab
        const firstTabEl = document.querySelector(tabId);
        if (firstTabEl) {
            const tab = new bootstrap.Tab(firstTabEl);
            tab.show();
        }

        const firstLabel = t(`ui.tab.${paneId.replace(/-/g, '_')}`) || firstSection;
        $('#config-section-title').text(firstLabel);
    }
}

function collectFormData(schema) {
    const data = {};
    if (!schema) return data; // Add safety check

    // Initialize sections
    for (const section of Object.keys(schema)) {
        data[section] = {};
    }

    $('#configTabsContent input:not([type="radio"]), #configTabsContent select').each(function () {
        const $el = $(this);
        const section = $el.data('section');
        const key = $el.data('key');

        if (section && key) {
            let val;
            const fieldDef = schema[section] ? schema[section][key] : null;

            if ($el.attr('type') === 'checkbox') {
                val = $el.is(':checked');
            } else if ($el.attr('type') === 'color') {
                let hex = $el.val();
                // Convert #RRGGBB to 0xRRGGBB if schema default was 0x format, or just generic 0x
                // Check default value format? or just assume 0x
                if (hex.startsWith('#')) {
                    val = '0x' + hex.substring(1).toUpperCase();
                } else {
                    val = hex;
                }
            } else if ($el.attr('type') === 'number' || $el.is('select') || $el.attr('type') === 'range') {
                let rawVal = $el.val();

                if (fieldDef && (fieldDef.inputType === 'float' || fieldDef.step && fieldDef.step % 1 !== 0)) {
                    val = parseFloat(rawVal);
                } else if (fieldDef && (fieldDef.type === 'number' || fieldDef.inputType === 'number')) {
                    if (rawVal.indexOf('.') !== -1) {
                        val = parseFloat(rawVal);
                    } else {
                        val = parseInt(rawVal, 10);
                    }
                } else {
                    if (typeof rawVal === 'string' && rawVal.indexOf('.') !== -1) {
                        val = parseFloat(rawVal);
                    } else {
                        // Check if it's purely numeric
                        const num = Number(rawVal);
                        val = isNaN(num) ? rawVal : num;
                    }
                }
                // Ensure we don't save NaN if user cleared input
                if (typeof val === 'number' && isNaN(val)) {
                    val = fieldDef ? (fieldDef['default-value'] || 0) : 0;
                }
            } else {
                val = $el.val();
            }
            data[section][key] = val;
        }
    });

    // Radio Buttons
    $('#configTabsContent input[type="radio"]:checked').each(function () {
        const $el = $(this);
        const section = $el.data('section');
        const key = $el.data('key');
        if (section && key) {
            data[section][key] = parseInt($el.val());
        }
    });

    return data;
}

// Constants - Azremen's Configuration
const REMOTE_URL = 'http://localhost/wse2-launcher/'; // Change this to your VPS URL (e.g., http://your-vps-ip/launcher/)
const PLAY_BUTTON_ID = 'play-btn';

// Azremen's Global State Variables
let localModules = [];
let remoteModules = [];
let activeModule = null;
let currentLocale = 'en'; // Default
let translations = {};

// Azremen's Initialization Routine
$(document).ready(async () => {
    // Azremen's Offline Detection
    function updateOnlineStatus() {
        if (navigator.onLine) {
            $('#offline-warning').addClass('d-none');
        } else {
            $('#offline-warning').removeClass('d-none');
        }
        
        // Azremen: Refresh buttons if a module is selected to reflect online status
        if (activeModule) {
            // Re-run selection logic to update disabled states
            const $btn = $('#list-pos .active');
            if ($btn.length) selectModule(activeModule, $btn);
        }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // Load Locale
    try {
        const storedLocale = localStorage.getItem('locale');
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
        if($('#locale-select').length > 0) {
            $('#locale-select').val(currentLocale);
            
            // Bind Change Event
            $('#locale-select').change(async function() {
                const newLang = $(this).val();
                if(newLang !== currentLocale) {
                    currentLocale = newLang;
                    localStorage.setItem('locale', newLang);
                    await loadTranslations(currentLocale);
                    // Update dynamic texts
                    // Refresh Main Window Logic if active to re-render buttons
                    if(typeof refreshModuleList === 'function') {
                        renderList(); 
                        if(activeModule) {
                            // Re-select to update button text
                             let $btn = $('#list-pos .active');
                             if($btn.length) selectModule(activeModule, $btn);
                        }
                    }
                    
                    // Update theme text
                    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
                    $("#theme-source").text(isDark ? t("ui_dark") : t("ui_light"));
                }
            });
        }
        
    } catch(e) {
        console.warn("Translation load failed, fallback to en", e);
        await loadTranslations('en');
    }

    // Determine if we are in Main Window or Config Window
    if ($('#config-sidebar').length > 0) {
        initConfigWindow();
        
        // Listen to storage changes to sync locale if changed in main window
        if(window.api && typeof window.addEventListener === 'function') {
           window.addEventListener('storage', async (e) => {
               if(e.key === 'locale') {
                   currentLocale = e.newValue;
                   await loadTranslations(currentLocale);
                   // Refresh Config Form with new locale
                   // We need the data again, or just re-render with stored schema
                   if(typeof renderConfigForm === 'function' && window._lastConfigData) {
                        applyTranslations(); // Updates static translations (tabs, buttons)
                        
                        // Preserve current user input before re-rendering
                        const currentValues = collectFormData(window._lastConfigData.schema);
                        window._lastConfigData.values = currentValues;

                        renderConfigForm(window._lastConfigData.schema, currentValues);
                   }
               } else if (e.key === 'theme') {
                   // Azremen: Sync theme change
                   const newTheme = e.newValue;
                   document.documentElement.setAttribute('data-bs-theme', newTheme);
                   // Config window generally doesn't have #theme-source but if it does:
                   const isDark = newTheme === 'dark';
                   $("#theme-source").text(isDark ? t("ui_dark") : t("ui_light"));
               }
           });
        }
    } else {
        initMainWindow();
    }
    
    // Apply theme on load
    const storedTheme = localStorage.getItem('theme');
    const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Default to system, but respect manual override if possible (needs main window implementation)
    // For now we just check system for initial, but listeners above handle sync.
    // Actually, let's look at how we toggle it.
    
    if (storedTheme) {
        document.documentElement.setAttribute('data-bs-theme', storedTheme);
        $("#theme-source").text(storedTheme === 'dark' ? t("ui_dark") : t("ui_light"));
    } else if (isSystemDark) {
       document.documentElement.setAttribute('data-bs-theme', 'dark');
       $("#theme-source").text(t("ui_dark"));
    } else {
       document.documentElement.setAttribute('data-bs-theme', 'light');
       $("#theme-source").text(t("ui_light"));
    }
    
    // Azremen: Note - Toggle logic moved to initMainWindow for main window
    // Config window does not have a toggle button.
});

async function loadTranslations(lang) {
    try {
        translations = await $.getJSON(`locales/${lang}.json`);
    } catch(e) {
        console.error(`Failed to load locale ${lang}`, e);
        translations = {}; // fallback
    }
    applyTranslations();
}

function t(key, params = {}) {
    let str = translations[key] || key;
    for (const prop in params) {
        str = str.replace(`{${prop}}`, params[prop]);
    }
    return str;
}

function applyTranslations() {
    // Text and Placeholder
    $('[data-i18n]').each(function() {
        const key = $(this).data('i18n');
        // Always try to translate or fallback to key (mostly english)
        const text = translations[key] || key;
        
        if ($(this).is('input') || $(this).is('textarea')) {
            $(this).attr('placeholder', text);
        } else {
            $(this).text(text);
        }
    });
    
    // Tooltips / Titles
    $('[data-i18n-title]').each(function() {
        const key = $(this).data('i18n-title');
        const text = translations[key] || key;
        $(this).attr('title', text);
    });

    // Explicitly update version translation if it exists
    const verText = $("#version").text().split(":")[1] || "";
    // Re-render version line completely
    window.api.launcher.getVersion().then(ver => {
         $("#version").html(`<strong>${t("heading_version")}</strong>: ${ver}`);
    });
    
    // Explicitly update theme text
    const currentTheme = document.documentElement.getAttribute('data-bs-theme');
    const isDark = currentTheme === 'dark';
    $("#theme-source").text(isDark ? t("ui_dark") : t("ui_light"));
}


// --- Azremen's Main Window Logic ---

async function initMainWindow() {
    // 1. Azremen: Setup Data
    await refreshModuleList();
    
    // 2. Azremen: Setup UI Events
    $('#toggle-dark-mode').click(async () => {
         const currentTheme = document.documentElement.getAttribute('data-bs-theme');
         const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
         document.documentElement.setAttribute('data-bs-theme', newTheme);
         localStorage.setItem('theme', newTheme);
         $("#theme-source").text(newTheme === 'dark' ? t("ui_dark") : t("ui_light"));
         
         // Notify main process if needed (though with BS5 client-side is often enough unless we persist it)
         await window.api.darkMode.toggle(); 
    });

    $('#btn-install').click(() => {
        if (activeModule && activeModule.url) {
            startDownload(activeModule.url);
        }
    });

    $('#btn-remove').click(async () => {
        if (activeModule && activeModule.path) {
            if(confirm(t("msg_confirm_remove", { name: activeModule.name }))) {
                await window.api.modules.remove(activeModule.path);
                await refreshModuleList();
            }
        }
    });

    $('#btn-configure').click(() => {
        if (activeModule && activeModule.path) {
            window.api.config.open(activeModule.path);
        }
    });

    $('#play-btn').click(() => {
        if (activeModule && activeModule.isInstalled) {
            window.api.launcher.launch(activeModule.name);
        } else {
             alert(t("ui_not_installed"));
        }
    });
    
    $('#settings').click(() => {
        const settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
        settingsModal.show();
    });

    $('#btn-open-folder').click(() => {
        window.api.launcher.openFolder();
    });

    $('#btn-check-updates').click(() => {
        alert(t("msg_launcher_update")); // Simulate check or trigger real event if wired to manual check
        // Real implementation would be window.api.launcher.checkUpdates()
    });

    // 3. Listengers
    window.api.events.onDownloadProgress((perc) => {
        updateProgressBar(perc);
    });

    window.api.events.onDownloadComplete(async () => {
        // Now it is truly complete
        $('.progress-bar').addClass('bg-success').text(t("ui_done") || "Done");
        $('.progress-bar').removeClass('progress-bar-striped progress-bar-animated');
        $('#download-status').text(t("msg_download_success") || "Installed Successfully!");
        
        setTimeout(() => {
            updateProgressBar(0);
            alert(t("msg_download_complete"));
            refreshModuleList();
        }, 1000);
    });

    window.api.events.onDownloadError((err) => {
        alert(t("msg_download_failed") + err);
        updateProgressBar(0);
    });
    
    window.api.events.onUpdateAvailable(() => {
         // Show update notification
         alert(t("msg_launcher_update"));
    });
    
     window.api.events.onUpdateDownloaded(() => {
         if(confirm(t("msg_restart_now"))) {
             window.api.launcher.restart();
         }
    });

    // Initial Render
    const ver = await window.api.launcher.getVersion();
    $("#version").html(`<strong>${t("heading_version")}</strong>: ${ver}`);
    
    // Initial State of Play Button
    $('#play-btn').addClass('disabled');
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
        remoteModules = await $.ajax({
            dataType: "json",
            url: REMOTE_URL + 'index.php', // Use the dynamic index.php from VPS
            timeout: 5000 // Timeout configuration
        });
        if (!Array.isArray(remoteModules)) remoteModules = [];
    } catch (e) {
        console.warn("Could not fetch remote modules", e);
        remoteModules = [];
    }
    
    renderList();
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
            
            // Azremen: Allow absolute URLs for mods hosted on other servers (MediaFire, VPS, etc.)
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
                md5: rm.md5 || null, // Capture checksum from index.php
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

    displayList.forEach((mod, index) => {
        let badge = '';
        if (mod.isInstalled) {
            // Updated Logic for Version Display
            if (mod.remoteVersion && mod.localVersion && mod.localVersion !== mod.remoteVersion) {
                badge = `<span class="badge bg-warning float-end text-dark">${mod.localVersion} -> ${mod.remoteVersion}</span>`;
            } else if (mod.localVersion === mod.remoteVersion) {
                // MATCH: Green badge with "Up to date" or just version
                badge = `<span class="badge bg-success float-end">${mod.localVersion}</span>`; 
            } else {
                 // Unknown logic
                 const displayVer = mod.localVersion || t("ui_unknown_version");
                 badge = `<span class="badge bg-secondary float-end">${displayVer}</span>`;
            }
        } else {
             badge = `<span class="badge bg-secondary float-end">${t("ui_not_installed")}</span>`;
        }

        const $btn = $(`<button class="list-group-item list-group-item-action">
            <span class="name fw-bold">${mod.name}</span>
            ${badge}
        </button>`);
        
        $btn.click(() => selectModule(mod, $btn));
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
    
    // Buttons
    const installBtn = $('#btn-install');
    const removeBtn = $('#btn-remove');
    const configBtn = $('#btn-configure');
    const playBtn = $('#play-btn');
    
    if (mod.isInstalled) {
        removeBtn.prop('disabled', false);
        removeBtn.text(t("ui_remove"));
        
        // Enable Play Button
        playBtn.removeClass('disabled');
        
        // Always enable config for installed modules (creates new if missing)
        configBtn.prop('disabled', false); 
        configBtn.text(t("ui_configure"));

        // Can update?
        if (mod.remoteVersion && mod.localVersion && mod.remoteVersion !== mod.localVersion) {
             installBtn.text(t("ui_update") || "Update");
             installBtn.prop('disabled', false);
             installBtn.removeClass('btn-primary').addClass('btn-success');
        } else {
             // Installed and up to date or unknown state -> Reinstall option
             // We allow Re-Install for repair purposes
             installBtn.text(t("ui_reinstall") || "Reinstall"); 
             
             // If this button is ONLY for install/update, disable it.
             installBtn.prop('disabled', false); // Allow user to force re-install
             installBtn.removeClass('btn-primary').removeClass('btn-success').addClass('btn-secondary');
        }
    } else {
        removeBtn.prop('disabled', true);
        removeBtn.text(t("ui_remove"));
        configBtn.prop('disabled', true);
        configBtn.text(t("ui_configure"));
        
        // Disable Play Button
        playBtn.addClass('disabled');
        
        installBtn.text(t("ui_install"));
        
        // Disable install if offline OR no URL
        const isOffline = !navigator.onLine;
        installBtn.prop('disabled', !mod.url || isOffline);
        
        installBtn.removeClass('btn-success').addClass('btn-primary');
    }
}

function startDownload(url) {
    if(!activeModule) return;
    
    // Check user preference first
    const userCleanInstall = $('#chk-clean-install').is(':checked');
    
    // Check if this is a "Full Install" or "Clean Update" vs a "Patch"
    // By default, if the URL ends in a pattern like "Update.zip" or "Patch.zip", we assume patch.
    // Otherwise, for main files (e.g. "Native.zip"), we default to clean install to avoid conflicts.
    const isPatch = url.toLowerCase().includes('update') || url.toLowerCase().includes('patch');
    
    // Priority: User Checkbox > Auto-Detection
    // If user explicitly requests clean install, we do it.
    // If user unchecks it, we respect that (overlay install).
    // If user hasn't touched it (implementation detail: we treat unchecked as "auto" or "overlay"? 
    // The user requirement is "add an option", so the checkbox should control it.
    
    let isCleanInstall = userCleanInstall;

    // Safety fallback: If user DID NOT check clean install, but it looks like a full installer (not patch),
    // we might warn or just proceed with overlay. 
    // However, specifically for the request "don't revert back but add an option", 
    // let's make the checkbox the authority.
    
    window.api.modules.download(url, { 
        name: activeModule.name, 
        version: activeModule.remoteVersion,
        md5: activeModule.md5 || null,
        cleanInstall: isCleanInstall
    });
}

function updateProgressBar(perc) {
    const $bar = $('.progress-bar');
    let $status = $('#download-status');

    // Create status element if it doesn't exist under parent of progress bar
    if ($status.length === 0) {
        $status = $('<div id="download-status" class="text-center small text-muted mt-1"></div>');
        $bar.parent().after($status);
    }
    
    // Explicitly handle Reset (0) or Start
    if (perc === 0) {
        $bar.css('width', '0%').text('');
        $bar.removeClass('bg-success progress-bar-striped progress-bar-animated');
        $status.text('');
        return;
    }

    $bar.addClass('progress-bar-striped progress-bar-animated');
    $bar.removeClass('bg-success');

    if (perc >= 99.9) {
         // Download finished, now main process is working
         $bar.css('width', '100%').text('100%');
         const verText = t("ui_verifying_extracting");
         $status.text(verText || "Verifying Integrity & Extracting...");
    } else {
        $bar.css('width', perc + '%').text(Math.round(perc) + '%');
        const dlText = t("msg_downloading");
        $status.text(dlText || "Downloading...");
    }
}

// Azremen: Config Window Logic

async function initConfigWindow() {
    let currentConfig = null;
    let modulePath = null;
    
    // Azremen: Check Storage for Theme Preference set by Main Window
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
         document.documentElement.setAttribute('data-bs-theme', storedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
         document.documentElement.setAttribute('data-bs-theme', 'dark');
    }

    // Azremen: Explicitly re-bind clicks because DOM might have been parsed before JS attached if order was odd, 
    // or to ensure we attach to the *current* elements if they are static.
    // Since we use static HTML for buttons in config.html, $(doc).ready is fine.
    
    $('#config-back').on('click', () => {
        window.api.config.close();
    });

    $('#config-save').on('click', async () => {
        // Collect data
        if (!currentConfig || !modulePath) return;
        
        const newData = collectFormData(currentConfig.schema);
        const success = await window.api.config.save(modulePath, newData);
        if (success) {
            alert(t("msg_config_saved"));
            window.api.config.close();
        } else {
            alert(t("msg_config_failed"));
        }
    });

    // Load Data
    const data = await window.api.config.get(); // Main process remembers the path
    if (data.error) {
        alert("Error loading config: " + data.error);
        return;
    }

    if (!data.schema || Object.keys(data.schema).length === 0) {
        alert("Configuration Schema is empty! Check config.json.");
    }
    
    currentConfig = data;
    modulePath = data.modulePath;
    
    if(!modulePath) {
        // Fallback for visual debugging only
        console.warn("Module Path missing in config load!");
    }
    
    // Store for re-rendering on locale change
    window._lastConfigData = data;
    
    renderConfigForm(data.schema, data.values);
}

function renderConfigForm(schema, values) {
    // Azremen: Generate Sidebar and Panes dynamically from schema keys
    
    const $sidebar = $('#config-sidebar');
    const $tabContent = $('#configTabsContent');
    
    $sidebar.empty();
    $tabContent.empty();
    
    // Azremen: Sort sections if needed, or use object order
    const sections = Object.keys(schema).sort();

    sections.forEach((section, index) => {
        const paneId = section.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(); // Azremen: CamelCase to kebab-case
        const tabId = `${paneId}-tab`;
        const sectionLabel = t(`ui_tab_${paneId.replace(/-/g, '_')}`) || section;
        
        const isActive = index === 0;
        const activeClassLink = isActive ? 'active' : '';
        const activeClassPane = isActive ? 'show active' : '';

        // Azremen: Add Sidebar Item
        // using data-bs-toggle="list" for list-group based tabs
        const $link = $(`<a class="list-group-item list-group-item-action ${activeClassLink}" id="${tabId}" data-bs-toggle="list" href="#${paneId}" role="tab" aria-controls="${paneId}">${sectionLabel}</a>`);
        $sidebar.append($link);

        // Azremen: Add Tab Pane
        const $pane = $(`<div class="tab-pane fade ${activeClassPane}" id="${paneId}" role="tabpanel" aria-labelledby="${tabId}"></div>`);
        $tabContent.append($pane);

        // Azremen: Render Fields into Pane
        const fields = schema[section];
        const $form = $('<form>'); // Removed p-3 as container has padding
        
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
            const $label = $(`<label class="col-sm-4 col-form-label" data-i18n="${labelKey}">${labelText}</label>`);
            
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


            // Azremen: Range Slider Logic
            } else if (fieldDef.inputType === 'range') {
                 // Wrapper for range + value display
                 const $rangeWrapper = $('<div class="d-flex align-items-center"></div>');
                 // Create inputs
                 const $rangeInput = $('<input type="range" class="form-range flex-grow-1 me-2">');
                 const $valDisplay = $('<span class="badge bg-secondary" style="min-width: 3em;"></span>');
                 
                 // Attributes
                 if (fieldDef.min !== undefined) $rangeInput.attr('min', fieldDef.min);
                 if (fieldDef.max !== undefined) $rangeInput.attr('max', fieldDef.max);
                 if (fieldDef.step) $rangeInput.attr('step', fieldDef.step); else $rangeInput.attr('step', 1);
                 
                 $rangeInput.val(val);
                 $valDisplay.text(val);
                 
                 // Event listener for display update
                 $rangeInput.on('input', function() {
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
                 
                 // Azremen: Apply Range Constraints
                 if (fieldDef.min !== undefined) $input.attr('min', fieldDef.min);
                 if (fieldDef.max !== undefined) $input.attr('max', fieldDef.max);

                 // Azremen: Strict Limit Enforcement
                 if (fieldDef.min !== undefined || fieldDef.max !== undefined) {
                     // Check Max on Input (prevent typing higher)
                     $input.on('input', function() {
                         let v = parseFloat($(this).val());
                         if (isNaN(v)) return; 

                         if (fieldDef.max !== undefined && v > fieldDef.max) {
                             $(this).val(fieldDef.max);
                         }
                     });
                     
                     // Check Min on Blur (allow typing lower temporarily, fix on exit)
                     $input.on('blur', function() {
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
                 
                 // Azremen: Apply Step
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
                         // Try translation if label is a key? 
                         // Usually labels in config.json are english readable. 
                         // We can try t(label) but fall back to label.
                         // But if label contains spaces, likely not a key.
                         $option.text(label);
                         
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

        const firstLabel = t(`ui_tab_${paneId.replace(/-/g, '_')}`) || firstSection;
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
    
    // Azremen: Process standard inputs and selects
    $('#configTabsContent input:not([type="radio"]), #configTabsContent select').each(function() {
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
                
                // Azremen: Force float parsing if schema defines it as float
                if (fieldDef && (fieldDef.inputType === 'float' || fieldDef.step && fieldDef.step % 1 !== 0)) {
                    val = parseFloat(rawVal);
                } else if (fieldDef && (fieldDef.type === 'number' || fieldDef.inputType === 'number')) {
                    // Try to respect the type in schema
                    if (rawVal.indexOf('.') !== -1) {
                        val = parseFloat(rawVal);
                    } else {
                        val = parseInt(rawVal, 10);
                    }
                } else {
                    // Fallback Heuristic
                    if (typeof rawVal === 'string' && rawVal.indexOf('.') !== -1) {
                        val = parseFloat(rawVal);
                    } else {
                        // Check if it's purely numeric
                        const num = Number(rawVal);
                        if (!isNaN(num)) {
                           val = num;
                        } else {
                           val = rawVal;
                        }
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

    // Azremen: Process Radio Buttons separately
    $('#configTabsContent input[type="radio"]:checked').each(function() {
         const $el = $(this);
         const section = $el.data('section');
         const key = $el.data('key');
         if (section && key) {
             data[section][key] = parseInt($el.val());
         }
    });
    
    return data;
}

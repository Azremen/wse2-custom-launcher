# Warband Script Enhancer 2 Launcher

[English](#english) | [Türkçe](#türkçe) | [Русский](#русский)

---

<a name="english"></a>
## 🇬🇧 English

A custom launcher for Warband Script Enhancer 2 (WSE2) by **Azremen**.

### Features
- **Cross-Platform:** Runs on Windows, Linux, and macOS.
- **Module Management:** Browse, download, install, and remove WSE2 modules directly from the launcher.
- **Steam Workshop:** Subscribed Warband workshop mods appear in the module list automatically.
- **64-bit Support:** Toggle next to the Play button when `mb_warband_wse2_x64.exe` is present.
- **Direct Connect:** Launch the selected module with a server IPv4 address/hostname, port and optional join password.
- **Dedicated Server:** Start a local WSE2 server in a separate console on Windows or Linux/Wine, with command/config files and extra arguments.
- **Enhanced Configuration:** Modern UI with support for Color Pickers, Drop-down Menus, Ranges, and Sliders.
- **Auto-Updater:** Automatically checks for new launcher versions and prompts to update.
- **Localization:** Supports English, Turkish, and Russian.
- **Dark/Light Theme:** Switchable UI theme.

### Steam Workshop

The launcher reads your subscribed items through the Steamworks API, exactly like the official WSE2 launcher. Workshop items are kept in Steam's installed workshop folders and are shown directly in the launcher; they are not copied or linked into `Modules`, so symbolic-link privileges are not required.

- Steam must be running and the game must be owned by the signed-in account.
- If Steam is unavailable, the launcher falls back to scanning `steamapps/workshop/content/48700`.
- Workshop modules cannot be removed from the launcher; manage them through Steam.
- Unsubscribed items disappear from the launcher on the next refresh.
- When a Workshop module is selected, its `main.bmp` is loaded from the Steam module folder; a missing image uses the launcher placeholder.

### Direct connect and dedicated server

Select an installed module, then use **Connect** for a single IPv4 address or hostname, port (1–65535), and optional **join** password. Hostnames resolve to IPv4. The client uses the existing 64-bit switch; **PLAY** still starts normally.

**Dedicated Server** accepts `mb_warband_wse2_dedicated.exe`, `mb_warband_wse2_dedicated_x64.exe`, `mb_warband_wse2_dedicated_campaign.exe` or `mb_warband_wse2_dedicated_campaign_x64.exe`. Select a server command file (`-r`, e.g. `Native.txt`; optional for campaign executables) and an optional WSE2 settings file (`--config-path`, e.g. `server_config.ini`). These are two different files. The selected module must also be installed in `Modules/<module name>` beside the server executable; Workshop modules are not copied automatically. Campaign modules must support campaign hosting; the launcher does not manage worlds or savegames.

Use **Edit / Create** beside the INI path to open the existing configuration UI for that server file, without changing client module settings. Known settings use the shared controls, and additional INI sections/options are retained. **Save** updates the selected file; **Save As** creates a copy or a new file, then selects the saved path in the server panel. New/missing files require a Save As destination. Saving normalizes INI formatting and removes comments.

Use **Load arguments from TXT** for a UTF-8 argument list (BOM and CRLF are supported), or type directly in the argument area. Loading replaces that area; you can edit the loaded text before launch. Each nonblank line is one argument, not an entire command line or a `-r` server command:
```text
--example-option
value with spaces
```
Replace the example option with a switch supported by your installed WSE2/module. Do not include an executable name, surrounding quotes or overrides for the module/config/command-file switches.

Example commands (shown without a join password):
```text
mb_warband_wse2.exe --module Native --no-intro --address 127.0.0.1:7240
mb_warband_wse2_dedicated.exe --config-path server_config.ini -r Native.txt --module Native
mb_warband_wse2_dedicated_campaign_x64.exe --config-path server_config.ini --module NativeCoop
```

- Enter extra server arguments **one per line**, without surrounding quotes. Reserved module/config/command-file switches cannot be overridden. Arguments are not interpreted as shell commands; Windows uses a fixed, encoded PowerShell `Start-Process` bootstrap to open the server console.
- Server port, join/admin passwords and game rules belong in the `-r` command file. No server downloads, firewall changes, readiness checks or stop/RCON controls are provided.
- A separate server console stays open after the launcher closes. Check that console for startup errors; “process started” does not guarantee that the server is ready. Stop the server through its console.
- On Linux, configure Wine and its prefix in Settings. Install `wineconsole` and `winepath` alongside that Wine executable, plus `xterm` or an `x-terminal-emulator` supporting `-e command args`.
- Address/port and server file paths are saved under Electron's user-data directory in `multiplayer-settings.json`. Join passwords and extra arguments are session-only. Join passwords are masked in launcher logs, but the operating system may expose them in process arguments.
- The launch switches follow the [official WSE2 documentation](https://forums.taleworlds.com/index.php?threads/warband-script-enhancer-2.384882/) and [dedicated example](https://github.com/Ruslan-700/WSE2-Releases/blob/master/Warband/Native_WSE2_dedicated.bat). Actual auto-connect, special-character parsing and Linux/Wine console behavior still require validation with your installed WSE2 version.

### Installation & Usage

#### Windows
1. **Installer:** Run the Setup executable and install it in any folder. The launcher detects your Warband installation through Steam or the Windows registry and supports in-app updates.
2. **Portable:** Place the portable executable next to `mb_warband_wse2.exe`, or let it detect an installed Steam copy. When an update is available, the launcher downloads the latest portable executable, replaces itself after closing, and restarts automatically.
3. Run the launcher, configure your settings, and click **Launch**.

#### Linux
This launcher is a native Linux application, but WSE2 itself is a Windows application (`mb_warband_wse2.exe`).

**Requirements:**
- **Wine** must be installed and available in your PATH (`wine --version`).

**Usage:**
1. Download the **AppImage** from the [Releases](../../releases) page.
2. Place it in your Mount & Blade Warband directory next to `mb_warband_wse2.exe`.
3. Make it executable: `chmod +x WSE2-Launcher.AppImage`
4. Run the launcher. Clicking **Launch** will automatically use `wine` to start the game.

#### macOS
1. Download the **`.dmg`** from the [Releases](../../releases) page.
2. Place the launcher app in your Warband directory.
3. Ensure Wine or a compatibility layer (CrossOver/Wineskin) is configured for the game.

### Building

Releases are built automatically via **GitHub Actions** when a version tag is pushed. Binaries for Linux, Windows, and macOS are published to GitHub Releases automatically.

To build locally:
```bash
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux (see note below)
npm run dist:mac    # macOS only (must run on macOS)
```

> **Building the AppImage on Windows requires a Linux packaging environment.**
> Build it from WSL/Linux or let GitHub Actions produce the Linux artifact. The launcher itself does not require symbolic-link privileges for workshop modules.

<a name="development"></a>
### Development and tests

Use **Node.js 24+** and npm. WSE2/game files are installed separately; they are not bundled with the launcher. PHP 8+ with `ZipArchive` is needed for manifest generation; the desktop application does not require PHP.

```text
npm install
npm start
npm test
```

`npm test` runs the built-in Node test runner. The multiplayer tests cover validation, argument construction, settings/password handling and mocked Electron IPC on Windows and Linux paths. They do **not** launch a real WSE2 client/server or prove Wine compatibility. For JavaScript syntax checks, use `node --check` with the changed file. There is no separate lint/type-check script.

| Component | Files |
| --- | --- |
| Main process and sandbox bridge | [main.js](./main.js), [preload.js](./preload.js) |
| UI and WSE2 configuration editor | [renderer.js](./renderer.js), [main.html](./main.html), [config.html](./config.html), [main.css](./main.css), [config.json](./config.json) |
| Multiplayer validation and arguments | [multiplayer.js](./multiplayer.js), [tests/multiplayer.test.js](./tests/multiplayer.test.js) |
| Server INI editor data and validation | [server-config.js](./server-config.js), [tests/server-config.test.js](./tests/server-config.test.js) |
| Translations | [locales/](./locales/) |
| Remote module distribution | [index.php](./index.php), [generate-manifests.php](./generate-manifests.php) |
| Packaging and CI | [package.json](./package.json), [build workflow](./.github/workflows/build.yml) |

Shared contributor/agent guidance is in [AGENTS.md](./AGENTS.md); [CLAUDE.md](./CLAUDE.md) imports that guidance for Claude. User-facing changes should update all three locales and the relevant README language sections. Keep credentials, signing files and local module/build data out of commits.

### Release Secrets

The workflows in `.github/workflows/` expect these repository secrets
(**Settings → Secrets and variables → Actions**):

| Secret | Purpose |
| --- | --- |
| `CSC_LINK` | Base64 of the code signing PFX |
| `CSC_KEY_PASSWORD` | PFX password |

Release publishing uses the built-in `github.token` with the workflow's `contents: write` permission.

### Self-Signed Certificate (Windows Code Signing)

> The certificate **must** carry the Code Signing extended key usage, otherwise
> electron-builder fails with *"Cannot extract publisher name from code signing certificate"*.

**1. Create the certificate (PowerShell):**
```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=YourName, E=your@email.com" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -KeyUsage DigitalSignature `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(5)

$pw = Read-Host "PFX password" -AsSecureString
Export-PfxCertificate -Cert $cert -FilePath .\wse2-cert.pfx -Password $pw
```

**2. Verify the key usage:**
```powershell
(Get-PfxCertificate .\wse2-cert.pfx).EnhancedKeyUsageList
```
The output must contain `Code Signing (1.3.6.1.5.5.7.3.3)`.

**3. Local builds** — add to your `.env` (never commit this file):
```
CSC_LINK=wse2-cert.pfx
CSC_KEY_PASSWORD=yourpassword
```

**4. GitHub Actions** — copy the base64 payload to the clipboard:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\wse2-cert.pfx")) | Set-Clipboard
```
Paste it into the `CSC_LINK` secret and set `CSC_KEY_PASSWORD`.

> A self-signed certificate does not remove the SmartScreen warning — it only replaces
> "Unknown publisher" with your name. Use a paid OV/EV certificate for a clean install.

---

<a name="türkçe"></a>
## 🇹🇷 Türkçe

**Azremen** tarafından geliştirilen Warband Script Enhancer 2 (WSE2) için özel başlatıcı.

### Özellikler
- **Çoklu Platform:** Windows, Linux ve macOS üzerinde çalışır.
- **Modül Yönetimi:** WSE2 modüllerini doğrudan başlatıcıdan indirin, kurun ve kaldırın.
- **Steam Atölyesi:** Abone olduğunuz Warband atölye modları modül listesinde otomatik görünür.
- **64-bit Desteği:** `mb_warband_wse2_x64.exe` mevcutsa Oynat butonunun yanında aç/kapa anahtarı çıkar.
- **Doğrudan Bağlantı:** Seçili modu sunucu IPv4 adresi/hostname, port ve isteğe bağlı giriş parolasıyla başlatın.
- **Dedicated Server:** Windows veya Linux/Wine üzerinde komut/config dosyaları ve ek argümanlarla yerel WSE2 sunucusunu ayrı konsolda başlatın.
- **Gelişmiş Yapılandırma:** Renk Seçiciler, Açılır Menüler, Aralıklar ve Kaydırıcılar içeren modern arayüz.
- **Otomatik Güncelleme:** Yeni başlatıcı sürümlerini otomatik kontrol eder ve güncelleme önerir.
- **Yerelleştirme:** Türkçe, İngilizce ve Rusça desteği.
- **Koyu/Açık Tema:** Değiştirilebilir arayüz teması.

### Steam Atölyesi

Başlatıcı, abone olduğunuz öğeleri resmi WSE2 başlatıcısıyla aynı şekilde Steamworks API üzerinden okur. Atölye öğeleri Steam'in kurulu atölye klasörlerinden doğrudan listelenir; `Modules` klasörüne kopyalanmaz veya bağlanmaz, bu nedenle sembolik bağlantı yetkisi gerekmez.

- Steam açık olmalı ve oyun giriş yapılmış hesapta sahipli olmalıdır.
- Steam erişilemezse `steamapps/workshop/content/48700` klasörü taranarak devam edilir.
- Atölye modülleri başlatıcıdan kaldırılamaz; yönetimi Steam üzerinden yapılır.
- Abonelikten çıkılan öğeler bir sonraki yenilemede başlatıcıdan kaldırılır.
- Atölye modu seçildiğinde `main.bmp` Steam'deki mod klasöründen yüklenir; dosya yoksa varsayılan görsel gösterilir.

### Doğrudan bağlantı ve dedicated server

Kurulu bir mod seçip **Bağlan** üzerinden IPv4 adresi/hostname, port (1–65535) ve isteğe bağlı **giriş** parolası girin. Hostname IPv4'e çözümlenir. Mevcut client 64-bit anahtarı kullanılır; **Oyna** normal başlatmayı sürdürür.

**Dedicated Server** için `mb_warband_wse2_dedicated.exe`, `mb_warband_wse2_dedicated_x64.exe`, `mb_warband_wse2_dedicated_campaign.exe` veya `mb_warband_wse2_dedicated_campaign_x64.exe` seçilebilir. Sunucu komut dosyası (`-r`, ör. `Native.txt`) normal dedicated için zorunlu, campaign için isteğe bağlıdır. WSE2 ayar dosyası (`--config-path`, ör. `server_config.ini`) isteğe bağlıdır ve komut dosyasından farklıdır. Seçili mod sunucu exe'sinin yanındaki `Modules/<mod adı>` içinde de kurulu olmalıdır; Workshop dosyaları otomatik kopyalanmaz. Campaign modu sunucu olarak çalışmayı desteklemelidir; launcher world/kayıt dosyası yönetmez.

INI yolunun yanındaki **Düzenle / Oluştur**, mevcut ayar arayüzünü seçili sunucu dosyası için açar; client mod ayarlarına dokunmaz. Bilinen ayarlar ortak kontrollerle gösterilir, ek INI bölüm ve alanları korunur. **Kaydet** seçili dosyayı günceller; **Farklı Kaydet** yeni dosya/kopya oluşturup yolu sunucu paneline aktarır. Yeni veya bulunamayan dosyalar için kayıt konumu seçilir. Kaydetme sırasında INI biçimi yenilenir ve yorumlar kaldırılır.

**TXT'den Argüman Yükle** ile UTF-8 argüman listesi yükleyin (BOM ve CRLF desteklenir) veya alana elle yazın. Yükleme alanın içeriğini değiştirir; metni başlatmadan önce düzenleyebilirsiniz. Her dolu satır tek argümandır; tam komut satırı ya da `-r` sunucu komutu değildir:
```text
--example-option
value with spaces
```
Örnek anahtarı kurulu WSE2/mod sürümünün desteklediği seçenekle değiştirin. Exe adı, dış tırnak veya mod/config/komut dosyası anahtarlarını eklemeyin.

Örnek komutlar (giriş parolası olmadan):
```text
mb_warband_wse2.exe --module Native --no-intro --address 127.0.0.1:7240
mb_warband_wse2_dedicated.exe --config-path server_config.ini -r Native.txt --module Native
mb_warband_wse2_dedicated_campaign_x64.exe --config-path server_config.ini --module NativeCoop
```

- Ek argümanları **her satıra bir argüman**, dış tırnak olmadan girin. Mod/config/komut dosyası anahtarları değiştirilemez. Argümanlar shell komutu olarak yorumlanmaz; Windows'ta ayrı konsol için sabit, kodlanmış bir PowerShell `Start-Process` başlatıcısı kullanılır.
- Port, giriş/admin parolaları ve oyun kuralları `-r` komut dosyasından ayarlanır. Sunucu indirme, firewall değişikliği, hazır olma kontrolü veya durdurma/RCON paneli yoktur.
- Sunucu ayrı konsolda, launcher kapandıktan sonra da çalışır. Başlatma hatalarını konsoldan kontrol edin; süreç oluşturulması sunucunun hazır olduğu anlamına gelmez. Sunucuyu kendi konsolundan kapatın.
- Linux'ta Ayarlar'dan Wine ve prefix'i seçin. Wine exe'si yanında `wineconsole` ve `winepath`, ayrıca `xterm` veya `-e command args` destekleyen `x-terminal-emulator` gereklidir.
- Adres/port ve sunucu yolları Electron kullanıcı verisi klasöründeki `multiplayer-settings.json` içinde saklanır. Giriş parolası ve ek argümanlar yalnız oturumda tutulur. Parola launcher loglarında maskelenir; işletim sisteminin süreç argümanlarında görünebilir.
- Anahtarlar [resmî WSE2 belgesini](https://forums.taleworlds.com/index.php?threads/warband-script-enhancer-2.384882/) ve [dedicated örneğini](https://github.com/Ruslan-700/WSE2-Releases/blob/master/Warband/Native_WSE2_dedicated.bat) izler. Gerçek otomatik bağlantı, özel karakterlerin işlenmesi ve Linux/Wine konsol davranışı kullandığınız WSE2 sürümüyle ayrıca doğrulanmalıdır.

### Kurulum ve Kullanım

#### Windows
1. **Kurulum:** Setup EXE dosyasını çalıştırın ve istediğiniz klasöre kurun. Başlatıcı Warband kurulumunu Steam veya Windows kayıt defteri üzerinden algılar ve uygulama içinden güncellenir.
2. **Taşınabilir:** Portable EXE dosyasını `mb_warband_wse2.exe` yanına koyun ya da Steam kurulumunun algılanmasına izin verin. Güncelleme olduğunda başlatıcı yeni Portable EXE dosyasını indirir, kapandıktan sonra kendini değiştirir ve otomatik yeniden açılır.
3. Başlatın, ayarları yapılandırın ve **Launch** butonuna basın.

#### Linux
Bu yerel bir Linux uygulamasıdır, ancak WSE2 bir Windows uygulamasıdır.

**Gereksinim:** `wine` kurulu ve PATH'te erişilebilir olmalıdır.

**Kullanım:**
1. [Releases](../../releases) sayfasından **AppImage** dosyasını indirin.
2. `mb_warband_wse2.exe` ile aynı klasöre koyun.
3. Çalıştırılabilir yapın: `chmod +x WSE2-Launcher.AppImage`
4. Başlatın. **Launch** butonuna basınca `wine` otomatik kullanılır.

#### macOS
1. [Releases](../../releases) sayfasından **`.dmg`** dosyasını indirin.
2. Uygulamayı Warband dizinine yerleştirin.
3. Oyun için Wine veya uyumluluk katmanı (CrossOver/Wineskin) yapılandırıldığından emin olun.

### Derleme

Sürümler bir versiyon etiketi (`v*`) push edildiğinde **GitHub Actions** aracılığıyla otomatik oluşturulur. Linux, Windows ve macOS çıktıları GitHub Releases'e otomatik yüklenir.

```bash
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux (aşağıdaki nota bakın)
npm run dist:mac    # Sadece macOS (macOS'ta çalıştırılmalı)
```

> **Windows'ta AppImage derlemek için Linux derleme ortamı gereklidir.**
> WSL/Linux kullanın veya Linux çıktısını GitHub Actions'a bırakın. Başlatıcının Atölye modları için sembolik bağlantı yetkisine ihtiyacı yoktur.

### Geliştirme ve testler

**Node.js 24+** ve npm kullanın. WSE2/oyun dosyaları ayrıca kurulmalıdır; launcher paketine dahil değildir. Manifest üretimi için PHP 8+ ve `ZipArchive` gerekir; masaüstü uygulaması PHP gerektirmez.

```text
npm install
npm start
npm test
```

`npm test`, Node'un yerleşik test çalıştırıcısını kullanır. Çok oyunculu testleri doğrulama, argümanlar, ayar/parola yönetimi ve Windows/Linux akışlarındaki taklit Electron IPC çağrılarını kapsar. Gerçek WSE2 client/server başlatmaz ve Wine uyumluluğunu kanıtlamaz. Değişen JavaScript dosyaları `node --check` ile denetlenebilir; ayrı lint/type-check komutu yoktur.

Dosya haritası için [Development and tests](#development) bölümüne bakın. Ortak katkıcı/ajan rehberi [AGENTS.md](./AGENTS.md), Claude giriş dosyası [CLAUDE.md](./CLAUDE.md) içindedir. Kullanıcıya yansıyan değişikliklerde üç dilin çevirilerini ve ilgili README bölümlerini birlikte güncelleyin. Kimlik bilgilerini, imza dosyalarını ve yerel mod/derleme verilerini commit etmeyin.

### Sürüm Secret'ları

`.github/workflows/` altındaki iş akışları şu repo secret'larını bekler
(**Settings → Secrets and variables → Actions**):

| Secret | Amacı |
| --- | --- |
| `CSC_LINK` | İmzalama PFX dosyasının base64 hali |
| `CSC_KEY_PASSWORD` | PFX parolası |

Sürüm yayınlama, iş akışının `contents: write` yetkisiyle yerleşik `github.token` değerini kullanır.

### Self-Signed Sertifika (Windows İmzalama)

> Sertifikada **Code Signing** genişletilmiş anahtar kullanımı bulunmalıdır; aksi halde
> electron-builder *"Cannot extract publisher name from code signing certificate"* hatası verir.

**1. Sertifikayı oluşturun (PowerShell):**
```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Adınız, E=eposta@adresiniz.com" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -KeyUsage DigitalSignature `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(5)

$pw = Read-Host "PFX parolası" -AsSecureString
Export-PfxCertificate -Cert $cert -FilePath .\wse2-cert.pfx -Password $pw
```

**2. Anahtar kullanımını doğrulayın:**
```powershell
(Get-PfxCertificate .\wse2-cert.pfx).EnhancedKeyUsageList
```
Çıktıda `Code Signing (1.3.6.1.5.5.7.3.3)` görülmelidir.

**3. Yerel derleme** — `.env` dosyanıza ekleyin (bu dosyayı asla commit etmeyin):
```
CSC_LINK=wse2-cert.pfx
CSC_KEY_PASSWORD=sifreniz
```

**4. GitHub Actions** — base64 çıktısını panoya kopyalayın:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\wse2-cert.pfx")) | Set-Clipboard
```
`CSC_LINK` secret'ına yapıştırın ve `CSC_KEY_PASSWORD` değerini girin.

> Self-signed sertifika SmartScreen uyarısını kaldırmaz — sadece "Bilinmeyen yayıncı" yerine
> adınızı gösterir. Temiz kurulum için ücretli OV/EV sertifikası gerekir.

---

<a name="русский"></a>
## 🇷🇺 Русский

Кастомный лаунчер для Warband Script Enhancer 2 (WSE2) от **Azremen**.

### Особенности
- **Кроссплатформенность:** Windows, Linux и macOS.
- **Управление модулями:** Скачивайте, устанавливайте и удаляйте WSE2 модули прямо из лаунчера.
- **Steam Workshop:** Моды Warband, на которые вы подписаны, появляются в списке автоматически.
- **Поддержка 64-bit:** Переключатель рядом с кнопкой запуска, если есть `mb_warband_wse2_x64.exe`.
- **Прямое подключение:** Запуск выбранного модуля с IPv4-адресом/именем сервера, портом и необязательным паролем входа.
- **Выделенный сервер:** Запуск локального WSE2-сервера в отдельной консоли Windows или Linux/Wine с файлами команд/конфигурации и дополнительными аргументами.
- **Расширенная конфигурация:** Современный интерфейс с поддержкой выбора цвета, выпадающих списков, диапазонов и ползунков.
- **Автообновление:** Автоматически проверяет новые версии и предлагает обновиться.
- **Локализация:** Поддержка русского, английского и турецкого языков.
- **Тёмная/Светлая тема:** Переключаемая тема интерфейса.

### Steam Workshop

Лаунчер читает ваши подписки через Steamworks API — так же, как официальный лаунчер WSE2. Элементы мастерской берутся непосредственно из установленных папок Steam и отображаются в лаунчере; они не копируются и не подключаются к папке `Modules`, поэтому права на символические ссылки не требуются.

- Steam должен быть запущен, а игра — принадлежать текущему аккаунту.
- Если Steam недоступен, выполняется сканирование `steamapps/workshop/content/48700`.
- Модули мастерской нельзя удалить из лаунчера — управляйте ими через Steam.
- Отменённые подписки исчезают из лаунчера при следующем обновлении списка.
- При выборе модуля Workshop его `main.bmp` загружается из папки Steam; если изображения нет, используется стандартная заглушка.

### Прямое подключение и выделенный сервер

Выберите установленный модуль и нажмите **Подключиться**: укажите IPv4-адрес или имя сервера, порт (1–65535) и необязательный пароль **входа**. Имя сервера преобразуется в IPv4. Используется переключатель 64-bit клиента; обычный запуск не меняется.

Для **Выделенного сервера** выберите `mb_warband_wse2_dedicated.exe`, `mb_warband_wse2_dedicated_x64.exe`, `mb_warband_wse2_dedicated_campaign.exe` или `mb_warband_wse2_dedicated_campaign_x64.exe`. Файл команд (`-r`, например `Native.txt`) обязателен для обычного dedicated, но необязателен для campaign. Файл настроек WSE2 (`--config-path`, например `server_config.ini`) необязателен и отличается от файла команд. Выбранный модуль должен быть установлен также в `Modules/<имя модуля>` рядом с exe сервера; файлы Workshop автоматически не копируются. Модуль должен поддерживать campaign-сервер; управление мирами/сохранениями не предусмотрено.

Кнопка **Изменить / Создать** рядом с INI открывает существующий интерфейс настроек для серверного файла, не меняя настройки модуля клиента. Известные параметры используют общие элементы управления; дополнительные секции и параметры сохраняются. **Сохранить** обновляет выбранный файл; **Сохранить как** создаёт новый файл/копию и подставляет путь в панель сервера. Для нового/отсутствующего файла нужно выбрать место сохранения. Формат INI обновляется, комментарии удаляются.

Используйте **Загрузить аргументы из TXT** для списка UTF-8 (поддерживаются BOM и CRLF) или вводите аргументы вручную. Загрузка заменяет текст в поле; затем его можно изменить. Каждая непустая строка — один аргумент, а не полная командная строка или команда файла `-r`:
```text
--example-option
value with spaces
```
Замените пример ключом, поддерживаемым вашей версией WSE2/модуля. Не добавляйте имя exe, внешние кавычки и переопределения модуля/конфигурации/файла команд.

Примеры команд (без пароля входа):
```text
mb_warband_wse2.exe --module Native --no-intro --address 127.0.0.1:7240
mb_warband_wse2_dedicated.exe --config-path server_config.ini -r Native.txt --module Native
mb_warband_wse2_dedicated_campaign_x64.exe --config-path server_config.ini --module NativeCoop
```

- Вводите дополнительные аргументы **по одному на строку**, без внешних кавычек. Переопределять модуль, конфигурацию и файл команд нельзя. Аргументы не исполняются как shell-команды; Windows открывает консоль через фиксированный кодированный вызов PowerShell `Start-Process`.
- Порт, пароли входа/администратора и правила игры задаются в файле `-r`. Загрузка сервера, настройка firewall, проверка готовности и панель остановки/RCON не предусмотрены.
- Сервер работает в отдельной консоли после закрытия лаунчера. Проверяйте ошибки в консоли: запуск процесса не означает готовность сервера. Останавливайте сервер через его консоль.
- В Linux настройте Wine и prefix. Рядом с Wine нужны `wineconsole` и `winepath`, а также `xterm` или `x-terminal-emulator` с поддержкой `-e command args`.
- Адрес/порт и пути сохраняются в `multiplayer-settings.json` в каталоге пользовательских данных Electron. Пароль входа и дополнительные аргументы хранятся только в сеансе. Пароль маскируется в журнале, но может быть виден в аргументах процесса ОС.
- Ключи соответствуют [официальной документации WSE2](https://forums.taleworlds.com/index.php?threads/warband-script-enhancer-2.384882/) и [примеру сервера](https://github.com/Ruslan-700/WSE2-Releases/blob/master/Warband/Native_WSE2_dedicated.bat). Автоподключение, специальные символы и консоль Linux/Wine требуют проверки с вашей версией WSE2.

### Установка и использование

#### Windows
1. **Установщик:** Запустите Setup EXE и установите его в любую папку. Лаунчер определит Warband через Steam или реестр Windows и поддерживает обновления из приложения.
2. **Portable:** Поместите Portable EXE рядом с `mb_warband_wse2.exe` или разрешите ему обнаружить установленную Steam-копию. При наличии обновления лаунчер загрузит новый Portable EXE, заменит себя после закрытия и автоматически перезапустится.
3. Запустите, настройте параметры и нажмите **Launch**.

#### Linux
Лаунчер является нативным Linux-приложением, но WSE2 — это Windows-приложение.

**Требование:** установленный `wine`, доступный в PATH.

**Использование:**
1. Скачайте **AppImage** со страницы [Releases](../../releases).
2. Поместите рядом с `mb_warband_wse2.exe`.
3. Сделайте исполняемым: `chmod +x WSE2-Launcher.AppImage`
4. Запустите. При нажатии **Launch** автоматически используется `wine`.

#### macOS
1. Скачайте **`.dmg`** со страницы [Releases](../../releases).
2. Поместите приложение в папку Warband.
3. Убедитесь, что Wine или слой совместимости (CrossOver/Wineskin) настроен для игры.

### Сборка

Релизы собираются автоматически через **GitHub Actions** при пуше тега версии (`v*`). Бинарники для Linux, Windows и macOS публикуются в GitHub Releases.

```bash
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux (см. примечание ниже)
npm run dist:mac    # Только macOS (запускать на macOS)
```

> **Для сборки AppImage на Windows нужна среда Linux.**
> Используйте WSL/Linux или GitHub Actions. Для модулей Workshop самому лаунчеру не нужны права на символические ссылки.

### Разработка и тесты

Используйте **Node.js 24+** и npm. WSE2/игра устанавливаются отдельно и не входят в пакет лаунчера. Для генерации манифестов нужны PHP 8+ и `ZipArchive`; настольное приложение не требует PHP.

```text
npm install
npm start
npm test
```

`npm test` использует встроенный тестовый раннер Node. Тесты проверяют валидацию, аргументы, настройки/пароли и имитацию Electron IPC для Windows/Linux. Они **не** запускают настоящий клиент/сервер WSE2 и не подтверждают совместимость Wine. Синтаксис изменённых JavaScript-файлов проверяется через `node --check`; отдельного lint/type-check скрипта нет.

Карта файлов приведена в разделе [Development and tests](#development). Общие инструкции для участников и агентов находятся в [AGENTS.md](./AGENTS.md), а [CLAUDE.md](./CLAUDE.md) подключает их для Claude. Пользовательские изменения сопровождайте обновлением трёх локалей и соответствующих разделов README. Не коммитьте учётные данные, файлы подписи и локальные игровые/сборочные данные.

### Секреты для релиза

Рабочие процессы в `.github/workflows/` ожидают следующие секреты репозитория
(**Settings → Secrets and variables → Actions**):

| Секрет | Назначение |
| --- | --- |
| `CSC_LINK` | Base64 сертификата PFX |
| `CSC_KEY_PASSWORD` | Пароль от PFX |

Публикация релиза использует встроенный `github.token` с разрешением `contents: write` рабочего процесса.

### Self-Signed сертификат (подпись Windows)

> Сертификат обязательно должен иметь назначение **Code Signing**, иначе electron-builder
> выдаст ошибку *"Cannot extract publisher name from code signing certificate"*.

**1. Создание сертификата (PowerShell):**
```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=ВашеИмя, E=ваш@email.com" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -KeyUsage DigitalSignature `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(5)

$pw = Read-Host "Пароль PFX" -AsSecureString
Export-PfxCertificate -Cert $cert -FilePath .\wse2-cert.pfx -Password $pw
```

**2. Проверка:**
```powershell
(Get-PfxCertificate .\wse2-cert.pfx).EnhancedKeyUsageList
```
В выводе должно быть `Code Signing (1.3.6.1.5.5.7.3.3)`.

**3. Локальная сборка** — добавьте в `.env` (не коммитьте этот файл):
```
CSC_LINK=wse2-cert.pfx
CSC_KEY_PASSWORD=yourpassword
```

**4. GitHub Actions** — скопируйте base64 в буфер обмена:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\wse2-cert.pfx")) | Set-Clipboard
```
Вставьте в секрет `CSC_LINK` и задайте `CSC_KEY_PASSWORD`.

> Self-signed сертификат не убирает предупреждение SmartScreen — он лишь заменяет
> "Неизвестный издатель" на ваше имя. Для чистой установки нужен платный OV/EV сертификат.

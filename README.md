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
- **Enhanced Configuration:** Modern UI with support for Color Pickers, Drop-down Menus, Ranges, and Sliders.
- **Auto-Updater:** Automatically checks for new launcher versions and prompts to update.
- **Localization:** Supports English, Turkish, and Russian.
- **Dark/Light Theme:** Switchable UI theme.

### Steam Workshop

The launcher reads your subscribed items through the Steamworks API, exactly like the official WSE2 launcher. Because the game engine only loads modules from its own `Modules` folder, each workshop item is exposed there as a **junction/symlink** — nothing is copied, and Steam updates apply instantly.

- Steam must be running and the game must be owned by the signed-in account.
- If Steam is unavailable, the launcher falls back to scanning `steamapps/workshop/content/48700`.
- Workshop modules cannot be removed from the launcher; manage them through Steam.
- Unsubscribed items have their links cleaned up on the next launcher start.

### Installation & Usage

#### Windows
1. **Download** the launcher (Installer or Portable) from the [Releases](../../releases) page.
2. Place the launcher in your **Mount & Blade Warband** game directory (same folder as `mb_warband_wse2.exe`).
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

> **Building the AppImage on Windows fails** with `EPERM: operation not permitted, symlink`.
> Enable **Developer Mode** (Settings → Privacy & security → For developers), build from WSL,
> or simply let GitHub Actions produce the Linux artifact.

### Release Secrets

The workflows in `.github/workflows/` expect these repository secrets
(**Settings → Secrets and variables → Actions**):

| Secret | Purpose |
| --- | --- |
| `GH_TOKEN` | PAT with `Contents: Read and write` on both target repositories |
| `CSC_LINK` | Base64 of the code signing PFX |
| `CSC_KEY_PASSWORD` | PFX password |

### Self-Signed Certificate (Windows Code Signing)

> The certificate **must** carry the Code Signing extended key usage, otherwise
> electron-builder fails with *"Cannot extract publisher name from code signing certificate"*.

**1. Create the certificate (PowerShell):**
```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=YourName" `
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
- **Gelişmiş Yapılandırma:** Renk Seçiciler, Açılır Menüler, Aralıklar ve Kaydırıcılar içeren modern arayüz.
- **Otomatik Güncelleme:** Yeni başlatıcı sürümlerini otomatik kontrol eder ve güncelleme önerir.
- **Yerelleştirme:** Türkçe, İngilizce ve Rusça desteği.
- **Koyu/Açık Tema:** Değiştirilebilir arayüz teması.

### Steam Atölyesi

Başlatıcı, abone olduğunuz öğeleri resmi WSE2 başlatıcısıyla aynı şekilde Steamworks API üzerinden okur. Oyun motoru yalnızca kendi `Modules` klasöründen modül yükleyebildiği için her atölye öğesi oraya **junction/symlink** olarak bağlanır — dosya kopyalanmaz, Steam güncellemeleri anında yansır.

- Steam açık olmalı ve oyun giriş yapılmış hesapta sahipli olmalıdır.
- Steam erişilemezse `steamapps/workshop/content/48700` klasörü taranarak devam edilir.
- Atölye modülleri başlatıcıdan kaldırılamaz; yönetimi Steam üzerinden yapılır.
- Abonelikten çıkılan öğelerin bağlantıları bir sonraki açılışta temizlenir.

### Kurulum ve Kullanım

#### Windows
1. [Releases](../../releases) sayfasından başlatıcıyı **indirin** (Kurulum veya Taşınabilir).
2. **Mount & Blade Warband** oyun klasörüne koyun (`mb_warband_wse2.exe` ile aynı dizin).
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

> **Windows'ta AppImage derlemesi başarısız olur:** `EPERM: operation not permitted, symlink`.
> **Geliştirici Modu**'nu açın (Ayarlar → Gizlilik ve güvenlik → Geliştiriciler için),
> WSL içinden derleyin veya Linux çıktısını GitHub Actions'a bırakın.

### Sürüm Secret'ları

`.github/workflows/` altındaki iş akışları şu repo secret'larını bekler
(**Settings → Secrets and variables → Actions**):

| Secret | Amacı |
| --- | --- |
| `GH_TOKEN` | Her iki hedef repoda `Contents: Read and write` yetkisi olan PAT |
| `CSC_LINK` | İmzalama PFX dosyasının base64 hali |
| `CSC_KEY_PASSWORD` | PFX parolası |

### Self-Signed Sertifika (Windows İmzalama)

> Sertifikada **Code Signing** genişletilmiş anahtar kullanımı bulunmalıdır; aksi halde
> electron-builder *"Cannot extract publisher name from code signing certificate"* hatası verir.

**1. Sertifikayı oluşturun (PowerShell):**
```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Adınız" `
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
- **Расширенная конфигурация:** Современный интерфейс с поддержкой выбора цвета, выпадающих списков, диапазонов и ползунков.
- **Автообновление:** Автоматически проверяет новые версии и предлагает обновиться.
- **Локализация:** Поддержка русского, английского и турецкого языков.
- **Тёмная/Светлая тема:** Переключаемая тема интерфейса.

### Steam Workshop

Лаунчер читает ваши подписки через Steamworks API — так же, как официальный лаунчер WSE2. Поскольку движок загружает модули только из своей папки `Modules`, каждый элемент мастерской подключается туда как **junction/symlink** — файлы не копируются, обновления Steam применяются сразу.

- Steam должен быть запущен, а игра — принадлежать текущему аккаунту.
- Если Steam недоступен, выполняется сканирование `steamapps/workshop/content/48700`.
- Модули мастерской нельзя удалить из лаунчера — управляйте ими через Steam.
- Ссылки на отменённые подписки удаляются при следующем запуске.

### Установка и использование

#### Windows
1. **Скачайте** лаунчер со страницы [Releases](../../releases) (Установщик или Portable).
2. Поместите в папку **Mount & Blade Warband** (рядом с `mb_warband_wse2.exe`).
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

> **Сборка AppImage на Windows падает** с ошибкой `EPERM: operation not permitted, symlink`.
> Включите **Режим разработчика**, собирайте из WSL или оставьте Linux-сборку GitHub Actions.

### Секреты для релиза

Рабочие процессы в `.github/workflows/` ожидают следующие секреты репозитория
(**Settings → Secrets and variables → Actions**):

| Секрет | Назначение |
| --- | --- |
| `GH_TOKEN` | PAT с правами `Contents: Read and write` в обоих репозиториях |
| `CSC_LINK` | Base64 сертификата PFX |
| `CSC_KEY_PASSWORD` | Пароль от PFX |

### Self-Signed сертификат (подпись Windows)

> Сертификат обязательно должен иметь назначение **Code Signing**, иначе electron-builder
> выдаст ошибку *"Cannot extract publisher name from code signing certificate"*.

**1. Создание сертификата (PowerShell):**
```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=ВашеИмя" `
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

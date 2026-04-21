# Warband Script Enhancer 2 Launcher

[English](#english) | [Türkçe](#türkçe) | [Русский](#русский)

---

<a name="english"></a>
## 🇬🇧 English

A custom launcher for Warband Script Enhancer 2 (WSE2) by **Azremen**.

### Features
- **Cross-Platform:** Runs on Windows, Linux, and macOS.
- **Module Management:** Browse, download, install, and remove WSE2 modules directly from the launcher.
- **Enhanced Configuration:** Modern UI with support for Color Pickers, Drop-down Menus, Ranges, and Sliders.
- **Auto-Updater:** Automatically checks for new launcher versions and prompts to update.
- **Localization:** Supports English, Turkish, and Russian.
- **Dark/Light Theme:** Switchable UI theme.

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
npm run dist:all   # Linux + Windows
npm run dist:mac   # macOS only (must run on macOS)
```

### Self-Signed Certificate (Windows Code Signing)

**1. Generate Key and Certificate:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=MyCert"
```

**2. Export to PFX:**
```bash
openssl pkcs12 -export -out wse2-cert.pfx -inkey key.pem -in cert.pem
```
Add to your `.env`:
```
CSC_KEY_PASSWORD=yourpassword
```

**3. For GitHub Actions:**
```bash
base64 wse2-cert.pfx -w 0
```
Go to **Repo Settings → Secrets → Actions** and create:
- `CSC_LINK` → paste the base64 string
- `CSC_KEY_PASSWORD` → your password

---

<a name="türkçe"></a>
## 🇹🇷 Türkçe

**Azremen** tarafından geliştirilen Warband Script Enhancer 2 (WSE2) için özel başlatıcı.

### Özellikler
- **Çoklu Platform:** Windows, Linux ve macOS üzerinde çalışır.
- **Modül Yönetimi:** WSE2 modüllerini doğrudan başlatıcıdan indirin, kurun ve kaldırın.
- **Gelişmiş Yapılandırma:** Renk Seçiciler, Açılır Menüler, Aralıklar ve Kaydırıcılar içeren modern arayüz.
- **Otomatik Güncelleme:** Yeni başlatıcı sürümlerini otomatik kontrol eder ve güncelleme önerir.
- **Yerelleştirme:** Türkçe, İngilizce ve Rusça desteği.
- **Koyu/Açık Tema:** Değiştirilebilir arayüz teması.

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
npm run dist:all   # Linux + Windows
npm run dist:mac   # Sadece macOS (macOS'ta çalıştırılmalı)
```

### Self-Signed Sertifika (Windows İmzalama)

**1. Anahtar ve Sertifika Oluşturun:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=MyCert"
```

**2. PFX'e Dönüştürün:**
```bash
openssl pkcs12 -export -out wse2-cert.pfx -inkey key.pem -in cert.pem
```
`.env` dosyasına ekleyin:
```
CSC_KEY_PASSWORD=sifreniz
```

**3. GitHub Actions İçin:**
```bash
base64 wse2-cert.pfx -w 0
```
**Repo Ayarları → Secrets → Actions** kısmına gidin:
- `CSC_LINK` → base64 çıktısını yapıştırın
- `CSC_KEY_PASSWORD` → şifreniz

---

<a name="русский"></a>
## 🇷🇺 Русский

Кастомный лаунчер для Warband Script Enhancer 2 (WSE2) от **Azremen**.

### Особенности
- **Кроссплатформенность:** Windows, Linux и macOS.
- **Управление модулями:** Скачивайте, устанавливайте и удаляйте WSE2 модули прямо из лаунчера.
- **Расширенная конфигурация:** Современный интерфейс с поддержкой выбора цвета, выпадающих списков, диапазонов и ползунков.
- **Автообновление:** Автоматически проверяет новые версии и предлагает обновиться.
- **Локализация:** Поддержка русского, английского и турецкого языков.
- **Тёмная/Светлая тема:** Переключаемая тема интерфейса.

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
npm run dist:all   # Linux + Windows
npm run dist:mac   # Только macOS (запускать на macOS)
```

### Self-Signed сертификат (подпись Windows)

**1. Создание ключа и сертификата:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=MyCert"
```

**2. Конвертация в PFX:**
```bash
openssl pkcs12 -export -out wse2-cert.pfx -inkey key.pem -in cert.pem
```
Добавьте в `.env`:
```
CSC_KEY_PASSWORD=yourpassword
```

**3. Для GitHub Actions:**
```bash
base64 wse2-cert.pfx -w 0
```
Перейдите в **Repo Settings → Secrets → Actions** и создайте:
- `CSC_LINK` → вставьте строку base64
- `CSC_KEY_PASSWORD` → ваш пароль
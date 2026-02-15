# Warband Script Enhancer 2 Launcher

[English](#english) | [Türkçe](#türkçe) | [Русский](#русский)

---

<a name="english"></a>
## 🇬🇧 English

A custom launcher for Warband Script Enhancer 2 (WSE2) by **Azremen**.

### Features
- **Cross-Platform:** Runs on Windows, Linux, and macOS.
- **Enhanced Configuration:** Up-to-date UI with support for Color Pickers, Drop-down Menus, Ranges, and Sliders.
- **Localization:** Supports multi-language descriptions.

### Installation & Usage

#### Windows
1. **Download** the launcher (Installer or Portable).
2. Place the launcher setup or executable in your **Mount & Blade Warband** game directory.
   - It must be in the same folder as `mb_warband_wse2.exe`.
3. Run the launcher and configure your settings.
4. Click **Launch** to start the game.

#### Linux
This launcher is a native Linux application, but WSE2 itself is a 32-bit Windows application (`mb_warband_wse2.exe`).

**Requirements:**
- **Wine** must be installed and available in your system PATH (`wine --version`).

**Usage:**
1. Place the created **AppImage** in your Mount & Blade Warband directory next to `mb_warband_wse2.exe`.
2. Run the launcher.
3. When you click **Launch**, it will automatically use `wine` to start the game.

#### macOS
WSE2 is a Windows application, so you must use Wine or a compatibility layer (CrossOver/Wineskin) to run the game content.

1. Place the launcher app in your Warband directory.
2. Ensure you have a Wine environment configured.
3. Launching might require manual configuration depending on your specific Wine wrapper setup on macOS.

### Building
To build executables for all platforms:
```bash
npm run dist
```

### Self-Signed Certificate Generation
If you want to create your own `wse2-cert.pfx` for signing the Windows executable, you can use OpenSSL.

**1. Generate Private Key and Certificate:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/C=US/ST=State/L=City/O=Dummy Organization/OU=Dummy Unit/CN=Dummy Common Name"
```

**2. Export to PFX Format:**
```bash
openssl pkcs12 -export -out wse2-cert.pfx -inkey key.pem -in cert.pem
```
*   When prompted for an **Export Password**, enter the password you want to use (e.g., `dummy123`).
*   Update your `.env` file with this password: `CSC_KEY_PASSWORD=dummy123`.

**3. For GitHub Actions (CI/CD):**
To use this certificate in GitHub Actions without committing the file to the repo:
```bash
base64 wse2-cert.pfx -w 0
```
*   Copy the output string.
*   Go to GitHub Repo Settings -> Secrets -> Actions.
*   Create a new secret named `CSC_LINK` and paste the base64 string.
*   Create another secret named `CSC_KEY_PASSWORD` with your password.

---

<a name="türkçe"></a>
## 🇹🇷 Türkçe

**Azremen** tarafından geliştirilen Warband Script Enhancer 2 (WSE2) için özel başlatıcı.

### Özellikler
- **Çoklu Platform:** Windows, Linux ve macOS üzerinde çalışır.
- **Gelişmiş Yapılandırma:** Renk Seçiciler, Açılır Menüler, Aralıklar ve Kaydırıcılar için modern arayüz desteği.
- **Yerelleştirme:** Çoklu dil açıklamalarını destekler.

### Başlatma ve Kullanım

#### Windows
1. **İndirin** (Kurulum veya Taşınabilir).
2. Dosyayı **Mount & Blade Warband** oyun klasörünüze yerleştirin (`mb_warband_wse2.exe` yanına).
3. Başlatın ve ayarlarınızı yapın.
4. **Launch** butonuna basın.

#### Linux
Bu yerel bir Linux uygulamasıdır, ancak WSE2 (Oyun motoru) Windows uygulamasıdır. `wine` gerektirir.

**Kullanım:**
1. **AppImage** dosyasını oyun klasörüne atın.
2. Başlatıcıyı çalıştırın.
3. Otomatik olarak `wine mb_warband_wse2.exe` komutunu dener.

### Kendi Sertifikanızı Oluşturma (İmzalama İçin)
Eğer kendi `wse2-cert.pfx` dosyanızı oluşturmak isterseniz:

**1. Sertifika ve Anahtar Oluşturun:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/C=US/ST=State/L=City/O=Dummy Organization/OU=Dummy Unit/CN=Dummy Common Name"
```

**2. PFX'e Dönüştürün:**
```bash
openssl pkcs12 -export -out wse2-cert.pfx -inkey key.pem -in cert.pem
```
*   Şifre sorduğunda bir şifre belirleyin (örn: `dummy123`).
*   `.env` dosyasına bu şifreyi yazın: `CSC_KEY_PASSWORD=dummy123`.

**3. GitHub Actions İçin (İsteğe Bağlı):**
Sertifika dosyasını repoya yüklemek istemiyorsanız (güvenlik için):
```bash
base64 wse2-cert.pfx -w 0
```
*   Çıkan uzun yazıyı kopyalayın.
*   GitHub Repo Ayarları -> Secrets -> Actions kısmına gidin.
*   `CSC_LINK` adında bir secret oluşturup bu yazıyı yapıştırın.
*   `CSC_KEY_PASSWORD` secret'ını şifrenizle güncelleyin.

---

<a name="русский"></a>
## 🇷🇺 Русский

Кастомный лаунчер для Warband Script Enhancer 2 (WSE2) от **Azremen**.

### Особенности
- **Кроссплатформенность:** Windows, Linux и macOS.
- **Интерфейс:** Современный UI с поддержкой локализации.

### Использование

#### Windows
1. Скачайте и поместите в папку с игрой **Mount & Blade Warband** (рядом с `mb_warband_wse2.exe`).
2. Запустите и нажмите **Launch**.

#### Linux
Требует установленного **Wine**, так как WSE2 — это Windows-приложение. Лаунчер сам запустит игру через Wine.

### Создание сертификата (Self-Signed)
Для создания `wse2-cert.pfx`:

**1. Создание ключа:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/C=US/ST=State/L=City/O=Dummy Organization/OU=Dummy Unit/CN=Dummy Common Name"
```

**2. Конвертация в PFX:**
```bash
openssl pkcs12 -export -out wse2-cert.pfx -inkey key.pem -in cert.pem
```
*   Задайте пароль (например, `dummy123`).
*   Укажите его в `.env`: `CSC_KEY_PASSWORD=dummy123`.

**3. Для GitHub Actions (Опционально):**
Чтобы использовать сертификат без добавления файла в репозиторий:
```bash
base64 wse2-cert.pfx -w 0
```
*   Скопируйте полученную строку.
*   Перейдите в GitHub Repo Settings -> Secrets -> Actions.
*   Создайте секрет `CSC_LINK` и вставьте строку base64.
*   Задайте пароль в секрете `CSC_KEY_PASSWORD`.

<a name="türkçe"></a>
## 🇹🇷 Türkçe

Warband Script Enhancer 2 (WSE2) için **Azremen** tarafından geliştirilen özel bir başlatıcı.

### Özellikler
- **Çapraz Platform:** Windows, Linux ve macOS üzerinde çalışır.
- **Gelişmiş Yapılandırma:** Renk Seçiciler, Açılır Menüler, Aralıklar ve Kaydırıcılar içeren güncel arayüz.
- **Yerelleştirme:** Çoklu dil açıklamalarını destekler.

### Kurulum ve Kullanım

#### Windows
1. Başlatıcıyı **indirin** (Kurulum veya Taşınabilir).
2. Başlatıcıyı veya kurulum dosyasını **Mount & Blade Warband** oyun dizinine yerleştirin.
   - `mb_warband_wse2.exe` ile aynı klasörde olmalıdır.
3. Başlatıcıyı çalıştırın ve ayarlarınızı yapılandırın.
4. Oyunu başlatmak için **Başlat** butonuna tıklayın.

#### Linux
Bu başlatıcı yerel bir Linux uygulamasıdır, ancak WSE2'nin kendisi 32-bit bir Windows uygulamasıdır (`mb_warband_wse2.exe`).

**Gereksinimler:**
- **Wine** kurulu olmalı ve sistem PATH'inizde erişilebilir olmalıdır (`wine --version`).

**Kullanım:**
1. Oluşturulan **AppImage** dosyasını Mount & Blade Warband dizininize, `mb_warband_wse2.exe` dosyasının yanına yerleştirin.
2. Başlatıcıyı çalıştırın.
3. **Başlat** (Launch) butonuna tıkladığınızda, oyunu başlatmak için otomatik olarak `wine` kullanılacaktır.

#### macOS
WSE2 bir Windows uygulamasıdır, bu nedenle oyun içeriğini çalıştırmak için Wine veya bir uyumluluk katmanı (CrossOver/Wineskin) kullanmanız gerekir.

1. Başlatıcı uygulamasını Warband dizinine yerleştirin.
2. Bir Wine ortamının yapılandırıldığından emin olun.
3. macOS üzerindeki Wine sarmalayıcı (wrapper) kurulumunuza bağlı olarak başlatma işlemi manuel yapılandırma gerektirebilir.

### Derleme
Tüm platformlar için çalıştırılabilir dosyalar oluşturmak için:
```bash
npm run dist
```

---

<a name="русский"></a>
## 🇷🇺 Русский

Пользовательский лаунчер для Warband Script Enhancer 2 (WSE2) от **Azremen**.

### Особенности
- **Кроссплатформенность:** Работает на Windows, Linux и macOS.
- **Расширенная конфигурация:** Актуальный интерфейс с поддержкой выбора цвета, выпадающих списков, диапазонов и ползунков.
- **Локализация:** Поддержка многоязычных описаний.

### Установка и использование

#### Windows
1. **Скачайте** лаунчер (Установщик или Portable).
2. Поместите установщик или исполняемый файл в папку игры **Mount & Blade Warband**.
   - Он должен находиться в той же папке, что и `mb_warband_wse2.exe`.
3. Запустите лаунчер и настройте параметры.
4. Нажмите **Запуск**, чтобы начать игру.

#### Linux
Этот лаунчер является нативным Linux-приложением, но сам WSE2 — это 32-битное приложение Windows (`mb_warband_wse2.exe`).

**Требования:**
- **Wine** должен быть установлен и доступен в системной переменной PATH (`wine --version`).

**Использование:**
1. Поместите созданный **AppImage** в папку Mount & Blade Warband рядом с `mb_warband_wse2.exe`.
2. Запустите лаунчер.
3. При нажатии кнопки **Запуск**, он автоматически использует `wine` для запуска игры.

#### macOS
WSE2 — это приложение Windows, поэтому для запуска игры вам потребуется Wine или слой совместимости (CrossOver/Wineskin).

1. Поместите приложение лаунчера в папку Warband.
2. Убедитесь, что среда Wine настроена.
3. Запуск может потребовать ручной настройки в зависимости от вашей конфигурации Wine на macOS.

### Сборка
Для сборки исполняемых файлов для всех платформ:
```bash
npm run dist
```

# Warband Script Enhancer 2 Launcher

[English](#english) | [Türkçe](#türkçe) | [Русский](#русский)

---

<a name="english"></a>
## 🇬🇧 English

A custom launcher for Warband Script Enhancer 2 (WSE2) by **Azremen**.

### Features
- **Cross-Platform:** Runs on Windows, Linux, and macOS.
- **Enhanced Configuration:** Modern UI with support for Color Pickers, Drop-down Menus, Ranges, and Sliders.
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

---

<a name="türkçe"></a>
## 🇹🇷 Türkçe

Warband Script Enhancer 2 (WSE2) için **Azremen** tarafından geliştirilen özel bir başlatıcı.

### Özellikler
- **Çapraz Platform:** Windows, Linux ve macOS üzerinde çalışır.
- **Gelişmiş Yapılandırma:** Renk Seçiciler, Açılır Menüler, Aralıklar ve Kaydırıcılar içeren modern arayüz.
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
- **Расширенная конфигурация:** Современный интерфейс с поддержкой выбора цвета, выпадающих списков, диапазонов и ползунков.
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

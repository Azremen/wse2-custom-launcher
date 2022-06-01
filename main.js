const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut } = require("electron");
const path = require("path");
const fs = require('fs');
var DecompressZip = require('decompress-zip');

var tempPath = "./Modules";

var cfgWindow = null;

if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath);

var dir = path.join(__dirname, 'Modules');

var mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        sandbox: true,
        width: 1280,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenuBarVisibility(false);

    mainWindow.loadFile('main.html');

    ipcMain.handle('dark-mode:toggle', async (event, args) => {
        if (nativeTheme.shouldUseDarkColors) {
            nativeTheme.themeSource = 'light';
            result = false
        }
        else {
            nativeTheme.themeSource = 'dark';
            result = true
        }

        return result;
    });

    ipcMain.on('sendLauncherVersion', (event, args) => {
        result = app.getVersion().toString();

        event.returnValue = result;
    });

    ipcMain.on('configWindow', (event, args) => {
        cfgWindow = new BrowserWindow({
            sandbox: true,
            width: 640,
            height: 360,
            frame: false,
            parent: mainWindow,
            modal: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js')
            }
        });

        cfgWindow.once('ready-to-show', () => {
            cfgWindow.show()
        })

        cfgWindow.loadFile('config.html');
    });

    ipcMain.on("download", (event, info) => {
        console.log(info)
        mainWindow.webContents.session.downloadURL(info.url);
    });

    ipcMain.on("store-data", (event, info) => {
        var files = fs.readdirSync(dir);
        var ret = [];

        for (i in files) {
            if (fs.existsSync(path.join(dir, files[i])) && fs.statSync(path.join(dir, files[i])).isDirectory()) {
                var n = { name: null, version: null, path: null, img: null }
                n.name = files[i];
                n.path = path.join(__dirname, 'Modules', files[i]);
                var moduleVersionDir = path.join(__dirname, 'Modules', files[i], 'version.json');

                if (fs.existsSync(moduleVersionDir)) {
                    rawdata = fs.readFileSync(path.resolve(moduleVersionDir));
                    n.version = JSON.parse(rawdata).version;
                }
                n.img = fs.existsSync(path.join(__dirname, 'Modules', files[i], 'main.bmp'));

                ret.push(n);
            }
        }

        event.returnValue = ret;
    });

    ipcMain.on('dirRemove', (event, args) => {
        console.log(args)
        if (args != null && fs.existsSync(args.module)) {
            fs.rmSync(args.module, { recursive: true });
            mainWindow.webContents.executeJavaScript('modules = getData.data();renderList();');
        }
    });

    ipcMain.on('configWindowBack', (event, args) => {
        if (cfgWindow != null) {
            cfgWindow.close();
        }
    });

    mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
        // Set the save path, making Electron not to prompt a save dialog.
        const tempName = path.join(__dirname, "Modules", "temp.zip");

        item.setSavePath(tempName)
        //  console.log(app.getAppPath())

        item.on('updated', (event, state) => {

            if (state === 'interrupted') {
                //item.resume()
                console.log('Download is interrupted but can be resumed')
            } else if (state === 'progressing') {
                if (item.isPaused()) {
                    console.log('Download is paused')
                } else {
                    var perc = item.getReceivedBytes() / item.getTotalBytes() * 100
                    mainWindow.webContents.executeJavaScript("updateProgressbar(" + perc + ");");
                    //console.log(`Received bytes: ${}`)
                }
            }
        });

        item.once('done', (event, state) => {
            if (state === 'completed') {
                var unzipper = new DecompressZip(tempName);

                unzipper.on('extract', function (log) {
                    fs.unlinkSync(tempName);
                    mainWindow.webContents.executeJavaScript('modules = getData.data();renderList();');
                });

                unzipper.extract({
                    path: path.join(__dirname, "Modules")
                });

                console.log('Download successfully');
            } else {
                console.log("Download failed:" + state);
            }
        });
    });
};

app.whenReady().then(() => {
    createWindow();
    globalShortcut.register('CommandOrControl+R', () => {
        mainWindow.reload();
        if (cfgWindow != null) {
            cfgWindow.reload();
        }
    });

    globalShortcut.register('CommandOrControl+D', () => {
        mainWindow.webContents.openDevTools();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
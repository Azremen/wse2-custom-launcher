const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
var DecompressZip = require('decompress-zip');

// Set global temporary directory for things like auto update downloads, creating it if it doesn't exist already.
global.tempPath = "./Modules";

if (!fs.existsSync(global.tempPath)) fs.mkdirSync(global.tempPath);

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

    ipcMain.on("download", (event, info) => {
        console.log(info)
        mainWindow.webContents.session.downloadURL(info.url);
    });

    ipcMain.on("store-data", (event, info) => {
        var files = fs.readdirSync(dir);
        
        if (info.info == 'moduleVersion') {
            var moduleVersion = moduleVersion || [];

            for (i in files) {
                var moduleVersionDir = path.join(__dirname, 'Modules', files[i], 'Version.json');

                if (!fs.existsSync(moduleVersionDir)) {
                    moduleVersion.push('Unknown Version');
                } else {
                    rawdata = fs.readFileSync(path.resolve(moduleVersionDir));
                    moduleVersion.push(JSON.parse(rawdata).version);
                }
            }

            event.returnValue = moduleVersion
        } else if (info.info == 'data') {
            var files = fs.readdirSync(dir);

            for (i in files) {
                var moduleDirectories = moduleDirectories || [];

                if (fs.existsSync(dir)) {
                    if (fs.lstatSync(dir).isDirectory()) {
                        moduleDirectories.push(files[i]);
                    } else {
                        console.log('false')
                        moduleDirectories.push(false);
                    }
                } else {
                    console.log('help')
                    moduleDirectories = false;
                }
            }

            event.returnValue = moduleDirectories;
        } else if (info.info == 'img') {
            for (i in files) {
                var img = path.join(__dirname, 'Modules', files[i], 'main.bmp');
                
                if (!fs.existsSync(img)) {
                    img = 'No Image';
                }

                event.returnValue = img;
            }
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
    createWindow()
    globalShortcut.register('CommandOrControl+R', () => {
        mainWindow.reload();
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
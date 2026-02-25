const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const OdooService = require('./odooService');

let mainWindow;
let odooSession = null; // { url, db, uid, password, user }

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 768,
        title: 'HotPos - Restaurant POS',
        icon: path.join(__dirname, '../public/icon.png'),
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Maximize and show the window
    mainWindow.maximize();
    mainWindow.show();
}

// ========== IPC Handlers ==========

ipcMain.handle('odoo:login', async (_event, url, db, username, password) => {
    try {
        const uid = await OdooService.authenticate(url, db, username, password);
        const userInfo = await OdooService.getUserInfo(url, db, uid, password);
        const user = userInfo && userInfo.length > 0 ? userInfo[0] : { id: uid, name: username };

        odooSession = { url, db, uid, password, user };

        return {
            success: true,
            user: {
                uid,
                name: user.name,
                login: user.login || username,
                email: user.email || '',
            },
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getPosConfigs', async () => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const configs = await OdooService.getPosConfigs(url, db, uid, password);
        return { success: true, configs, currentUid: uid };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:openPosSession', async (_event, configId) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const session = await OdooService.openPosSession(url, db, uid, password, configId);
        return { success: true, session };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getProducts', async () => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const products = await OdooService.getProducts(url, db, uid, password);
        return { success: true, products };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getCustomers', async () => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const customers = await OdooService.getCustomers(url, db, uid, password);
        return { success: true, customers };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getPosCategories', async () => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const categories = await OdooService.getPosCategories(url, db, uid, password);
        return { success: true, categories };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getUserInfo', async () => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    return { success: true, user: odooSession.user };
});

// ========== App Lifecycle ==========

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

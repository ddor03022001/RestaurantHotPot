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
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // app.isPackaged is the reliable way to detect production in Electron
    if (!app.isPackaged) {
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

ipcMain.handle('odoo:getPricelists', async (event, pricelistIds) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const pricelists = await OdooService.getPricelists(url, db, uid, password, pricelistIds);
        return { success: true, pricelists };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getPromotions', async () => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const promotions = await OdooService.getPromotions(url, db, uid, password);
        return { success: true, promotions };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getPaymentJournals', async (event, journalIds) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const journals = await OdooService.getPaymentJournals(url, db, uid, password, journalIds);
        return { success: true, journals };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getPosOrders', async (event, configId, days) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const orders = await OdooService.getPosOrders(url, db, uid, password, configId, days || 7);
        return { success: true, orders };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:createPosOrder', async (event, orderData) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const result = await OdooService.createPosOrder(url, db, uid, password, orderData);
        return { success: true, result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getStockProducts', async (event, product_ids, location_ids) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const result = await OdooService.getStockProducts(url, db, uid, password, product_ids, location_ids);
        return { success: true, result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:executeKw', async (event, model, method, args, kwargs) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const result = await OdooService._execute(url, db, uid, password, model, method, args, kwargs);
        return { success: true, result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getPosOrderLines', async (event, lineIds) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const lines = await OdooService.getPosOrderLines(url, db, uid, password, lineIds);
        return { success: true, lines };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:createCustomer', async (event, data) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const customer = await OdooService.createCustomer(url, db, uid, password, data);
        return { success: true, customer };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:closePosSession', async (event, sessionId) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        await OdooService.closePosSession(url, db, uid, password, sessionId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:createProductionOrder', async (event, productId, quantity, branchId, sessionId, materialIds, locationId, locationDestId, pickingTypeId) => {
    try {
        if (!odooSession) throw new Error('Not logged in');
        const { url, db, uid, password } = odooSession;
        const result = await OdooService.createProductionOrder(
            url, db, uid, password,
            productId, quantity, branchId, sessionId, materialIds, locationId, locationDestId, pickingTypeId
        );
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ========== App Lifecycle ==========

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

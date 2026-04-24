const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const OdooService = require('./odooService');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let customerWindow = null;
let odooSession = null; // { url, db, uid, password, user }

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 768,
        title: 'SeaPos - Restaurant POS',
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

function createCustomerWindow() {
    if (customerWindow) return;

    const displays = screen.getAllDisplays();
    const externalDisplay = displays.find((display) => {
        return display.bounds.x !== 0 || display.bounds.y !== 0;
    });

    const windowOptions = {
        title: 'Customer Display',
        show: false,
        autoHideMenuBar: true,
        alwaysOnTop: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    };

    if (externalDisplay) {
        windowOptions.x = externalDisplay.bounds.x;
        windowOptions.y = externalDisplay.bounds.y;
        windowOptions.fullscreen = true;
    } else {
        // Fallback to primary display if only 1 screen
        windowOptions.width = 1024;
        windowOptions.height = 768;
    }

    customerWindow = new BrowserWindow(windowOptions);

    if (!app.isPackaged) {
        customerWindow.loadURL('http://localhost:5173/#/customer-display');
    } else {
        customerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'customer-display' });
    }

    if (externalDisplay) {
        customerWindow.maximize();
    }
    customerWindow.show();

    customerWindow.on('closed', () => {
        customerWindow = null;
    });
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

ipcMain.handle('odoo:getTables', async (event, configId) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const result = await OdooService.getTables(url, db, uid, password, configId);
        return { success: true, result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('odoo:getTransactionTypes', async (event) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const result = await OdooService.getTransactionTypes(url, db, uid, password);
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

ipcMain.handle('odoo:createInternalTransfer', async (event, pickingData) => {
    if (!odooSession) return { success: false, error: 'Chưa đăng nhập' };
    try {
        const { url, db, uid, password } = odooSession;
        const result = await OdooService.createInternalTransfer(url, db, uid, password, pickingData);
        return { success: true, result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// get vietQR

ipcMain.handle('get-api-qrcode', async (_, totalAmount) => {
    try {
        const apiUrl = 'https://api.vietqr.io/v2/generate';

        const payload = {
            accountNo: '8650025365',
            accountName: 'CTY TNHH DANNYGREEN RETAIL FRANCHISE',
            acqId: '970418',
            amount: totalAmount,
            addInfo: "Thanh toán đơn hàng POS",
            format: "text",
            template: "compact"
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'x-api-key': '106f81f6-abff-42ea-9b1b-c07538846b6e',
                'x-client-id': '51e98ca7-e8f7-497b-bf0f-e0e0b8d8d404',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const responseData = await response.json();

        if (responseData.code === '00') {
            return responseData.data;
        } else {
            console.error('Lỗi từ API VietQR (mã lỗi khác 00):', responseData);
            return null;
        }

    } catch (error) {
        console.error('Lỗi khi gọi API VietQR:', error.message);
        return null;
    }
});

// ========== Customer Display IPC ==========
ipcMain.handle('window:toggleCustomerDisplay', (event, show) => {
    if (show) {
        createCustomerWindow();
    } else {
        if (customerWindow) {
            customerWindow.close();
            customerWindow = null;
        }
    }
    return true;
});

ipcMain.handle('window:sendToCustomerDisplay', (event, data) => {
    if (customerWindow) {
        customerWindow.webContents.send('customer-display-update', data);
    }
    return true;
});

// ========== Silent Print IPC ==========
// Receives base64 PNG image data from renderer, saves to file, prints via PowerShell
ipcMain.handle('window:silentPrint', async (event, base64ImageData, printerName) => {
    const fs = require('fs');
    const os = require('os');
    const { exec } = require('child_process');
    const ts = Date.now();
    const tmpImg = path.join(os.tmpdir(), `hotpos_print_${ts}.png`);
    const tmpPs1 = path.join(os.tmpdir(), `hotpos_print_${ts}.ps1`);

    // Save base64 image to file
    const imgBuffer = Buffer.from(base64ImageData, 'base64');
    fs.writeFileSync(tmpImg, imgBuffer);
    console.log('[PRINT] Image saved:', tmpImg, imgBuffer.length, 'bytes');

    const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${tmpImg.replace(/\\/g, '\\\\')}')
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '${printerName}'
$pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$pd.add_PrintPage({
    param($s, $e)
    $ratio = $e.PageBounds.Width / $img.Width
    $h = [int]($img.Height * $ratio)
    $e.Graphics.DrawImage($img, 0, 0, [int]$e.PageBounds.Width, $h)
    $e.HasMorePages = $false
})
$pd.Print()
$pd.Dispose()
$img.Dispose()
`;
    fs.writeFileSync(tmpPs1, psScript, 'utf-8');

    return new Promise((resolve, reject) => {
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`, (error, stdout, stderr) => {
            setTimeout(() => {
                try { fs.unlinkSync(tmpImg); } catch (e) { /* ignore */ }
                try { fs.unlinkSync(tmpPs1); } catch (e) { /* ignore */ }
            }, 5000);

            if (error) {
                console.error('[PRINT] Error:', stderr || error.message);
                reject(new Error(stderr || error.message));
            } else {
                console.log('[PRINT] Sent to:', printerName);
                resolve(true);
            }
        });
    });
});

ipcMain.handle('window:getPrinters', async () => {
    try {
        const printers = mainWindow.webContents.getPrintersAsync
            ? await mainWindow.webContents.getPrintersAsync()
            : mainWindow.webContents.getPrinters();
        return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
    } catch (err) {
        return [];
    }
});

// ========== App Lifecycle ==========

app.whenReady().then(() => {
    createWindow();

    // --- KIỂM TRA UPDATE SAU KHI APP MỞ 2 GIÂY ---
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 2000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- Lắng nghe các sự kiện cập nhật (Tùy chọn, dùng để debug hoặc báo cho user) ---
autoUpdater.on('checking-for-update', () => {
    // Tùy chọn: Có thể bật log này lên nếu muốn biết lúc nào nó bắt đầu tìm kiếm
    // console.log('Đang tìm bản cập nhật...');
});

autoUpdater.on('update-available', () => {
    // Hiển thị popup cho người dùng biết là ĐANG tải bản mới
    dialog.showMessageBox({
        type: 'info',
        title: 'Bản cập nhật mới',
        message: 'Đã tìm thấy phiên bản mới. Hệ thống đang tải xuống ngầm, vui lòng không tắt ứng dụng...',
        buttons: ['Đồng ý']
    });
});

autoUpdater.on('update-not-available', () => {
    // App đang ở bản mới nhất, không làm gì cả
});

autoUpdater.on('error', (err) => {
    // CỰC KỲ QUAN TRỌNG: Bật popup báo lỗi nếu update thất bại (ví dụ: mất mạng, lỗi repo private)
    dialog.showErrorBox('Lỗi tự động cập nhật', err == null ? "Không xác định" : (err.stack || err).toString());
});

autoUpdater.on('update-downloaded', () => {
    // Hiển thị popup khi đã TẢI XONG và chờ cài đặt
    dialog.showMessageBox({
        type: 'question',
        title: 'Cài đặt bản cập nhật',
        message: 'Đã tải xong bản cập nhật. Ứng dụng sẽ tự động khởi động lại để cài đặt ngay bây giờ.',
        buttons: ['Cài đặt ngay']
    }).then(() => {
        autoUpdater.quitAndInstall(false, true);
    });
});

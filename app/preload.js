const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Authentication
    login: (url, db, username, password) =>
        ipcRenderer.invoke('odoo:login', url, db, username, password),

    // POS configs (includes session owner info)
    getPosConfigs: () =>
        ipcRenderer.invoke('odoo:getPosConfigs'),

    // Open POS session + load products & customers
    openPosSession: (configId) =>
        ipcRenderer.invoke('odoo:openPosSession', configId),

    // Get products, customers, categories (loaded when POS opens)
    getProducts: () =>
        ipcRenderer.invoke('odoo:getProducts'),

    getCustomers: () =>
        ipcRenderer.invoke('odoo:getCustomers'),

    getPosCategories: () =>
        ipcRenderer.invoke('odoo:getPosCategories'),

    // Pricelists & Promotions
    getPricelists: () =>
        ipcRenderer.invoke('odoo:getPricelists'),

    getPromotions: () =>
        ipcRenderer.invoke('odoo:getPromotions'),

    // POS order history
    getPosOrders: (configId, days) =>
        ipcRenderer.invoke('odoo:getPosOrders', configId, days),

    getPosOrderLines: (lineIds) =>
        ipcRenderer.invoke('odoo:getPosOrderLines', lineIds),

    // Get user info
    getUserInfo: () =>
        ipcRenderer.invoke('odoo:getUserInfo'),
});

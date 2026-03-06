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
    getPricelists: (pricelistIds) =>
        ipcRenderer.invoke('odoo:getPricelists', pricelistIds),

    getPromotions: () =>
        ipcRenderer.invoke('odoo:getPromotions'),

    // Payment journals
    getPaymentJournals: (journalIds) =>
        ipcRenderer.invoke('odoo:getPaymentJournals', journalIds),

    // POS order history
    getPosOrders: (configId, days) =>
        ipcRenderer.invoke('odoo:getPosOrders', configId, days),

    getPosOrderLines: (lineIds) =>
        ipcRenderer.invoke('odoo:getPosOrderLines', lineIds),

    // Close POS session
    closePosSession: (sessionId) =>
        ipcRenderer.invoke('odoo:closePosSession', sessionId),

    // Create customer
    createCustomer: (data) =>
        ipcRenderer.invoke('odoo:createCustomer', data),

    // Create production order
    createProductionOrder: (productId, quantity, branchId, sessionId, materialIds, locationId, locationDestId, pickingTypeId) =>
        ipcRenderer.invoke('odoo:createProductionOrder', productId, quantity, branchId, sessionId, materialIds, locationId, locationDestId, pickingTypeId),

    // Get user info
    getUserInfo: () =>
        ipcRenderer.invoke('odoo:getUserInfo'),
});

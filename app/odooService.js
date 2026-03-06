const xmlrpc = require('xmlrpc');

class OdooService {
    /**
     * Authenticate user against Odoo 12 via XML-RPC
     */
    static authenticate(url, db, username, password) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isSecure = parsedUrl.protocol === 'https:';
            const createClient = isSecure
                ? xmlrpc.createSecureClient
                : xmlrpc.createClient;

            const client = createClient({
                host: parsedUrl.hostname,
                port: parsedUrl.port || (isSecure ? 443 : 8069),
                path: '/xmlrpc/2/common',
            });

            client.methodCall('authenticate', [db, username, password, {}], (err, uid) => {
                if (err) {
                    reject(new Error(`Lỗi kết nối Odoo: ${err.message}`));
                    return;
                }
                if (!uid || uid === false) {
                    reject(new Error('Sai tên đăng nhập hoặc mật khẩu'));
                    return;
                }
                resolve(uid);
            });
        });
    }

    /**
     * Get user info from Odoo
     */
    static getUserInfo(url, db, uid, password) {
        return OdooService._execute(url, db, uid, password, 'res.users', 'read', [[uid]], {
            fields: ['name', 'login', 'email'],
        });
    }

    /**
     * Get POS configs with their current session info (including who opened it)
     */
    static async getPosConfigs(url, db, uid, password) {
        const configs = await OdooService._execute(url, db, uid, password, 'pos.config', 'search_read', [[]], {
            fields: ['id', 'name', 'stock_location_id', 'pricelist_id', 'available_pricelist_ids', 'company_id', 'current_session_id', 'current_session_state', 'journal_ids'],
        });

        // For each config, check if there's an open session and who owns it
        for (const config of configs) {
            if (config.current_session_id && config.current_session_id[0]) {
                try {
                    const sessions = await OdooService._execute(
                        url, db, uid, password,
                        'pos.session', 'read',
                        [[config.current_session_id[0]]],
                        { fields: ['id', 'name', 'state', 'user_id', 'config_id'] }
                    );
                    if (sessions && sessions.length > 0) {
                        config.session = sessions[0];
                        config.session_user_id = sessions[0].user_id ? sessions[0].user_id[0] : null;
                        config.session_user_name = sessions[0].user_id ? sessions[0].user_id[1] : null;
                        config.session_state = sessions[0].state;
                    }
                } catch (e) {
                    // Ignore session read errors
                }
            }
        }

        return configs;
    }

    /**
     * Open or get existing POS session for a config
     */
    static async openPosSession(url, db, uid, password, configId) {
        const sessions = await OdooService._execute(
            url, db, uid, password,
            'pos.session', 'search_read',
            [[['config_id', '=', configId], ['state', '!=', 'closed']]],
            { fields: ['id', 'name', 'state', 'config_id', 'user_id'] }
        );

        if (sessions && sessions.length > 0) {
            return sessions[0];
        }

        try {
            await OdooService._execute(
                url, db, uid, password,
                'pos.config', 'open_session_cb', [[configId]], {}
            );
            const newSessions = await OdooService._execute(
                url, db, uid, password,
                'pos.session', 'search_read',
                [[['config_id', '=', configId], ['state', '!=', 'closed']]],
                { fields: ['id', 'name', 'state', 'config_id', 'user_id'] }
            );
            return newSessions && newSessions.length > 0 ? newSessions[0] : null;
        } catch (e) {
            throw new Error(`Không thể mở phiên POS: ${e.message}`);
        }
    }

    /**
     * Close a POS session
     */
    static async closePosSession(url, db, uid, password, sessionId) {
        try {
            await OdooService._execute(
                url, db, uid, password,
                'pos.session', 'action_pos_session_closing_control', [[sessionId]], {}
            );
            return true;
        } catch (e) {
            throw new Error(`Không thể đóng ca: ${e.message}`);
        }
    }

    /**
     * Get all products (product.product with sale_ok = true)
     */
    static getProducts(url, db, uid, password) {
        return OdooService._execute(url, db, uid, password, 'product.product', 'search_read',
            [[['sale_ok', '=', true], ['available_in_pos', '=', true]]],
            {
                fields: ['id', 'name', 'display_name', 'list_price', 'pos_categ_id', 'image_small', 'is_combo', 'pos_combo_item_ids', 'barcode', 'default_code', 'categ_id', 'product_tmpl_id'],
            }
        );
    }

    /**
     * Get payment journals by IDs (from pos.config journal_ids)
     */
    static getPaymentJournals(url, db, uid, password, journalIds) {
        if (!journalIds || !Array.isArray(journalIds) || journalIds.length === 0) return Promise.resolve([]);
        // Filter to only valid numeric IDs
        const validIds = journalIds.filter(id => typeof id === 'number' && id > 0);
        if (validIds.length === 0) return Promise.resolve([]);
        return OdooService._execute(url, db, uid, password, 'account.journal', 'search_read',
            [[['id', 'in', validIds]]],
            { fields: ['id', 'name', 'type', 'code'] }
        );
    }

    /**
     * Get all customers (res.partner with customer = true)
     */
    static async getCustomers(url, db, uid, password) {
        let customers;
        customers = await OdooService._execute(url, db, uid, password, 'res.partner', 'search_read',
            [[['customer', '=', true]]],
            {
                fields: ['id', 'name', 'phone', 'mobile', 'email', 'street', 'group_ids'],
            }
        );
        const groups = await OdooService._execute(url, db, uid, password, 'res.partner.group', 'search_read',
            [[]],
            { fields: ['id', 'name', 'pricelist_id'] }
        );
        for (const pl of customers) {
            if (pl.group_ids && pl.group_ids.length > 0) {
                const group = groups.find(g => g.id === pl.group_ids[0]);
                if (group) {
                    pl.group_id = group;
                }
            }
        }
        return customers;
    }

    /**
     * Create a new customer (res.partner)
     */
    static async createCustomer(url, db, uid, password, data) {
        const vals = { customer: true };
        if (data.name) vals.name = data.name;
        if (data.phone) vals.phone = data.phone;
        if (data.mobile) vals.mobile = data.mobile;
        if (data.email) vals.email = data.email;
        if (data.street) vals.street = data.street;

        const id = await OdooService._execute(url, db, uid, password, 'res.partner', 'create', [vals]);
        // Read back the created record
        const records = await OdooService._execute(url, db, uid, password, 'res.partner', 'read', [[id]], {
            fields: ['id', 'name', 'phone', 'mobile', 'email', 'street'],
        });
        return records && records.length > 0 ? records[0] : { id, ...vals };
    }

    /**
     * Get POS categories
     */
    static getPosCategories(url, db, uid, password) {
        return OdooService._execute(url, db, uid, password, 'pos.category', 'search_read', [[]], {
            fields: ['id', 'name', 'parent_id', 'sequence'],
        });
    }

    /**
     * Get pricelists by IDs (from pos.config available_pricelist_ids)
     * Also fetches pricelist items (product.pricelist.item) for each pricelist
     */
    static async getPricelists(url, db, uid, password, pricelistIds) {
        let pricelists;
        if (!pricelistIds || !Array.isArray(pricelistIds) || pricelistIds.length === 0) {
            pricelists = await OdooService._execute(url, db, uid, password, 'product.pricelist', 'search_read', [[]], {
                fields: ['id', 'name', 'currency_id', 'active', 'item_ids'],
            });
        } else {
            const validIds = pricelistIds.filter(id => typeof id === 'number' && id > 0);
            if (validIds.length === 0) return [];
            pricelists = await OdooService._execute(url, db, uid, password, 'product.pricelist', 'search_read',
                [[['id', 'in', validIds]]],
                { fields: ['id', 'name', 'currency_id', 'active', 'item_ids'] }
            );
        }

        // Collect all item IDs from all pricelists
        const allItemIds = [];
        for (const pl of pricelists) {
            if (pl.item_ids && pl.item_ids.length > 0) {
                allItemIds.push(...pl.item_ids);
            }
        }

        // Batch fetch pricelist items
        let itemsMap = {};
        if (allItemIds.length > 0) {
            const items = await OdooService._execute(url, db, uid, password, 'product.pricelist.item', 'search_read',
                [[['id', 'in', allItemIds]]],
                { fields: ['id', 'pricelist_id', 'compute_price', 'min_quantity'] }
            );
            for (const item of items) {
                const plId = item.pricelist_id ? item.pricelist_id[0] : null;
                if (plId) {
                    if (!itemsMap[plId]) itemsMap[plId] = [];
                    itemsMap[plId].push(item);
                }
            }
        }

        // Attach items to pricelists
        for (const pl of pricelists) {
            pl.items = itemsMap[pl.id] || [];
        }
        return pricelists;
    }

    /**
     * Get promotion programs (Odoo 12: sale.coupon.program or coupon.program)
     */
    static async getPromotions(url, db, uid, password) {
        try {
            // Try sale.coupon.program first (Odoo 12+)
            return await OdooService._execute(url, db, uid, password, 'sale.coupon.program', 'search_read',
                [[['program_type', '=', 'promotion_program']]],
                { fields: ['id', 'name', 'discount_type', 'discount_percentage', 'discount_fixed_amount', 'active'] }
            );
        } catch (e) {
            try {
                // Fallback: coupon.program
                return await OdooService._execute(url, db, uid, password, 'coupon.program', 'search_read',
                    [[]],
                    { fields: ['id', 'name', 'discount_type', 'discount_percentage', 'discount_fixed_amount', 'active'] }
                );
            } catch (e2) {
                // No promotion module installed — return empty
                return [];
            }
        }
    }

    /**
     * Get POS orders for a given config, last N days
     */
    static async getPosOrders(url, db, uid, password, configId, days = 7) {
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - days);
        const dateStr = dateFrom.toISOString().split('T')[0] + ' 00:00:00';

        const orders = await OdooService._execute(url, db, uid, password, 'pos.order', 'search_read',
            [[
                ['config_id', '=', configId],
                ['date_order', '>=', dateStr],
            ]],
            {
                fields: ['id', 'name', 'date_order', 'partner_id', 'amount_total', 'amount_tax',
                    'amount_paid', 'amount_return', 'state', 'pos_reference', 'lines',
                    'session_id', 'user_id'],
                order: 'date_order desc',
            }
        );
        return orders;
    }

    /**
     * Get POS order lines by order IDs
     */
    static getPosOrderLines(url, db, uid, password, lineIds) {
        return OdooService._execute(url, db, uid, password, 'pos.order.line', 'search_read',
            [[['id', 'in', lineIds]]],
            {
                fields: ['id', 'order_id', 'product_id', 'qty', 'price_unit',
                    'price_subtotal', 'price_subtotal_incl', 'discount'],
            }
        );
    }

    /**
     * Internal: execute_kw wrapper
     */
    static _execute(url, db, uid, password, model, method, args, kwargs = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isSecure = parsedUrl.protocol === 'https:';
            const createClient = isSecure
                ? xmlrpc.createSecureClient
                : xmlrpc.createClient;

            const client = createClient({
                host: parsedUrl.hostname,
                port: parsedUrl.port || (isSecure ? 443 : 8069),
                path: '/xmlrpc/2/object',
            });

            client.methodCall(
                'execute_kw',
                [db, uid, password, model, method, args, kwargs],
                (err, result) => {
                    if (err) {
                        reject(new Error(`Odoo error (${model}.${method}): ${err.message}`));
                        return;
                    }
                    resolve(result);
                }
            );
        });
    }
}

module.exports = OdooService;

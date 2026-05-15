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
     * Create a production order via pos.mrp -> create_from_ui
     */
    static async createProductionOrder(url, db, uid, password, productId, quantity, branchId, sessionId, materialIds, locationId, locationDestId, pickingTypeId) {
        try {
            const result = await OdooService._execute(url, db, uid, password, 'pos.mrp', 'create_from_ui', [{
                'type': 'mrp',
                'product_id': productId,
                'quantity': quantity,
                'user_id': uid,
                'pos_branch_id': branchId,
                'pos_session_id': sessionId,
                'raw_material_ids': materialIds,
                'location_id': locationId,
                'location_dest_id': locationDestId,
                'mrp_picking_type_id': pickingTypeId
            }]);
            return result;
        } catch (error) {
            // Odoo's pos.mrp create_from_ui returns a RecordSet which XML-RPC cannot serialize,
            // throwing a TypeError about '_thread.lock' even though the order is created successfully.
            if (error.message && error.message.includes('_thread.lock')) {
                console.warn("Ignored XML-RPC serialization error on successful MRP creation.");
                return true;
            }
            throw error;
        }
    }

    /**
     * Create a new POS Order (pos.order -> create_from_ui)
     */
    static async createPosOrder(url, db, uid, password, orderData) {
        try {
            const result = await OdooService._execute(url, db, uid, password, 'pos.order', 'create_from_ui', [[orderData]]);
            console.log("Create POS Order result:", result);
            return result;
        } catch (error) {
            console.error("Create POS Order error:", error);
            // Ignore _thread.lock serialization error similar to pos.mrp if happens
            if (error.message && error.message.includes('_thread.lock')) {
                console.warn("Ignored XML-RPC serialization error on successful POS Order creation.");
                return true;
            }
            throw error;
        }
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
            fields: [
                'id', 'name', 'currency_id', 'stock_location_id', 'pricelist_id', 'available_pricelist_ids', 'company_id',
                'current_session_id', 'current_session_state', 'journal_ids', 'pos_mrp', 'pos_branch_id',
                'location_dest_id', 'mrp_picking_type_id', 'enable_button_loyalty_point', 'receipt_header', 'receipt_footer',
                'enable_dynamic_qrcode_viet', 'apikey_qrcode_viet', 'client_id_qrcode_viet', 'account_no', 'account_name', 'account_id',
                'seller_ids', 'internal_transfer', 'operation_type_internal_transfer', 'print_product_label'
            ],
        });

        // sellers
        const allSellerIds = [];
        for (const p of configs) {
            if (p.seller_ids && p.seller_ids.length > 0) {
                allSellerIds.push(...p.seller_ids);
            }
        }
        const sellers = await OdooService._execute(url, db, uid, password, 'res.users', 'search_read',
            [[['id', 'in', allSellerIds]]],
            { fields: ['id', 'name'] }
        );
        const sellerMap = {};
        for (const seller of sellers) {
            sellerMap[seller.id] = seller;
        }
        for (const p of configs) {
            if (p.seller_ids && p.seller_ids.length > 0) {
                p.seller_ids = p.seller_ids.map(id => sellerMap[id]);
            }
        }

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
     * Also fetches MRP components for products with is_pos_mrp = true
     */
    static async getProducts(url, db, uid, password) {
        const products = await OdooService._execute(url, db, uid, password, 'product.product', 'search_read',
            [[['sale_ok', '=', true], ['available_in_pos', '=', true]]],
            {
                fields: ['id', 'name', 'type', 'display_name', 'taxes_id', 'allow_discount_global', 'list_price', 'pos_categ_id', 'image_small', 'is_combo', 'pos_combo_item_ids', 'barcode', 'default_code', 'categ_id', 'product_tmpl_id', 'is_pos_mrp', 'product_mrp_ids', 'print_product_label', 'uom_id'],
            }
        );

        // taxes
        const allTaxIds = [];
        for (const p of products) {
            if (p.taxes_id && p.taxes_id.length > 0) {
                allTaxIds.push(...p.taxes_id);
            }
        }
        const taxes = await OdooService._execute(url, db, uid, password, 'account.tax', 'search_read',
            [[['id', 'in', allTaxIds]]],
            { fields: ['id', 'name', 'amount', 'type_tax_use'] }
        );
        const taxMap = {};
        for (const tax of taxes) {
            taxMap[tax.id] = tax;
        }
        for (const p of products) {
            if (p.taxes_id && p.taxes_id.length > 0) {
                p.tax_id = p.taxes_id.map(id => taxMap[id]);
            }
        }
        // Collect all MRP item IDs from products with is_pos_mrp
        const allMrpIds = [];
        for (const p of products) {
            if (p.is_pos_mrp && p.product_mrp_ids && p.product_mrp_ids.length > 0) {
                allMrpIds.push(...p.product_mrp_ids);
            }
        }

        // Batch fetch pos.product.mrp records
        let mrpMap = {};
        if (allMrpIds.length > 0) {
            const mrpItems = await OdooService._execute(url, db, uid, password, 'pos.product.mrp', 'search_read',
                [[['id', 'in', allMrpIds]]],
                { fields: ['id', 'component'] }
            );
            for (const item of mrpItems) {
                mrpMap[item.id] = item;
            }
        }

        // Attach MRP components to products
        for (const p of products) {
            if (p.is_pos_mrp && p.product_mrp_ids && p.product_mrp_ids.length > 0) {
                p.mrpComponents = p.product_mrp_ids
                    .map(id => mrpMap[id])
                    .filter(Boolean)
                    .map(item => ({
                        id: item.id,
                        componentId: item.component ? item.component[0] : null,
                        componentName: item.component ? item.component[1] : 'Unknown',
                        quantity: 0,
                    }));
            } else {
                p.mrpComponents = [];
            }
        }

        // Collect all Combo item IDs
        const allComboIds = [];
        for (const p of products) {
            if (p.is_combo && p.pos_combo_item_ids && p.pos_combo_item_ids.length > 0) {
                allComboIds.push(...p.pos_combo_item_ids);
            }
        }

        // Batch fetch pos.combo.item records
        let comboMap = {};
        if (allComboIds.length > 0) {
            const comboItems = await OdooService._execute(url, db, uid, password, 'pos.combo.item', 'search_read',
                [[['id', 'in', allComboIds], ['required', '=', true]]],
                { fields: ['id', 'name', 'product_ids', 'quantity'] }
            );
            for (const item of comboItems) {
                comboMap[item.id] = item;
            }
        }

        const productsMap = {};
        for (const p of products) {
            productsMap[p.id] = p;
        }

        // Attach combo lines to products
        for (const p of products) {
            if (p.is_combo && p.pos_combo_item_ids && p.pos_combo_item_ids.length > 0) {
                p.combo_lines = p.pos_combo_item_ids
                    .map(id => comboMap[id])
                    .filter(Boolean)
                    .map(item => {
                        const selectableProducts = (item.product_ids || [])
                            .map(prodId => productsMap[prodId])
                            .filter(Boolean);

                        return {
                            id: item.id,
                            name: item.name || 'Tùy chọn',
                            required_qty: item.quantity || 1,
                            products: selectableProducts,
                        };
                    });
            } else {
                p.combo_lines = [];
            }
        }

        return products;
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
                fields: ['id', 'name', 'phone', 'mobile', 'email', 'street', 'group_ids', 'pos_loyalty_point', 'company_type', 'vat'],
            }
        );
        // Group lookup is optional — custom module may not exist
        try {
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
        } catch (groupErr) {
            console.warn('res.partner.group not available, skipping group lookup:', groupErr.message);
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
                { fields: ['id', 'pricelist_id', 'compute_price', 'min_quantity', 'product_tmpl_id', 'product_id', 'categ_id', 'pos_category', 'date_start', 'date_end', 'fixed_price', 'percent_price'] }
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
        dateFrom.setDate(dateFrom.getDate() - days + 1);
        const dateStr = dateFrom.toISOString().split('T')[0] + ' 00:00:00';

        const orders = await OdooService._execute(url, db, uid, password, 'pos.order', 'search_read',
            [[
                ['config_id', '=', configId],
                ['date_order', '>=', dateStr],
            ]],
            {
                fields: ['id', 'name', 'date_order', 'partner_id', 'amount_total', 'amount_tax',
                    'amount_paid', 'amount_return', 'state', 'pos_reference', 'lines',
                    'session_id', 'user_id', 'statement_ids', 'picking_ids', 'currency_id', 'pricelist_id', 'note', 'table_id', 'ecommerce_code', 'return_order_id'],
                order: 'id desc',
            }
        );

        return orders.map(order => {
            if (order.date_order) {
                // Khởi tạo đối tượng Date từ chuỗi Odoo trả về (mặc định hiểu là UTC)
                let date = new Date(order.date_order + " Z");

                // Cộng thêm 7 tiếng
                date.setHours(date.getHours() + 7);

                // Định dạng lại thành chuỗi YYYY-MM-DD HH:mm:ss hoặc để nguyên đối tượng Date
                // Ở đây tôi định dạng lại thành chuỗi dễ đọc:
                order.date_order = date.toISOString().replace('T', ' ').split('.')[0];
            }
            return order;
        });
    }

    /**
     * Get POS order lines by order IDs
     */
    static getPosOrderLines(url, db, uid, password, lineIds) {
        return OdooService._execute(url, db, uid, password, 'pos.order.line', 'search_read',
            [[['id', 'in', lineIds]]],
            {
                fields: ['id', 'order_id', 'product_id', 'qty', 'price_unit', 'note',
                    'price_subtotal', 'price_subtotal_incl', 'discount_type', 'discount', 'discount_amount', 'uom_id'],
            }
        );
    }

    /**
     * Get Stock proudcts
     */
    static getStockProducts(url, db, uid, password, product_ids, location_ids) {
        const domain = [
            ['product_id', 'in', product_ids],
            ['location_id', 'in', location_ids]
        ];
        return OdooService._execute(url, db, uid, password, 'stock.quant', 'read_group',
            [domain, ['quantity'], ['product_id', 'location_id']],
            {}
        );
    }

    /**
     * Get Stock proudcts
     */
    static getTransactionTypes(url, db, uid, password) {
        return OdooService._execute(url, db, uid, password, 'transaction.type', 'search_read',
            [[['is_pos', '=', true]]],
            {
                fields: ['id', 'name', 'code', 'type'],
            }
        );
    }

    /**
     * Get Tables
     */
    static async getTables(url, db, uid, password, configId) {
        const Floors = await OdooService._execute(url, db, uid, password, 'restaurant.floor', 'search_read',
            [[['pos_config_id', '=', configId]]],
            {
                fields: ['id', 'name', 'table_ids'],
            }
        );

        // taxes
        const allTables = [];
        for (const p of Floors) {
            if (p.table_ids && p.table_ids.length > 0) {
                allTables.push(...p.table_ids);
            }
        }
        const tables = await OdooService._execute(url, db, uid, password, 'restaurant.table', 'search_read',
            [[['id', 'in', allTables]]],
            { fields: ['id', 'name', 'seats'] }
        );
        return tables;
    }

    /**
     * Create a new Internal Transfer
     */
    static async createInternalTransfer(url, db, uid, password, pickingData) {
        try {
            const result = await OdooService._execute(url, db, uid, password, 'sea.pos.internal.transfer.desktop', 'create_from_ui', [pickingData]);
            console.log("Create Internal Transfer result:", result);
            return result;
        } catch (error) {
            console.error("Create Internal Transfer error:", error);
            throw error;
        }
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

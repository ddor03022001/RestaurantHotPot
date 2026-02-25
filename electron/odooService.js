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
            fields: ['id', 'name', 'stock_location_id', 'pricelist_id', 'company_id', 'current_session_id', 'current_session_state'],
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
     * Get all products (product.product with sale_ok = true)
     */
    static getProducts(url, db, uid, password) {
        return OdooService._execute(url, db, uid, password, 'product.product', 'search_read',
            [[['sale_ok', '=', true], ['available_in_pos', '=', true]]],
            {
                fields: ['id', 'name', 'list_price', 'pos_categ_id', 'image_small', 'barcode', 'default_code', 'categ_id'],
            }
        );
    }

    /**
     * Get all customers (res.partner with customer = true)
     */
    static getCustomers(url, db, uid, password) {
        return OdooService._execute(url, db, uid, password, 'res.partner', 'search_read',
            [[['customer', '=', true]]],
            {
                fields: ['id', 'name', 'phone', 'mobile', 'email', 'street'],
            }
        );
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

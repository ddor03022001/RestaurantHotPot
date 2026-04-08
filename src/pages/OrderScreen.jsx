import React, { useState, useMemo, useCallback } from 'react';
import './OrderScreen.css';

// Stable popup component (outside OrderScreen to avoid re-creation on every render)
function PopupOverlay({ show, onClose, title, className, children }) {
    if (!show) return null;
    return (
        <div className="order-popup-overlay" onClick={onClose}>
            <div className={`order-popup ${className || ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="order-popup-header">
                    <h3 className="order-popup-title">{title}</h3>
                    <button className="order-popup-close" onClick={onClose}>✕</button>
                </div>
                <div className="order-popup-body">
                    {children}
                </div>
            </div>
        </div>
    );
}

function OrderScreen({ authData, posConfig, posData, table, updateTable, onBack, onLogout, onGoToPayment }) {
    const { products = [], categories = [], customers = [], pricelists = [], promotions = [], defaultPricelistId = null } = posData || {};
    const [orderItems, setOrderItems] = useState(table.orderItems || []);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Combo popup state
    const [comboPopup, setComboPopup] = useState(null); // { productId, comboInfo }
    const [comboSelections, setComboSelections] = useState({}); // { lineId: { productId: qty } }

    // Production data — filter products with is_pos_mrp
    const productionData = useMemo(() => {
        return products.filter(p => p.is_pos_mrp && p.mrpComponents && p.mrpComponents.length > 0);
    }, [products]);
    // Production popup state
    const [showProductionPopup, setShowProductionPopup] = useState(false);
    const [selectedProduction, setSelectedProduction] = useState(null);
    const [productionQty, setProductionQty] = useState(0);
    const [materialQtys, setMaterialQtys] = useState({});
    const [productionSearch, setProductionSearch] = useState('');
    const [isProducing, setIsProducing] = useState(false);
    const [productionError, setProductionError] = useState('');

    // Label printing state
    const [showLabelPopup, setShowLabelPopup] = useState(false);
    const [showProduceConfirm, setShowProduceConfirm] = useState(false);

    const openProduction = (prod) => {
        setSelectedProduction(prod);
        setProductionQty(0);
        setProductionError('');
        setShowProduceConfirm(false);
        const initialQtys = {};
        prod.mrpComponents.forEach((m) => { initialQtys[m.componentId] = m.quantity; });
        setMaterialQtys(initialQtys);
    };

    const updateMaterialQty = (materialId, value) => {
        const qty = parseFloat(value);
        setMaterialQtys((prev) => ({
            ...prev,
            [materialId]: isNaN(qty) ? 0 : qty,
        }));
    };

    const handleProductionConfirm = async () => {
        if (!selectedProduction || productionQty <= 0) return;

        setShowProduceConfirm(false);
        setIsProducing(true);
        setProductionError('');

        try {
            // Build raw_material_ids expected by Odoo
            // const materialIds = selectedProduction.mrpComponents.map(m => {
            //     const qty = materialQtys[m.id] || 0;
            //     // Structure expected: [0, 0, { product_id: ID, qty: QTY }]
            //     return [0, 0, {
            //         product_id: m.componentId,
            //         qty: qty
            //     }];
            // });

            // Fallbacks for config fields if missing
            const branchId = posConfig.pos_branch_id ? posConfig.pos_branch_id[0] : false;
            const locationId = posConfig.stock_location_id ? posConfig.stock_location_id[0] : false;
            const locationDestId = posConfig.location_dest_id ? posConfig.location_dest_id[0] : false;
            const pickingTypeId = posConfig.mrp_picking_type_id ? posConfig.mrp_picking_type_id[0] : false;
            const filtered_materialQtys = Object.fromEntries(
                Object.entries(materialQtys).filter(([key, value]) => value > 0)
            );
            const res = await window.electronAPI.createProductionOrder(
                selectedProduction.id,
                productionQty,
                branchId,
                posConfig.current_session_id[0],
                filtered_materialQtys,
                locationId,
                locationDestId,
                pickingTypeId
            );

            if (res.success) {
                setShowProductionPopup(false);
                setSelectedProduction(null);
            } else {
                setProductionError(res.error || 'Lỗi tạo đơn sản xuất');
            }
        } catch (err) {
            setProductionError(err.message);
        } finally {
            setIsProducing(false);
        }
    };

    // Bill discount state
    const [billDiscount, setBillDiscount] = useState(table.billDiscount || { type: 'percent', value: 0 });
    const [showBillDiscount, setShowBillDiscount] = useState(false);

    // Item discount popup
    const [discountItemId, setDiscountItemId] = useState(null);

    // Item note popup
    const [noteItemId, setNoteItemId] = useState(null);

    // Customer selection — closed table → no customer; open table → keep saved
    const hasOrders = table.orderItems && table.orderItems.length > 0;
    const initialCustomer = hasOrders ? (table.selectedCustomer || null) : null;
    const [selectedCustomer, setSelectedCustomer] = useState(initialCustomer);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerPopup, setShowCustomerPopup] = useState(false);

    // Create customer form
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', street: '' });
    const [creatingCustomer, setCreatingCustomer] = useState(false);
    const [createCustomerError, setCreateCustomerError] = useState('');
    const [localCustomers, setLocalCustomers] = useState(customers);

    // Pricelist & Promotion selection
    // Closed table → set default pricelist and save to table; Open table → keep saved
    const getInitialPricelist = () => {
        if (hasOrders && table.selectedPricelist) return table.selectedPricelist;
        // Closed table: find default and save it
        if (defaultPricelistId && pricelists.length > 0) {
            const defaultPl = pricelists.find(pl => pl.id === defaultPricelistId) || null;
            if (defaultPl) updateTable(table.id, { selectedPricelist: defaultPl });
            return defaultPl;
        }
        return null;
    };
    const [selectedPricelist, setSelectedPricelist] = useState(getInitialPricelist);
    const [showPricelistPopup, setShowPricelistPopup] = useState(false);
    const [selectedPromotion, setSelectedPromotion] = useState(table.selectedPromotion || null);
    const [showPromotionPopup, setShowPromotionPopup] = useState(false);

    // Sync order items + bill discount back to table
    const syncOrderItems = (newItems, newBillDiscount) => {
        setOrderItems(newItems);
        const bd = newBillDiscount !== undefined ? newBillDiscount : billDiscount;
        updateTable(table.id, { orderItems: newItems, billDiscount: bd });
    };

    // Get product price based on selected pricelist (Odoo logic)
    const getProductPrice = (product) => {
        if (!selectedPricelist || !selectedPricelist.items || selectedPricelist.items.length === 0) {
            return product.list_price;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const productTmplId = Array.isArray(product.product_tmpl_id) ? product.product_tmpl_id[0] : product.product_tmpl_id;
        const posCategoryIds = [];
        if (product.pos_categ_id) {
            posCategoryIds.push(Array.isArray(product.pos_categ_id) ? product.pos_categ_id[0] : product.pos_categ_id);
        }

        // Filter matching pricelist items
        const matchingItems = selectedPricelist.items.filter(item => {
            if (item.product_tmpl_id && item.product_tmpl_id[0] !== productTmplId && !item.pos_category) return false;
            if (item.product_id && item.product_id[0] !== product.id) return false;
            if (item.categ_id && product.categ_id) {
                const prodCategId = Array.isArray(product.categ_id) ? product.categ_id[0] : product.categ_id;
                if (item.categ_id[0] !== prodCategId) return false;
            }
            if (item.pos_category && posCategoryIds.indexOf(item.pos_category[0]) === -1) return false;
            if (item.date_start) {
                const start = new Date(item.date_start);
                start.setHours(0, 0, 0, 0);
                if (start > now) return false;
            }
            if (item.date_end) {
                const end = new Date(item.date_end);
                end.setHours(0, 0, 0, 0);
                if (end < now) return false;
            }
            return true;
        });

        if (matchingItems.length === 0) return product.list_price;

        let price = product.list_price;
        for (const rule of matchingItems) {
            if (rule.compute_price === 'fixed') {
                price = rule.fixed_price || 0;
                break;
            } else if (rule.compute_price === 'percentage') {
                price = price - (price * ((rule.percent_price || 0) / 100));
                break;
            }
        }
        return parseInt(price);
    };

    const syncBillDiscount = (newBillDiscount) => {
        setBillDiscount(newBillDiscount);
        updateTable(table.id, { billDiscount: newBillDiscount });
    };

    const syncCustomer = (customer) => {
        console.log(customer);
        setSelectedCustomer(customer);
        updateTable(table.id, { selectedCustomer: customer });
        if (customer.group_id) {
            const pl = pricelists.find(g => g.id === customer.group_id.pricelist_id[0]);
            if (pl) {
                syncPricelist(pl);
            }
        }
    };

    const syncPricelist = (pl) => {
        setSelectedPricelist(pl);
        updateTable(table.id, { selectedPricelist: pl });
    };

    const syncPromotion = (promo) => {
        setSelectedPromotion(promo);
        updateTable(table.id, { selectedPromotion: promo });
    };

    // Filter products
    const filteredProducts = useMemo(() => {
        let filtered = products;
        if (selectedCategory) {
            filtered = filtered.filter((p) => {
                const catId = p.pos_categ_id ? (Array.isArray(p.pos_categ_id) ? p.pos_categ_id[0] : p.pos_categ_id) : null;
                return catId === selectedCategory;
            });
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (p) =>
                    (p.display_name || p.name).toLowerCase().includes(q) ||
                    (p.default_code && p.default_code.toLowerCase().includes(q)) ||
                    (p.barcode && p.barcode.toLowerCase().includes(q))
            );
        }
        return filtered.slice(0, 100);
    }, [products, selectedCategory, searchQuery]);

    // Filter customers
    const filteredCustomers = useMemo(() => {
        let list = customers;
        if (customerSearch.trim()) {
            const q = customerSearch.toLowerCase().replace(/\s/g, '');
            list = customers.filter(
                (c) =>
                    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                    (c.phone && c.phone.replace(/\s/g, '').includes(q)) ||
                    (c.mobile && c.mobile.replace(/\s/g, '').includes(q)) ||
                    (c.email && c.email.toLowerCase().includes(q))
            );
        }
        return list.slice(0, 50);
    }, [localCustomers, customerSearch]);

    // Create customer handler
    const handleCreateCustomer = async () => {
        if (!newCustomerForm.name.trim()) {
            setCreateCustomerError('Tên khách hàng không được để trống');
            return;
        }
        setCreatingCustomer(true);
        setCreateCustomerError('');
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.createCustomer(newCustomerForm);
                if (result.success) {
                    setLocalCustomers((prev) => [result.customer, ...prev]);
                    syncCustomer(result.customer);
                    setShowCreateCustomer(false);
                    setShowCustomerPopup(false);
                    setNewCustomerForm({ name: '', phone: '', email: '', street: '' });
                } else {
                    setCreateCustomerError(result.error || 'L\u1ed7i t\u1ea1o kh\u00e1ch h\u00e0ng');
                }
            } else {
                // Browser mock
                await new Promise((r) => setTimeout(r, 500));
                const mock = { id: Date.now(), ...newCustomerForm };
                setLocalCustomers((prev) => [mock, ...prev]);
                syncCustomer(mock);
                setShowCreateCustomer(false);
                setShowCustomerPopup(false);
                setNewCustomerForm({ name: '', phone: '', email: '', street: '' });
            }
        } catch (err) {
            setCreateCustomerError(err.message);
        } finally {
            setCreatingCustomer(false);
        }
    };

    // Line ID counter
    let lineIdCounter = orderItems.reduce((max, item) => Math.max(max, item.lineId || 0), 0);

    // Add product to order — always creates a new line
    const addToOrder = (product) => {
        // Check if product is a combo
        if (product.is_combo && product.combo_lines && product.combo_lines.length > 0) {
            const comboInfo = {
                name: product.display_name || product.name,
                lines: product.combo_lines
            };
            // Initialize combo selections and auto-select if only 1 option
            const initialSelections = {};
            comboInfo.lines.forEach((line) => {
                initialSelections[line.id] = {};
                // Auto-select if there is only 1 product option in this line
                if (line.products && line.products.length === 1) {
                    initialSelections[line.id][line.products[0].id] = line.required_qty;
                }
            });
            setComboSelections(initialSelections);
            setComboPopup({ product, comboInfo });
            return;
        }

        lineIdCounter += 1;
        const newLine = {
            lineId: Date.now() + lineIdCounter,
            product,
            quantity: 1,
            discount: { type: 'percent', value: 0 },
            note: '',
        };
        syncOrderItems([...orderItems, newLine]);
    };

    // Combo selection helpers
    const getComboLineQty = (lineId) => {
        const sel = comboSelections[lineId] || {};
        return Object.values(sel).reduce((sum, q) => sum + q, 0);
    };

    const toggleComboProduct = (lineId, productId, requiredQty, totalLineOptions) => {
        setComboSelections((prev) => {
            const lineSel = { ...(prev[lineId] || {}) };
            const currentTotal = Object.values(lineSel).reduce((s, q) => s + q, 0);
            if (lineSel[productId]) {
                // Remove
                delete lineSel[productId];
            } else if (currentTotal < requiredQty) {
                // Add
                // If there's only 1 option in this line, auto-fill the required quantity
                if (totalLineOptions === 1) {
                    lineSel[productId] = requiredQty;
                } else {
                    lineSel[productId] = 1;
                }
            }
            return { ...prev, [lineId]: lineSel };
        });
    };

    const updateComboProductQty = (lineId, productId, delta, requiredQty) => {
        setComboSelections((prev) => {
            const lineSel = { ...(prev[lineId] || {}) };
            const currentTotal = Object.values(lineSel).reduce((s, q) => s + q, 0);
            const currentQty = lineSel[productId] || 0;
            const newQty = currentQty + delta;
            if (newQty <= 0) {
                delete lineSel[productId];
            } else if (currentTotal - currentQty + newQty <= requiredQty) {
                lineSel[productId] = newQty;
            }
            return { ...prev, [lineId]: lineSel };
        });
    };

    const isComboComplete = () => {
        if (!comboPopup) return false;
        return comboPopup.comboInfo.lines.every((line) => getComboLineQty(line.id) === line.required_qty);
    };

    const confirmCombo = () => {
        if (!comboPopup || !isComboComplete()) return;
        const comboItems = [];
        comboPopup.comboInfo.lines.forEach((line) => {
            const lineSel = comboSelections[line.id] || {};
            Object.entries(lineSel).forEach(([prodId, qty]) => {
                const product = line.products.find((p) => p.id === parseInt(prodId));
                if (product && qty > 0) {
                    comboItems.push({
                        product,
                        quantity: qty,
                        lineLabel: line.name,
                    });
                }
            });
        });
        lineIdCounter += 1;
        const comboLine = {
            lineId: Date.now() + lineIdCounter,
            product: comboPopup.product,
            quantity: 1,
            discount: { type: 'percent', value: 0 },
            note: '',
            isCombo: true,
            comboName: comboPopup.comboInfo.name,
            comboItems,
        };
        syncOrderItems([...orderItems, comboLine]);
        setComboPopup(null);
        setComboSelections({});
    };

    const updateQuantity = (lineId, delta) => {
        const newItems = orderItems
            .map((item) =>
                item.lineId === lineId
                    ? { ...item, quantity: Math.max(0, parseFloat((item.quantity + delta).toFixed(3))) }
                    : item
            )
            .filter((item) => item.quantity > 0);
        syncOrderItems(newItems);
    };

    const setQuantity = (lineId, value) => {
        const qty = parseFloat(value);
        if (isNaN(qty) || qty <= 0) {
            syncOrderItems(orderItems.filter((item) => item.lineId !== lineId));
        } else {
            const newItems = orderItems.map((item) =>
                item.lineId === lineId ? { ...item, quantity: qty } : item
            );
            syncOrderItems(newItems);
        }
    };

    const removeItem = (lineId) => {
        syncOrderItems(orderItems.filter((item) => item.lineId !== lineId));
    };

    const updateItemDiscount = (lineId, discountType, discountValue) => {
        const val = Math.max(0, parseFloat(discountValue) || 0);
        const newItems = orderItems.map((item) =>
            item.lineId === lineId
                ? { ...item, discount: { type: discountType, value: val } }
                : item
        );
        syncOrderItems(newItems);
    };

    const updateItemNote = (lineId, note) => {
        const newItems = orderItems.map((item) =>
            item.lineId === lineId
                ? { ...item, note: note }
                : item
        );
        syncOrderItems(newItems);
    };

    const getItemTotal = (item) => {
        const lineTotal = getProductPrice(item.product) * item.quantity;
        const disc = item.discount || { type: 'percent', value: 0 };
        if (disc.value <= 0) return lineTotal;
        if (disc.type === 'percent') {
            return parseInt(lineTotal * (1 - Math.min(disc.value, 100) / 100));
        }
        return parseInt(Math.max(0, lineTotal - disc.value));
    };

    const getItemDiscountAmount = (item) => {
        const lineTotal = getProductPrice(item.product) * item.quantity;
        return parseInt(lineTotal - getItemTotal(item));
    };

    const subtotal = orderItems.reduce((sum, item) => sum + getItemTotal(item), 0);

    const billDiscountAmount = useMemo(() => {
        if (billDiscount.value <= 0) return 0;
        if (billDiscount.type === 'percent') {
            return parseInt(subtotal * Math.min(billDiscount.value, 100) / 100);
        }
        return parseInt(Math.min(billDiscount.value, subtotal));
    }, [subtotal, billDiscount]);

    // Loyalty points are now handled entirely in PaymentScreen.jsx
    const afterDiscount = Math.max(0, subtotal - billDiscountAmount);
    const orderTotal = Math.max(0, afterDiscount);

    const formatPrice = useCallback((price) => {
        return new Intl.NumberFormat('vi-VN').format(Math.round(price)) + 'đ';
    }, []);

    return (
        <div className="order-screen">
            {/* Header */}
            <header className="order-header">
                <div className="order-header-left">
                    <button className="btn btn-secondary order-back-btn" onClick={onBack}>
                        ← Bàn
                    </button>
                    <div className="order-header-info">
                        <h1 className="order-header-title">
                            Bàn {table.number}
                            {table.mergedTables && table.mergedTables.length > 0 && (
                                <span className="order-merged-badge">
                                    + Bàn {table.mergedTables.join(', ')}
                                </span>
                            )}
                        </h1>
                        <p className="order-header-meta">{posConfig.name}</p>
                    </div>
                </div>

                {/* Header toolbar: Customer, Pricelist, Promotion */}
                <div className="order-header-toolbar">
                    {/* Customer button */}
                    <button
                        className={`order-toolbar-btn ${selectedCustomer ? 'order-toolbar-btn-active' : ''}`}
                        onClick={() => setShowCustomerPopup(true)}
                    >
                        👤 {selectedCustomer ? selectedCustomer.name : 'Khách hàng'}
                    </button>

                    {/* Pricelist button */}
                    <button
                        className={`order-toolbar-btn ${selectedPricelist ? 'order-toolbar-btn-active' : ''}`}
                        onClick={() => setShowPricelistPopup(true)}
                    >
                        💲 {selectedPricelist ? selectedPricelist.name : 'Bảng giá'}
                    </button>

                    {/* Promotion button */}
                    <button
                        className={`order-toolbar-btn ${selectedPromotion ? 'order-toolbar-btn-active' : ''}`}
                        onClick={() => setShowPromotionPopup(true)}
                    >
                        🎁 {selectedPromotion ? selectedPromotion.name : 'Khuyến mãi'}
                    </button>

                    {/* Production button — only show if pos_mrp enabled */}
                    {posConfig?.pos_mrp && (
                        <button
                            className="order-toolbar-btn"
                            onClick={() => setShowProductionPopup(true)}
                        >
                            🏭 Sản xuất
                        </button>
                    )}

                    {/* Label printing button */}
                    <button
                        className={`order-toolbar-btn ${orderItems.length > 0 ? 'order-toolbar-btn-active' : ''}`}
                        onClick={() => setShowLabelPopup(true)}
                        disabled={orderItems.length === 0}
                    >
                        🏷️ In tem
                    </button>
                </div>

                <div className="order-header-right">
                    <span className="order-header-user">👤 {authData.user.name}</span>
                </div>
            </header>

            <div className="order-body">
                {/* Left: Product catalog */}
                <div className="order-products">
                    <div className="order-search">
                        <input
                            type="text"
                            className="input-field order-search-input"
                            placeholder="🔍 Tìm sản phẩm..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="order-categories">
                        <button
                            className={`order-cat-btn ${selectedCategory === null ? 'order-cat-active' : ''}`}
                            onClick={() => setSelectedCategory(null)}
                        >
                            Tất cả
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                className={`order-cat-btn ${selectedCategory === cat.id ? 'order-cat-active' : ''}`}
                                onClick={() => setSelectedCategory(cat.id)}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <div className="order-product-grid">
                        {filteredProducts.length === 0 ? (
                            <div className="order-product-empty">
                                <p>Không tìm thấy sản phẩm</p>
                            </div>
                        ) : (
                            filteredProducts.map((product) => {
                                const totalQty = orderItems
                                    .filter((i) => i.product.id === product.id)
                                    .reduce((sum, i) => sum + i.quantity, 0);
                                return (
                                    <div
                                        key={product.id}
                                        className={`order-product-card glass-card ${totalQty > 0 ? 'order-product-in-cart' : ''}`}
                                        onClick={() => addToOrder(product)}
                                    >
                                        {totalQty > 0 && <div className="order-product-qty-badge">{totalQty}</div>}
                                        <div className="order-product-name">{product.display_name || product.name}</div>
                                        <div className="order-product-price">{formatPrice(getProductPrice(product))}</div>
                                        {product.pos_categ_id && (
                                            <div className="order-product-cat">
                                                {Array.isArray(product.pos_categ_id) ? product.pos_categ_id[1] : ''}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right: Order panel */}
                <div className="order-panel">
                    <div className="order-panel-header">
                        <h2 className="order-panel-title">Đơn hàng — Bàn {table.number}</h2>
                        <span className="order-panel-count">{orderItems.length} món</span>
                    </div>
                    <div className="order-items-list">
                        {orderItems.length === 0 ? (
                            <div className="order-items-empty">
                                <span className="order-items-empty-icon">🛒</span>
                                <p>Chưa có món nào</p>
                                <p className="order-items-empty-hint">Bấm vào sản phẩm bên trái để thêm</p>
                            </div>
                        ) : (
                            orderItems.map((item) => {
                                const disc = item.discount || { type: 'percent', value: 0 };
                                const hasDiscount = disc.value > 0;
                                const lineTotal = getProductPrice(item.product) * item.quantity;
                                const itemTotal = getItemTotal(item);
                                const isEditing = discountItemId === item.lineId;

                                const hasNote = item.note && item.note.trim().length > 0;
                                const isEditingNote = noteItemId === item.lineId;

                                return (
                                    <div key={item.lineId} className={`order-item fade-in ${item.isCombo ? 'order-item-combo' : ''}`}>
                                        <div className="order-item-info">
                                            <div className="order-item-name-wrapper">
                                                <span className="order-item-name">
                                                    {item.isCombo && <span className="combo-badge">🍱</span>}
                                                    {item.product.display_name || item.product.name}
                                                </span>
                                                {hasNote && !isEditingNote && (
                                                    <span className="order-item-note-preview">📝 {item.note}</span>
                                                )}
                                            </div>
                                            <div className="order-item-prices">
                                                {hasDiscount && (
                                                    <span className="order-item-price-original">{formatPrice(lineTotal)}</span>
                                                )}
                                                <span className={`order-item-price ${hasDiscount ? 'order-item-price-discounted' : ''}`}>
                                                    {formatPrice(itemTotal)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="order-item-controls">
                                            <button className="order-qty-btn" onClick={() => updateQuantity(item.lineId, -1)}>−</button>
                                            <input
                                                type="number"
                                                className="order-qty-input"
                                                value={item.quantity}
                                                min="0"
                                                step="0.1"
                                                onChange={(e) => setQuantity(item.lineId, e.target.value)}
                                                onClick={(e) => e.target.select()}
                                            />
                                            <button className="order-qty-btn" onClick={() => updateQuantity(item.lineId, 1)}>+</button>
                                            <button
                                                className={`order-discount-btn ${hasDiscount ? 'order-discount-btn-active' : ''}`}
                                                onClick={() => { setDiscountItemId(isEditing ? null : item.lineId); setNoteItemId(null); }}
                                                title="Chiết khấu"
                                            >
                                                %
                                            </button>
                                            <button
                                                className={`order-note-btn ${hasNote ? 'order-note-btn-active' : ''}`}
                                                onClick={() => { setNoteItemId(isEditingNote ? null : item.lineId); setDiscountItemId(null); }}
                                                title="Ghi chú"
                                            >
                                                📝
                                            </button>
                                            <button className="order-remove-btn" onClick={() => removeItem(item.lineId)}>🗑️</button>
                                        </div>

                                        {/* Combo sub-items */}
                                        {item.isCombo && item.comboItems && (
                                            <div className="combo-sub-items">
                                                {item.comboItems.map((sub, idx) => (
                                                    <div key={idx} className="combo-sub-item">
                                                        <span className="combo-sub-dot">└</span>
                                                        <span className="combo-sub-name">{sub.product.display_name || sub.product.name}</span>
                                                        <span className="combo-sub-qty">×{sub.quantity}</span>
                                                        {getProductPrice(sub.product) > 0 && (
                                                            <span className="combo-sub-extra">+{formatPrice(getProductPrice(sub.product))}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {isEditing && (
                                            <div className="order-item-discount-editor">
                                                <div className="discount-type-toggle">
                                                    <button
                                                        className={`discount-type-btn ${disc.type === 'percent' ? 'discount-type-active' : ''}`}
                                                        onClick={() => updateItemDiscount(item.lineId, 'percent', disc.value)}
                                                    >
                                                        %
                                                    </button>
                                                    <button
                                                        className={`discount-type-btn ${disc.type === 'amount' ? 'discount-type-active' : ''}`}
                                                        onClick={() => updateItemDiscount(item.lineId, 'amount', disc.value)}
                                                    >
                                                        đ
                                                    </button>
                                                </div>
                                                <input
                                                    type="number"
                                                    className="discount-input"
                                                    value={disc.value || ''}
                                                    placeholder={disc.type === 'percent' ? '0%' : '0đ'}
                                                    min="0"
                                                    max={disc.type === 'percent' ? 100 : lineTotal}
                                                    onChange={(e) => updateItemDiscount(item.lineId, disc.type, e.target.value)}
                                                />
                                                {hasDiscount && (
                                                    <span className="discount-preview">-{formatPrice(getItemDiscountAmount(item))}</span>
                                                )}
                                            </div>
                                        )}

                                        {isEditingNote && (
                                            <div className="order-item-note-editor">
                                                <input
                                                    type="text"
                                                    className="note-input"
                                                    value={item.note || ''}
                                                    placeholder="Nhập ghi chú... (VD: ít đường, ít đá)"
                                                    onChange={(e) => updateItemNote(item.lineId, e.target.value)}
                                                    autoFocus
                                                />
                                                {hasNote && (
                                                    <button
                                                        className="note-clear-btn"
                                                        onClick={() => updateItemNote(item.lineId, '')}
                                                        title="Xóa ghi chú"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="order-panel-footer">
                        <div className="order-bill-discount">
                            <button
                                className={`btn ${showBillDiscount || billDiscount.value > 0 ? 'btn-warning' : 'btn-secondary'} order-bill-discount-btn`}
                                onClick={() => setShowBillDiscount(!showBillDiscount)}
                            >
                                🏷️ Chiết khấu tổng {billDiscount.value > 0 && (
                                    <span>
                                        ({billDiscount.type === 'percent' ? `${billDiscount.value}%` : formatPrice(billDiscount.value)})
                                    </span>
                                )}
                            </button>
                        </div>

                        {showBillDiscount && (
                            <div className="order-bill-discount-editor">
                                <div className="discount-type-toggle">
                                    <button
                                        className={`discount-type-btn ${billDiscount.type === 'percent' ? 'discount-type-active' : ''}`}
                                        onClick={() => syncBillDiscount({ type: 'percent', value: billDiscount.value })}
                                    >
                                        %
                                    </button>
                                    <button
                                        className={`discount-type-btn ${billDiscount.type === 'amount' ? 'discount-type-active' : ''}`}
                                        onClick={() => syncBillDiscount({ type: 'amount', value: billDiscount.value })}
                                    >
                                        đ
                                    </button>
                                </div>
                                <input
                                    type="number"
                                    className="discount-input discount-input-bill"
                                    value={billDiscount.value || ''}
                                    placeholder={billDiscount.type === 'percent' ? 'Nhập %...' : 'Nhập số tiền...'}
                                    min="0"
                                    onChange={(e) => {
                                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                                        syncBillDiscount({ type: billDiscount.type, value: val });
                                    }}
                                />
                                {billDiscount.value > 0 && (
                                    <span className="discount-preview">-{formatPrice(billDiscountAmount)}</span>
                                )}
                            </div>
                        )}

                        <div className="order-total-section">
                            <div className="order-total-row">
                                <span className="order-total-label">Tạm tính</span>
                                <span className="order-total-sub">{formatPrice(subtotal)}</span>
                            </div>
                            {billDiscountAmount > 0 && (
                                <div className="order-total-row order-total-row-discount">
                                    <span className="order-total-label">Chiết khấu</span>
                                    <span className="order-total-discount">-{formatPrice(billDiscountAmount)}</span>
                                </div>
                            )}
                            <div className="order-total">
                                <span className="order-total-label-big">Tổng cộng</span>
                                <span className="order-total-value">{formatPrice(orderTotal)}</span>
                            </div>
                        </div>

                        <div className="order-panel-actions">
                            {!selectedCustomer && orderItems.length > 0 && (
                                <p className="order-customer-required">⚠️ Chọn khách hàng để thanh toán</p>
                            )}
                            <button
                                className="btn btn-primary order-action-btn"
                                disabled={orderItems.length === 0 || !selectedCustomer}
                                onClick={onGoToPayment}
                            >
                                💳 Thanh toán
                            </button>
                            {/* <button className="btn btn-secondary order-action-btn" onClick={onBack}>
                                ← Quay lại bàn
                            </button> */}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== POPUP: Customer selector ===== */}
            <PopupOverlay show={showCustomerPopup} onClose={() => setShowCustomerPopup(false)} title="👤 Chọn khách hàng" className="order-popup-wide">
                <div className="popup-search popup-search-with-btn">
                    <input
                        type="text"
                        className="input-field"
                        placeholder="🔍 Tìm khách hàng..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        autoFocus
                    />
                    <button
                        className="btn btn-primary popup-search-btn"
                        onClick={() => { setShowCreateCustomer(true); setCreateCustomerError(''); }}
                    >
                        ➕ Tạo mới
                    </button>
                </div>
                <div className="popup-list">
                    <div
                        className={`popup-list-item ${!selectedCustomer ? 'popup-list-item-active' : ''}`}
                        onClick={() => { syncCustomer(null); setShowCustomerPopup(false); setCustomerSearch(''); }}
                    >
                        <span className="popup-list-item-icon">🚶</span>
                        <span className="popup-list-item-name">Khách vãng lai</span>
                    </div>
                    {/* Table header */}
                    <div className="popup-table-header">
                        <span className="popup-col popup-col-name">Tên</span>
                        <span className="popup-col popup-col-phone">SĐT</span>
                        <span className="popup-col popup-col-email">Email</span>
                        <span className="popup-col popup-col-group">Nhóm</span>
                        <span className="popup-col popup-col-check"></span>
                    </div>
                    {/* Table rows */}
                    {filteredCustomers.map((c) => (
                        <div
                            key={c.id}
                            className={`popup-table-row ${selectedCustomer?.id === c.id ? 'popup-table-row-active' : ''}`}
                            onClick={() => { syncCustomer(c); setShowCustomerPopup(false); setCustomerSearch(''); }}
                        >
                            <span className="popup-col popup-col-name">{c.name}</span>
                            <span className="popup-col popup-col-phone">{c.phone || c.mobile || '—'}</span>
                            <span className="popup-col popup-col-email">{c.email || '—'}</span>
                            <span className="popup-col popup-col-group">{c.group_id ? c.group_id.name : '—'}</span>
                            <span className="popup-col popup-col-check">
                                {selectedCustomer?.id === c.id && <span className="popup-list-item-check">✓</span>}
                            </span>
                        </div>
                    ))}
                    {filteredCustomers.length === 0 && (
                        <div className="popup-list-empty">Không tìm thấy khách hàng</div>
                    )}
                </div>
            </PopupOverlay>

            {/* ===== POPUP: Create new customer ===== */}
            <PopupOverlay show={showCreateCustomer} onClose={() => setShowCreateCustomer(false)} title="➕ Tạo khách hàng mới">
                <div className="create-customer-form">
                    <div className="create-customer-field">
                        <label className="create-customer-label">Tên khách hàng *</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Nhập tên khách hàng..."
                            value={newCustomerForm.name}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                            autoFocus
                        />
                    </div>
                    <div className="create-customer-field">
                        <label className="create-customer-label">Số điện thoại</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Nhập SĐT..."
                            value={newCustomerForm.phone}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                        />
                    </div>
                    <div className="create-customer-field">
                        <label className="create-customer-label">Email</label>
                        <input
                            type="email"
                            className="input-field"
                            placeholder="Nhập email..."
                            value={newCustomerForm.email}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                        />
                    </div>
                    <div className="create-customer-field">
                        <label className="create-customer-label">Địa chỉ</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Nhập địa chỉ..."
                            value={newCustomerForm.street}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, street: e.target.value })}
                        />
                    </div>
                    {createCustomerError && (
                        <p className="create-customer-error">⚠️ {createCustomerError}</p>
                    )}
                    <div className="create-customer-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleCreateCustomer}
                            disabled={creatingCustomer}
                        >
                            {creatingCustomer ? '⏳ Đang tạo...' : '✅ Tạo khách hàng'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowCreateCustomer(false)}
                            disabled={creatingCustomer}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </PopupOverlay>

            {/* ===== POPUP: Pricelist selector ===== */}
            <PopupOverlay show={showPricelistPopup} onClose={() => setShowPricelistPopup(false)} title="💲 Chọn bảng giá">
                <div className="popup-list">
                    <div
                        className={`popup-list-item ${!selectedPricelist ? 'popup-list-item-active' : ''}`}
                        onClick={() => { syncPricelist(null); setShowPricelistPopup(false); }}
                    >
                        <span className="popup-list-item-icon">📋</span>
                        <span className="popup-list-item-name">Mặc định</span>
                        {!selectedPricelist && <span className="popup-list-item-check">✓</span>}
                    </div>
                    {pricelists.map((pl) => (
                        <div
                            key={pl.id}
                            className={`popup-list-item ${selectedPricelist?.id === pl.id ? 'popup-list-item-active' : ''}`}
                            onClick={() => { syncPricelist(pl); setShowPricelistPopup(false); }}
                        >
                            <span className="popup-list-item-icon">💲</span>
                            <span className="popup-list-item-name">{pl.name}</span>
                            {selectedPricelist?.id === pl.id && <span className="popup-list-item-check">✓</span>}
                        </div>
                    ))}
                    {pricelists.length === 0 && (
                        <div className="popup-list-empty">Chưa có bảng giá nào</div>
                    )}
                </div>
            </PopupOverlay>

            {/* ===== POPUP: Promotion selector ===== */}
            <PopupOverlay show={showPromotionPopup} onClose={() => setShowPromotionPopup(false)} title="🎁 Chọn chương trình khuyến mãi">
                <div className="popup-list">
                    <div
                        className={`popup-list-item ${!selectedPromotion ? 'popup-list-item-active' : ''}`}
                        onClick={() => { syncPromotion(null); setShowPromotionPopup(false); }}
                    >
                        <span className="popup-list-item-icon">❌</span>
                        <span className="popup-list-item-name">Không áp dụng</span>
                        {!selectedPromotion && <span className="popup-list-item-check">✓</span>}
                    </div>
                    {promotions.map((promo) => (
                        <div
                            key={promo.id}
                            className={`popup-list-item ${selectedPromotion?.id === promo.id ? 'popup-list-item-active' : ''}`}
                            onClick={() => { syncPromotion(promo); setShowPromotionPopup(false); }}
                        >
                            <span className="popup-list-item-icon">🎁</span>
                            <div className="popup-list-item-info">
                                <span className="popup-list-item-name">{promo.name}</span>
                                <span className="popup-list-item-detail">
                                    {promo.discount_type === 'percentage'
                                        ? `Giảm ${promo.discount_percentage}%`
                                        : `Giảm ${formatPrice(promo.discount_fixed_amount)}`}
                                </span>
                            </div>
                            {selectedPromotion?.id === promo.id && <span className="popup-list-item-check">✓</span>}
                        </div>
                    ))}
                    {promotions.length === 0 && (
                        <div className="popup-list-empty">Chưa có chương trình khuyến mãi nào</div>
                    )}
                </div>
            </PopupOverlay>

            {/* ===== POPUP: Combo product selector ===== */}
            {comboPopup && (
                <div className="popup-overlay" onClick={() => { setComboPopup(null); setComboSelections({}); }}>
                    <div className="combo-popup glass-card slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="combo-header">
                            <h2 className="combo-title">🍱 {comboPopup.comboInfo.name}</h2>
                            <button className="history-close" onClick={() => { setComboPopup(null); setComboSelections({}); }}>✕</button>
                        </div>
                        <div className="combo-body">
                            {comboPopup.comboInfo.lines.map((line) => {
                                const selectedQty = getComboLineQty(line.id);
                                const isLineDone = selectedQty === line.required_qty;
                                return (
                                    <div key={line.id} className={`combo-line ${isLineDone ? 'combo-line-done' : ''}`}>
                                        <div className="combo-line-header">
                                            <span className="combo-line-name">{line.name}</span>
                                            <span className={`combo-line-counter ${isLineDone ? 'combo-line-counter-done' : ''}`}>
                                                {selectedQty}/{line.required_qty}
                                            </span>
                                        </div>
                                        <div className="combo-products">
                                            {line.products.map((p) => {
                                                const qty = (comboSelections[line.id] || {})[p.id] || 0;
                                                const isSelected = qty > 0;
                                                return (
                                                    <div
                                                        key={p.id}
                                                        className={`combo-product-item ${isSelected ? 'combo-product-selected' : ''} ${!isSelected && isLineDone ? 'combo-product-disabled' : ''}`}
                                                        onClick={() => toggleComboProduct(line.id, p.id, line.required_qty, line.products.length)}
                                                    >
                                                        <div className="combo-product-info">
                                                            <span className="combo-product-name">{p.display_name}</span>
                                                            {getProductPrice(p) > 0 && (
                                                                <span className="combo-product-extra">+{formatPrice(getProductPrice(p))}</span>
                                                            )}
                                                        </div>
                                                        {isSelected && (
                                                            <div className="combo-product-qty" onClick={(e) => e.stopPropagation()}>
                                                                <button className="combo-qty-btn" onClick={() => updateComboProductQty(line.id, p.id, -1, line.required_qty)}>−</button>
                                                                <span className="combo-qty-value">{qty}</span>
                                                                <button className="combo-qty-btn" onClick={() => updateComboProductQty(line.id, p.id, 1, line.required_qty)}>+</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="combo-footer">
                            <button
                                className="btn btn-primary combo-confirm-btn"
                                disabled={!isComboComplete()}
                                onClick={confirmCombo}
                            >
                                {isComboComplete() ? '✅ Xác nhận combo' : 'Vui lòng chọn đủ sản phẩm'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => { setComboPopup(null); setComboSelections({}); }}>
                                Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== POPUP: Production ===== */}
            {showProductionPopup && (
                <div className="popup-overlay" onClick={() => { setShowProductionPopup(false); setSelectedProduction(null); }}>
                    <div className="production-popup glass-card slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="production-header">
                            <h2 className="production-title">🏭 Sản xuất</h2>
                            <button className="history-close" onClick={() => { setShowProductionPopup(false); setSelectedProduction(null); }}>✕</button>
                        </div>
                        <div className="production-body">
                            {!selectedProduction ? (
                                /* Product selection list */
                                <div className="production-product-list">
                                    <div className="popup-search">
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="🔍 Tìm sản phẩm sản xuất..."
                                            value={productionSearch}
                                            onChange={(e) => setProductionSearch(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    {productionData
                                        .filter((p) => !productionSearch.trim() || (p.display_name || p.name).toLowerCase().includes(productionSearch.toLowerCase()))
                                        .map((prod) => (
                                            <div
                                                key={prod.id}
                                                className="production-product-item"
                                                onClick={() => openProduction(prod)}
                                            >
                                                <span className="production-product-name">{prod.display_name || prod.name}</span>
                                                <span className="production-product-materials">{prod.mrpComponents.length} nguyên liệu</span>
                                                <span className="production-product-arrow">›</span>
                                            </div>
                                        ))}
                                    {productionData.length === 0 && (
                                        <p style={{ color: 'var(--text-muted)', padding: '16px', textAlign: 'center' }}>Không có sản phẩm sản xuất</p>
                                    )}
                                </div>
                            ) : (
                                /* Material entry form */
                                <div className="production-form">
                                    <button className="btn btn-secondary production-back-btn" onClick={() => setSelectedProduction(null)}>
                                        ← Chọn sản phẩm khác
                                    </button>
                                    {/* Finished product */}
                                    <div className="production-finished">
                                        <div className="production-finished-info">
                                            <span className="production-finished-label">Thành phẩm</span>
                                            <span className="production-finished-name">{selectedProduction.display_name || selectedProduction.name}</span>
                                        </div>
                                        <div className="production-finished-qty">
                                            <label className="production-qty-label">Số lượng</label>
                                            <input
                                                type="number"
                                                className="input-field production-qty-input"
                                                value={productionQty}
                                                min="0.1"
                                                step="0.1"
                                                onChange={(e) => setProductionQty(parseFloat(e.target.value) || 0)}
                                                onClick={(e) => e.target.select()}
                                            />
                                        </div>
                                    </div>

                                    {/* Materials list */}
                                    <h4 className="production-materials-title">🧱 Nguyên liệu</h4>
                                    <div className="production-materials-list">
                                        <div className="production-material-header">
                                            <span className="production-mat-col production-mat-name">Nguyên liệu</span>
                                            <span className="production-mat-col production-mat-qty">Số lượng</span>
                                        </div>
                                        {selectedProduction.mrpComponents.map((mat) => (
                                            <div key={mat.componentId} className="production-material-row">
                                                <span className="production-mat-col production-mat-name">{mat.componentName}</span>
                                                <span className="production-mat-col production-mat-qty">
                                                    <input
                                                        type="number"
                                                        className="input-field production-mat-input"
                                                        value={materialQtys[mat.componentId] ?? mat.quantity}
                                                        min="0"
                                                        step="0.1"
                                                        onChange={(e) => updateMaterialQty(mat.componentId, e.target.value)}
                                                        onClick={(e) => e.target.select()}
                                                    />
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {selectedProduction && (
                            <div className="production-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {productionError && <div style={{ color: 'red', fontSize: '14px', textAlign: 'center' }}>{productionError}</div>}
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                    <button
                                        className="btn btn-primary production-confirm-btn"
                                        onClick={() => setShowProduceConfirm(true)}
                                        disabled={productionQty <= 0 || isProducing}
                                    >
                                        {isProducing ? '⏳ Đang xử lý...' : '✅ Xác nhận sản xuất'}
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => { setShowProductionPopup(false); setSelectedProduction(null); }}
                                        disabled={isProducing}
                                    >
                                        Hủy
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Custom Production Confirm Popup */}
            {showProduceConfirm && (
                <div className="popup-overlay" onClick={() => setShowProduceConfirm(false)} style={{ zIndex: 2000 }}>
                    <div className="glass-card popup-card" style={{ width: '400px', padding: '24px', borderRadius: '16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤔</div>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 'bold' }}>Xác nhận sản xuất</h3>
                        <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '15px', lineHeight: '1.5' }}>
                            Bạn có chắc chắn muốn tạo đơn sản xuất cho <strong>{productionQty} {selectedProduction?.display_name || selectedProduction?.name}</strong> với định mức vật tư hiện tại không?
                            <br /><br />
                            <em>Bạn đã kiểm tra đầy đủ dữ liệu chưa?</em>
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button className="btn btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setShowProduceConfirm(false)}>
                                Xem lại
                            </button>
                            <button className="btn btn-primary" style={{ flex: 1, padding: '12px', background: 'var(--primary-color)' }} onClick={handleProductionConfirm}>
                                Đồng ý tạo
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Label Printing Popup */}
            {showLabelPopup && (
                <div className="order-popup-overlay" onClick={() => setShowLabelPopup(false)}>
                    <div className="label-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="label-popup-header">
                            <h3 className="label-popup-title">🏷️ In tem sản phẩm ({orderItems.reduce((s, i) => s + i.quantity, 0)} tem)</h3>
                            <div className="label-popup-actions">
                                <button className="btn btn-primary label-print-btn" onClick={() => {
                                    const printContent = document.getElementById('label-print-area');
                                    const printWindow = window.open('', '_blank', 'width=800,height=600');
                                    printWindow.document.write(`
                                        <html>
                                        <head>
                                            <title>In tem sản phẩm</title>
                                            <style>
                                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                                body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; }
                                                .label-grid {
                                                    display: flex; flex-direction: column;
                                                    align-items: center; gap: 0; padding: 0;
                                                }
                                                .product-label {
                                                    width: 50mm; height: 30mm;
                                                    border: 0.5px dashed #ccc;
                                                    display: flex; flex-direction: row;
                                                    align-items: stretch;
                                                    page-break-inside: avoid;
                                                    background: #fff; overflow: hidden;
                                                }
                                                .label-left {
                                                    width: 14mm; display: flex;
                                                    flex-direction: column; align-items: center;
                                                    justify-content: center; gap: 1mm;
                                                    padding: 1.5mm;
                                                    border-right: 0.3px solid #e0e0e0;
                                                    background: #fafafa;
                                                }
                                                .label-logo {
                                                    width: 10mm; height: 10mm;
                                                    border-radius: 1.5mm; object-fit: cover;
                                                }
                                                .label-table-info {
                                                    font-size: 6pt; color: #888;
                                                    text-align: center; line-height: 1.2;
                                                    font-weight: 600;
                                                }
                                                .label-right {
                                                    flex: 1; display: flex;
                                                    flex-direction: column; justify-content: center;
                                                    padding: 1.5mm 2.5mm; gap: 0.8mm; overflow: hidden;
                                                }
                                                .label-product-name {
                                                    font-size: 8pt; font-weight: 700;
                                                    color: #111; line-height: 1.25;
                                                    overflow: hidden; display: -webkit-box;
                                                    -webkit-line-clamp: 3; -webkit-box-orient: vertical;
                                                }
                                                .label-price-row {
                                                    display: flex; align-items: center;
                                                    justify-content: space-between; gap: 2mm;
                                                }
                                                .label-price {
                                                    font-size: 10pt; font-weight: 800; color: #000;
                                                }
                                                .label-qty {
                                                    font-size: 5.5pt; color: #666; font-weight: 600;
                                                    background: #f0f0f0; padding: 0.3mm 1.5mm;
                                                    border-radius: 1mm; white-space: nowrap;
                                                }
                                                .label-note {
                                                    font-size: 6.5pt; color: #444; font-style: italic;
                                                    line-height: 1.2; border-top: 0.3px dashed #ddd;
                                                    padding-top: 0.5mm; overflow: hidden;
                                                    white-space: nowrap; text-overflow: ellipsis;
                                                }
                                                .label-date {
                                                    font-size: 5.5pt; color: #aaa; text-align: right;
                                                }
                                                @page { size: 50mm 30mm; margin: 0; }
                                                @media print {
                                                    body { margin: 0; }
                                                    .label-grid { gap: 0; padding: 0; }
                                                    .product-label { border: none; }
                                                }
                                            </style>
                                        </head>
                                        <body>
                                    ` + printContent.innerHTML + `
                                            <script>window.onload = function() { window.print(); window.close(); }<\/script>
                                        </body>
                                        </html>
                                    `);
                                    printWindow.document.close();
                                }}>
                                    🖨️ In
                                </button>
                                <button className="order-popup-close" onClick={() => setShowLabelPopup(false)}>✕</button>
                            </div>
                        </div>
                        <div className="label-popup-body">
                            <div id="label-print-area" className="label-grid">
                                {orderItems.map((item) => {
                                    const labels = [];
                                    for (let i = 0; i < item.quantity; i++) {
                                        labels.push(
                                            <div key={`${item.lineId}-${i}`} className="product-label">
                                                <div className="label-left">
                                                    <img src={item.product.image_medium ? `data:image/png;base64,${item.product.image_medium}` : "/logo.png"} alt="Logo" className="label-logo" />
                                                    <div className="label-table-info">Bàn {table.number}</div>
                                                </div>
                                                <div className="label-right">
                                                    <div className="label-product-name">
                                                        {item.product.name || item.product.display_name}
                                                    </div>
                                                    <div className="label-price-row">
                                                        <span className="label-price">{formatPrice(getProductPrice(item.product))}</span>
                                                        <span className="label-qty">Tem {i + 1}/{item.quantity}</span>
                                                    </div>
                                                    {item.note && item.note.trim() && (
                                                        <div className="label-note">📝 {item.note}</div>
                                                    )}
                                                    <div className="label-date">{new Date().toLocaleDateString('vi-VN')}</div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return labels;
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default OrderScreen;

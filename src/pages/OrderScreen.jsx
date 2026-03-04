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
    const { products = [], categories = [], customers = [], pricelists = [], promotions = [] } = posData || {};
    const [orderItems, setOrderItems] = useState(table.orderItems || []);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Mock combo data — combo products have combo_lines
    const comboData = {
        // Key = product ID that is a combo
        132712: {
            name: 'Combo Lẩu Thái 2 Người',
            lines: [
                {
                    id: 1,
                    name: 'Chọn nước lẩu',
                    required_qty: 1,
                    products: [
                        { id: 101, display_name: 'Nước lẩu Thái chua cay', list_price: 0 },
                        { id: 102, display_name: 'Nước lẩu Tomyum', list_price: 0 },
                        { id: 103, display_name: 'Nước lẩu Mala', list_price: 15000 },
                    ],
                },
                {
                    id: 2,
                    name: 'Chọn thịt (2 phần)',
                    required_qty: 2,
                    products: [
                        { id: 201, display_name: 'Bò Mỹ thái lát', list_price: 0 },
                        { id: 202, display_name: 'Ba chỉ bò', list_price: 0 },
                        { id: 203, display_name: 'Thịt heo cuộn nấm', list_price: 0 },
                        { id: 204, display_name: 'Bò Wagyu A5', list_price: 50000 },
                    ],
                },
                {
                    id: 3,
                    name: 'Chọn rau & nấm (3 phần)',
                    required_qty: 3,
                    products: [
                        { id: 301, display_name: 'Rau muống', list_price: 0 },
                        { id: 302, display_name: 'Nấm kim châm', list_price: 0 },
                        { id: 303, display_name: 'Nấm đùi gà', list_price: 0 },
                        { id: 304, display_name: 'Đậu phụ non', list_price: 0 },
                        { id: 305, display_name: 'Bắp cải thảo', list_price: 0 },
                    ],
                },
                {
                    id: 4,
                    name: 'Chọn đồ uống',
                    required_qty: 2,
                    products: [
                        { id: 401, display_name: 'Trà đá', list_price: 0 },
                        { id: 402, display_name: 'Nước ngọt Pepsi', list_price: 0 },
                        { id: 403, display_name: 'Bia Tiger', list_price: 10000 },
                        { id: 404, display_name: 'Sinh tố bơ', list_price: 15000 },
                    ],
                },
            ],
        },
        999002: {
            name: 'Combo Trái Cây Mùa Hè',
            lines: [
                {
                    id: 1,
                    name: 'Chọn trái cây chính (2 loại)',
                    required_qty: 2,
                    products: [
                        { id: 501, display_name: 'Xoài cát Hòa Lộc', list_price: 0 },
                        { id: 502, display_name: 'Sầu riêng Ri6', list_price: 30000 },
                        { id: 503, display_name: 'Măng cụt', list_price: 0 },
                        { id: 504, display_name: 'Chôm chôm', list_price: 0 },
                    ],
                },
                {
                    id: 2,
                    name: 'Chọn topping',
                    required_qty: 1,
                    products: [
                        { id: 601, display_name: 'Sữa đặc', list_price: 0 },
                        { id: 602, display_name: 'Kem vanilla', list_price: 5000 },
                        { id: 603, display_name: 'Mật ong', list_price: 0 },
                    ],
                },
            ],
        },
    };

    // Combo popup state
    const [comboPopup, setComboPopup] = useState(null); // { productId, comboInfo }
    const [comboSelections, setComboSelections] = useState({}); // { lineId: { productId: qty } }

    // Mock production data
    const productionData = [
        {
            id: 1,
            name: 'Nước ép cam',
            unit: 'ly',
            materials: [
                { id: 101, name: 'Cam tươi', unit: 'kg', default_qty: 0.3 },
                { id: 102, name: 'Đường', unit: 'g', default_qty: 20 },
                { id: 103, name: 'Đá viên', unit: 'viên', default_qty: 5 },
            ],
        },
        {
            id: 2,
            name: 'Sinh tố bơ',
            unit: 'ly',
            materials: [
                { id: 201, name: 'Bơ', unit: 'quả', default_qty: 0.5 },
                { id: 202, name: 'Sữa đặc', unit: 'ml', default_qty: 30 },
                { id: 203, name: 'Đá viên', unit: 'viên', default_qty: 5 },
                { id: 204, name: 'Sữa tươi', unit: 'ml', default_qty: 100 },
            ],
        },
        {
            id: 3,
            name: 'Nước lẩu Thái',
            unit: 'phần',
            materials: [
                { id: 301, name: 'Nước dùng xương', unit: 'lít', default_qty: 1.5 },
                { id: 302, name: 'Sả cây', unit: 'cây', default_qty: 2 },
                { id: 303, name: 'Lá chanh', unit: 'lá', default_qty: 5 },
                { id: 304, name: 'Ớt hiểm', unit: 'g', default_qty: 10 },
                { id: 305, name: 'Nước mắm', unit: 'ml', default_qty: 30 },
                { id: 306, name: 'Nước cốt chanh', unit: 'ml', default_qty: 20 },
            ],
        },
        {
            id: 4,
            name: 'Gỏi cuốn',
            unit: 'cuốn',
            materials: [
                { id: 401, name: 'Bánh tráng', unit: 'tấm', default_qty: 1 },
                { id: 402, name: 'Bún', unit: 'g', default_qty: 30 },
                { id: 403, name: 'Tôm luộc', unit: 'con', default_qty: 2 },
                { id: 404, name: 'Rau sống', unit: 'g', default_qty: 20 },
                { id: 405, name: 'Giá đỗ', unit: 'g', default_qty: 10 },
            ],
        },
    ];

    // Production popup state
    const [showProductionPopup, setShowProductionPopup] = useState(false);
    const [selectedProduction, setSelectedProduction] = useState(null);
    const [productionQty, setProductionQty] = useState(1);
    const [materialQtys, setMaterialQtys] = useState({});
    const [productionSearch, setProductionSearch] = useState('');

    const openProduction = (prod) => {
        setSelectedProduction(prod);
        setProductionQty(1);
        const initialQtys = {};
        prod.materials.forEach((m) => { initialQtys[m.id] = m.default_qty; });
        setMaterialQtys(initialQtys);
    };

    const updateMaterialQty = (materialId, value) => {
        const qty = parseFloat(value);
        setMaterialQtys((prev) => ({
            ...prev,
            [materialId]: isNaN(qty) ? 0 : qty,
        }));
    };

    const handleProductionConfirm = () => {
        // Placeholder — user will implement real logic
        console.log('Production confirm:', {
            product: selectedProduction,
            finishedQty: productionQty,
            materials: materialQtys,
        });
        setShowProductionPopup(false);
        setSelectedProduction(null);
    };

    // Bill discount state
    const [billDiscount, setBillDiscount] = useState(table.billDiscount || { type: 'percent', value: 0 });
    const [showBillDiscount, setShowBillDiscount] = useState(false);

    // Item discount popup
    const [discountItemId, setDiscountItemId] = useState(null);

    // Customer selection (moved from PaymentScreen)
    const [selectedCustomer, setSelectedCustomer] = useState(table.selectedCustomer || null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerPopup, setShowCustomerPopup] = useState(false);

    // Create customer form
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', street: '' });
    const [creatingCustomer, setCreatingCustomer] = useState(false);
    const [createCustomerError, setCreateCustomerError] = useState('');
    const [localCustomers, setLocalCustomers] = useState(customers);

    // Pricelist & Promotion selection
    const [selectedPricelist, setSelectedPricelist] = useState(table.selectedPricelist || null);
    const [showPricelistPopup, setShowPricelistPopup] = useState(false);
    const [selectedPromotion, setSelectedPromotion] = useState(table.selectedPromotion || null);
    const [showPromotionPopup, setShowPromotionPopup] = useState(false);

    // Sync order items + bill discount back to table
    const syncOrderItems = (newItems, newBillDiscount) => {
        setOrderItems(newItems);
        const bd = newBillDiscount !== undefined ? newBillDiscount : billDiscount;
        updateTable(table.id, { orderItems: newItems, billDiscount: bd });
    };

    const syncBillDiscount = (newBillDiscount) => {
        setBillDiscount(newBillDiscount);
        updateTable(table.id, { billDiscount: newBillDiscount });
    };

    const syncCustomer = (customer) => {
        setSelectedCustomer(customer);
        updateTable(table.id, { selectedCustomer: customer });
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
                    c.name.toLowerCase().includes(q) ||
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
        const combo = comboData[product.id];
        if (combo) {
            // Initialize combo selections
            const initialSelections = {};
            combo.lines.forEach((line) => {
                initialSelections[line.id] = {};
            });
            setComboSelections(initialSelections);
            setComboPopup({ product, comboInfo: combo });
            return;
        }

        lineIdCounter += 1;
        const newLine = {
            lineId: Date.now() + lineIdCounter,
            product,
            quantity: 1,
            discount: { type: 'percent', value: 0 },
        };
        syncOrderItems([...orderItems, newLine]);
    };

    // Combo selection helpers
    const getComboLineQty = (lineId) => {
        const sel = comboSelections[lineId] || {};
        return Object.values(sel).reduce((sum, q) => sum + q, 0);
    };

    const toggleComboProduct = (lineId, productId, requiredQty) => {
        setComboSelections((prev) => {
            const lineSel = { ...(prev[lineId] || {}) };
            const currentTotal = Object.values(lineSel).reduce((s, q) => s + q, 0);
            if (lineSel[productId]) {
                // Remove
                delete lineSel[productId];
            } else if (currentTotal < requiredQty) {
                // Add
                lineSel[productId] = 1;
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

    const getItemTotal = (item) => {
        const lineTotal = item.product.list_price * item.quantity;
        const disc = item.discount || { type: 'percent', value: 0 };
        if (disc.value <= 0) return lineTotal;
        if (disc.type === 'percent') {
            return lineTotal * (1 - Math.min(disc.value, 100) / 100);
        }
        return Math.max(0, lineTotal - disc.value);
    };

    const getItemDiscountAmount = (item) => {
        const lineTotal = item.product.list_price * item.quantity;
        return lineTotal - getItemTotal(item);
    };

    const subtotal = orderItems.reduce((sum, item) => sum + getItemTotal(item), 0);

    const billDiscountAmount = useMemo(() => {
        if (billDiscount.value <= 0) return 0;
        if (billDiscount.type === 'percent') {
            return subtotal * Math.min(billDiscount.value, 100) / 100;
        }
        return Math.min(billDiscount.value, subtotal);
    }, [subtotal, billDiscount]);

    const orderTotal = Math.max(0, subtotal - billDiscountAmount);

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

                    {/* Production button */}
                    <button
                        className="order-toolbar-btn"
                        onClick={() => setShowProductionPopup(true)}
                    >
                        🏭 Sản xuất
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
                                        <div className="order-product-price">{formatPrice(product.list_price)}</div>
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
                                const lineTotal = item.product.list_price * item.quantity;
                                const itemTotal = getItemTotal(item);
                                const isEditing = discountItemId === item.lineId;

                                return (
                                    <div key={item.lineId} className={`order-item fade-in ${item.isCombo ? 'order-item-combo' : ''}`}>
                                        <div className="order-item-info">
                                            <span className="order-item-name">
                                                {item.isCombo && <span className="combo-badge">🍱</span>}
                                                {item.product.display_name || item.product.name}
                                            </span>
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
                                                onClick={() => setDiscountItemId(isEditing ? null : item.lineId)}
                                                title="Chiết khấu"
                                            >
                                                %
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
                                                        {sub.product.list_price > 0 && (
                                                            <span className="combo-sub-extra">+{formatPrice(sub.product.list_price)}</span>
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
                            <button className="btn btn-secondary order-action-btn" onClick={onBack}>
                                ← Quay lại bàn
                            </button>
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
                                                        onClick={() => toggleComboProduct(line.id, p.id, line.required_qty)}
                                                    >
                                                        <div className="combo-product-info">
                                                            <span className="combo-product-name">{p.display_name}</span>
                                                            {p.list_price > 0 && (
                                                                <span className="combo-product-extra">+{formatPrice(p.list_price)}</span>
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
                                        .filter((p) => !productionSearch.trim() || p.name.toLowerCase().includes(productionSearch.toLowerCase()))
                                        .map((prod) => (
                                            <div
                                                key={prod.id}
                                                className="production-product-item"
                                                onClick={() => openProduction(prod)}
                                            >
                                                <span className="production-product-name">{prod.name}</span>
                                                <span className="production-product-unit">{prod.unit}</span>
                                                <span className="production-product-materials">{prod.materials.length} nguyên liệu</span>
                                                <span className="production-product-arrow">›</span>
                                            </div>
                                        ))}
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
                                            <span className="production-finished-name">{selectedProduction.name}</span>
                                        </div>
                                        <div className="production-finished-qty">
                                            <label className="production-qty-label">Số lượng ({selectedProduction.unit})</label>
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
                                            <span className="production-mat-col production-mat-name">Tên nguyên liệu</span>
                                            <span className="production-mat-col production-mat-unit">Đơn vị</span>
                                            <span className="production-mat-col production-mat-qty">Số lượng</span>
                                        </div>
                                        {selectedProduction.materials.map((mat) => (
                                            <div key={mat.id} className="production-material-row">
                                                <span className="production-mat-col production-mat-name">{mat.name}</span>
                                                <span className="production-mat-col production-mat-unit">{mat.unit}</span>
                                                <span className="production-mat-col production-mat-qty">
                                                    <input
                                                        type="number"
                                                        className="input-field production-mat-input"
                                                        value={materialQtys[mat.id] ?? mat.default_qty}
                                                        min="0"
                                                        step="0.1"
                                                        onChange={(e) => updateMaterialQty(mat.id, e.target.value)}
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
                            <div className="production-footer">
                                <button
                                    className="btn btn-primary production-confirm-btn"
                                    onClick={handleProductionConfirm}
                                    disabled={productionQty <= 0}
                                >
                                    ✅ Xác nhận sản xuất
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setShowProductionPopup(false); setSelectedProduction(null); }}>
                                    Hủy
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default OrderScreen;

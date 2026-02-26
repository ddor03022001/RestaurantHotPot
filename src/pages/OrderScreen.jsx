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

    // Bill discount state
    const [billDiscount, setBillDiscount] = useState(table.billDiscount || { type: 'percent', value: 0 });
    const [showBillDiscount, setShowBillDiscount] = useState(false);

    // Item discount popup
    const [discountItemId, setDiscountItemId] = useState(null);

    // Customer selection (moved from PaymentScreen)
    const [selectedCustomer, setSelectedCustomer] = useState(table.selectedCustomer || null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerPopup, setShowCustomerPopup] = useState(false);

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
                    p.name.toLowerCase().includes(q) ||
                    (p.default_code && p.default_code.toLowerCase().includes(q)) ||
                    (p.barcode && p.barcode.toLowerCase().includes(q))
            );
        }
        return filtered;
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
    }, [customers, customerSearch]);

    // Add product to order
    const addToOrder = (product) => {
        const newItems = [...orderItems];
        const existing = newItems.find((item) => item.product.id === product.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            newItems.push({ product, quantity: 1, discount: { type: 'percent', value: 0 } });
        }
        syncOrderItems(newItems);
    };

    const updateQuantity = (productId, delta) => {
        const newItems = orderItems
            .map((item) =>
                item.product.id === productId
                    ? { ...item, quantity: Math.max(0, item.quantity + delta) }
                    : item
            )
            .filter((item) => item.quantity > 0);
        syncOrderItems(newItems);
    };

    const removeItem = (productId) => {
        syncOrderItems(orderItems.filter((item) => item.product.id !== productId));
    };

    const updateItemDiscount = (productId, discountType, discountValue) => {
        const val = Math.max(0, parseFloat(discountValue) || 0);
        const newItems = orderItems.map((item) =>
            item.product.id === productId
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
                                const inOrder = orderItems.find((i) => i.product.id === product.id);
                                return (
                                    <div
                                        key={product.id}
                                        className={`order-product-card glass-card ${inOrder ? 'order-product-in-cart' : ''}`}
                                        onClick={() => addToOrder(product)}
                                    >
                                        {inOrder && <div className="order-product-qty-badge">{inOrder.quantity}</div>}
                                        <div className="order-product-name">{product.name}</div>
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
                                const isEditing = discountItemId === item.product.id;

                                return (
                                    <div key={item.product.id} className="order-item fade-in">
                                        <div className="order-item-info">
                                            <span className="order-item-name">{item.product.name}</span>
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
                                            <button className="order-qty-btn" onClick={() => updateQuantity(item.product.id, -1)}>−</button>
                                            <span className="order-qty-value">{item.quantity}</span>
                                            <button className="order-qty-btn" onClick={() => updateQuantity(item.product.id, 1)}>+</button>
                                            <button
                                                className={`order-discount-btn ${hasDiscount ? 'order-discount-btn-active' : ''}`}
                                                onClick={() => setDiscountItemId(isEditing ? null : item.product.id)}
                                                title="Chiết khấu"
                                            >
                                                %
                                            </button>
                                            <button className="order-remove-btn" onClick={() => removeItem(item.product.id)}>🗑️</button>
                                        </div>

                                        {isEditing && (
                                            <div className="order-item-discount-editor">
                                                <div className="discount-type-toggle">
                                                    <button
                                                        className={`discount-type-btn ${disc.type === 'percent' ? 'discount-type-active' : ''}`}
                                                        onClick={() => updateItemDiscount(item.product.id, 'percent', disc.value)}
                                                    >
                                                        %
                                                    </button>
                                                    <button
                                                        className={`discount-type-btn ${disc.type === 'amount' ? 'discount-type-active' : ''}`}
                                                        onClick={() => updateItemDiscount(item.product.id, 'amount', disc.value)}
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
                                                    onChange={(e) => updateItemDiscount(item.product.id, disc.type, e.target.value)}
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
                <div className="popup-search">
                    <input
                        type="text"
                        className="input-field"
                        placeholder="🔍 Tìm khách hàng..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        autoFocus
                    />
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
        </div>
    );
}

export default OrderScreen;

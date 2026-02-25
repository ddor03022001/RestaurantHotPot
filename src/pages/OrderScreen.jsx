import React, { useState, useMemo } from 'react';
import './OrderScreen.css';

function OrderScreen({ authData, posConfig, posData, table, updateTable, onBack, onLogout, onGoToPayment }) {
    const { products = [], categories = [] } = posData || {};
    const [orderItems, setOrderItems] = useState(table.orderItems || []);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Bill discount state
    const [billDiscount, setBillDiscount] = useState(table.billDiscount || { type: 'percent', value: 0 });
    const [showBillDiscount, setShowBillDiscount] = useState(false);

    // Item discount popup
    const [discountItemId, setDiscountItemId] = useState(null);

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

    // Update item quantity
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

    // Remove item
    const removeItem = (productId) => {
        syncOrderItems(orderItems.filter((item) => item.product.id !== productId));
    };

    // Update item discount
    const updateItemDiscount = (productId, discountType, discountValue) => {
        const val = Math.max(0, parseFloat(discountValue) || 0);
        const newItems = orderItems.map((item) =>
            item.product.id === productId
                ? { ...item, discount: { type: discountType, value: val } }
                : item
        );
        syncOrderItems(newItems);
    };

    // Calculate item price after discount
    const getItemTotal = (item) => {
        const lineTotal = item.product.list_price * item.quantity;
        const disc = item.discount || { type: 'percent', value: 0 };
        if (disc.value <= 0) return lineTotal;
        if (disc.type === 'percent') {
            return lineTotal * (1 - Math.min(disc.value, 100) / 100);
        } else {
            return Math.max(0, lineTotal - disc.value);
        }
    };

    const getItemDiscountAmount = (item) => {
        const lineTotal = item.product.list_price * item.quantity;
        return lineTotal - getItemTotal(item);
    };

    // Calculate subtotal (after per-item discounts)
    const subtotal = orderItems.reduce((sum, item) => sum + getItemTotal(item), 0);

    // Calculate bill discount amount
    const billDiscountAmount = useMemo(() => {
        if (billDiscount.value <= 0) return 0;
        if (billDiscount.type === 'percent') {
            return subtotal * Math.min(billDiscount.value, 100) / 100;
        } else {
            return Math.min(billDiscount.value, subtotal);
        }
    }, [subtotal, billDiscount]);

    // Final total
    const orderTotal = Math.max(0, subtotal - billDiscountAmount);

    const formatPrice = (price) => {
        return new Intl.NumberFormat('vi-VN').format(Math.round(price)) + 'đ';
    };

    return (
        <div className="order-screen">
            {/* Header */}
            <header className="order-header">
                <div className="order-header-left">
                    <button className="btn btn-secondary order-back-btn" onClick={onBack}>
                        ← Danh sách bàn
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
                <div className="order-header-right">
                    <span className="order-header-user">👤 {authData.user.name}</span>
                </div>
            </header>

            <div className="order-body">
                {/* Left: Product catalog */}
                <div className="order-products">
                    {/* Search */}
                    <div className="order-search">
                        <input
                            type="text"
                            className="input-field order-search-input"
                            placeholder="🔍 Tìm sản phẩm..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Category tabs */}
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

                    {/* Product grid */}
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

                    {/* Order items list */}
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

                                        {/* Inline discount editor */}
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

                    {/* Order total & actions */}
                    <div className="order-panel-footer">
                        {/* Bill discount toggle */}
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
                            <button
                                className="btn btn-primary order-action-btn"
                                disabled={orderItems.length === 0}
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
        </div>
    );
}

export default OrderScreen;

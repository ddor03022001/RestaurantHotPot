import React, { useState, useMemo } from 'react';
import './PaymentScreen.css';

const PAYMENT_METHODS = [
    { id: 'cash', name: 'Tiền mặt', icon: '💵' },
    { id: 'card', name: 'Thẻ ngân hàng', icon: '💳' },
    { id: 'transfer', name: 'Chuyển khoản', icon: '🏦' },
    { id: 'momo', name: 'MoMo', icon: '📱' },
];

function PaymentScreen({ authData, posConfig, posData, table, onBack, onComplete }) {
    const orderItems = table.orderItems || [];
    const billDiscount = table.billDiscount || { type: 'percent', value: 0 };
    const selectedCustomer = table.selectedCustomer || null;

    const [selectedPayment, setSelectedPayment] = useState('cash');
    const [processing, setProcessing] = useState(false);
    const [completed, setCompleted] = useState(false);

    // Calculate item total after per-item discount
    const getItemTotal = (item) => {
        const lineTotal = item.product.list_price * item.quantity;
        const disc = item.discount || { type: 'percent', value: 0 };
        if (disc.value <= 0) return lineTotal;
        if (disc.type === 'percent') {
            return lineTotal * (1 - Math.min(disc.value, 100) / 100);
        }
        return Math.max(0, lineTotal - disc.value);
    };

    // Subtotal after per-item discounts
    const subtotal = orderItems.reduce((sum, item) => sum + getItemTotal(item), 0);

    // Total item-level discounts
    const totalItemDiscounts = orderItems.reduce((sum, item) => {
        const lineTotal = item.product.list_price * item.quantity;
        return sum + (lineTotal - getItemTotal(item));
    }, 0);

    // Bill discount amount
    const billDiscountAmount = useMemo(() => {
        if (billDiscount.value <= 0) return 0;
        if (billDiscount.type === 'percent') {
            return subtotal * Math.min(billDiscount.value, 100) / 100;
        }
        return Math.min(billDiscount.value, subtotal);
    }, [subtotal, billDiscount]);

    // Loyalty points
    const usedPoints = table.usedPoints || 0;

    // Grand total
    const afterDiscount = Math.max(0, subtotal - billDiscountAmount);
    const pointsDeduction = Math.min(usedPoints, afterDiscount);
    const orderTotal = Math.max(0, afterDiscount - pointsDeduction);
    const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const rawTotal = orderItems.reduce((sum, item) => sum + item.product.list_price * item.quantity, 0);

    const formatPrice = (price) => {
        return new Intl.NumberFormat('vi-VN').format(Math.round(price)) + 'đ';
    };



    // Handle payment
    const handlePayment = async () => {
        setProcessing(true);
        await new Promise((r) => setTimeout(r, 1500));
        setProcessing(false);
        setCompleted(true);
    };

    const handleDone = () => {
        onComplete();
    };

    if (completed) {
        return (
            <div className="payment-screen">
                <div className="payment-success slide-up">
                    <div className="payment-success-icon">✅</div>
                    <h1 className="payment-success-title">Thanh toán thành công!</h1>
                    <p className="payment-success-detail">
                        Bàn {table.number} • {formatPrice(orderTotal)}
                    </p>
                    {selectedCustomer && (
                        <p className="payment-success-customer">Khách hàng: {selectedCustomer.name}</p>
                    )}
                    <p className="payment-success-method">
                        Phương thức: {PAYMENT_METHODS.find((m) => m.id === selectedPayment)?.name}
                    </p>
                    <button className="btn btn-primary payment-done-btn" onClick={handleDone}>
                        ✅ Hoàn tất — Về danh sách bàn
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="payment-screen">
            {/* Header */}
            <header className="payment-header">
                <div className="payment-header-left">
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← Quay lại đơn hàng
                    </button>
                    <div className="payment-header-info">
                        <h1 className="payment-header-title">Thanh toán — Bàn {table.number}</h1>
                        <p className="payment-header-meta">{posConfig.name} • {authData.user.name}</p>
                    </div>
                </div>
            </header>

            <div className="payment-body">
                {/* Left: Order summary + Customer */}
                <div className="payment-left">
                    {/* Customer info (read-only, managed in OrderScreen) */}
                    <div className="payment-section">
                        <h3 className="payment-section-title">👤 Khách hàng</h3>
                        <div className="payment-customer-area">
                            {selectedCustomer ? (
                                <div className="payment-customer-selected glass-card">
                                    <div className="payment-customer-info">
                                        <span className="payment-customer-name">{selectedCustomer.name}</span>
                                        {(selectedCustomer.phone || selectedCustomer.mobile) && (
                                            <span className="payment-customer-phone">📞 {selectedCustomer.phone || selectedCustomer.mobile}</span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="payment-customer-selected glass-card">
                                    <span className="payment-customer-name" style={{ color: 'var(--text-muted)' }}>🚶 Khách vãng lai</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Order summary */}
                    <div className="payment-section">
                        <h3 className="payment-section-title">📋 Đơn hàng ({totalItems} món)</h3>
                        <div className="payment-order-list">
                            {orderItems.map((item) => {
                                const lineTotal = item.product.list_price * item.quantity;
                                const itemTotal = getItemTotal(item);
                                const hasDiscount = (item.discount?.value || 0) > 0;
                                return (
                                    <div key={item.lineId || item.product.id} className={`payment-order-item ${item.isCombo ? 'payment-order-item-combo' : ''}`}>
                                        <div className="payment-order-item-left">
                                            <span className="payment-order-item-qty">{item.quantity}x</span>
                                            <div className="payment-order-item-details">
                                                <span className="payment-order-item-name">
                                                    {item.isCombo && <span className="combo-badge">🍱</span>}
                                                    {item.product.display_name || item.product.name}
                                                </span>
                                                {hasDiscount && (
                                                    <span className="payment-order-item-discount">
                                                        CK: {item.discount.type === 'percent' ? `${item.discount.value}%` : formatPrice(item.discount.value)}
                                                    </span>
                                                )}
                                                {item.isCombo && item.comboItems && (
                                                    <div className="payment-combo-sub-items">
                                                        {item.comboItems.map((sub, idx) => (
                                                            <div key={idx} className="payment-combo-sub-item">
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
                                            </div>
                                        </div>
                                        <div className="payment-order-item-right">
                                            {hasDiscount && (
                                                <span className="payment-order-item-price-original">{formatPrice(lineTotal)}</span>
                                            )}
                                            <span className={`payment-order-item-price ${hasDiscount ? 'payment-order-item-price-disc' : ''}`}>
                                                {formatPrice(itemTotal)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Payment methods + Total */}
                <div className="payment-right">
                    {/* Payment methods */}
                    <div className="payment-section">
                        <h3 className="payment-section-title">💰 Phương thức thanh toán</h3>
                        <div className="payment-methods">
                            {PAYMENT_METHODS.map((method) => (
                                <div
                                    key={method.id}
                                    className={`payment-method-card glass-card ${selectedPayment === method.id ? 'payment-method-active' : ''}`}
                                    onClick={() => setSelectedPayment(method.id)}
                                >
                                    <span className="payment-method-icon">{method.icon}</span>
                                    <span className="payment-method-name">{method.name}</span>
                                    {selectedPayment === method.id && (
                                        <span className="payment-method-check">✓</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Total + Pay button */}
                    <div className="payment-total-area">
                        <div className="payment-total-row">
                            <span className="payment-total-label">Tạm tính</span>
                            <span className="payment-total-subtotal">{formatPrice(rawTotal)}</span>
                        </div>
                        {totalItemDiscounts > 0 && (
                            <div className="payment-total-row payment-total-row-discount">
                                <span className="payment-total-label">CK từng món</span>
                                <span className="payment-total-discount-value">-{formatPrice(totalItemDiscounts)}</span>
                            </div>
                        )}
                        {billDiscountAmount > 0 && (
                            <div className="payment-total-row payment-total-row-discount">
                                <span className="payment-total-label">
                                    CK tổng bill ({billDiscount.type === 'percent' ? `${billDiscount.value}%` : formatPrice(billDiscount.value)})
                                </span>
                                <span className="payment-total-discount-value">-{formatPrice(billDiscountAmount)}</span>
                            </div>
                        )}
                        {pointsDeduction > 0 && (
                            <div className="payment-total-row payment-total-row-discount">
                                <span className="payment-total-label">
                                    Điểm sử dụng ({usedPoints} điểm)
                                </span>
                                <span className="payment-total-discount-value">-{formatPrice(pointsDeduction)}</span>
                            </div>
                        )}
                        <div className="payment-total-row payment-total-final">
                            <span className="payment-total-label-big">Tổng thanh toán</span>
                            <span className="payment-total-value-big">{formatPrice(orderTotal)}</span>
                        </div>

                        {!selectedCustomer && (
                            <p className="payment-customer-required">⚠️ Chưa chọn khách hàng (có thể chọn ở màn hình order)</p>
                        )}
                        <button
                            className="btn btn-primary payment-pay-btn"
                            onClick={handlePayment}
                            disabled={processing || orderItems.length === 0}
                        >
                            {processing ? (
                                <>
                                    <span className="login-spinner"></span>
                                    Đang xử lý...
                                </>
                            ) : (
                                <>💳 Thanh toán {formatPrice(orderTotal)}</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PaymentScreen;

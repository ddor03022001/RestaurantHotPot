import React, { useState, useMemo } from 'react';
import './PaymentScreen.css';

const JOURNAL_ICONS = {
    cash: '💵',
    bank: '🏦',
    general: '💳',
    sale: '💰',
    purchase: '📭',
};

function PaymentScreen({ authData, posConfig, posData, table, onBack, onComplete }) {
    const orderItems = table.orderItems || [];
    const billDiscount = table.billDiscount || { type: 'percent', value: 0 };
    const selectedCustomer = table.selectedCustomer || null;
    const paymentJournals = (posData && posData.paymentJournals) || [];
    const selectedPricelist = table.selectedPricelist || null;
    const defaultPricelistId = (posData && posData.defaultPricelistId) || null;

    // Get product price based on selected pricelist (same logic as OrderScreen)
    // Mock: default pricelist = half price; others = full price
    // TODO: replace with real pricelist logic
    const getProductPrice = (product) => {
        if (selectedPricelist && selectedPricelist.id === defaultPricelistId) {
            return product.list_price / 2;
        }
        return product.list_price;
    };

    // Multi payment lines: [{ journalId, journalName, amount }]
    const [paymentLines, setPaymentLines] = useState([]);
    const [activePaymentIdx, setActivePaymentIdx] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [showPrintBill, setShowPrintBill] = useState(false);

    // Calculate item total after per-item discount
    const getItemTotal = (item) => {
        const lineTotal = getProductPrice(item.product) * item.quantity;
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
        const lineTotal = getProductPrice(item.product) * item.quantity;
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
    const rawTotal = orderItems.reduce((sum, item) => sum + getProductPrice(item.product) * item.quantity, 0);

    // Payment helper calculations
    const totalPaid = paymentLines.reduce((sum, pl) => sum + (pl.amount || 0), 0);
    const remaining = Math.max(0, orderTotal - totalPaid);
    const changeAmount = Math.max(0, totalPaid - orderTotal);

    const addPaymentLine = (journal) => {
        // Check if journal already added
        const existIdx = paymentLines.findIndex(pl => pl.journalId === journal.id);
        if (existIdx >= 0) {
            setActivePaymentIdx(existIdx);
            return;
        }
        const newLine = {
            journalId: journal.id,
            journalName: journal.name,
            journalType: journal.type,
            amount: remaining, // default: fill remaining
        };
        const newLines = [...paymentLines, newLine];
        setPaymentLines(newLines);
        setActivePaymentIdx(newLines.length - 1);
    };

    const updatePaymentAmount = (idx, amount) => {
        setPaymentLines(prev => prev.map((pl, i) => i === idx ? { ...pl, amount: Math.max(0, amount) } : pl));
    };

    const removePaymentLine = (idx) => {
        setPaymentLines(prev => prev.filter((_, i) => i !== idx));
        setActivePaymentIdx(null);
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('vi-VN').format(Math.round(price)) + 'đ';
    };

    // Handle payment
    const handlePayment = async () => {
        console.log('=== PAYMENT DATA ===', {
            table,
            orderItems,
            selectedCustomer,
            paymentLines,
            subtotal,
            totalItemDiscounts,
            billDiscount,
            billDiscountAmount,
            usedPoints,
            pointsDeduction,
            orderTotal,
            totalPaid,
            changeAmount,
            selectedPricelist
        });
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
                        Phương thức: {paymentLines.map(pl => `${pl.journalName} (${formatPrice(pl.amount)})`).join(', ')}
                    </p>
                    {changeAmount > 0 && (
                        <p className="payment-success-method">Tiền thừa: {formatPrice(changeAmount)}</p>
                    )}
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
                            {paymentJournals.map((journal) => (
                                <div
                                    key={journal.id}
                                    className={`payment-method-card glass-card ${paymentLines.some(pl => pl.journalId === journal.id) ? 'payment-method-active' : ''}`}
                                    onClick={() => addPaymentLine(journal)}
                                >
                                    <span className="payment-method-icon">{JOURNAL_ICONS[journal.type] || '💳'}</span>
                                    <span className="payment-method-name">{journal.name}</span>
                                    {paymentLines.some(pl => pl.journalId === journal.id) && (
                                        <span className="payment-method-check">✓</span>
                                    )}
                                </div>
                            ))}
                            {paymentJournals.length === 0 && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Không có phương thức thanh toán</p>
                            )}
                        </div>

                        {/* Payment lines with amounts */}
                        {paymentLines.length > 0 && (
                            <div className="payment-lines">
                                {paymentLines.map((pl, idx) => (
                                    <div key={idx} className={`payment-line ${activePaymentIdx === idx ? 'payment-line-active' : ''}`}
                                        onClick={() => setActivePaymentIdx(idx)}>
                                        <span className="payment-line-icon">{JOURNAL_ICONS[pl.journalType] || '💳'}</span>
                                        <span className="payment-line-name">{pl.journalName}</span>
                                        <input
                                            type="number"
                                            className="payment-line-amount"
                                            value={pl.amount || ''}
                                            onChange={(e) => updatePaymentAmount(idx, parseFloat(e.target.value) || 0)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <button
                                            className="payment-line-remove"
                                            onClick={(e) => { e.stopPropagation(); removePaymentLine(idx); }}
                                        >✕</button>
                                    </div>
                                ))}
                                <div className="payment-lines-summary">
                                    <div className="payment-lines-row">
                                        <span>Đã nhập:</span>
                                        <span className="payment-lines-paid">{formatPrice(totalPaid)}</span>
                                    </div>
                                    {remaining > 0 && (
                                        <div className="payment-lines-row">
                                            <span>Còn lại:</span>
                                            <span className="payment-lines-remaining">{formatPrice(remaining)}</span>
                                        </div>
                                    )}
                                    {changeAmount > 0 && (
                                        <div className="payment-lines-row">
                                            <span>Tiền thừa:</span>
                                            <span className="payment-lines-change">{formatPrice(changeAmount)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
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
                        <div className="payment-actions-row">
                            <button
                                className="btn btn-secondary payment-print-btn"
                                onClick={() => setShowPrintBill(true)}
                                disabled={orderItems.length === 0}
                            >
                                🧾 In bill tạm tính
                            </button>
                            <button
                                className="btn btn-primary payment-pay-btn"
                                onClick={handlePayment}
                                disabled={processing || orderItems.length === 0 || totalPaid < orderTotal}
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

            {/* Print Bill Popup */}
            {showPrintBill && (
                <div className="popup-overlay" onClick={() => setShowPrintBill(false)}>
                    <div className="print-bill-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="print-bill-actions no-print">
                            <button className="btn btn-primary" onClick={() => window.print()}>
                                🖨️ In
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowPrintBill(false)}>
                                Đóng
                            </button>
                        </div>
                        <div className="print-bill-receipt" id="print-receipt">
                            <div className="receipt-header">
                                <h2 className="receipt-shop-name">{posConfig?.name || 'HotPOS'}</h2>
                                <p className="receipt-sub">BILL TẠM TÍNH</p>
                                <p className="receipt-info">Bàn {table.number}</p>
                                <p className="receipt-info">{new Date().toLocaleString('vi-VN')}</p>
                                {selectedCustomer && (
                                    <p className="receipt-info">KH: {selectedCustomer.name}</p>
                                )}
                                <p className="receipt-info">NV: {authData?.user?.name}</p>
                            </div>
                            <div className="receipt-divider">--------------------------------</div>
                            <table className="receipt-table">
                                <thead>
                                    <tr>
                                        <th className="receipt-th-name">Món</th>
                                        <th className="receipt-th-qty">SL</th>
                                        <th className="receipt-th-price">T.Tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderItems.map((item, idx) => {
                                        const itemTotal = getItemTotal(item);
                                        return (
                                            <tr key={idx}>
                                                <td>{item.product.display_name || item.product.name}</td>
                                                <td className="receipt-td-center">{item.quantity}</td>
                                                <td className="receipt-td-right">{formatPrice(itemTotal)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="receipt-divider">--------------------------------</div>
                            <div className="receipt-totals">
                                <div className="receipt-total-row">
                                    <span>Tạm tính</span>
                                    <span>{formatPrice(rawTotal)}</span>
                                </div>
                                {totalItemDiscounts > 0 && (
                                    <div className="receipt-total-row">
                                        <span>CK từng món</span>
                                        <span>-{formatPrice(totalItemDiscounts)}</span>
                                    </div>
                                )}
                                {billDiscountAmount > 0 && (
                                    <div className="receipt-total-row">
                                        <span>CK tổng bill</span>
                                        <span>-{formatPrice(billDiscountAmount)}</span>
                                    </div>
                                )}
                                {pointsDeduction > 0 && (
                                    <div className="receipt-total-row">
                                        <span>Điểm ({usedPoints})</span>
                                        <span>-{formatPrice(pointsDeduction)}</span>
                                    </div>
                                )}
                                <div className="receipt-divider">================================</div>
                                <div className="receipt-total-row receipt-grand-total">
                                    <span>TỔNG CỘNG</span>
                                    <span>{formatPrice(orderTotal)}</span>
                                </div>
                            </div>
                            <div className="receipt-divider">--------------------------------</div>
                            <p className="receipt-footer">Bill tạm tính - Chưa thanh toán</p>
                            <p className="receipt-footer">Cảm ơn quý khách!</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PaymentScreen;

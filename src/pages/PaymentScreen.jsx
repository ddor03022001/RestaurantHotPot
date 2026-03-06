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

    // Get product price based on selected pricelist (Odoo logic — same as OrderScreen)
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
        return price;
    };

    // Multi payment lines: [{ journalId, journalName, amount }]
    const [paymentLines, setPaymentLines] = useState([]);
    const [activePaymentIdx, setActivePaymentIdx] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [showPrintBill, setShowPrintBill] = useState(false);

    // Note and Ecommerce Code
    const [note, setNote] = useState(table.note || '');
    const [showNotePopup, setShowNotePopup] = useState(false);
    const [tempNote, setTempNote] = useState('');

    const [ecommerceCode, setEcommerceCode] = useState(table.ecommerceCode || '');
    const [showEcommerceCodePopup, setShowEcommerceCodePopup] = useState(false);
    const [tempEcommerceCode, setTempEcommerceCode] = useState('');

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

    // Loyalty points state (moved from OrderScreen)
    const [showUsePoints, setShowUsePoints] = useState(false);
    const loyaltyEnabled = posConfig.enable_button_loyalty_point || false;
    const customerPoints = selectedCustomer?.pos_loyalty_point || 0;
    const [localUsedPoints, setLocalUsedPoints] = useState(table.usedPoints || 0);

    const afterDiscountTotal = Math.max(0, subtotal - billDiscountAmount);
    const earnedPoints = Math.floor(afterDiscountTotal / 100);

    const updateUsedPoints = (val) => {
        setLocalUsedPoints(val);
        // Dispatch to table context just in case it needs to be saved
        window.dispatchEvent(new CustomEvent('update-table-discount', {
            detail: { tableId: table.id, billDiscount: table.billDiscount, usedPoints: val }
        }));
    };

    // Grand total
    const afterDiscount = Math.max(0, subtotal - billDiscountAmount);
    const pointsDeduction = Math.min(localUsedPoints, afterDiscount);
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

    const [showPayConfirm, setShowPayConfirm] = useState(false);

    // Handle payment
    const handlePaymentClick = () => {
        setShowPayConfirm(true);
    };

    const handleConfirmPayment = async () => {
        setShowPayConfirm(false);
        setProcessing(true);
        try {
            // Find statement_ids for chosen payment journals under the current open session
            const statementIds = [];
            for (const pl of paymentLines) {
                const stResp = await window.electronAPI.executeKw(
                    'account.bank.statement', 'search_read',
                    [[['pos_session_id', '=', posConfig.session.id], ['journal_id', '=', pl.journalId]]],
                    { fields: ['id'], limit: 1 }
                );

                let statementId = false;
                if (stResp.success && stResp.result && stResp.result.length > 0) {
                    statementId = stResp.result[0].id;
                }

                statementIds.push([0, 0, {
                    journal_id: pl.journalId,
                    amount: pl.amount,
                    name: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    statement_id: statementId
                }]);
            }

            // Calculate the discount distribution ratio for global discounts
            const ratio = subtotal > 0 ? orderTotal / subtotal : 1;

            const lines = orderItems.map(item => {
                const price = getProductPrice(item.product);
                // What they would pay for this line specifically due to item-level discount:
                const itemOriginalTotalForThisLine = getItemTotal(item);
                // Final amount this line contributes, factoring in bill discounts and points:
                const itemFinalTotal = itemOriginalTotalForThisLine * ratio;

                const rawTotal = price * item.quantity;
                const effectiveDiscountPct = rawTotal > 0 ? ((rawTotal - itemFinalTotal) / rawTotal) * 100 : 0;

                return [0, 0, {
                    product_id: item.product.id,
                    qty: item.quantity,
                    price_unit: price,
                    discount: effectiveDiscountPct,
                    tax_ids: [[6, false, item.product.taxes_id || []]]
                }];
            });

            // Local time formatted for Odoo
            const tzoffset = (new Date()).getTimezoneOffset() * 60000;
            const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 19).replace('T', ' ');

            const uidId = Math.random().toString(36).substr(2, 9);

            const orderData = {
                data: {
                    name: `Order ${uidId}`,
                    amount_paid: totalPaid,
                    amount_return: changeAmount,
                    amount_tax: 0, // Simplified, modify if tax calculation is needed locally
                    amount_total: orderTotal,
                    creation_date: localISOTime,
                    fiscal_position_id: false,
                    lines: lines,
                    partner_id: selectedCustomer ? selectedCustomer.id : false,
                    pos_session_id: posConfig.session.id,
                    sequence_number: 1, // Optional placeholder
                    statement_ids: statementIds,
                    uid: uidId,
                    user_id: authData.user.id
                },
                id: uidId,
                to_invoice: false
            };

            const res = await window.electronAPI.createPosOrder(orderData);
            if (!res.success) {
                throw new Error(res.error);
            }

            setCompleted(true);
        } catch (err) {
            console.error("Lỗi thanh toán:", err);
            alert("Lỗi thanh toán: " + err.message);
        } finally {
            setProcessing(false);
        }
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
            {/* Payment Confirmation Popup */}
            {showPayConfirm && (
                <div className="popup-overlay" onClick={() => setShowPayConfirm(false)}>
                    <div className="popup-card slide-up" onClick={e => e.stopPropagation()}>
                        <div className="popup-header">
                            <h3 className="popup-title">🤔 Xác nhận thanh toán</h3>
                            <button className="popup-close-btn" onClick={() => setShowPayConfirm(false)}>✕</button>
                        </div>
                        <div className="popup-body">
                            <p style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '20px' }}>
                                Bạn đã chắc chắn chưa? <br />
                                <strong style={{ color: 'var(--danger-color)' }}>Dữ liệu sẽ được tạo thành Pos Order!</strong>
                            </p>
                        </div>
                        <div className="popup-footer">
                            <button className="btn btn-secondary" onClick={() => setShowPayConfirm(false)}>
                                Xem lại
                            </button>
                            <button className="btn btn-primary" onClick={handleConfirmPayment}>
                                Xác nhận {formatPrice(orderTotal)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                        {/* Loyalty points section (Moved from OrderScreen) */}
                        {loyaltyEnabled && selectedCustomer && (
                            <div className="loyalty-section glass-card" style={{ marginBottom: '20px', padding: '15px' }}>
                                <div className="loyalty-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <div className="loyalty-current">
                                        <span className="loyalty-label" style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block' }}>⭐ Điểm hiện tại</span>
                                        <span className="loyalty-value" style={{ fontWeight: 'bold' }}>{customerPoints.toLocaleString()} điểm</span>
                                    </div>
                                    <div className="loyalty-earned" style={{ textAlign: 'right' }}>
                                        <span className="loyalty-label" style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block' }}>📈 Điểm tích lũy</span>
                                        <span className="loyalty-value loyalty-earned-value" style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>+{earnedPoints.toLocaleString()} điểm</span>
                                    </div>
                                </div>
                                <button
                                    className={`btn ${localUsedPoints > 0 ? 'btn-warning' : 'btn-secondary'} loyalty-use-btn`}
                                    style={{ width: '100%', marginBottom: showUsePoints ? '10px' : '0' }}
                                    onClick={() => setShowUsePoints(!showUsePoints)}
                                >
                                    🎁 Sử dụng điểm {localUsedPoints > 0 && `(${localUsedPoints.toLocaleString()} điểm)`}
                                </button>
                                {showUsePoints && (
                                    <div className="loyalty-use-editor" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <input
                                            type="number"
                                            className="input-field loyalty-use-input"
                                            value={localUsedPoints || ''}
                                            placeholder="Nhập số điểm sử dụng..."
                                            min="0"
                                            max={customerPoints}
                                            onChange={(e) => {
                                                const val = Math.max(0, Math.min(customerPoints, parseInt(e.target.value) || 0));
                                                updateUsedPoints(val);
                                            }}
                                            onClick={(e) => e.target.select()}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                            <span className="loyalty-use-hint" style={{ color: 'var(--text-muted)' }}>
                                                Tối đa: {customerPoints.toLocaleString()} điểm
                                            </span>
                                            {localUsedPoints > 0 && (
                                                <span className="loyalty-use-deduction" style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>
                                                    -{formatPrice(pointsDeduction)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                                    Điểm sử dụng ({localUsedPoints} điểm)
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
                        <div className="payment-actions-row" style={{ marginBottom: '10px' }}>
                            <button
                                className="btn btn-secondary payment-print-btn"
                                onClick={() => {
                                    setTempNote(note);
                                    setShowNotePopup(true);
                                }}
                            >
                                📝 Ghi chú
                            </button>
                            <button
                                className="btn btn-secondary payment-print-btn"
                                onClick={() => {
                                    setTempEcommerceCode(ecommerceCode);
                                    setShowEcommerceCodePopup(true);
                                }}
                            >
                                🛒 TMĐT Code
                            </button>
                        </div>
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
                                onClick={handlePaymentClick}
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
                                {note && <p className="receipt-info"><strong>Ghi chú:</strong> {note}</p>}
                                {ecommerceCode && <p className="receipt-info"><strong>TMĐT Code:</strong> {ecommerceCode}</p>}
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
                                        const rawLineTotal = getProductPrice(item.product) * item.quantity;
                                        const hasDiscount = itemTotal < rawLineTotal;

                                        return (
                                            <tr key={idx}>
                                                <td>{item.product.display_name || item.product.name}</td>
                                                <td className="receipt-td-center">{item.quantity}</td>
                                                <td className="receipt-td-right">
                                                    {hasDiscount && (
                                                        <span style={{ textDecoration: 'line-through', color: '#888', marginRight: '4px', fontSize: '0.9em' }}>
                                                            {formatPrice(rawLineTotal)}
                                                        </span>
                                                    )}
                                                    <span>{formatPrice(itemTotal)}</span>
                                                </td>
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
                                        <span>Điểm ({localUsedPoints})</span>
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

            {/* Note Popup */}
            {showNotePopup && (
                <div className="popup-overlay" onClick={() => setShowNotePopup(false)}>
                    <div className="glass-card popup-card" style={{ width: '400px', padding: '20px', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>📝 Ghi chú đơn hàng</h3>
                            <button style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowNotePopup(false)}>✕</button>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <textarea
                                className="input-field"
                                rows="4"
                                placeholder="Nhập ghi chú cho đơn hàng..."
                                value={tempNote}
                                onChange={(e) => setTempNote(e.target.value)}
                                style={{ width: '100%', resize: 'none' }}
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowNotePopup(false)}>Hủy</button>
                            <button className="btn btn-primary" onClick={() => { setNote(tempNote); setShowNotePopup(false); }}>Lưu ghi chú</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ecommerce Code Popup */}
            {showEcommerceCodePopup && (
                <div className="popup-overlay" onClick={() => setShowEcommerceCodePopup(false)}>
                    <div className="glass-card popup-card" style={{ width: '400px', padding: '20px', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>🛒 Ecommerce Code</h3>
                            <button style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowEcommerceCodePopup(false)}>✕</button>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Nhập mã Ecommerce..."
                                value={tempEcommerceCode}
                                onChange={(e) => setTempEcommerceCode(e.target.value)}
                                style={{ width: '100%' }}
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowEcommerceCodePopup(false)}>Hủy</button>
                            <button className="btn btn-primary" onClick={() => { setEcommerceCode(tempEcommerceCode); setShowEcommerceCodePopup(false); }}>Lưu mã</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PaymentScreen;

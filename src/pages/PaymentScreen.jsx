import React, { useState, useMemo } from 'react';
import { formatPrice } from '../utils/formatters';
import { printBill } from '../utils/printBill';
import { printLabel } from '../utils/printLabel';
import LabelPrintPopup from '../components/LabelPrintPopup';
import './PaymentScreen.css';

const JOURNAL_ICONS = {
    cash: '💵',
    bank: '🏦',
    general: '💳',
    sale: '💰',
    purchase: '📭',
};

function PaymentScreen({ authData, posConfig, posData, table, onBack, onComplete, posMode, onRefreshStock, offlineQueue }) {
    const isRetail = posMode === 'retail';
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
        return parseInt(price);
    };

    // Multi payment lines: [{ journalId, journalName, amount }]
    const [paymentLines, setPaymentLines] = useState([]);
    const [activePaymentIdx, setActivePaymentIdx] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [completed, setCompleted] = useState(false);

    // Note and Ecommerce Code
    const [note, setNote] = useState(table.note || '');
    const [showNotePopup, setShowNotePopup] = useState(false);
    const [tempNote, setTempNote] = useState('');

    const [ecommerceCode, setEcommerceCode] = useState(table.ecommerceCode || '');
    const [showEcommerceCodePopup, setShowEcommerceCodePopup] = useState(false);
    const [tempEcommerceCode, setTempEcommerceCode] = useState('');
    const [showLabelPopup, setShowLabelPopup] = useState(false);
    const [selectedSeller, setSelectedSeller] = useState(null);
    const [showSellerPopup, setShowSellerPopup] = useState(false);

    const [selectedInvoiceCustomer, setSelectedInvoiceCustomer] = useState(null);
    const [showInvoiceCustomerPopup, setShowInvoiceCustomerPopup] = useState(false);
    const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');

    // Calculate item total after per-item discount
    const getItemTotal = (item) => {
        const lineTotal = getProductPrice(item.product) * item.quantity;
        const disc = item.discount || { type: 'percent', value: 0 };
        if (disc.value <= 0) return lineTotal;
        if (disc.type === 'percent') {
            return parseInt(lineTotal * (1 - Math.min(disc.value, 100) / 100));
        }
        return parseInt(Math.max(0, lineTotal - disc.value));
    };

    // Subtotal after per-item discounts
    const subtotal = orderItems.reduce((sum, item) => sum + getItemTotal(item), 0);

    // Total item-level discounts
    const totalItemDiscounts = orderItems.reduce((sum, item) => {
        const lineTotal = getProductPrice(item.product) * item.quantity;
        return parseInt(sum + (lineTotal - getItemTotal(item)));
    }, 0);

    // Bill discount amount
    const billDiscountAmount = useMemo(() => {
        if (billDiscount.value <= 0) return 0;
        if (billDiscount.type === 'percent') {
            return parseInt(subtotal * Math.min(billDiscount.value, 100) / 100);
        }
        return parseInt(Math.min(billDiscount.value, subtotal));
    }, [subtotal, billDiscount]);

    // Loyalty points state (moved from OrderScreen)
    const [showUsePoints, setShowUsePoints] = useState(false);
    const loyaltyEnabled = posConfig.enable_button_loyalty_point || false;
    const customerPoints = selectedCustomer?.pos_loyalty_point || 0;
    const [localUsedPoints, setLocalUsedPoints] = useState(table.usedPoints || 0);

    const afterDiscountTotal = Math.max(0, subtotal - billDiscountAmount);
    let earnedPoints;
    if (selectedCustomer.group_id && selectedCustomer.group_id.name === "Khách lẻ" || selectedCustomer.group_id && selectedCustomer.group_id.name === "Doanh nghiệp" || selectedCustomer.group_id && selectedCustomer.group_id.name === "Bạn mới") {
        earnedPoints = 0;
    } else {
        earnedPoints = Math.floor(afterDiscountTotal / 100)
    }
    // const earnedPoints = Math.floor(afterDiscountTotal / 100);

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

    React.useEffect(() => {
        if (window.electronAPI && window.electronAPI.sendToCustomerDisplay) {
            window.electronAPI.sendToCustomerDisplay({
                screen: 'payment',
                items: orderItems.map(item => ({
                    id: item.product.id,
                    name: item.product.display_name || item.product.name,
                    price: getProductPrice(item.product),
                    quantity: item.quantity
                })),
                totalData: {
                    subTotal: rawTotal,
                    tax: 0,
                    total: orderTotal
                }
            });
        }
    }, [orderItems, rawTotal, orderTotal]);

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



    const [showPayConfirm, setShowPayConfirm] = useState(false);

    // Handle payment
    const handlePaymentClick = () => {
        setShowPayConfirm(true);
    };

    const handleConfirmPayment = async () => {
        setShowPayConfirm(false);
        setProcessing(true);
        let orderData = null;
        let uidId = '';
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
            // check loyalty
            const defaultPl = paymentJournals.find(pl => pl.code === 'LOYAL') || null;
            if (defaultPl && localUsedPoints > 0) {
                const stResp = await window.electronAPI.executeKw(
                    'account.bank.statement', 'search_read',
                    [[['pos_session_id', '=', posConfig.session.id], ['journal_id', '=', defaultPl.id]]],
                    { fields: ['id'], limit: 1 }
                );

                let statementId = false;
                if (stResp.success && stResp.result && stResp.result.length > 0) {
                    statementId = stResp.result[0].id;
                }

                statementIds.push([0, 0, {
                    journal_id: defaultPl.id,
                    amount: localUsedPoints,
                    name: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    statement_id: statementId
                }]);
            }
            // Calculate the discount distribution ratio for global discounts
            const ratio = subtotal > 0 ? orderTotal / subtotal : 1;
            // console.log(orderItems);
            let lines = orderItems.map(item => {
                const price = getProductPrice(item.product);
                // What they would pay for this line specifically due to item-level discount:
                const itemOriginalTotalForThisLine = getItemTotal(item);
                // Final amount this line contributes, factoring in bill discounts and points:
                // const itemFinalTotal = itemOriginalTotalForThisLine * ratio;
                const rawTotal = price * item.quantity;
                const effectiveDiscountPct = item.discount.type === 'percent' ? rawTotal - (rawTotal * item.discount.value / 100) : rawTotal - item.discount.value;
                // const effectiveDiscountPct = rawTotal > 0 ? ((rawTotal - itemFinalTotal) / rawTotal) * 100 : 0;
                let combo_item_ids = {};
                if (item.comboItems && item.comboItems.length > 0) {
                    combo_item_ids = item.comboItems.reduce((acc, comboItem) => {
                        acc[comboItem.product.id] = comboItem.quantity;
                        return acc;
                    }, {});
                }
                return [0, 0, {
                    product_id: item.product.id,
                    qty: item.quantity,
                    price_unit: price,
                    price_subtotal: item.product.tax_id ? parseInt(effectiveDiscountPct / ((100 + item.product.tax_id[0].amount) / 100)) : parseInt(effectiveDiscountPct),
                    price_subtotal_incl: effectiveDiscountPct,
                    combo_item_ids: combo_item_ids,
                    discount_type: item.discount.type,
                    discount: item.discount.type === 'percent' ? item.discount.value : 0,
                    discount_amount: item.discount.type === 'amount' ? item.discount.value : 0,
                    tax_ids: [[6, false, item.product.taxes_id || []]],
                    note: item.note || '',
                    plus_point: localUsedPoints > 0 || billDiscountAmount > 0 || earnedPoints <= 0 ? 0 : effectiveDiscountPct / 100,
                    session_info: {
                        user: {
                            id: authData.user.uid,
                            name: authData.user.name
                        },
                        pos: {
                            id: posConfig.session.id,
                            name: posConfig.session.name
                        }
                    },
                }];
            });
            if (billDiscountAmount > 0) {
                const productDiscount = posData.products.find(pl => pl.allow_discount_global === true) || null;
                if (productDiscount) {
                    lines.push([0, 0, {
                        product_id: productDiscount.id,
                        qty: -1,
                        price_unit: billDiscountAmount,
                        price_subtotal: productDiscount.tax_id ? parseInt(- billDiscountAmount / ((100 + productDiscount.tax_id[0].amount) / 100)) : parseInt(- billDiscountAmount),
                        price_subtotal_incl: - billDiscountAmount,
                        discount_reason: 'Global Discount',
                        tax_ids: [[6, false, productDiscount.taxes_id || []]],
                        session_info: {
                            user: {
                                id: authData.user.uid,
                                name: authData.user.name
                            },
                            pos: {
                                id: posConfig.session.id,
                                name: posConfig.session.name
                            }
                        },
                    }]);
                }
            }
            // Local time formatted for Odoo
            // const tzoffset = 420 * 60000;
            const localISOTime = (new Date(Date.now())).toISOString().slice(0, 19).replace('T', ' ');

            const now = new Date();

            const hour = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');

            const timeString = `${hour}${minutes}${second}`;
            uidId = `${timeString}-${posConfig.session.id}-${authData.user.uid}`;

            const amount_total = lines.reduce((sum, line) => sum + line[2].price_subtotal_incl, 0);
            const amount_paid = amount_total;
            const amount_tax = lines.reduce((sum, line) => sum + (line[2].price_subtotal_incl - line[2].price_subtotal), 0);

            orderData = {
                data: {
                    name: `Order ${uidId}`,
                    amount_paid: amount_paid,
                    amount_return: 0,
                    amount_tax: amount_tax, // Simplified, modify if tax calculation is needed locally
                    amount_total: amount_total,
                    creation_date: localISOTime,
                    fiscal_position_id: false,
                    lines: lines,
                    partner_id: selectedCustomer ? selectedCustomer.id : false,
                    pricelist_id: selectedPricelist ? selectedPricelist.id : false,
                    pos_session_id: posConfig.session.id,
                    plus_point: localUsedPoints > 0 || billDiscountAmount > 0 ? 0 : earnedPoints,
                    redeem_point: localUsedPoints > 0 ? localUsedPoints : 0,
                    sequence_number: 1, // Optional placeholder
                    statement_ids: statementIds,
                    ecommerce_code: ecommerceCode,
                    note: note,
                    table_id: posMode === 'retail' ? false : table.id,
                    currency_id: posConfig.currency_id[0],
                    uid: uidId,
                    user_id: selectedSeller?.id || authData.user.uid,
                    is_get_invoice: selectedInvoiceCustomer ? true : false,
                    invoice_address: selectedInvoiceCustomer ? selectedInvoiceCustomer.id : false
                },
                id: uidId,
                to_invoice: true
            };
            console.log(orderData);
            const res = await window.electronAPI.createPosOrder(orderData);
            if (!res.success) {
                throw new Error(res.error);
            }

            setCompleted(true);

            // Auto-print 2 bills after successful payment
            doPrintBill('HÓA ĐƠN BÁN HÀNG', `Order ${uidId}`);
            doPrintBill('HÓA ĐƠN BÁN HÀNG', `Order ${uidId}`);

            // Auto-print labels after successful payment (only if enabled in POS config)
            if (posConfig.print_product_label) {
                printLabel({
                    posName: posConfig?.name || 'SeaPOS',
                    orderItems,
                    ecommerceCode: `Order ${uidId}`,
                });
            }
        } catch (err) {
            console.error("Lỗi thanh toán:", err);

            // Save to offline queue instead of blocking
            if (offlineQueue && offlineQueue.addFailedOrder && orderData) {
                offlineQueue.addFailedOrder(orderData, err);

                // Still complete the order so cashier can continue
                setCompleted(true);

                // Still print 2 bills and labels even on network failure
                doPrintBill('HÓA ĐƠN BÁN HÀNG', `Order ${uidId}`);
                doPrintBill('HÓA ĐƠN BÁN HÀNG', `Order ${uidId}`);

                if (posConfig.print_product_label) {
                    printLabel({
                        posName: posConfig?.name || 'SeaPOS',
                        orderItems,
                        ecommerceCode: `Order ${uidId}`,
                    });
                }
            } else {
                // Error happened before orderData was built — show alert
                alert("Lỗi thanh toán: " + err.message);
            }
        } finally {
            setProcessing(false);
        }
    };

    const handleDone = () => {
        if (onRefreshStock) onRefreshStock();
        onComplete();
    };

    // Centralized bill print helper
    const doPrintBill = (billTitle, refStr) => {
        const now = new Date();
        const totalDiscount = totalItemDiscounts + billDiscountAmount + pointsDeduction;
        printBill({
            storeName: posConfig?.name || 'SeaPOS',
            billTitle,
            orderRef: refStr,
            dateStr: `${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
            customerName: selectedCustomer?.name || '',
            staffName: selectedSeller?.name || '',
            companyInvoice: selectedInvoiceCustomer?.name || '',
            lines: orderItems.map(item => ({
                name: item.product.name || item.product.display_name,
                priceUnit: getProductPrice(item.product),
                qty: item.quantity,
                discount: item.discount?.type === 'percent' ? item.discount.value + '%' : formatPrice(item.discount.value),
                subtotal: getItemTotal(item),
                uom: item.product.uom_id ? item.product.uom_id[1] : 'Cái',
            })),
            totalAmount: orderTotal,
            discountAmount: totalDiscount,
            note: note || '',
            ecommerceCode: ecommerceCode || '',
        });
    };

    if (completed) {
        return (
            <div className="payment-screen">
                <div className="payment-success slide-up">
                    <div className="payment-success-icon">✅</div>
                    <h1 className="payment-success-title">Thanh toán thành công!</h1>
                    <p className="payment-success-detail">
                        {isRetail ? '' : `Bàn ${table.number} • `}{formatPrice(orderTotal)}
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
                        ✅ Hoàn tất {isRetail ? '— Đơn hàng mới' : '— Về danh sách bàn'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="payment-screen">
            {/* Payment Confirmation Popup */}
            {showPayConfirm && (
                <div className="popup-overlay">
                    <div className="popup-card slide-up" style={{ borderRadius: '20px' }} onClick={e => e.stopPropagation()}>
                        <div className="popup-header">
                            <h3 className="popup-title" style={{ padding: '10px' }}>🤔 Xác nhận thanh toán</h3>
                            {/* <button className="popup-close-btn" onClick={() => setShowPayConfirm(false)}>✕</button> */}
                        </div>
                        <div className="popup-body">
                            <p style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '20px' }}>
                                Bạn đã chắc chắn chưa? <br />
                                <strong style={{ color: 'var(--danger-color)' }}>Dữ liệu sẽ được tạo thành Pos Order!</strong>
                            </p>
                        </div>
                        <div className="popup-footer">
                            <button className="btn btn-secondary" style={{ marginRight: '20px' }} onClick={() => setShowPayConfirm(false)}>
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
                        <h1 className="payment-header-title">
                            {isRetail ? 'Thanh toán' : `Thanh toán — Bàn ${table.number}`}
                        </h1>
                        <p className="payment-header-meta">{posConfig.name} • {authData.user.name}</p>
                    </div>
                </div>
                <div className="payment-header-right" style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className={`btn ${selectedInvoiceCustomer ? 'btn-success' : 'btn-secondary'} seller-select-btn`}
                        onClick={() => setShowInvoiceCustomerPopup(true)}
                    >
                        {selectedInvoiceCustomer ? `🏢 ${selectedInvoiceCustomer.name}` : '🏢 Hóa đơn công ty'}
                    </button>
                    <button
                        className={`btn ${selectedSeller ? 'btn-success' : 'btn-warning'} seller-select-btn`}
                        onClick={() => setShowSellerPopup(true)}
                    >
                        {selectedSeller ? `👤 ${selectedSeller.name}` : '👤 Chọn người bán'}
                    </button>
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
                                                {item.note && item.note.trim() && (
                                                    <span className="payment-order-item-note">📝 {item.note}</span>
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
                        {loyaltyEnabled && selectedCustomer && selectedCustomer.group_id && selectedCustomer.group_id.name !== "Khách lẻ" && (
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
                                className={`btn ${note && note.trim() ? 'btn-warning' : 'btn-secondary'} payment-print-btn`}
                                onClick={() => {
                                    setTempNote(note);
                                    setShowNotePopup(true);
                                }}
                            >
                                📝 Ghi chú {note && note.trim() ? '✓' : ''}
                            </button>
                            <button
                                className={`btn ${ecommerceCode && ecommerceCode.trim() ? 'btn-warning' : 'btn-secondary'} payment-print-btn`}
                                onClick={() => {
                                    setTempEcommerceCode(ecommerceCode);
                                    setShowEcommerceCodePopup(true);
                                }}
                            >
                                🛒 TMĐT Code {ecommerceCode && ecommerceCode.trim() ? '✓' : ''}
                            </button>
                            {/* {posConfig.print_product_label && (
                                <button
                                    className="btn btn-secondary payment-print-btn"
                                    onClick={() => setShowLabelPopup(true)}
                                    disabled={orderItems.length === 0}
                                >
                                    🏷️ In tem
                                </button>
                            )} */}
                        </div>
                        <div className="payment-actions-row">
                            <button
                                className="btn btn-secondary payment-print-btn"
                                onClick={() => doPrintBill('HÓA ĐƠN BÁN HÀNG', 'Tạm Tính')}
                                disabled={orderItems.length === 0}
                            >
                                🧾 In bill tạm tính
                            </button>
                            <button
                                className="btn btn-primary payment-pay-btn"
                                onClick={handlePaymentClick}
                                disabled={processing || orderItems.length === 0 || totalPaid < orderTotal || !selectedSeller}
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


            {/* Note Popup */}
            {showNotePopup && (
                <div className="popup-overlay">
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
                <div className="popup-overlay">
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

            {/* Label Printing Popup (only if enabled in POS config) */}
            {posConfig.print_product_label && (
                <LabelPrintPopup
                    show={showLabelPopup}
                    onClose={() => setShowLabelPopup(false)}
                    orderItems={orderItems}
                    posConfig={posConfig}
                    ecommerceCode={ecommerceCode}
                />
            )}

            {/* Invoice Customer Selection Popup */}
            {showInvoiceCustomerPopup && (
                <div className="popup-overlay">
                    <div className="popup-card invoice-popup-card slide-up" style={{ maxWidth: '700px', width: '95%', height: '80%' }} onClick={e => e.stopPropagation()}>
                        <div className="invoice-popup-header">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    👤 Chọn khách hàng
                                </h3>
                                <button style={{ background: 'rgba(255,255,255,0.05)', border: 'none', width: '32px', height: '32px', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowInvoiceCustomerPopup(false)}>✕</button>
                            </div>
                        </div>

                        <div className="invoice-search-wrapper">
                            <div className="invoice-search-container">
                                <span className="invoice-search-icon">🔍</span>
                                <input
                                    type="text"
                                    className="invoice-search-input"
                                    placeholder="Tìm khách hàng..."
                                    value={invoiceSearchQuery}
                                    onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="invoice-table-header">
                            <div className="invoice-th">TÊN</div>
                            <div className="invoice-th">MST</div>
                            <div className="invoice-th">EMAIL</div>
                        </div>

                        <div className="invoice-list">
                            {(posData.customers || [])
                                .filter(c => c.company_type === 'company')
                                .filter(c => {
                                    const q = invoiceSearchQuery.toLowerCase();
                                    return (c.name || '').toLowerCase().includes(q) || (c.vat || '').toLowerCase().includes(q);
                                })
                                .map((customer) => (
                                    <div
                                        key={customer.id}
                                        className={`invoice-row ${selectedInvoiceCustomer?.id === customer.id ? 'invoice-row-active' : ''}`}
                                        onClick={() => {
                                            setSelectedInvoiceCustomer(customer);
                                            setShowInvoiceCustomerPopup(false);
                                        }}
                                    >
                                        <div className="invoice-cell-name">{customer.name}</div>
                                        <div className="invoice-cell-detail">{customer.vat || '—'}</div>
                                        <div className="invoice-cell-detail">{customer.email || '—'}</div>

                                        {selectedInvoiceCustomer?.id === customer.id && (
                                            <div className="invoice-check-icon">✓</div>
                                        )}
                                    </div>
                                ))}

                            {(posData.customers || []).filter(c => c.company_type === 'company').length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                    Không tìm thấy dữ liệu khách hàng công ty
                                </div>
                            )}
                        </div>

                        {selectedInvoiceCustomer && (
                            <div style={{ padding: '15px 20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <button
                                    className="btn btn-danger"
                                    style={{ width: '100%', borderRadius: '12px', padding: '12px' }}
                                    onClick={() => {
                                        setSelectedInvoiceCustomer(null);
                                        setShowInvoiceCustomerPopup(false);
                                    }}
                                >
                                    🗑️ Bỏ chọn khách hàng
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Seller Selection Popup */}
            {showSellerPopup && (
                <div className="popup-overlay">
                    <div className="popup-card slide-up seller-popup" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="popup-header">
                            <h3 className="popup-title">👤 Chọn người bán hàng</h3>
                            {/* <button className="popup-close-btn" onClick={() => setShowSellerPopup(false)}>✕</button> */}
                        </div>
                        <div className="popup-body">
                            <div className="seller-list">
                                {posConfig.seller_ids && posConfig.seller_ids.length > 0 ? (
                                    posConfig.seller_ids.map((seller) => (
                                        <div
                                            key={seller.id}
                                            className={`seller-item ${selectedSeller?.id === seller.id ? 'seller-item-active' : ''}`}
                                            onClick={() => {
                                                setSelectedSeller(seller);
                                                setShowSellerPopup(false);
                                            }}
                                        >
                                            <div className="seller-item-avatar">
                                                {seller.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="seller-item-info">
                                                <span className="seller-item-name">{seller.name}</span>
                                                {selectedSeller?.id === seller.id && <span className="seller-item-check">✓</span>}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="seller-empty">
                                        <p>Không có danh sách người bán hàng</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PaymentScreen;


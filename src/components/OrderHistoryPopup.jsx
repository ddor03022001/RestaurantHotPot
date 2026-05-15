import React, { useState, useMemo } from 'react';
import { formatPrice, formatDate, getStateLabel, getStateClass, getCustomerName, getProductName } from '../utils/formatters';
import { printBill } from '../utils/printBill';
import LabelPrintPopup from './LabelPrintPopup';
import './OrderHistoryPopup.css';

/**
 * Reusable Order History Popup component.
 * Used by both TablePage (restaurant mode) and OrderScreen (retail mode).
 *
 * @param {object} props
 * @param {boolean} props.show - Whether the popup is visible
 * @param {Function} props.onClose - Close the popup
 * @param {Array} props.orders - Array of pos.order records
 * @param {boolean} props.loading - Whether orders are loading
 * @param {string} props.error - Error message if any
 * @param {object|null} props.selectedOrder - Currently selected order for detail view
 * @param {Array} props.orderLines - Array of pos.order.line for the selected order
 * @param {boolean} props.linesLoading - Whether lines are loading
 * @param {Function} props.onViewDetail - Called with (order) when clicking a row
 * @param {Function} props.onBackToList - Called to go back from detail to list
 * @param {string} [props.posName] - POS name for print header (optional)
 * @param {object} [props.authData] - POS name for print header (optional)
 * @param {object} [props.posConfig] - POS name for print header (optional)
 * @param {object} [props.posData] - POS data for print header (optional)
 */
function OrderHistoryPopup({
    show,
    onClose,
    orders,
    loading,
    error,
    selectedOrder,
    orderLines,
    linesLoading,
    onViewDetail,
    onBackToList,
    posName = 'SeaPOS',
    authData,
    posConfig,
    posData,
    onRefreshStock,
}) {
    const [showReturnConfirm, setShowReturnConfirm] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [returnSuccess, setReturnSuccess] = useState(null); // { orderRef }
    const [returnError, setReturnError] = useState('');
    const [orderSearch, setOrderSearch] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [showLabelPopup, setShowLabelPopup] = useState(false);
    // Filter orders by search query
    const filteredOrders = useMemo(() => {
        if (!orderSearch.trim()) return orders;
        const q = orderSearch.toLowerCase();
        return orders.filter((order) => {
            const ref = (order.pos_reference || order.name || '').toLowerCase();
            return ref.includes(q);
        });
    }, [orders, orderSearch]);

    if (!show) return null;

    // Lookup order by code via API (for orders not in local history)
    const handleLookupOrder = async () => {
        const code = orderSearch.trim();
        if (!code) return;
        setLookupLoading(true);
        setLookupError('');
        try {
            if (!window.electronAPI) {
                setLookupError('Chức năng chỉ khả dụng trên ứng dụng');
                return;
            }
            const res = await window.electronAPI.executeKw(
                'pos.order', 'search_read',
                [[['config_id', '=', posConfig.id], ['name', '=', code]]],
                {
                    fields: ['id', 'name', 'date_order', 'partner_id', 'amount_total', 'amount_tax',
                        'amount_paid', 'amount_return', 'state', 'pos_reference', 'lines',
                        'session_id', 'user_id', 'statement_ids', 'picking_ids', 'currency_id', 'pricelist_id', 'note', 'table_id', 'ecommerce_code', 'return_order_id'],
                    order: 'id desc',
                    limit: 1,
                }
            );
            console.log(res);
            if (!res.success || !res.result || res.result.length === 0) {
                setLookupError('Không tìm thấy đơn hàng với mã "' + code + '"');
                return;
            }
            const order = res.result[0];
            // Convert date same as getPosOrders
            if (order.date_order) {
                let date = new Date(order.date_order + ' Z');
                date.setHours(date.getHours() + 7);
                order.date_order = date.toISOString().replace('T', ' ').split('.')[0];
            }
            onViewDetail(order);
        } catch (err) {
            setLookupError(err.message || 'Có lỗi xảy ra khi tra cứu');
        } finally {
            setLookupLoading(false);
        }
    };

    const handleConfirmReturn = async () => {
        setProcessing(true);
        try {
            const statementIds = [];
            const statement_lines = await window.electronAPI.executeKw(
                'account.bank.statement.line', 'search_read',
                [[['id', 'in', selectedOrder.statement_ids]]],
                { fields: ['id', 'journal_id', 'amount'] }
            );
            for (const pl of statement_lines.result) {
                const stResp = await window.electronAPI.executeKw(
                    'account.bank.statement', 'search_read',
                    [[['pos_session_id', '=', posConfig.session.id], ['journal_id', '=', pl.journal_id[0]]]],
                    { fields: ['id'], limit: 1 }
                );

                let statementId = false;
                if (stResp.success && stResp.result && stResp.result.length > 0) {
                    statementId = stResp.result[0].id;
                }

                statementIds.push([0, 0, {
                    journal_id: pl.journal_id[0],
                    amount: -pl.amount,
                    name: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    statement_id: statementId
                }]);
            }

            let lines = orderLines.map(item => {
                return [0, 0, {
                    product_id: item.product_id[0],
                    qty: -item.qty,
                    price_unit: parseInt(item.price_unit),
                    price_subtotal: -parseInt(item.price_subtotal),
                    price_subtotal_incl: -parseInt(item.price_subtotal_incl),
                    // combo_item_ids: combo_item_ids,
                    discount_type: item.discount_type,
                    discount: item.discount,
                    discount_amount: item.discount_amount,
                    tax_ids: [[6, false, item.tax_ids_after_fiscal_position]],
                    note: item.note || '',
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

            const localISOTime = (new Date(Date.now())).toISOString().slice(0, 19).replace('T', ' ');
            const now = new Date();
            const hour = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');

            const timeString = `${hour}${minutes}${second}`;
            const uidId = `${timeString}-${posConfig.session.id}-${authData.user.uid}`;

            const orderData = {
                data: {
                    name: `Return/Order ${uidId}`,
                    amount_paid: -selectedOrder.amount_paid,
                    amount_return: 0,
                    amount_tax: -selectedOrder.amount_tax,
                    amount_total: -selectedOrder.amount_total,
                    creation_date: localISOTime,
                    fiscal_position_id: false,
                    lines: lines,
                    partner_id: selectedOrder.partner_id[0],
                    pricelist_id: selectedOrder.pricelist_id[0],
                    pos_session_id: posConfig.session.id,
                    sequence_number: 1,
                    statement_ids: statementIds,
                    ecommerce_code: selectedOrder.ecommerce_code,
                    note: selectedOrder.note,
                    table_id: selectedOrder.table_id ? selectedOrder.table_id[0] : false,
                    currency_id: selectedOrder.currency_id[0],
                    return_order_id: selectedOrder.id,
                    is_return: true,
                    uid: uidId,
                    user_id: authData.user.uid
                },
                id: uidId,
                to_invoice: true
            };
            console.log(orderData);
            const res = await window.electronAPI.createPosOrder(orderData);
            if (!res.success) {
                throw new Error(res.error);
            }
            console.log(res);
            // Show success
            setReturnSuccess({
                orderRef: selectedOrder.pos_reference || selectedOrder.name,
            });
            // Refresh stock
            if (onRefreshStock) onRefreshStock();
        } catch (err) {
            console.error("Lỗi thanh toán:", err);
            setReturnError(err.message || 'Có lỗi xảy ra');
        } finally {
            setProcessing(false);
            setShowReturnConfirm(false);
        }
    };

    const handlePrintBill = () => {
        if (!selectedOrder) return;
        const orderDate = new Date(selectedOrder.date_order);
        printBill({
            storeName: posConfig?.name || posName,
            billTitle: 'HÓA ĐƠN BÁN HÀNG',
            orderRef: `Order ${selectedOrder.pos_reference || selectedOrder.name}`,
            dateStr: `${orderDate.toLocaleDateString('vi-VN')} ${orderDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
            customerName: getCustomerName(selectedOrder.partner_id),
            lines: orderLines.map(line => ({
                name: getProductById(line.product_id[0])?.name,
                priceUnit: line.price_unit,
                qty: line.qty,
                discount: line.discount_type === 'percent' ? line.discount + '%' : formatPrice(line.discount_amount),
                subtotal: Math.round(line.price_subtotal_incl),
                uom: line.uom_id ? line.uom_id[1] : 'Cái',
            })),
            totalAmount: Math.round(selectedOrder.amount_total),
            discountAmount: 0,
            note: selectedOrder.note || '',
            ecommerceCode: selectedOrder.ecommerce_code || '',
        });
    };

    const getProductById = (productId) => {
        const product = posData.products.find(p => p.id === productId);
        if (!product) return null;
        return product;
    }

    return (
        <div className="order-popup-overlay">
            <div className="history-popup glass-card slide-up" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="history-popup-header">
                    <div className="history-popup-header-left">
                        {selectedOrder && (
                            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={onBackToList}>
                                ← Danh sách
                            </button>
                        )}
                        <h2 className="history-popup-title">
                            {selectedOrder
                                ? `Chi tiết — ${selectedOrder.name || selectedOrder.pos_reference}`
                                : '📋 Lịch sử đơn hàng (7 ngày)'}
                        </h2>
                    </div>
                    <button className="order-popup-close" onClick={onClose}>✕</button>
                </div>

                {/* Body */}
                <div className="history-popup-body">
                    {loading ? (
                        <div className="history-popup-empty">
                            <span className="login-spinner"></span>
                            <p>Đang tải đơn hàng...</p>
                        </div>
                    ) : error ? (
                        <div className="history-popup-empty">
                            <p>⚠️ {error}</p>
                        </div>
                    ) : !selectedOrder ? (
                        /* === Order list === */
                        <>
                            {/* Search bar */}
                            <div className="history-search">
                                <input
                                    type="text"
                                    className="history-search-input"
                                    placeholder="🔍 Tìm theo mã đơn..."
                                    value={orderSearch}
                                    onChange={(e) => { setOrderSearch(e.target.value); setLookupError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleLookupOrder(); }}
                                />
                                {orderSearch && (
                                    <button className="history-search-clear" onClick={() => { setOrderSearch(''); setLookupError(''); }}>✕</button>
                                )}
                                <button
                                    className="btn btn-sm history-lookup-btn"
                                    onClick={handleLookupOrder}
                                    disabled={!orderSearch.trim() || lookupLoading}
                                >
                                    {lookupLoading ? (
                                        <><span className="login-spinner" style={{ width: 14, height: 14 }}></span></>
                                    ) : (
                                        'Tra cứu'
                                    )}
                                </button>
                            </div>
                            {lookupError && (
                                <div className="history-lookup-error">
                                    <span>⚠️ {lookupError}</span>
                                </div>
                            )}
                            {filteredOrders.length === 0 ? (
                                <div className="history-popup-empty">
                                    <p>{orderSearch.trim() ? '🔍 Không tìm thấy đơn hàng phù hợp' : '📭 Chưa có đơn hàng nào trong 7 ngày qua'}</p>
                                </div>
                            ) : (
                                <div className="history-table">
                                    <div className="history-table-header">
                                        <span className="ht-col ht-col-ref">Mã đơn</span>
                                        <span className="ht-col ht-col-date">Ngày</span>
                                        <span className="ht-col ht-col-customer">Khách hàng</span>
                                        <span className="ht-col ht-col-total">Tổng tiền</span>
                                        <span className="ht-col ht-col-state">Trạng thái</span>
                                    </div>
                                    {filteredOrders.map((order) => (
                                        <div key={order.id} className="history-table-row" onClick={() => onViewDetail(order)}>
                                            <span className="ht-col ht-col-ref">{order.pos_reference || order.name}</span>
                                            <span className="ht-col ht-col-date">{formatDate(order.date_order)}</span>
                                            <span className="ht-col ht-col-customer">{getCustomerName(order.partner_id)}</span>
                                            <span className="ht-col ht-col-total">{formatPrice(order.amount_total)}</span>
                                            <span className={`ht-col ht-col-state ${getStateClass(order.state)}`}>
                                                {getStateLabel(order.state)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        /* === Order detail === */
                        <div className="history-detail">
                            <div className="history-detail-actions">
                                <button className="btn btn-primary" onClick={handlePrintBill}>
                                    🖨️ In lại bill
                                </button>
                                {posConfig.print_product_label && (
                                    <button className="btn btn-secondary" onClick={() => setShowLabelPopup(true)} disabled={orderLines.length === 0}>
                                        🏷️ In lại tem
                                    </button>
                                )}
                                {!selectedOrder.return_order_id && (
                                    <button className="btn btn-danger" onClick={() => setShowReturnConfirm(true)}>
                                        🔄 Trả hàng
                                    </button>
                                )}
                            </div>

                            {/* Order info grid */}
                            <div className="history-detail-info">
                                <div className="history-detail-field">
                                    <span className="history-detail-label">Mã đơn</span>
                                    <span className="history-detail-value">{selectedOrder.pos_reference || selectedOrder.name}</span>
                                </div>
                                <div className="history-detail-field">
                                    <span className="history-detail-label">Ngày</span>
                                    <span className="history-detail-value">{formatDate(selectedOrder.date_order)}</span>
                                </div>
                                <div className="history-detail-field">
                                    <span className="history-detail-label">Khách hàng</span>
                                    <span className="history-detail-value">{getCustomerName(selectedOrder.partner_id)}</span>
                                </div>
                                <div className="history-detail-field">
                                    <span className="history-detail-label">Trạng thái</span>
                                    <span className={`history-detail-value ${getStateClass(selectedOrder.state)}`}>
                                        {getStateLabel(selectedOrder.state)}
                                    </span>
                                </div>
                                <div className="history-detail-total">
                                    <span className="history-detail-label">Tổng tiền</span>
                                    <span className="history-detail-total-value">{formatPrice(selectedOrder.amount_total)}</span>
                                </div>
                            </div>

                            {/* Lines table */}
                            <h3 className="history-detail-subtitle">Chi tiết sản phẩm</h3>
                            {linesLoading ? (
                                <div className="history-popup-empty" style={{ padding: '24px' }}>
                                    <span className="login-spinner"></span> Đang tải...
                                </div>
                            ) : (
                                <div className="history-table">
                                    <div className="history-table-header">
                                        <span className="ht-col" style={{ flex: 3 }}>Sản phẩm</span>
                                        <span className="ht-col" style={{ flex: 0.5, textAlign: 'center' }}>SL</span>
                                        <span className="ht-col" style={{ flex: 1, textAlign: 'right' }}>Đơn giá</span>
                                        <span className="ht-col" style={{ flex: 0.7, textAlign: 'center' }}>CK</span>
                                        <span className="ht-col" style={{ flex: 1, textAlign: 'right' }}>Thành tiền</span>
                                    </div>
                                    {orderLines.map((line) => (
                                        <div key={line.id} className="history-table-row" style={{ cursor: 'default' }}>
                                            <span className="ht-col" style={{ flex: 3, color: 'var(--text-primary)', fontWeight: 600 }}>
                                                {getProductById(line.product_id[0])?.name}
                                            </span>
                                            <span className="ht-col" style={{ flex: 0.5, textAlign: 'center' }}>{line.qty}</span>
                                            <span className="ht-col" style={{ flex: 1, textAlign: 'right' }}>{formatPrice(line.price_unit)}</span>
                                            <span className="ht-col" style={{ flex: 0.7, textAlign: 'center' }}>{line.discount_type === 'percent' ? `${line.discount}%` : `${formatPrice(line.discount_amount)}`}</span>
                                            <span className="ht-col" style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: 'var(--accent-primary)' }}>
                                                {formatPrice(line.price_subtotal_incl)}
                                            </span>
                                        </div>
                                    ))}
                                    {orderLines.length === 0 && (
                                        <div className="history-popup-empty">Không có dữ liệu</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Return Confirmation Popup */}
            {showReturnConfirm && (
                <div className="return-confirm-overlay">
                    <div className="return-confirm-modal glass-card fade-in">
                        <div className="return-confirm-icon">⚠️</div>
                        <h3>Xác nhận trả hàng?</h3>
                        <p>Bạn có chắc chắn muốn trả lại đơn hàng <strong>{selectedOrder?.pos_reference || selectedOrder?.name}</strong> không?</p>
                        {returnError && (
                            <div className="return-error-bar">
                                <span>⚠️ {returnError}</span>
                                <button className="return-error-close" onClick={() => setReturnError('')}>✕</button>
                            </div>
                        )}
                        <div className="return-confirm-actions">
                            <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowReturnConfirm(false); setReturnError(''); }}>
                                Hủy
                            </button>
                            <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleConfirmReturn() }}>
                                {processing ? (
                                    <>
                                        <span className="login-spinner"></span>
                                        Đang xử lý...
                                    </>
                                ) : (
                                    <>Xác nhận trả hàng</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Return Success Popup */}
            {returnSuccess && (
                <div className="return-success-overlay" onClick={() => { setReturnSuccess(null); onClose(); }}>
                    <div className="return-success-card" onClick={(e) => e.stopPropagation()}>
                        <div className="return-success-icon-wrapper">
                            <div className="return-success-icon">✓</div>
                            <div className="return-success-ring"></div>
                        </div>
                        <h3 className="return-success-title">Trả hàng thành công!</h3>
                        <p className="return-success-desc">
                            Đơn hàng <strong>{returnSuccess.orderRef}</strong> đã được trả thành công
                        </p>
                        <button className="btn btn-primary return-success-btn" onClick={() => { setReturnSuccess(null); onClose(); }}>
                            Đóng
                        </button>
                    </div>
                </div>
            )}

            {/* Label Print Popup (only if enabled in POS config) */}
            {posConfig.print_product_label && (
                <LabelPrintPopup
                    show={showLabelPopup}
                    onClose={() => setShowLabelPopup(false)}
                    orderItems={orderLines.map(line => ({
                        lineId: line.id,
                        product: {
                            id: line.product_id[0],
                            name: getProductById(line.product_id[0])?.name,
                            note: line.note || '',
                            display_name: getProductById(line.product_id[0])?.display_name,
                            print_product_label: getProductById(line.product_id[0])?.print_product_label,
                        },
                        quantity: Math.abs(line.qty),
                        note: line.note || '',
                    }))}
                    posConfig={posConfig}
                    ecommerceCode={selectedOrder?.pos_reference || selectedOrder?.name || ''}
                />
            )}
        </div>
    );
}

export default OrderHistoryPopup;

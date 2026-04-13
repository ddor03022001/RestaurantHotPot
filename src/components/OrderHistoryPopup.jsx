import React from 'react';
import { formatPrice, formatDate, getStateLabel, getStateClass, getCustomerName, getProductName } from '../utils/formatters';
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
    posName = 'HotPOS',
}) {
    if (!show) return null;

    const handlePrintBill = () => {
        if (!selectedOrder) return;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>In Bill Cũ</title>
                <style>
                    body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; color: #000; }
                    h2 { text-align: center; margin-bottom: 5px; font-size: 1.2rem; }
                    p { text-align: center; margin: 2px 0; font-size: 0.9rem; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
                    th, td { text-align: left; padding: 4px 0; border-bottom: 1px dashed #ccc; }
                    th:last-child, td:last-child { text-align: right; }
                    th:nth-child(2), td:nth-child(2) { text-align: center; }
                    .grand-total { font-size: 1.2rem; font-weight: bold; margin-top: 10px; border-top: 2px dashed #000; padding-top: 10px; display: flex; justify-content: space-between; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <h2>${posName}</h2>
                <p>HÓA ĐƠN BÁN HÀNG (IN LẠI)</p>
                <p style="text-align:left">Mã đơn: ${selectedOrder.pos_reference || selectedOrder.name}</p>
                <p style="text-align:left">Ngày: ${new Date(selectedOrder.date_order).toLocaleString('vi-VN')}</p>
                <p style="text-align:left">KH: ${getCustomerName(selectedOrder.partner_id)}</p>
                <table>
                    <thead><tr><th>Món</th><th>SL</th><th>T.Tiền</th></tr></thead>
                    <tbody>
                        ${orderLines.map(line => `
                            <tr>
                                <td>${getProductName(line.product_id)}</td>
                                <td>${line.qty}</td>
                                <td>${new Intl.NumberFormat('vi-VN').format(Math.round(line.price_subtotal_incl))}đ</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="grand-total"><span>TỔNG CỘNG</span><span>${new Intl.NumberFormat('vi-VN').format(Math.round(selectedOrder.amount_total))}đ</span></div>
                <script>setTimeout(() => window.print(), 500);</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="order-popup-overlay" onClick={onClose}>
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
                        orders.length === 0 ? (
                            <div className="history-popup-empty">
                                <p>📭 Chưa có đơn hàng nào trong 7 ngày qua</p>
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
                                {orders.map((order) => (
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
                        )
                    ) : (
                        /* === Order detail === */
                        <div className="history-detail">
                            <div className="history-detail-actions">
                                <button className="btn btn-primary" onClick={handlePrintBill}>
                                    🖨️ In lại bill
                                </button>
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
                                        <span className="ht-col" style={{ flex: 0.7, textAlign: 'center' }}>CK%</span>
                                        <span className="ht-col" style={{ flex: 1, textAlign: 'right' }}>Thành tiền</span>
                                    </div>
                                    {orderLines.map((line) => (
                                        <div key={line.id} className="history-table-row" style={{ cursor: 'default' }}>
                                            <span className="ht-col" style={{ flex: 3, color: 'var(--text-primary)', fontWeight: 600 }}>
                                                {getProductName(line.product_id)}
                                            </span>
                                            <span className="ht-col" style={{ flex: 0.5, textAlign: 'center' }}>{line.qty}</span>
                                            <span className="ht-col" style={{ flex: 1, textAlign: 'right' }}>{formatPrice(line.price_unit)}</span>
                                            <span className="ht-col" style={{ flex: 0.7, textAlign: 'center' }}>{line.discount > 0 ? `${line.discount}%` : '—'}</span>
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
        </div>
    );
}

export default OrderHistoryPopup;

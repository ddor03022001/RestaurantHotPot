import React, { useState, useCallback } from 'react';
import TableCard from '../components/TableCard';
import './TablePage.css';

function TablePage({ authData, posConfig, posData, tables, setTables, onBack, onLogout, onOpenTableOrder }) {
    const [selectedTables, setSelectedTables] = useState([]);
    const [mode, setMode] = useState('normal'); // normal | merge | split
    const [popup, setPopup] = useState(null); // { type: 'confirm-open', table }

    // Order history state
    const [showHistory, setShowHistory] = useState(false);
    const [historyOrders, setHistoryOrders] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orderLines, setOrderLines] = useState([]);
    const [linesLoading, setLinesLoading] = useState(false);

    const formatPrice = (price) => {
        return new Intl.NumberFormat('vi-VN').format(Math.round(price)) + 'đ';
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getStateLabel = (state) => {
        const map = { draft: 'Nháp', paid: 'Đã thanh toán', done: 'Hoàn tất', invoiced: 'Đã xuất HĐ', cancel: 'Đã hủy' };
        return map[state] || state;
    };

    const getStateClass = (state) => {
        if (state === 'paid' || state === 'done' || state === 'invoiced') return 'history-state-paid';
        if (state === 'cancel') return 'history-state-cancel';
        return 'history-state-draft';
    };

    // Fetch order history
    const openHistory = async () => {
        setShowHistory(true);
        setSelectedOrder(null);
        setHistoryLoading(true);
        setHistoryError('');
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.getPosOrders(posConfig.id, 7);
                if (result.success) {
                    setHistoryOrders(result.orders || []);
                } else {
                    setHistoryError(result.error);
                }
            } else {
                // Mock data for browser dev
                await new Promise((r) => setTimeout(r, 500));
                setHistoryOrders([
                    { id: 1, name: 'POS/001', pos_reference: 'Order 00001-001-0001', date_order: '2026-02-25 10:30:00', partner_id: [1, 'Nguyễn Văn A'], amount_total: 450000, state: 'paid', lines: [1, 2, 3] },
                    { id: 2, name: 'POS/002', pos_reference: 'Order 00001-001-0002', date_order: '2026-02-25 12:00:00', partner_id: false, amount_total: 120000, state: 'paid', lines: [4, 5] },
                    { id: 3, name: 'POS/003', pos_reference: 'Order 00001-001-0003', date_order: '2026-02-24 18:45:00', partner_id: [2, 'Trần Thị B'], amount_total: 680000, state: 'done', lines: [6, 7, 8] },
                ]);
            }
        } catch (err) {
            setHistoryError(err.message);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Fetch order lines (detail)
    const viewOrderDetail = async (order) => {
        setSelectedOrder(order);
        setLinesLoading(true);
        try {
            if (window.electronAPI && order.lines && order.lines.length > 0) {
                const result = await window.electronAPI.getPosOrderLines(order.lines);
                if (result.success) {
                    setOrderLines(result.lines || []);
                }
            } else {
                // Mock data
                await new Promise((r) => setTimeout(r, 300));
                setOrderLines([
                    { id: 1, product_id: [1, 'Phở bò'], qty: 2, price_unit: 45000, discount: 0, price_subtotal_incl: 90000 },
                    { id: 2, product_id: [2, 'Cà phê sữa'], qty: 3, price_unit: 20000, discount: 10, price_subtotal_incl: 54000 },
                    { id: 3, product_id: [3, 'Bánh flan'], qty: 1, price_unit: 15000, discount: 0, price_subtotal_incl: 15000 },
                ]);
            }
        } catch (err) {
            setOrderLines([]);
        } finally {
            setLinesLoading(false);
        }
    };

    const closeHistory = () => {
        setShowHistory(false);
        setSelectedOrder(null);
        setHistoryOrders([]);
        setOrderLines([]);
    };

    // Show confirmation popup before opening table
    const showOpenConfirm = useCallback((table) => {
        setPopup({ type: 'confirm-open', table });
    }, []);

    // Confirm open table (just open, don't go to order)
    const confirmOpenTable = useCallback(() => {
        if (!popup || !popup.table) return;
        const tableId = popup.table.id;
        setTables((prev) =>
            prev.map((t) =>
                t.id === tableId && t.status === 'available'
                    ? { ...t, status: 'occupied', guestCount: 1, orderTime: new Date().toISOString() }
                    : t
            )
        );
        setPopup(null);
    }, [popup, setTables]);

    // Confirm open and go to order screen
    const confirmOpenAndGoToOrder = useCallback(() => {
        if (!popup || !popup.table) return;
        const tableId = popup.table.id;
        setTables((prev) =>
            prev.map((t) =>
                t.id === tableId && t.status === 'available'
                    ? { ...t, status: 'occupied', guestCount: 1, orderTime: new Date().toISOString() }
                    : t
            )
        );
        setPopup(null);
        onOpenTableOrder(tableId);
    }, [popup, setTables, onOpenTableOrder]);

    // Close popup
    const closePopup = () => setPopup(null);

    // Close a table
    const handleCloseTable = useCallback((tableId) => {
        setTables((prev) =>
            prev.map((t) => {
                if (t.id === tableId) {
                    if (t.mergedTables.length > 0) {
                        return { ...t, status: 'available', guestCount: 0, orderTime: null, mergedTables: [], mergedWith: null, orderItems: [] };
                    }
                    return { ...t, status: 'available', guestCount: 0, orderTime: null, mergedWith: null, orderItems: [] };
                }
                if (t.mergedWith === tableId) {
                    return { ...t, status: 'available', mergedWith: null, guestCount: 0, orderTime: null, orderItems: [] };
                }
                return t;
            })
        );
    }, [setTables]);

    // Toggle table selection for merge/split mode
    const handleSelectTable = useCallback(
        (tableId) => {
            if (mode === 'normal') return;
            const table = tables.find((t) => t.id === tableId);
            if (!table) return;
            if (mode === 'merge' && table.status !== 'occupied') return;
            if (mode === 'split' && table.mergedTables.length === 0 && !table.mergedWith) return;

            setSelectedTables((prev) =>
                prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
            );
        },
        [mode, tables]
    );

    // Handle table click
    const handleTableClick = useCallback(
        (tableId) => {
            if (mode !== 'normal') {
                handleSelectTable(tableId);
                return;
            }
            const table = tables.find((t) => t.id === tableId);
            if (!table) return;

            if (table.status === 'available') {
                showOpenConfirm(table);
            } else if (table.status === 'occupied') {
                onOpenTableOrder(tableId);
            }
        },
        [mode, tables, handleSelectTable, showOpenConfirm, onOpenTableOrder]
    );

    // Merge/split mode handlers
    const enterMergeMode = () => { setMode('merge'); setSelectedTables([]); };
    const enterSplitMode = () => { setMode('split'); setSelectedTables([]); };
    const cancelMode = () => { setMode('normal'); setSelectedTables([]); };

    const confirmMerge = () => {
        if (selectedTables.length < 2) return;
        const primaryId = selectedTables[0];
        const secondaryIds = selectedTables.slice(1);
        setTables((prev) =>
            prev.map((t) => {
                if (t.id === primaryId) return { ...t, status: 'occupied', mergedTables: [...t.mergedTables, ...secondaryIds] };
                if (secondaryIds.includes(t.id)) return { ...t, status: 'merged', mergedWith: primaryId };
                return t;
            })
        );
        setMode('normal');
        setSelectedTables([]);
    };

    const confirmSplit = () => {
        if (selectedTables.length === 0) return;
        setTables((prev) =>
            prev.map((t) => {
                if (selectedTables.includes(t.id) && t.mergedTables.length > 0) return { ...t, mergedTables: [] };
                const primaryIds = prev.filter((pt) => selectedTables.includes(pt.id) && pt.mergedTables.length > 0).map((pt) => pt.id);
                if (primaryIds.includes(t.mergedWith)) return { ...t, status: 'occupied', mergedWith: null };
                return t;
            })
        );
        setMode('normal');
        setSelectedTables([]);
    };

    const getMergeGroupLabel = (table) => {
        if (table.mergedTables.length > 0) return `Bàn ${table.number} + ${table.mergedTables.join(', ')}`;
        if (table.mergedWith) return `→ Bàn ${table.mergedWith}`;
        return null;
    };

    const occupiedCount = tables.filter((t) => t.status === 'occupied' || t.status === 'merged').length;
    const availableCount = tables.filter((t) => t.status === 'available').length;

    return (
        <div className="table-page">
            {/* Header */}
            <header className="table-header">
                <div className="table-header-left">
                    <button className="btn btn-secondary table-back-btn" onClick={onBack}>
                        ← Quay lại
                    </button>
                    <div className="table-header-info">
                        <h1 className="table-header-title">{posConfig.name}</h1>
                        <p className="table-header-meta">
                            {authData.user.name} • {posConfig.session?.name || 'Phiên POS'}
                        </p>
                    </div>
                </div>

                <div className="table-header-stats">
                    <div className="table-stat">
                        <span className="table-stat-dot table-stat-dot-available"></span>
                        <span className="table-stat-label">Trống: {availableCount}</span>
                    </div>
                    <div className="table-stat">
                        <span className="table-stat-dot table-stat-dot-occupied"></span>
                        <span className="table-stat-label">Đang dùng: {occupiedCount}</span>
                    </div>
                </div>

                <div className="table-header-right">
                    <button className="btn btn-secondary" onClick={onLogout}>
                        🚪 Đăng xuất
                    </button>
                </div>
            </header>

            {/* Toolbar */}
            <div className="table-toolbar">
                {mode === 'normal' ? (
                    <>
                        <button className="btn btn-purple" onClick={enterMergeMode}>🔗 Gộp bàn</button>
                        <button className="btn btn-warning" onClick={enterSplitMode}>✂️ Tách bàn</button>
                        <button className="btn btn-secondary" onClick={openHistory}>📋 Lịch sử đơn hàng</button>
                    </>
                ) : mode === 'merge' ? (
                    <div className="table-toolbar-mode">
                        <span className="table-toolbar-label">🔗 Chọn các bàn để gộp ({selectedTables.length} đã chọn)</span>
                        <div className="table-toolbar-actions">
                            <button className="btn btn-primary" onClick={confirmMerge} disabled={selectedTables.length < 2}>✅ Xác nhận gộp</button>
                            <button className="btn btn-secondary" onClick={cancelMode}>Hủy</button>
                        </div>
                    </div>
                ) : (
                    <div className="table-toolbar-mode">
                        <span className="table-toolbar-label">✂️ Chọn bàn đã gộp để tách ({selectedTables.length} đã chọn)</span>
                        <div className="table-toolbar-actions">
                            <button className="btn btn-warning" onClick={confirmSplit} disabled={selectedTables.length === 0}>✅ Xác nhận tách</button>
                            <button className="btn btn-secondary" onClick={cancelMode}>Hủy</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Table Grid */}
            <div className="table-grid-container">
                <div className="table-grid">
                    {tables.map((table, index) => (
                        <TableCard
                            key={table.id}
                            table={table}
                            index={index}
                            isSelected={selectedTables.includes(table.id)}
                            mode={mode}
                            mergeLabel={getMergeGroupLabel(table)}
                            onClick={() => handleTableClick(table.id)}
                            onClose={() => handleCloseTable(table.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="table-legend">
                <div className="table-legend-item">
                    <div className="table-legend-color table-legend-available"></div>
                    <span>Trống</span>
                </div>
                <div className="table-legend-item">
                    <div className="table-legend-color table-legend-occupied"></div>
                    <span>Đang dùng</span>
                </div>
                <div className="table-legend-item">
                    <div className="table-legend-color table-legend-merged"></div>
                    <span>Đã gộp</span>
                </div>
            </div>

            {/* Popup: Confirm open table */}
            {popup && popup.type === 'confirm-open' && (
                <div className="popup-overlay" onClick={closePopup}>
                    <div className="popup-card glass-card slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="popup-icon">🍽️</div>
                        <h2 className="popup-title">Mở Bàn {popup.table.number}?</h2>
                        <p className="popup-desc">Bạn muốn mở bàn này cho khách?</p>
                        <div className="popup-actions">
                            <button className="btn btn-primary popup-btn" onClick={confirmOpenAndGoToOrder}>✅ Mở bàn & Gọi món</button>
                            <button className="btn btn-secondary popup-btn" onClick={confirmOpenTable}>Chỉ mở bàn</button>
                            <button className="btn btn-secondary popup-btn" onClick={closePopup}>Hủy</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== POPUP: Order History ===== */}
            {showHistory && (
                <div className="popup-overlay" onClick={closeHistory}>
                    <div className="history-popup glass-card slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="history-header">
                            <div className="history-header-left">
                                {selectedOrder && (
                                    <button className="btn btn-secondary history-back-btn" onClick={() => setSelectedOrder(null)}>
                                        ← Danh sách
                                    </button>
                                )}
                                <h2 className="history-title">
                                    {selectedOrder ? `Chi tiết — ${selectedOrder.name || selectedOrder.pos_reference}` : '📋 Lịch sử đơn hàng (7 ngày)'}
                                </h2>
                            </div>
                            <button className="history-close" onClick={closeHistory}>✕</button>
                        </div>

                        <div className="history-body">
                            {historyLoading ? (
                                <div className="history-loading">
                                    <span className="login-spinner"></span>
                                    <p>Đang tải đơn hàng...</p>
                                </div>
                            ) : historyError ? (
                                <div className="history-error">
                                    <p>⚠️ {historyError}</p>
                                </div>
                            ) : !selectedOrder ? (
                                /* ===== Order list ===== */
                                historyOrders.length === 0 ? (
                                    <div className="history-empty">
                                        <p>📭 Chưa có đơn hàng nào trong 7 ngày qua</p>
                                    </div>
                                ) : (
                                    <div className="history-table">
                                        <div className="history-table-header">
                                            <span className="history-col history-col-ref">Mã đơn</span>
                                            <span className="history-col history-col-date">Ngày</span>
                                            <span className="history-col history-col-customer">Khách hàng</span>
                                            <span className="history-col history-col-total">Tổng tiền</span>
                                            <span className="history-col history-col-state">Trạng thái</span>
                                        </div>
                                        {historyOrders.map((order) => (
                                            <div
                                                key={order.id}
                                                className="history-table-row"
                                                onClick={() => viewOrderDetail(order)}
                                            >
                                                <span className="history-col history-col-ref">{order.pos_reference || order.name}</span>
                                                <span className="history-col history-col-date">{formatDate(order.date_order)}</span>
                                                <span className="history-col history-col-customer">
                                                    {order.partner_id ? (Array.isArray(order.partner_id) ? order.partner_id[1] : order.partner_id) : 'Khách vãng lai'}
                                                </span>
                                                <span className="history-col history-col-total">{formatPrice(order.amount_total)}</span>
                                                <span className={`history-col history-col-state ${getStateClass(order.state)}`}>
                                                    {getStateLabel(order.state)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                /* ===== Order detail ===== */
                                <div className="history-detail">
                                    <div className="history-detail-info">
                                        <div className="history-detail-row">
                                            <span className="history-detail-label">Mã đơn</span>
                                            <span className="history-detail-value">{selectedOrder.pos_reference || selectedOrder.name}</span>
                                        </div>
                                        <div className="history-detail-row">
                                            <span className="history-detail-label">Ngày</span>
                                            <span className="history-detail-value">{formatDate(selectedOrder.date_order)}</span>
                                        </div>
                                        <div className="history-detail-row">
                                            <span className="history-detail-label">Khách hàng</span>
                                            <span className="history-detail-value">
                                                {selectedOrder.partner_id ? (Array.isArray(selectedOrder.partner_id) ? selectedOrder.partner_id[1] : selectedOrder.partner_id) : 'Khách vãng lai'}
                                            </span>
                                        </div>
                                        <div className="history-detail-row">
                                            <span className="history-detail-label">Trạng thái</span>
                                            <span className={`history-detail-value ${getStateClass(selectedOrder.state)}`}>
                                                {getStateLabel(selectedOrder.state)}
                                            </span>
                                        </div>
                                        <div className="history-detail-row history-detail-total-row">
                                            <span className="history-detail-label">Tổng tiền</span>
                                            <span className="history-detail-value history-detail-total">{formatPrice(selectedOrder.amount_total)}</span>
                                        </div>
                                    </div>

                                    <h3 className="history-detail-section-title">Chi tiết sản phẩm</h3>
                                    {linesLoading ? (
                                        <div className="history-loading"><span className="login-spinner"></span> Đang tải...</div>
                                    ) : (
                                        <div className="history-table">
                                            <div className="history-table-header">
                                                <span className="history-col history-col-product">Sản phẩm</span>
                                                <span className="history-col history-col-qty">SL</span>
                                                <span className="history-col history-col-price">Đơn giá</span>
                                                <span className="history-col history-col-disc">CK%</span>
                                                <span className="history-col history-col-subtotal">Thành tiền</span>
                                            </div>
                                            {orderLines.map((line) => (
                                                <div key={line.id} className="history-table-row history-table-row-detail">
                                                    <span className="history-col history-col-product">
                                                        {Array.isArray(line.product_id) ? line.product_id[1] : line.product_id}
                                                    </span>
                                                    <span className="history-col history-col-qty">{line.qty}</span>
                                                    <span className="history-col history-col-price">{formatPrice(line.price_unit)}</span>
                                                    <span className="history-col history-col-disc">{line.discount > 0 ? `${line.discount}%` : '—'}</span>
                                                    <span className="history-col history-col-subtotal">{formatPrice(line.price_subtotal_incl)}</span>
                                                </div>
                                            ))}
                                            {orderLines.length === 0 && (
                                                <div className="history-empty"><p>Không có dữ liệu</p></div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TablePage;

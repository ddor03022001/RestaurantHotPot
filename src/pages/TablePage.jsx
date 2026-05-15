import React, { useState, useCallback } from 'react';
import TableCard from '../components/TableCard';
import OrderHistoryPopup from '../components/OrderHistoryPopup';
import { formatPrice } from '../utils/formatters';
import { useOrderHistory } from '../hooks/useOrderHistory';
import './TablePage.css';

function TablePage({ authData, posConfig, posData, tables, setTables, onBack, onLogout, onCloseSession, onOpenTableOrder, posMode, onToggleMode, onGoToManagement }) {
    const [popup, setPopup] = useState(null); // { type: 'confirm-open', table }
    const [closingSession, setClosingSession] = useState(false);
    const [closeSessionError, setCloseSessionError] = useState('');

    // Merge/Split State
    const [showMergePopup, setShowMergePopup] = useState(false);
    const [mergeSource, setMergeSource] = useState('');
    const [mergeDest, setMergeDest] = useState('');

    const [showSplitPopup, setShowSplitPopup] = useState(false);
    const [splitSource, setSplitSource] = useState('');
    const [splitDest, setSplitDest] = useState('');
    const [splitItems, setSplitItems] = useState({}); // { item_index: qty_to_move }

    // Order history — shared hook
    const history = useOrderHistory(posConfig?.id);

    // Close POS session
    const handleConfirmCloseSession = async () => {
        setClosingSession(true);
        setCloseSessionError('');
        try {
            const result = await onCloseSession();
            if (!result.success) {
                setCloseSessionError(result.error || 'Không thể đóng ca');
                setClosingSession(false);
            }
            // If success, App.jsx navigates away so we don't need to reset state
        } catch (err) {
            setCloseSessionError(err.message);
            setClosingSession(false);
        }
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
    const closePopup = () => {
        setPopup(null);
        setCloseSessionError('');
    };

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

    // Handle table click
    const handleTableClick = useCallback(
        (tableId) => {
            const table = tables.find((t) => t.id === tableId);
            if (!table) return;

            if (table.status === 'available') {
                showOpenConfirm(table);
            } else if (table.status === 'occupied') {
                onOpenTableOrder(tableId);
            }
        },
        [tables, showOpenConfirm, onOpenTableOrder]
    );

    // Merge/split handlers
    const openMergePopup = () => {
        setMergeSource('');
        setMergeDest('');
        setShowMergePopup(true);
    };

    const handleMergeConfirm = () => {
        if (!mergeSource || !mergeDest || mergeSource === mergeDest) return;

        const sourceId = parseInt(mergeSource, 10);
        const destId = parseInt(mergeDest, 10);

        setTables(prev => {
            const sourceTable = prev.find(t => t.id === sourceId);
            const targetTable = prev.find(t => t.id === destId);
            if (!sourceTable || !targetTable) return prev;

            const combinedItems = [...(targetTable.orderItems || [])];

            // Combine items logic (add qty if exists, else push)
            const srcItems = sourceTable.orderItems || [];
            srcItems.forEach(item => {
                const existingIdx = combinedItems.findIndex(ti => ti.product.id === item.product.id);
                if (existingIdx >= 0) {
                    combinedItems[existingIdx] = {
                        ...combinedItems[existingIdx],
                        quantity: combinedItems[existingIdx].quantity + item.quantity
                    };
                } else {
                    combinedItems.push(item);
                }
            });

            return prev.map(t => {
                if (t.id === destId) {
                    return { ...t, status: 'occupied', orderItems: combinedItems, guestCount: Math.max(t.guestCount || 1, sourceTable.guestCount || 0) };
                }
                if (t.id === sourceId) {
                    return { ...t, status: 'available', orderItems: [], guestCount: 0, orderTime: null };
                }
                return t;
            });
        });

        setShowMergePopup(false);
    };

    const openSplitPopup = () => {
        setSplitSource('');
        setSplitDest('');
        setSplitItems({});
        setShowSplitPopup(true);
    };

    const handleSplitConfirm = () => {
        if (!splitSource || !splitDest || splitSource === splitDest) return;

        const sourceId = parseInt(splitSource, 10);
        const destId = parseInt(splitDest, 10);

        setTables(prev => {
            const sourceTable = prev.find(t => t.id === sourceId);
            const targetTable = prev.find(t => t.id === destId);
            if (!sourceTable || !targetTable) return prev;

            let newSourceItems = [...(sourceTable.orderItems || [])];
            let newTargetItems = [...(targetTable.orderItems || [])];

            Object.entries(splitItems).forEach(([idxStr, qtyToMove]) => {
                const idx = parseInt(idxStr, 10);
                if (qtyToMove > 0 && newSourceItems[idx]) {
                    const item = newSourceItems[idx];

                    const existingTargetItemIndex = newTargetItems.findIndex(ti => ti.product.id === item.product.id);
                    if (existingTargetItemIndex >= 0) {
                        newTargetItems[existingTargetItemIndex] = {
                            ...newTargetItems[existingTargetItemIndex],
                            quantity: newTargetItems[existingTargetItemIndex].quantity + qtyToMove
                        };
                    } else {
                        newTargetItems.push({
                            product: item.product,
                            quantity: qtyToMove
                        });
                    }

                    newSourceItems[idx] = {
                        ...item,
                        quantity: item.quantity - qtyToMove
                    };
                }
            });

            newSourceItems = newSourceItems.filter(item => item.quantity > 0);

            return prev.map(t => {
                if (t.id === destId) {
                    return { ...t, status: 'occupied', orderItems: newTargetItems, guestCount: Math.max(t.guestCount || 1, 1), orderTime: t.orderTime || new Date().toISOString() };
                }
                if (t.id === sourceId) {
                    return {
                        ...t,
                        orderItems: newSourceItems,
                        status: newSourceItems.length > 0 ? 'occupied' : 'available',
                        guestCount: newSourceItems.length > 0 ? t.guestCount : 0,
                        orderTime: newSourceItems.length > 0 ? t.orderTime : null
                    };
                }
                return t;
            });
        });

        setShowSplitPopup(false);
    };

    const occupiedCount = tables.filter((t) => t.status === 'occupied' || t.status === 'merged').length;
    const availableCount = tables.filter((t) => t.status === 'available').length;

    return (
        <div className="table-page">
            {/* Header */}
            <header className="table-header">
                <div className="table-header-left">
                    {/* <button className="btn btn-secondary table-back-btn" onClick={onBack}>
                        ← Quay lại
                    </button> */}
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
                    <button className="btn btn-danger" onClick={() => setPopup({ type: 'confirm-close-session' })}>
                        🔒 Đóng ca
                    </button>
                    <button className="btn btn-secondary" onClick={onLogout}>
                        🚪 Đăng xuất
                    </button>
                </div>
            </header>

            {/* Toolbar */}
            <div className="table-toolbar">
                <div className="table-toolbar-left">
                    <button className="btn btn-purple" onClick={openMergePopup}>🔗 Gộp bàn</button>
                    <button className="btn btn-warning" onClick={openSplitPopup}>✂️ Tách bàn</button>
                    <button className="btn btn-secondary" onClick={history.openHistory}>📋 Lịch sử đơn hàng</button>
                    <button className="btn btn-secondary" onClick={onGoToManagement}>📊 Quản lý</button>
                </div>
                <div className="table-mode-toggle">
                    <button
                        className={`table-mode-btn ${posMode === 'restaurant' ? 'table-mode-btn-active' : ''}`}
                        onClick={() => onToggleMode('restaurant')}
                        title="Chế độ nhà hàng"
                    >
                        🍽️ Nhà hàng
                    </button>
                    <button
                        className={`table-mode-btn ${posMode === 'retail' ? 'table-mode-btn-active' : ''}`}
                        onClick={() => onToggleMode('retail')}
                        title="Chế độ bán lẻ"
                    >
                        🛒 Bán lẻ
                    </button>
                </div>
            </div>

            {/* Table Grid */}
            <div className="table-grid-container">
                <div className="table-grid">
                    {tables.map((table, index) => (
                        <TableCard
                            key={table.id}
                            table={table}
                            index={index}
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
                {/* <div className="table-legend-item">
                    <div className="table-legend-color table-legend-merged"></div>
                    <span>Đã gộp</span>
                </div> */}
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

            {/* Popup: Confirm close session */}
            {popup && popup.type === 'confirm-close-session' && (
                <div className="popup-overlay">
                    <div className="popup-card glass-card slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="popup-icon">🔒</div>
                        <h2 className="popup-title">Đóng ca POS?</h2>
                        <p className="popup-desc">
                            Bạn có chắc muốn đóng ca <strong>{posConfig.session?.name || 'phiên POS hiện tại'}</strong>?
                            Sau khi đóng, bạn sẽ quay về màn hình chọn POS.
                        </p>
                        {closeSessionError && (
                            <p className="popup-error">⚠️ {closeSessionError}</p>
                        )}
                        <div className="popup-actions">
                            <button
                                className="btn btn-danger popup-btn"
                                onClick={handleConfirmCloseSession}
                                disabled={closingSession}
                            >
                                {closingSession ? '⏳ Đang đóng ca...' : '🔒 Xác nhận đóng ca'}
                            </button>
                            <button className="btn btn-secondary popup-btn" onClick={closePopup} disabled={closingSession}>
                                Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== POPUP: Order History (shared component) ===== */}
            <OrderHistoryPopup
                show={history.showHistory}
                onClose={history.closeHistory}
                orders={history.historyOrders}
                loading={history.historyLoading}
                error={history.historyError}
                selectedOrder={history.selectedOrder}
                orderLines={history.orderLines}
                linesLoading={history.linesLoading}
                onViewDetail={history.viewOrderDetail}
                onBackToList={history.backToList}
                posName={posConfig?.name}
                authData={authData}
                posConfig={posConfig}
                posData={posData}
            />
            {/* Merge Popup */}
            {showMergePopup && (
                <div className="popup-overlay">
                    <div className="popup-card slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="popup-header">
                            <h3 className="popup-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>🔗</span> Gộp Bàn
                            </h3>
                            {/* <button className="popup-close-btn" onClick={() => setShowMergePopup(false)}>✕</button> */}
                        </div>
                        <div className="popup-body" style={{ textAlign: 'left', marginTop: '16px' }}>
                            <div className="popup-form-group">
                                <label className="popup-label">Từ bàn (đang có khách):</label>
                                <select
                                    className="popup-select"
                                    value={mergeSource}
                                    onChange={(e) => setMergeSource(e.target.value)}
                                >
                                    <option value="">-- Chọn bàn đi --</option>
                                    {tables.filter(t => t.status === 'occupied').map(t => (
                                        <option key={t.id} value={t.id}>Bàn {t.number}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="popup-form-group">
                                <label className="popup-label">Đến bàn:</label>
                                <select
                                    className="popup-select"
                                    value={mergeDest}
                                    onChange={(e) => setMergeDest(e.target.value)}
                                    disabled={!mergeSource}
                                >
                                    <option value="">-- Chọn bàn đến --</option>
                                    {tables.filter(t => t.id.toString() !== mergeSource && t.status === 'occupied').map(t => (
                                        <option key={t.id} value={t.id}>Bàn {t.number}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="popup-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                            <button className="btn btn-secondary" onClick={() => setShowMergePopup(false)}>Hủy</button>
                            <button className="btn btn-primary" onClick={handleMergeConfirm} disabled={!mergeSource || !mergeDest || mergeSource === mergeDest}>
                                Xác nhận Gộp
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Split Popup */}
            {showSplitPopup && (
                <div className="popup-overlay">
                    <div className="popup-card slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90vw' }}>
                        <div className="popup-header">
                            <h3 className="popup-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>✂️</span> Tách Bàn
                            </h3>
                            {/* <button className="popup-close-btn" onClick={() => setShowSplitPopup(false)}>✕</button> */}
                        </div>
                        <div className="popup-body" style={{ textAlign: 'left', marginTop: '16px' }}>
                            <div className="popup-split-container">
                                <div className="popup-form-group" style={{ marginBottom: 0 }}>
                                    <label className="popup-label">Từ bàn (đang có khách):</label>
                                    <select
                                        className="popup-select"
                                        value={splitSource}
                                        onChange={(e) => {
                                            setSplitSource(e.target.value);
                                            setSplitItems({});
                                        }}
                                    >
                                        <option value="">-- Chọn bàn gốc --</option>
                                        {tables.filter(t => t.status === 'occupied').map(t => (
                                            <option key={t.id} value={t.id}>Bàn {t.number}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="popup-form-group" style={{ marginBottom: 0 }}>
                                    <label className="popup-label">Đến bàn (chỉ bàn trống):</label>
                                    <select
                                        className="popup-select"
                                        value={splitDest}
                                        onChange={(e) => setSplitDest(e.target.value)}
                                        disabled={!splitSource}
                                    >
                                        <option value="">-- Chọn bàn đích --</option>
                                        {tables.filter(t => t.status === 'available').map(t => (
                                            <option key={t.id} value={t.id}>Bàn {t.number}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {splitSource && (
                                <div>
                                    <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Chọn số lượng món muốn chuyển:</h4>
                                    <div className="split-items-list">
                                        {(() => {
                                            const srcId = parseInt(splitSource, 10);
                                            const srcTbl = tables.find(t => t.id === srcId);
                                            const items = srcTbl?.orderItems || [];

                                            if (items.length === 0) {
                                                return (
                                                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🍽️</div>
                                                        Bàn này chưa có món nào.
                                                    </div>
                                                );
                                            }

                                            return items.map((item, idx) => (
                                                <div key={idx} className="split-item-row">
                                                    <div style={{ flex: 1, paddingRight: '16px' }}>
                                                        <div className="split-item-name">{item.product.display_name || item.product.name}</div>
                                                        <div className="split-item-meta">Hiện có: <strong style={{ color: 'var(--text-primary)' }}>{item.quantity}</strong> món</div>
                                                    </div>
                                                    <div className="qty-control">
                                                        <button
                                                            className="qty-control-btn"
                                                            disabled={(splitItems[idx] || 0) <= 0}
                                                            onClick={() => setSplitItems(prev => ({ ...prev, [idx]: Math.max(0, (prev[idx] || 0) - 1) }))}
                                                        >−</button>
                                                        <input
                                                            type="number"
                                                            className="qty-control-input"
                                                            min="0"
                                                            max={item.quantity}
                                                            value={splitItems[idx] || 0}
                                                            onChange={(e) => {
                                                                const val = Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0));
                                                                setSplitItems(prev => ({ ...prev, [idx]: val }));
                                                            }}
                                                        />
                                                        <button
                                                            className="qty-control-btn"
                                                            disabled={(splitItems[idx] || 0) >= item.quantity}
                                                            onClick={() => setSplitItems(prev => ({ ...prev, [idx]: Math.min(item.quantity, (prev[idx] || 0) + 1) }))}
                                                        >+</button>
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="popup-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                            <button className="btn btn-secondary" onClick={() => setShowSplitPopup(false)}>Hủy</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSplitConfirm}
                                disabled={!splitSource || !splitDest || Object.values(splitItems).every(v => v === 0)}
                            >
                                Xác nhận Chuyển
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TablePage;

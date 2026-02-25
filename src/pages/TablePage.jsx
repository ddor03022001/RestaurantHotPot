import React, { useState, useCallback } from 'react';
import TableCard from '../components/TableCard';
import './TablePage.css';

function TablePage({ authData, posConfig, posData, tables, setTables, onBack, onLogout, onOpenTableOrder }) {
    const [selectedTables, setSelectedTables] = useState([]);
    const [mode, setMode] = useState('normal'); // normal | merge | split
    const [popup, setPopup] = useState(null); // { type: 'confirm-open', table }

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
        </div>
    );
}

export default TablePage;

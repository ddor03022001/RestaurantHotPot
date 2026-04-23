import React, { useState, useMemo } from 'react';
import './StockTransferPopup.css';

/**
 * Stock Transfer Popup — Internal warehouse transfer (Chuyển kho nội bộ).
 * UI-only component, logic to be implemented later.
 *
 * @param {object} props
 * @param {boolean} props.show - Whether the popup is visible
 * @param {Function} props.onClose - Close the popup
 * @param {Array} props.products - Available products list to search from
 * @param {object} props.posData - POS data containing transaction types
 * @param {object} props.posConfig - POS config
 * @param {Function} [props.onRefreshStock] - Callback to refresh stock after transfer
 */
function StockTransferPopup({ show, onClose, products = [], posData = {}, posConfig = {}, onRefreshStock }) {
    // Transaction type
    const [transactionType, setTransactionType] = useState('');
    // Description
    const [description, setDescription] = useState('');
    // Product search
    const [productSearch, setProductSearch] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    // Transfer lines: [{ id, product, quantity }]
    const [transferLines, setTransferLines] = useState([]);
    // Submit states
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successResult, setSuccessResult] = useState(null); // { typeName, itemCount, totalQty }
    const [transferError, setTransferError] = useState('');

    // Transaction type options from posData
    const transactionTypes = (posData.transactionTypes || []).map((t) => ({
        id: t.id,
        value: t.code,
        label: t.name,
        type: t.type,
    }));

    // Filter products for search
    const filteredProducts = useMemo(() => {
        if (!productSearch.trim()) return [];
        const q = productSearch.toLowerCase();
        return products
            .filter(
                (p) =>
                    (p.display_name || p.name).toLowerCase().includes(q) ||
                    (p.default_code && p.default_code.toLowerCase().includes(q)) ||
                    (p.barcode && p.barcode.toLowerCase().includes(q))
            )
            .filter((p) => (p.qty_available || 0) > 0)
            .filter((p) => !transferLines.some((line) => line.product.id === p.id))
            .slice(0, 20);
    }, [products, productSearch, transferLines]);

    // Add product to transfer lines
    const addProduct = (product) => {
        const stock = product.qty_available || 0;
        setTransferLines((prev) => [
            ...prev,
            {
                id: Date.now() + Math.random(),
                product,
                quantity: stock < 1 ? stock : 1,
            },
        ]);
        setProductSearch('');
        setShowProductDropdown(false);
    };

    // Update line quantity
    const updateLineQty = (lineId, value) => {
        const qty = value === '' ? 0 : parseFloat(value);
        setTransferLines((prev) =>
            prev.map((line) => {
                if (line.id !== lineId) return line;
                const maxQty = line.product.qty_available || 0;
                const clamped = isNaN(qty) ? 0 : Math.max(0, Math.min(qty, maxQty));
                return { ...line, quantity: clamped };
            })
        );
    };

    // Remove line
    const removeLine = (lineId) => {
        setTransferLines((prev) => prev.filter((line) => line.id !== lineId));
    };

    // Reset form
    const handleClose = () => {
        setTransactionType('');
        setDescription('');
        setProductSearch('');
        setShowProductDropdown(false);
        setTransferLines([]);
        onClose();
    };

    // Confirm transfer
    const handleConfirmTransfer = async () => {
        setIsSubmitting(true);
        setTransferError('');
        try {
            const items = transferLines.map(item => {
                return {
                    product_id: item.product.id,
                    quantity: item.quantity,
                }
            })
            const stockTransferData = {
                pos_session_name: posConfig.current_session_id[1],
                transaction_type_id: transactionType.id,
                picking_type_id: posConfig.operation_type_internal_transfer[0],
                location_id: posConfig.stock_location_id[0],
                company_id: posConfig.company_id[0],
                description: description || false,
                items
            };
            console.log(stockTransferData);
            const res = await window.electronAPI.createInternalTransfer(stockTransferData);
            if (!res.success) {
                throw new Error(res.error);
            }
            console.log(res);
            // Show success
            setSuccessResult({
                typeName: selectedType?.label || transactionType.label || 'Chuyển kho',
                itemCount: transferLines.length,
                totalQty: transferLines.reduce((sum, l) => sum + l.quantity, 0),
            });
            // Refresh stock
            if (onRefreshStock) onRefreshStock();
        } catch (err) {
            console.error("Lỗi khi tạo phiếu chuyển kho", err);
            setTransferError(err.message || 'Có lỗi xảy ra');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Close success popup and reset
    const handleSuccessClose = () => {
        setSuccessResult(null);
        handleClose();
    };

    // Get selected type info
    const selectedType = transactionTypes.find((t) => t.value === transactionType.value);

    if (!show) return null;

    return (
        <div className="order-popup-overlay" onClick={handleClose}>
            <div className="stock-transfer-popup" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="stock-transfer-header">
                    <div className="stock-transfer-header-left">
                        <div className="stock-transfer-icon">📦</div>
                        <div>
                            <h2 className="stock-transfer-title">Chuyển kho nội bộ</h2>
                            <p className="stock-transfer-subtitle">Tạo phiếu xuất / chuyển kho</p>
                        </div>
                    </div>
                    <button className="order-popup-close" onClick={handleClose}>✕</button>
                </div>

                {/* Body */}
                <div className="stock-transfer-body">
                    {/* Transaction Type */}
                    <div className="stock-transfer-section">
                        <label className="stock-transfer-label">
                            <span className="stock-transfer-label-icon">📋</span>
                            Loại giao dịch
                        </label>
                        <div className="stock-transfer-type-grid">
                            {transactionTypes.map((type) => (
                                <button
                                    key={type.value}
                                    className={`stock-transfer-type-btn ${transactionType.value === type.value ? 'stock-transfer-type-active' : ''}`}
                                    onClick={() => setTransactionType(type)}
                                >
                                    <span className="stock-transfer-type-label">{type.label}</span>
                                    {transactionType.value === type.value && (
                                        <span className="stock-transfer-type-check">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Description */}
                    <div className="stock-transfer-section">
                        <label className="stock-transfer-label">
                            <span className="stock-transfer-label-icon">✏️</span>
                            Mô tả
                        </label>
                        <textarea
                            className="stock-transfer-textarea"
                            placeholder="Nhập mô tả cho phiếu chuyển kho..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {/* Divider */}
                    <div className="stock-transfer-divider">
                        <span className="stock-transfer-divider-text">Sản phẩm chuyển kho</span>
                    </div>

                    {/* Product Search */}
                    <div className="stock-transfer-search-wrapper">
                        <div className="stock-transfer-search-container">
                            <span className="stock-transfer-search-icon">🔍</span>
                            <input
                                type="text"
                                className="stock-transfer-search-input"
                                placeholder="Tìm sản phẩm (tên, mã, barcode)..."
                                value={productSearch}
                                onChange={(e) => {
                                    setProductSearch(e.target.value);
                                    setShowProductDropdown(true);
                                }}
                                onFocus={() => setShowProductDropdown(true)}
                            />
                            {productSearch && (
                                <button
                                    className="stock-transfer-search-clear"
                                    onClick={() => { setProductSearch(''); setShowProductDropdown(false); }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Product dropdown */}
                        {showProductDropdown && productSearch.trim() && (
                            <div className="stock-transfer-dropdown">
                                {filteredProducts.length === 0 ? (
                                    <div className="stock-transfer-dropdown-empty">
                                        Không tìm thấy sản phẩm
                                    </div>
                                ) : (
                                    filteredProducts.map((product) => (
                                        <div
                                            key={product.id}
                                            className="stock-transfer-dropdown-item"
                                            onClick={() => addProduct(product)}
                                        >
                                            <div className="stock-transfer-dropdown-info">
                                                <span className="stock-transfer-dropdown-name">
                                                    {product.display_name || product.name}
                                                </span>
                                                <span className="stock-transfer-dropdown-meta">
                                                    {product.default_code && <span className="stock-transfer-dropdown-code">{product.default_code}</span>}
                                                    {product.type === 'product' && (
                                                        <span className="stock-transfer-dropdown-stock">
                                                            📦 {product.qty_available || 0}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            <span className="stock-transfer-dropdown-add">+ Thêm</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Transfer Lines */}
                    <div className="stock-transfer-lines">
                        {transferLines.length === 0 ? (
                            <div className="stock-transfer-lines-empty">
                                <div className="stock-transfer-lines-empty-icon">📭</div>
                                <p>Chưa có sản phẩm nào</p>
                                <p className="stock-transfer-lines-empty-hint">Tìm kiếm và thêm sản phẩm ở trên</p>
                            </div>
                        ) : (
                            <>
                                {/* Lines header */}
                                <div className="stock-transfer-line-header">
                                    <span className="stl-col stl-col-name">Sản phẩm</span>
                                    <span className="stl-col stl-col-stock">Tồn kho</span>
                                    <span className="stl-col stl-col-qty">Số lượng</span>
                                    <span className="stl-col stl-col-action"></span>
                                </div>
                                {transferLines.map((line) => (
                                    <div key={line.id} className="stock-transfer-line-row">
                                        <div className="stl-col stl-col-name">
                                            <span className="stl-product-name">
                                                {line.product.display_name || line.product.name}
                                            </span>
                                            {line.product.default_code && (
                                                <span className="stl-product-code">{line.product.default_code}</span>
                                            )}
                                        </div>
                                        <span className="stl-col stl-col-stock">
                                            {line.product.type === 'product' ? (line.product.qty_available || 0) : '∞'}
                                        </span>
                                        <div className="stl-col stl-col-qty">
                                            <button
                                                className="stl-qty-btn"
                                                onClick={() => updateLineQty(line.id, line.quantity - 1)}
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                className="stl-qty-input"
                                                value={line.quantity}
                                                min="0"
                                                step="1"
                                                onChange={(e) => updateLineQty(line.id, e.target.value)}
                                                onClick={(e) => e.target.select()}
                                            />
                                            <button
                                                className="stl-qty-btn"
                                                onClick={() => updateLineQty(line.id, line.quantity + 1)}
                                            >
                                                +
                                            </button>
                                        </div>
                                        <div className="stl-col stl-col-action">
                                            <button
                                                className="stl-remove-btn"
                                                onClick={() => removeLine(line.id)}
                                                title="Xóa"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="stock-transfer-footer">
                    <div className="stock-transfer-footer-info">
                        {selectedType && (
                            <span className="stock-transfer-footer-type">
                                {selectedType.label}
                            </span>
                        )}
                        <span className="stock-transfer-footer-count">
                            {transferLines.length} sản phẩm · {transferLines.reduce((sum, l) => sum + l.quantity, 0)} tổng SL
                        </span>
                    </div>
                    <div className="stock-transfer-footer-actions">
                        <button className="btn btn-secondary" onClick={handleClose} disabled={isSubmitting}>
                            Hủy
                        </button>
                        <button
                            className="btn btn-primary stock-transfer-submit-btn"
                            onClick={handleConfirmTransfer}
                            disabled={!transactionType || transferLines.length === 0 || isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="stock-transfer-spinner"></span>
                                    Đang xử lý...
                                </>
                            ) : (
                                '✅ Xác nhận chuyển kho'
                            )}
                        </button>
                    </div>
                </div>

                {/* Error message */}
                {transferError && (
                    <div className="stock-transfer-error">
                        <span>⚠️ {transferError}</span>
                        <button className="stock-transfer-error-close" onClick={() => setTransferError('')}>✕</button>
                    </div>
                )}
            </div>

            {/* Success Popup */}
            {successResult && (
                <div className="stock-transfer-success-overlay" onClick={handleSuccessClose}>
                    <div className="stock-transfer-success-card" onClick={(e) => e.stopPropagation()}>
                        <div className="stock-transfer-success-icon-wrapper">
                            <div className="stock-transfer-success-icon">✓</div>
                            <div className="stock-transfer-success-ring"></div>
                        </div>
                        <h3 className="stock-transfer-success-title">Thành công!</h3>
                        <p className="stock-transfer-success-desc">
                            Đã tạo phiếu <strong>{successResult.typeName}</strong> thành công
                        </p>
                        <div className="stock-transfer-success-stats">
                            <div className="stock-transfer-success-stat">
                                <span className="stock-transfer-success-stat-value">{successResult.itemCount}</span>
                                <span className="stock-transfer-success-stat-label">Sản phẩm</span>
                            </div>
                            <div className="stock-transfer-success-stat-divider"></div>
                            <div className="stock-transfer-success-stat">
                                <span className="stock-transfer-success-stat-value">{successResult.totalQty}</span>
                                <span className="stock-transfer-success-stat-label">Tổng SL</span>
                            </div>
                        </div>
                        <button className="btn btn-primary stock-transfer-success-btn" onClick={handleSuccessClose}>
                            Đóng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default StockTransferPopup;

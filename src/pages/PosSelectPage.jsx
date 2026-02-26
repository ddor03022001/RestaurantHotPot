import React, { useState, useEffect } from 'react';
import './PosSelectPage.css';

function PosSelectPage({ authData, onSelectPos, onLogout }) {
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openingId, setOpeningId] = useState(null);
    const [loadingMessage, setLoadingMessage] = useState('');

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        setLoading(true);
        setError('');
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.getPosConfigs();
                if (result.success) {
                    // Mark each config with session ownership status
                    const configsWithStatus = (result.configs || []).map((c) => {
                        if (c.session && c.session_state && c.session_state !== 'closed') {
                            if (c.session_user_id === result.currentUid) {
                                c._status = 'mine'; // User's own open session
                            } else {
                                c._status = 'locked'; // Someone else's session
                            }
                        } else {
                            c._status = 'available'; // No active session
                        }
                        return c;
                    });
                    setConfigs(configsWithStatus);
                } else {
                    setError(result.error);
                }
            } else {
                // Browser mock
                await new Promise((r) => setTimeout(r, 800));
                setConfigs([
                    { id: 1, name: 'POS Tầng 1', _status: 'available', stock_location_id: [1, 'Kho chính'] },
                    { id: 2, name: 'POS Tầng 2', _status: 'mine', session_user_name: 'Admin', stock_location_id: [2, 'Kho phụ'] },
                    { id: 3, name: 'POS Bar', _status: 'locked', session_user_name: 'Nguyễn Văn A', stock_location_id: [1, 'Kho chính'] },
                    { id: 4, name: 'POS Sân vườn', _status: 'available', stock_location_id: [3, 'Kho sân vườn'] },
                ]);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenPos = async (config) => {
        if (config._status === 'locked') return; // Can't open others' session

        setOpeningId(config.id);
        setLoadingMessage('Đang mở phiên POS...');

        try {
            let session = config.session;

            // Open session via Odoo if needed
            if (window.electronAPI && config._status !== 'mine') {
                const result = await window.electronAPI.openPosSession(config.id);
                if (!result.success) {
                    setError(result.error);
                    setOpeningId(null);
                    return;
                }
                session = result.session;
            }

            // Load products, customers, categories, pricelists, promotions
            setLoadingMessage('Đang tải sản phẩm...');
            let products = [], customers = [], categories = [], pricelists = [], promotions = [];

            if (window.electronAPI) {
                const [prodResult, custResult, catResult, plResult, promoResult] = await Promise.all([
                    window.electronAPI.getProducts(),
                    window.electronAPI.getCustomers(),
                    window.electronAPI.getPosCategories(),
                    window.electronAPI.getPricelists(),
                    window.electronAPI.getPromotions(),
                ]);
                products = prodResult.success ? prodResult.products : [];
                customers = custResult.success ? custResult.customers : [];
                categories = catResult.success ? catResult.categories : [];
                pricelists = plResult.success ? plResult.pricelists : [];
                promotions = promoResult.success ? promoResult.promotions : [];
            } else {
                // Browser mock data
                await new Promise((r) => setTimeout(r, 600));
                products = [
                    { id: 1, name: 'Phở bò', list_price: 45000, pos_categ_id: [1, 'Món chính'], categ_id: [1, 'Thực phẩm'] },
                    { id: 2, name: 'Bún chả', list_price: 40000, pos_categ_id: [1, 'Món chính'], categ_id: [1, 'Thực phẩm'] },
                    { id: 3, name: 'Cơm rang', list_price: 35000, pos_categ_id: [1, 'Món chính'], categ_id: [1, 'Thực phẩm'] },
                    { id: 4, name: 'Gỏi cuốn', list_price: 30000, pos_categ_id: [2, 'Khai vị'], categ_id: [1, 'Thực phẩm'] },
                    { id: 5, name: 'Chả giò', list_price: 25000, pos_categ_id: [2, 'Khai vị'], categ_id: [1, 'Thực phẩm'] },
                    { id: 6, name: 'Nộm bò', list_price: 35000, pos_categ_id: [2, 'Khai vị'], categ_id: [1, 'Thực phẩm'] },
                    { id: 7, name: 'Trà đá', list_price: 5000, pos_categ_id: [3, 'Đồ uống'], categ_id: [2, 'Đồ uống'] },
                    { id: 8, name: 'Cà phê sữa', list_price: 20000, pos_categ_id: [3, 'Đồ uống'], categ_id: [2, 'Đồ uống'] },
                    { id: 9, name: 'Sinh tố bơ', list_price: 30000, pos_categ_id: [3, 'Đồ uống'], categ_id: [2, 'Đồ uống'] },
                    { id: 10, name: 'Bia Hà Nội', list_price: 15000, pos_categ_id: [3, 'Đồ uống'], categ_id: [2, 'Đồ uống'] },
                    { id: 11, name: 'Bánh flan', list_price: 15000, pos_categ_id: [4, 'Tráng miệng'], categ_id: [3, 'Tráng miệng'] },
                    { id: 12, name: 'Chè đậu đỏ', list_price: 12000, pos_categ_id: [4, 'Tráng miệng'], categ_id: [3, 'Tráng miệng'] },
                ];
                customers = [
                    { id: 1, name: 'Khách lẻ', phone: '', email: '' },
                    { id: 2, name: 'Nguyễn Văn A', phone: '0901234567', email: 'a@mail.com' },
                    { id: 3, name: 'Trần Thị B', phone: '0912345678', email: 'b@mail.com' },
                ];
                categories = [
                    { id: 1, name: 'Món chính', parent_id: false, sequence: 1 },
                    { id: 2, name: 'Khai vị', parent_id: false, sequence: 2 },
                    { id: 3, name: 'Đồ uống', parent_id: false, sequence: 3 },
                    { id: 4, name: 'Tráng miệng', parent_id: false, sequence: 4 },
                ];
                pricelists = [
                    { id: 1, name: 'Bảng giá chung', active: true },
                    { id: 2, name: 'Bảng giá VIP', active: true },
                    { id: 3, name: 'Bảng giá nhân viên', active: true },
                ];
                promotions = [
                    { id: 1, name: 'Giảm 10% Happy Hour', discount_type: 'percentage', discount_percentage: 10, active: true },
                    { id: 2, name: 'Giảm 50k cho bill trên 500k', discount_type: 'fixed_amount', discount_fixed_amount: 50000, active: true },
                    { id: 3, name: 'Mua 2 tặng 1 đồ uống', discount_type: 'percentage', discount_percentage: 100, active: true },
                ];
            }

            setLoadingMessage('');
            onSelectPos(
                { ...config, session },
                { products, customers, categories, pricelists, promotions }
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setOpeningId(null);
            setLoadingMessage('');
        }
    };

    const posIcons = ['🏪', '🏬', '🍸', '🌿', '🍽️', '☕', '🏠', '🎯'];

    const getStatusBadge = (config) => {
        if (config._status === 'mine') {
            return { text: '▶ Tiếp tục', className: 'pos-badge-continue' };
        }
        if (config._status === 'locked') {
            return { text: `🔒 ${config.session_user_name || 'Người khác'} đang sử dụng`, className: 'pos-badge-locked' };
        }
        return { text: '▶ Mở POS', className: 'pos-badge-open' };
    };

    return (
        <div className="pos-select-page">
            {/* Header */}
            <header className="pos-header">
                <div className="pos-header-left">
                    <h1 className="pos-header-title">Chọn điểm bán</h1>
                    <p className="pos-header-subtitle">
                        Xin chào, <strong>{authData.user.name}</strong>
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={onLogout}>
                    🚪 Đăng xuất
                </button>
            </header>

            {/* Content */}
            <div className="pos-content">
                {loading ? (
                    <div className="pos-loading">
                        <div className="pos-loading-spinner"></div>
                        <p>Đang tải danh sách POS...</p>
                    </div>
                ) : error ? (
                    <div className="pos-error fade-in">
                        <span className="pos-error-icon">⚠️</span>
                        <p>{error}</p>
                        <button className="btn btn-secondary" onClick={fetchConfigs}>
                            Thử lại
                        </button>
                    </div>
                ) : configs.length === 0 ? (
                    <div className="pos-empty fade-in">
                        <span className="pos-empty-icon">📭</span>
                        <p>Không có POS nào được cấu hình</p>
                    </div>
                ) : (
                    <div className="pos-grid">
                        {configs.map((config, index) => {
                            const badge = getStatusBadge(config);
                            const isLocked = config._status === 'locked';
                            return (
                                <div
                                    key={config.id}
                                    className={`pos-card glass-card fade-in ${isLocked ? 'pos-card-locked' : ''} ${openingId === config.id ? 'pos-card-opening' : ''}`}
                                    style={{ animationDelay: `${index * 0.08}s` }}
                                    onClick={() => !openingId && handleOpenPos(config)}
                                >
                                    <div className="pos-card-icon">
                                        {posIcons[index % posIcons.length]}
                                    </div>
                                    <h3 className="pos-card-name">{config.name}</h3>
                                    {config.stock_location_id && (
                                        <p className="pos-card-location">
                                            📍 {Array.isArray(config.stock_location_id) ? config.stock_location_id[1] : config.stock_location_id}
                                        </p>
                                    )}
                                    <div className="pos-card-action">
                                        {openingId === config.id ? (
                                            <span className="pos-card-opening-text">
                                                <span className="login-spinner"></span> {loadingMessage || 'Đang mở...'}
                                            </span>
                                        ) : (
                                            <span className={`pos-card-badge ${badge.className}`}>{badge.text}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default PosSelectPage;

import React, { useState, useEffect, useRef } from 'react';
import './CustomerScreen.css';
import { formatPrice } from '../utils/formatters';

const CustomerScreen = () => {
    const [displayState, setDisplayState] = useState({
        screen: 'idle', // 'idle' | 'order' | 'payment'
        items: [],
        totalData: {
            subTotal: 0,
            tax: 0,
            total: 0
        }
    });
    const [qrCodeUrl, setQrCodeUrl] = useState(null);
    const [qrLoading, setQrLoading] = useState(false);
    const prevScreenRef = useRef('idle');

    useEffect(() => {
        if (window.electronAPI && window.electronAPI.onCustomerDisplayUpdate) {
            window.electronAPI.onCustomerDisplayUpdate((data) => {
                // console.log('Customer update received:', data);
                setDisplayState((prev) => ({ ...prev, ...data }));
            });
        }
    }, []);

    const { screen, items, totalData } = displayState;

    // Fetch QR code when entering payment screen
    useEffect(() => {
        if (screen === 'payment' && prevScreenRef.current !== 'payment') {
            const totalAmount = totalData.total;
            if (totalAmount > 0 && window.electronAPI && window.electronAPI.getApiQrCode) {
                setQrLoading(true);
                setQrCodeUrl(null);
                window.electronAPI.getApiQrCode(totalAmount).then((data) => {
                    if (data && data.qrDataURL) {
                        setQrCodeUrl(data.qrDataURL);
                    }
                    setQrLoading(false);
                }).catch((err) => {
                    console.error('QR code error:', err);
                    setQrLoading(false);
                });
            }
        }
        if (screen !== 'payment') {
            setQrCodeUrl(null);
            setQrLoading(false);
        }
        prevScreenRef.current = screen;
    }, [screen, totalData.total]);

    return (
        <div className="customer-screen-container">
            {/* Left Promotional Panel */}
            <div className="customer-screen-left">
                <h1 className="brand-title">Welcome to DannyGreen Retail</h1>
                <p className="brand-subtitle"></p>
                {/* You can replace this img with an actual promotional video or carousel */}
                <video
                    autoPlay    // Tự động chạy
                    loop        // Lặp lại liên tục
                    muted       // Tắt tiếng (Bắt buộc phải có muted thì trình duyệt mới cho autoPlay)
                    playsInline // Chạy trực tiếp trên trang (quan trọng cho các thiết bị di động)
                    style={{
                        width: '90%',
                        height: '70%',
                        objectFit: 'cover', // Cắt xén khéo léo để video lấp đầy khung mà không bị méo
                        marginTop: '2rem',
                        borderRadius: '20px',
                        border: '1px solid #334155',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}
                >
                    {/* Thay đường dẫn này bằng link video của bạn */}
                    <source src="./video.mp4" type="video/mp4" />

                    {/* Dòng chữ này sẽ hiện ra nếu trình duyệt hoặc màn hình POS quá cũ không hỗ trợ video */}
                    Trình duyệt của bạn không hỗ trợ phát video.
                </video>
            </div>

            {/* Right Receipt Panel */}
            <div className="customer-screen-right">
                <div className="cart-header">
                    <h2>Đơn hàng của bạn</h2>
                </div>

                <div className="cart-body">
                    {!items || items.length === 0 ? (
                        <div className="idle-state">
                            <span style={{ fontSize: '48px', marginBottom: '1rem' }}>🛒</span>
                            <h3>Xin chào quý khách!</h3>
                            <p>Đơn hàng sẽ hiển thị tại đây khi bắt đầu gọi món.</p>
                        </div>
                    ) : (
                        items.map((item, index) => {
                            const hasDiscount = item.discountAmount > 0;
                            const originalLineTotal = item.quantity * item.price;

                            return (
                                <div key={index} className={`cart-item ${hasDiscount ? 'has-discount' : ''}`}>
                                    <div className="item-info">
                                        <div className="item-name">{item.name}</div>
                                        <div className="item-qty-price">{item.quantity} x {formatPrice(item.price)}</div>
                                    </div>
                                    <div className="item-total">
                                        {hasDiscount && (
                                            <span className="item-original-total">{formatPrice(originalLineTotal)}</span>
                                        )}
                                        <span className={hasDiscount ? 'item-discounted-total' : ''}>
                                            {formatPrice(item.lineTotal || originalLineTotal)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {items && items.length > 0 && (
                    <div className="cart-footer">
                        <div className="summary-row">
                            <span>Tạm tính</span>
                            <span>{formatPrice(totalData.subTotal)}</span>
                        </div>
                        {totalData.totalDiscount > 0 && (
                            <div className="summary-row discount">
                                <span>Chiết khấu</span>
                                <span>-{formatPrice(totalData.totalDiscount)}</span>
                            </div>
                        )}
                        <div className="summary-row">
                            <span>Thuế / Phí</span>
                            <span>{formatPrice(totalData.tax || 0)}</span>
                        </div>
                        <div className="summary-row total">
                            <span>Tổng cộng</span>
                            <span>{formatPrice(totalData.total)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Payment Overlay */}
            {screen === 'payment' && (
                <div className="payment-overlay">
                    <h2>Vui lòng thanh toán</h2>
                    <div className="payment-total">{formatPrice(totalData.total)}</div>

                    {/* QR Code Section */}
                    <div className="qr-code-section">
                        {qrLoading && (
                            <div className="qr-loading">
                                <div className="qr-spinner"></div>
                                <span>Đang tạo mã QR...</span>
                            </div>
                        )}
                        {qrCodeUrl && !qrLoading && (
                            <div className="qr-code-wrapper">
                                <img
                                    src={qrCodeUrl}
                                    alt="VietQR Payment"
                                    className="qr-code-image"
                                />
                                <p className="qr-scan-text">Quét mã để thanh toán</p>
                            </div>
                        )}
                    </div>

                    <div className="payment-instructions">
                        Quý khách vui lòng thanh toán tại quầy
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerScreen;

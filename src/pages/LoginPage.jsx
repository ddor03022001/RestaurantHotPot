import React, { useState, useEffect } from 'react';
import './LoginPage.css';

function LoginPage({ onLogin }) {
    const [url, setUrl] = useState('');
    const [db, setDb] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Restore saved connection info
    useEffect(() => {
        const savedUrl = localStorage.getItem('hotpos_odoo_url') || 'https://retail.seateklab.vn';
        const savedDb = localStorage.getItem('hotpos_odoo_db') || 'dngretaildb';
        const savedUser = localStorage.getItem('hotpos_odoo_user') || '';
        setUrl(savedUrl);
        setDb(savedDb);
        setUsername(savedUser);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Save connection info
            localStorage.setItem('hotpos_odoo_url', url);
            localStorage.setItem('hotpos_odoo_db', db);
            localStorage.setItem('hotpos_odoo_user', username);

            // Check if running in Electron
            if (window.electronAPI) {
                const result = await window.electronAPI.login(url, db, username, password);
                if (result.success) {
                    onLogin({
                        user: result.user,
                        url,
                        db,
                        password,
                    });
                } else {
                    setError(result.error || 'Đăng nhập thất bại');
                }
            } else {
                // Browser mode — simulate login for UI testing
                await new Promise((r) => setTimeout(r, 1000));
                onLogin({
                    user: { uid: 1, name: username, login: username, email: '' },
                    url,
                    db,
                    password,
                });
            }
        } catch (err) {
            setError(err.message || 'Không thể kết nối đến server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Animated background */}
            <div className="login-bg">
                <div className="login-bg-orb login-bg-orb-1"></div>
                <div className="login-bg-orb login-bg-orb-2"></div>
                <div className="login-bg-orb login-bg-orb-3"></div>
            </div>

            <div className="login-container slide-up">
                {/* Logo / Brand */}
                <div className="login-brand">
                    <div className="login-logo">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                            <rect width="48" height="48" rx="12" fill="url(#logoGrad)" />
                            <path
                                d="M14 32V20C14 17.8 15.8 16 18 16H30C32.2 16 34 17.8 34 20V32"
                                stroke="white"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                            />
                            <path d="M10 32H38" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                            <circle cx="21" cy="24" r="2" fill="white" />
                            <circle cx="27" cy="24" r="2" fill="white" />
                            <path
                                d="M20 28C20 28 22 30 24 30C26 30 28 28 28 28"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                            <defs>
                                <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48">
                                    <stop stopColor="#10b981" />
                                    <stop offset="1" stopColor="#059669" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <h1 className="login-title">SeaPos</h1>
                    <p className="login-subtitle">Restaurant Point of Sale</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="login-form-section">
                        <label className="login-label">Kết nối Odoo</label>
                        <div className="login-row">
                            <div className="login-field">
                                <div className="login-field-icon">🌐</div>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="URL Server (vd: http://localhost:8069)"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="login-field login-field-small">
                                <div className="login-field-icon">🗄️</div>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Database"
                                    value={db}
                                    onChange={(e) => setDb(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="login-form-section">
                        <label className="login-label">Tài khoản</label>
                        <div className="login-field">
                            <div className="login-field-icon">👤</div>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Tên đăng nhập"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="login-field">
                            <div className="login-field-icon">🔒</div>
                            <input
                                type="password"
                                className="input-field"
                                placeholder="Mật khẩu"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="login-error fade-in">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                        {loading ? (
                            <>
                                <span className="login-spinner"></span>
                                Đang kết nối...
                            </>
                        ) : (
                            'Đăng nhập'
                        )}
                    </button>
                </form>

                <p className="login-footer">Đăng nhập bằng tài khoản Odoo 12 của bạn</p>
            </div>
        </div>
    );
}

export default LoginPage;

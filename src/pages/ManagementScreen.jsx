import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { formatPrice, formatDate, getStateLabel } from '../utils/formatters';
import { printBill } from '../utils/printBill';
import { printLabel } from '../utils/printLabel';
import './ManagementScreen.css';

const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Tổng quan' },
    { id: 'reports', icon: '📋', label: 'Báo cáo' },
    { id: 'products', icon: '📦', label: 'Sản phẩm' },
    { id: 'customers', icon: '👥', label: 'Khách hàng' },
    { id: 'employees', icon: '🧑‍💼', label: 'Nhân viên' },
    { id: 'settings', icon: '⚙️', label: 'Cài đặt' },
];

// Get start of day in local timezone
const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay() || 7; // Mon = 1
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getStartOfMonth = (date) => {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
};

function ManagementScreen({ authData, posConfig, posData, onBack }) {
    const [activeMenu, setActiveMenu] = useState('dashboard');
    const [dateRange, setDateRange] = useState('today'); // today | week | month

    // Data state
    const [allOrders, setAllOrders] = useState([]); // All orders (30 days)
    const [allLines, setAllLines] = useState([]); // All order lines
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Report export state
    const [exporting, setExporting] = useState(false);

    // Printer settings state
    const [printers, setPrinters] = useState([]);
    const [selectedPrinter, setSelectedPrinter] = useState(localStorage.getItem('billPrinterName') || '');
    const [selectedLabelPrinter, setSelectedLabelPrinter] = useState(localStorage.getItem('labelPrinterName') || '');
    const [printersLoading, setPrintersLoading] = useState(false);
    const [testPrintDone, setTestPrintDone] = useState(false);
    const [testLabelPrintDone, setTestLabelPrintDone] = useState(false);

    // Customer Display settings state
    const [customerTitle, setCustomerTitle] = useState(localStorage.getItem('customerDisplayTitle') || '');
    const [customerVideoPath, setCustomerVideoPath] = useState(localStorage.getItem('customerVideoPath') || '');
    const [videoUploading, setVideoUploading] = useState(false);
    const [titleSaved, setTitleSaved] = useState(false);

    // Fetch all orders (30 days) once on mount
    const fetchAllData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.getPosOrders(posConfig.id, 30);
                if (result.success) {
                    const orders = result.orders || [];
                    setAllOrders(orders);

                    // Fetch all order lines in batch
                    const allLineIds = orders.reduce((acc, o) => {
                        if (o.lines && o.lines.length > 0) acc.push(...o.lines);
                        return acc;
                    }, []);

                    if (allLineIds.length > 0) {
                        const linesResult = await window.electronAPI.getPosOrderLines(allLineIds);
                        if (linesResult.success) {
                            setAllLines(linesResult.lines || []);
                        }
                    }
                } else {
                    setError(result.error || 'Không thể tải dữ liệu');
                }
            } else {
                // Dev mock
                await new Promise((r) => setTimeout(r, 600));
                const now = new Date();
                const mockOrders = [];
                for (let i = 0; i < 47; i++) {
                    const d = new Date(now);
                    d.setHours(7 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));
                    d.setDate(d.getDate() - Math.floor(Math.random() * 30));
                    const amount = Math.round(50000 + Math.random() * 500000);
                    mockOrders.push({
                        id: i + 1,
                        name: `POS/${String(i + 1).padStart(3, '0')}`,
                        pos_reference: `Order 00001-001-${String(i + 1).padStart(4, '0')}`,
                        date_order: d.toISOString().replace('T', ' ').split('.')[0],
                        partner_id: Math.random() > 0.4 ? [i + 100, ['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm D'][i % 4]] : false,
                        amount_total: amount,
                        amount_tax: Math.round(amount * 0.1),
                        amount_paid: amount,
                        amount_return: 0,
                        state: Math.random() > 0.1 ? 'paid' : 'draft',
                        lines: [i * 3 + 1, i * 3 + 2, i * 3 + 3],
                        session_id: [1, 'POS/001'],
                        user_id: [1, authData?.user?.name || 'Admin'],
                    });
                }
                setAllOrders(mockOrders);

                const productNames = ['Phở bò', 'Bún chả', 'Cơm rang', 'Gỏi cuốn', 'Chả giò', 'Nộm bò', 'Trà đá', 'Cà phê sữa', 'Sinh tố bơ', 'Bia Hà Nội', 'Bánh flan', 'Chè đậu đỏ'];
                const mockLines = [];
                for (let i = 0; i < mockOrders.length * 3; i++) {
                    const pIdx = i % productNames.length;
                    const qty = 1 + Math.floor(Math.random() * 4);
                    const price = [45000, 40000, 35000, 30000, 25000, 35000, 5000, 20000, 30000, 15000, 15000, 12000][pIdx];
                    const disc = Math.random() > 0.8 ? 10 : 0;
                    mockLines.push({
                        id: i + 1,
                        order_id: [Math.floor(i / 3) + 1, ''],
                        product_id: [pIdx + 1, productNames[pIdx]],
                        qty,
                        price_unit: price,
                        discount: disc,
                        price_subtotal: qty * price * (1 - disc / 100),
                        price_subtotal_incl: qty * price * (1 - disc / 100),
                    });
                }
                setAllLines(mockLines);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [posConfig?.id]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // ===== Computed data =====
    const now = new Date();
    const todayStart = getStartOfDay(now);
    const weekStart = getStartOfWeek(now);
    const monthStart = getStartOfMonth(now);

    const filterOrders = (range) => {
        let start;
        if (range === 'today') start = todayStart;
        else if (range === 'week') start = weekStart;
        else start = monthStart;

        return allOrders.filter((o) => {
            if (!o.date_order) return false;
            const d = new Date(o.date_order);
            return d >= start && (o.state === 'paid' || o.state === 'done' || o.state === 'invoiced');
        });
    };

    const filteredOrders = filterOrders(dateRange);

    // KPIs
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.amount_total || 0), 0);
    const totalTax = filteredOrders.reduce((sum, o) => sum + (o.amount_tax || 0), 0);
    const orderCount = filteredOrders.length;
    const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0;
    const uniqueCustomers = new Set(filteredOrders.filter(o => o.partner_id).map(o => Array.isArray(o.partner_id) ? o.partner_id[0] : o.partner_id)).size;

    // Compare with previous period
    const getPrevPeriod = (range) => {
        const prevOrders = allOrders.filter((o) => {
            if (!o.date_order || !(o.state === 'paid' || o.state === 'done' || o.state === 'invoiced')) return false;
            const d = new Date(o.date_order);
            if (range === 'today') {
                const yest = new Date(todayStart);
                yest.setDate(yest.getDate() - 1);
                return d >= yest && d < todayStart;
            } else if (range === 'week') {
                const prevWeek = new Date(weekStart);
                prevWeek.setDate(prevWeek.getDate() - 7);
                return d >= prevWeek && d < weekStart;
            } else {
                const prevMonth = new Date(monthStart);
                prevMonth.setMonth(prevMonth.getMonth() - 1);
                return d >= prevMonth && d < monthStart;
            }
        });
        return prevOrders.reduce((sum, o) => sum + (o.amount_total || 0), 0);
    };

    const prevRevenue = getPrevPeriod(dateRange);
    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : (totalRevenue > 0 ? '+100' : '0');

    const kpis = [
        { id: 'revenue', label: 'Doanh thu', value: formatPrice(totalRevenue), change: `${revenueChange > 0 ? '+' : ''}${revenueChange}%`, icon: '💰', color: '#10b981' },
        { id: 'orders', label: 'Đơn hàng', value: String(orderCount), change: '', icon: '🧾', color: '#3b82f6' },
        { id: 'avg', label: 'TB / đơn', value: formatPrice(avgOrder), change: '', icon: '📊', color: '#8b5cf6' },
        { id: 'customers', label: 'Khách hàng', value: String(uniqueCustomers), change: '', icon: '👥', color: '#f59e0b' },
    ];

    // Hourly chart — follows the selected dateRange filter
    const hourlyData = Array.from({ length: 16 }, (_, i) => {
        const hour = 7 + i; // 7h -> 22h
        const ordersInHour = filteredOrders.filter(o => {
            const d = new Date(o.date_order);
            return d.getHours() === hour;
        });
        return {
            hour: `${hour}h`,
            value: ordersInHour.reduce((sum, o) => sum + (o.amount_total || 0), 0),
            count: ordersInHour.length,
        };
    });
    const maxBarValue = Math.max(...hourlyData.map(d => d.value), 1);
    const chartLabel = dateRange === 'today' ? 'hôm nay' : dateRange === 'week' ? 'tuần này' : 'tháng này';

    // Top products — aggregate from lines matching filtered orders, exclude service products
    const filteredOrderIds = new Set(filteredOrders.map(o => o.id));
    const { products: posProducts = [] } = posData || {};
    const serviceProductIds = new Set(posProducts.filter(p => p.type === 'service').map(p => p.id));
    const productAgg = {};
    for (const line of allLines) {
        const orderId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;
        if (!filteredOrderIds.has(orderId)) continue;
        const prodId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
        if (serviceProductIds.has(prodId)) continue;
        const prodName = Array.isArray(line.product_id) ? line.product_id[1] : (line.product_id || 'Không rõ');
        if (!productAgg[prodName]) productAgg[prodName] = { name: prodName, qty: 0, revenue: 0 };
        productAgg[prodName].qty = Math.round(((productAgg[prodName].qty || 0) + (Number(line.qty) || 0)) * 100) / 100;
        productAgg[prodName].revenue += line.price_subtotal_incl || 0;
    }
    const topProducts = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const maxProductRevenue = topProducts.length > 0 ? topProducts[0].revenue : 1;

    // Recent orders (last 10)
    const recentOrders = [...allOrders].sort((a, b) => {
        const da = new Date(a.date_order || 0);
        const db2 = new Date(b.date_order || 0);
        return db2 - da;
    }).slice(0, 10);

    // ===== Excel Export =====
    const exportToExcel = async (reportType) => {
        setExporting(true);
        try {
            let orders, label, dateLabel;
            if (reportType === 'daily') {
                orders = filterOrders('today');
                label = 'Báo cáo ngày';
                dateLabel = now.toLocaleDateString('vi-VN');
            } else if (reportType === 'weekly') {
                orders = filterOrders('week');
                label = 'Báo cáo tuần';
                dateLabel = `${weekStart.toLocaleDateString('vi-VN')} - ${now.toLocaleDateString('vi-VN')}`;
            } else {
                orders = filterOrders('month');
                label = 'Báo cáo tháng';
                dateLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
            }

            // Get lines for these orders
            const orderIds = new Set(orders.map(o => o.id));
            const lines = allLines.filter((l) => {
                const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id;
                return orderIds.has(oid);
            });

            // Sheet 1: Summary
            const totalRev = orders.reduce((s, o) => s + (o.amount_total || 0), 0);
            const totalTaxReport = orders.reduce((s, o) => s + (o.amount_tax || 0), 0);
            const paidOrders = orders.filter(o => o.state === 'paid' || o.state === 'done' || o.state === 'invoiced');

            const summaryData = [
                [label.toUpperCase()],
                [`POS: ${posConfig?.name || 'SeaPOS'}`],
                [`Ngày: ${dateLabel}`],
                [`Nhân viên: ${authData?.user?.name || ''}`],
                [],
                ['CHỈ SỐ', 'GIÁ TRỊ'],
                ['Tổng đơn hàng', orders.length],
                ['Đơn đã thanh toán', paidOrders.length],
                ['Tổng doanh thu', Math.round(totalRev)],
                ['Tổng thuế', Math.round(totalTaxReport)],
                ['Doanh thu sau thuế', Math.round(totalRev - totalTaxReport)],
                ['TB / đơn', orders.length > 0 ? Math.round(totalRev / orders.length) : 0],
            ];

            // Sheet 2: Order list
            const orderData = [
                ['MÃ ĐƠN', 'NGÀY GIỜ', 'KHÁCH HÀNG', 'TỔNG TIỀN', 'THUẾ', 'TRẠNG THÁI', 'NHÂN VIÊN'],
                ...orders.map(o => [
                    o.pos_reference || o.name,
                    o.date_order ? new Date(o.date_order).toLocaleString('vi-VN') : '',
                    o.partner_id ? (Array.isArray(o.partner_id) ? o.partner_id[1] : o.partner_id) : 'Khách vãng lai',
                    Math.round(o.amount_total || 0),
                    Math.round(o.amount_tax || 0),
                    getStateLabel(o.state),
                    o.user_id ? (Array.isArray(o.user_id) ? o.user_id[1] : o.user_id) : '',
                ]),
            ];

            // Sheet 3: Product summary
            const prodAgg = {};
            for (const line of lines) {
                const prodName = Array.isArray(line.product_id) ? line.product_id[1] : (line.product_id || '');
                if (!prodAgg[prodName]) prodAgg[prodName] = { name: prodName, qty: 0, revenue: 0, discount: 0 };
                prodAgg[prodName].qty += line.qty || 0;
                prodAgg[prodName].revenue += line.price_subtotal_incl || 0;
                if (line.discount > 0) prodAgg[prodName].discount += (line.price_unit * line.qty * line.discount / 100) || 0;
            }
            const productReport = Object.values(prodAgg).sort((a, b) => b.revenue - a.revenue);

            const productData = [
                ['SẢN PHẨM', 'SỐ LƯỢNG', 'DOANH THU', 'CHIẾT KHẤU'],
                ...productReport.map(p => [
                    p.name,
                    p.qty,
                    Math.round(p.revenue),
                    Math.round(p.discount),
                ]),
            ];

            // Build workbook
            const wb = XLSX.utils.book_new();

            const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
            ws1['!cols'] = [{ wch: 25 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, ws1, 'Tổng hợp');

            const ws2 = XLSX.utils.aoa_to_sheet(orderData);
            ws2['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 18 }];
            XLSX.utils.book_append_sheet(wb, ws2, 'Đơn hàng');

            const ws3 = XLSX.utils.aoa_to_sheet(productData);
            ws3['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, ws3, 'Sản phẩm');

            // Generate filename
            const timestamp = now.toISOString().split('T')[0];
            const filename = `SeaPOS_${reportType}_${timestamp}.xlsx`;

            // Download
            XLSX.writeFile(wb, filename);

        } catch (err) {
            alert('Lỗi xuất Excel: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    // ===== Render Dashboard =====
    const renderDashboard = () => (
        <div className="mgmt-dashboard fade-in">
            <div className="mgmt-date-bar">
                <h2 className="mgmt-section-title">📊 Tổng quan kinh doanh</h2>
                <div className="mgmt-date-selector">
                    <button className={`mgmt-date-btn ${dateRange === 'today' ? 'mgmt-date-btn-active' : ''}`} onClick={() => setDateRange('today')}>Hôm nay</button>
                    <button className={`mgmt-date-btn ${dateRange === 'week' ? 'mgmt-date-btn-active' : ''}`} onClick={() => setDateRange('week')}>Tuần này</button>
                    <button className={`mgmt-date-btn ${dateRange === 'month' ? 'mgmt-date-btn-active' : ''}`} onClick={() => setDateRange('month')}>Tháng này</button>
                </div>
            </div>

            {loading ? (
                <div className="mgmt-loading">
                    <span className="login-spinner"></span>
                    <p>Đang tải dữ liệu...</p>
                </div>
            ) : error ? (
                <div className="mgmt-loading">
                    <p>⚠️ {error}</p>
                    <button className="btn btn-primary" onClick={fetchAllData} style={{ marginTop: '12px' }}>🔄 Thử lại</button>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="mgmt-kpi-grid">
                        {kpis.map((kpi) => (
                            <div key={kpi.id} className="mgmt-kpi-card glass-card">
                                <div className="mgmt-kpi-icon" style={{ background: `${kpi.color}20`, color: kpi.color }}>{kpi.icon}</div>
                                <div className="mgmt-kpi-info">
                                    <span className="mgmt-kpi-label">{kpi.label}</span>
                                    <span className="mgmt-kpi-value">{kpi.value}</span>
                                    {kpi.change && <span className="mgmt-kpi-change" style={{ color: kpi.color }}>{kpi.change} so với kỳ trước</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Charts + Top products row */}
                    <div className="mgmt-charts-row">
                        <div className="mgmt-chart-card glass-card">
                            <h3 className="mgmt-card-title">⏰ Doanh thu theo giờ ({chartLabel})</h3>
                            <div className="mgmt-bar-chart">
                                {hourlyData.map((d, i) => (
                                    <div key={i} className="mgmt-bar-col" data-tooltip={d.value > 0 ? `${formatPrice(d.value)}\n${d.count} đơn` : ''}>
                                        <div className="mgmt-bar-wrapper">
                                            <div
                                                className="mgmt-bar"
                                                style={{
                                                    height: `${(d.value / maxBarValue) * 100}%`,
                                                    background: d.value === maxBarValue && d.value > 0
                                                        ? 'linear-gradient(180deg, #10b981, #047857)'
                                                        : 'linear-gradient(180deg, #3b82f6, #1d4ed8)',
                                                    boxShadow: d.value === maxBarValue && d.value > 0 ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none'
                                                }}
                                            />
                                        </div>
                                        <span className="mgmt-bar-label">{d.hour}</span>
                                    </div>
                                ))}
                            </div>
                            {filteredOrders.length === 0 && (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>Chưa có dữ liệu {chartLabel}</p>
                            )}
                        </div>

                        <div className="mgmt-top-products glass-card">
                            <h3 className="mgmt-card-title">🏆 Top sản phẩm bán chạy</h3>
                            {topProducts.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Chưa có dữ liệu</p>
                            ) : (
                                <div className="mgmt-top-list">
                                    {topProducts.map((p, i) => (
                                        <div key={i} className="mgmt-top-item">
                                            <div className="mgmt-top-rank">#{i + 1}</div>
                                            <div className="mgmt-top-info">
                                                <div className="mgmt-top-name-row">
                                                    <span className="mgmt-top-name">{p.name}</span>
                                                    <span className="mgmt-top-revenue">{formatPrice(p.revenue)}</span>
                                                </div>
                                                <div className="mgmt-top-bar-bg">
                                                    <div className="mgmt-top-bar-fill" style={{ width: `${(p.revenue / maxProductRevenue) * 100}%` }} />
                                                </div>
                                                <span className="mgmt-top-qty">{p.qty} đã bán</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recent orders */}
                    <div className="mgmt-recent glass-card">
                        <h3 className="mgmt-card-title">🕐 Đơn hàng gần đây</h3>
                        {recentOrders.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Chưa có đơn hàng</p>
                        ) : (
                            <div className="mgmt-table">
                                <div className="mgmt-table-header">
                                    <span className="mgmt-th" style={{ flex: 1.5 }}>Mã đơn</span>
                                    <span className="mgmt-th" style={{ flex: 1.5 }}>Ngày giờ</span>
                                    <span className="mgmt-th" style={{ flex: 2 }}>Khách hàng</span>
                                    <span className="mgmt-th" style={{ flex: 1.2, textAlign: 'right' }}>Tổng tiền</span>
                                    <span className="mgmt-th" style={{ flex: 1, textAlign: 'center' }}>Trạng thái</span>
                                </div>
                                {recentOrders.map((order) => (
                                    <div key={order.id} className="mgmt-table-row">
                                        <span className="mgmt-td mgmt-td-ref" style={{ flex: 1.5 }}>{order.pos_reference || order.name}</span>
                                        <span className="mgmt-td" style={{ flex: 1.5 }}>{formatDate(order.date_order)}</span>
                                        <span className="mgmt-td" style={{ flex: 2 }}>
                                            {order.partner_id ? (Array.isArray(order.partner_id) ? order.partner_id[1] : order.partner_id) : 'Khách vãng lai'}
                                        </span>
                                        <span className="mgmt-td mgmt-td-total" style={{ flex: 1.2, textAlign: 'right' }}>{formatPrice(order.amount_total)}</span>
                                        <span className="mgmt-td" style={{ flex: 1, textAlign: 'center' }}>
                                            <span className={`mgmt-status ${(order.state === 'paid' || order.state === 'done' || order.state === 'invoiced') ? 'mgmt-status-paid' : order.state === 'cancel' ? 'mgmt-status-cancel' : 'mgmt-status-draft'}`}>
                                                {getStateLabel(order.state)}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );

    // ===== Render Reports =====
    const renderReports = () => {
        const reportConfigs = [
            {
                id: 'daily', icon: '📅', label: 'Báo cáo ngày',
                desc: `Ngày ${now.toLocaleDateString('vi-VN')} — ${filterOrders('today').length} đơn, ${formatPrice(filterOrders('today').reduce((s, o) => s + (o.amount_total || 0), 0))}`,
            },
            {
                id: 'weekly', icon: '📆', label: 'Báo cáo tuần',
                desc: `${weekStart.toLocaleDateString('vi-VN')} → ${now.toLocaleDateString('vi-VN')} — ${filterOrders('week').length} đơn, ${formatPrice(filterOrders('week').reduce((s, o) => s + (o.amount_total || 0), 0))}`,
            },
            {
                id: 'monthly', icon: '📊', label: 'Báo cáo tháng',
                desc: `Tháng ${now.getMonth() + 1}/${now.getFullYear()} — ${filterOrders('month').length} đơn, ${formatPrice(filterOrders('month').reduce((s, o) => s + (o.amount_total || 0), 0))}`,
            },
        ];

        return (
            <div className="mgmt-reports fade-in">
                <div className="mgmt-date-bar">
                    <h2 className="mgmt-section-title">📋 Báo cáo & Xuất Excel</h2>
                    <button className="btn btn-secondary" onClick={fetchAllData} disabled={loading}>
                        🔄 Làm mới dữ liệu
                    </button>
                </div>

                {loading ? (
                    <div className="mgmt-loading">
                        <span className="login-spinner"></span>
                        <p>Đang tải dữ liệu...</p>
                    </div>
                ) : (
                    <>
                        <div className="mgmt-report-grid">
                            {reportConfigs.map((r) => (
                                <div key={r.id} className="mgmt-report-card glass-card">
                                    <div className="mgmt-report-icon">{r.icon}</div>
                                    <div className="mgmt-report-info">
                                        <h3 className="mgmt-report-title">{r.label}</h3>
                                        <p className="mgmt-report-desc">{r.desc}</p>
                                    </div>
                                    <div className="mgmt-report-actions">
                                        <button
                                            className="btn btn-primary mgmt-report-btn"
                                            onClick={() => exportToExcel(r.id)}
                                            disabled={exporting}
                                        >
                                            {exporting ? '⏳...' : '📥 Xuất Excel'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Quick summary */}
                        <div className="mgmt-report-summary glass-card">
                            <h3 className="mgmt-card-title">📈 Tóm tắt 30 ngày</h3>
                            <div className="mgmt-summary-grid">
                                <div className="mgmt-summary-item">
                                    <span className="mgmt-summary-label">Tổng doanh thu</span>
                                    <span className="mgmt-summary-value" style={{ color: '#10b981' }}>{formatPrice(allOrders.filter(o => o.state === 'paid' || o.state === 'done' || o.state === 'invoiced').reduce((s, o) => s + (o.amount_total || 0), 0))}</span>
                                </div>
                                <div className="mgmt-summary-item">
                                    <span className="mgmt-summary-label">Tổng đơn hàng</span>
                                    <span className="mgmt-summary-value" style={{ color: '#3b82f6' }}>{allOrders.length}</span>
                                </div>
                                <div className="mgmt-summary-item">
                                    <span className="mgmt-summary-label">Tổng thuế</span>
                                    <span className="mgmt-summary-value" style={{ color: '#f59e0b' }}>{formatPrice(allOrders.reduce((s, o) => s + (o.amount_tax || 0), 0))}</span>
                                </div>
                                <div className="mgmt-summary-item">
                                    <span className="mgmt-summary-label">Đơn đã TT</span>
                                    <span className="mgmt-summary-value" style={{ color: '#10b981' }}>{allOrders.filter(o => o.state === 'paid' || o.state === 'done' || o.state === 'invoiced').length}</span>
                                </div>
                                <div className="mgmt-summary-item">
                                    <span className="mgmt-summary-label">Đơn nháp</span>
                                    <span className="mgmt-summary-value" style={{ color: '#8b5cf6' }}>{allOrders.filter(o => o.state === 'draft').length}</span>
                                </div>
                                <div className="mgmt-summary-item">
                                    <span className="mgmt-summary-label">Đơn hủy</span>
                                    <span className="mgmt-summary-value" style={{ color: '#ef4444' }}>{allOrders.filter(o => o.state === 'cancel').length}</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ===== Render Settings =====
    const fetchPrinters = async () => {
        setPrintersLoading(true);
        try {
            if (window.electronAPI && window.electronAPI.getPrinters) {
                const list = await window.electronAPI.getPrinters();
                setPrinters(list || []);
            }
        } catch (err) {
            console.error('Failed to load printers:', err);
        } finally {
            setPrintersLoading(false);
        }
    };

    const handleSelectPrinter = (name) => {
        setSelectedPrinter(name);
        localStorage.setItem('billPrinterName', name);
        setTestPrintDone(false);
    };

    const handleClearPrinter = () => {
        setSelectedPrinter('');
        localStorage.removeItem('billPrinterName');
        setTestPrintDone(false);
    };

    const handleSelectLabelPrinter = (name) => {
        setSelectedLabelPrinter(name);
        localStorage.setItem('labelPrinterName', name);
    };

    const handleClearLabelPrinter = () => {
        setSelectedLabelPrinter('');
        localStorage.removeItem('labelPrinterName');
    };

    const handleTestPrint = async () => {
        await printBill({
            storeName: posConfig?.name || 'SeaPOS',
            billTitle: 'IN THỬ MÁY IN',
            orderRef: 'TEST-001',
            dateStr: new Date().toLocaleString('vi-VN'),
            customerName: 'Khách thử nghiệm',
            staffName: authData?.user?.name || 'Admin',
            lines: [
                { name: 'Sản phẩm mẫu A', priceUnit: 50000, qty: 2, discount: 0, subtotal: 100000, uom: 'Cái' },
                { name: 'Sản phẩm mẫu B', priceUnit: 30000, qty: 1, discount: 10, subtotal: 27000, uom: 'Kg' },
            ],
            totalAmount: 127000,
            discountAmount: 3000,
        });
        setTestPrintDone(true);
        setTimeout(() => setTestPrintDone(false), 3000);
    };

    const handleTestLabelPrint = async () => {
        await printLabel({
            posName: posConfig?.name || 'SeaPOS',
            orderItems: [
                {
                    product: { name: 'Sản phẩm mẫu A', print_product_label: true },
                    quantity: 1,
                    note: 'Ghi chú thử nghiệm',
                },
            ],
            ecommerceCode: 'TEST-001',
        });
        setTestLabelPrintDone(true);
        setTimeout(() => setTestLabelPrintDone(false), 3000);
    };

    // Customer Display handlers
    const handleSaveTitle = () => {
        if (customerTitle.trim()) {
            localStorage.setItem('customerDisplayTitle', customerTitle);
        } else {
            localStorage.removeItem('customerDisplayTitle');
        }
        setTitleSaved(true);
        setTimeout(() => setTitleSaved(false), 2000);
    };

    const handleSelectVideo = async () => {
        if (!window.electronAPI || !window.electronAPI.selectVideoFile) {
            alert('Chức năng này chỉ hoạt động trong ứng dụng Electron.');
            return;
        }
        setVideoUploading(true);
        try {
            const result = await window.electronAPI.selectVideoFile();
            if (result.success && result.filePath) {
                setCustomerVideoPath(result.filePath);
                localStorage.setItem('customerVideoPath', result.filePath);
            }
        } catch (err) {
            console.error('Failed to select video:', err);
            alert('Lỗi khi chọn video: ' + err.message);
        } finally {
            setVideoUploading(false);
        }
    };

    const handleClearVideo = () => {
        setCustomerVideoPath('');
        localStorage.removeItem('customerVideoPath');
    };

    const renderSettings = () => (
        <div className="mgmt-settings fade-in">
            <div className="mgmt-date-bar">
                <h2 className="mgmt-section-title">⚙️ Cài đặt</h2>
            </div>

            {/* Printer Settings */}
            <div className="mgmt-settings-section glass-card">
                <h3 className="mgmt-card-title">🖨️ Máy in Bill</h3>
                <p className="mgmt-settings-desc">
                    Chọn máy in để in bill trực tiếp (không hiển popup). Nếu không chọn, hệ thống sẽ mở cửa sổ in của trình duyệt.
                </p>

                <div className="mgmt-printer-controls">
                    <div className="mgmt-printer-select-row">
                        <select
                            className="input-field mgmt-printer-dropdown"
                            value={selectedPrinter}
                            onChange={(e) => handleSelectPrinter(e.target.value)}
                            onFocus={() => { if (printers.length === 0) fetchPrinters(); }}
                        >
                            <option value="">🖨️ -- Chọn máy in --</option>
                            {printers.map((p) => (
                                <option key={p.name} value={p.name}>
                                    {p.name} {p.isDefault ? '(★ Mặc định)' : ''}
                                </option>
                            ))}
                        </select>
                        <button
                            className="btn btn-secondary"
                            onClick={fetchPrinters}
                            disabled={printersLoading}
                            title="Làm mới danh sách máy in"
                        >
                            {printersLoading ? '⏳' : '🔄'}
                        </button>
                    </div>

                    {selectedPrinter && (
                        <div className="mgmt-printer-status">
                            <div className="mgmt-printer-current">
                                <span className="mgmt-printer-badge">✅ Đang sử dụng: <strong>{selectedPrinter}</strong></span>
                                <button className="btn btn-sm btn-danger" onClick={handleClearPrinter}>✕ Xóa</button>
                            </div>
                            <div className="mgmt-printer-actions">
                                <button className="btn btn-primary" onClick={handleTestPrint}>
                                    {testPrintDone ? '✅ Đã gửi lệnh in!' : '🧪 In thử'}
                                </button>
                            </div>
                        </div>
                    )}

                    {!selectedPrinter && (
                        <div className="mgmt-printer-hint">
                            ℹ️ Chưa chọn máy in. Bill sẽ hiển popup in của trình duyệt khi in.
                        </div>
                    )}
                </div>
            </div>

            {/* Label Printer Settings (only if enabled in POS config) */}
            {posConfig.print_product_label && (
                <div className="mgmt-settings-section glass-card">
                    <h3 className="mgmt-card-title">🏷️ Máy in Tem</h3>
                    <p className="mgmt-settings-desc">
                        Chọn máy in để in tem sản phẩm tự động sau khi thanh toán. Nếu không chọn, hệ thống sẽ mở cửa sổ in của trình duyệt.
                    </p>

                    <div className="mgmt-printer-controls">
                        <div className="mgmt-printer-select-row">
                            <select
                                className="input-field mgmt-printer-dropdown"
                                value={selectedLabelPrinter}
                                onChange={(e) => handleSelectLabelPrinter(e.target.value)}
                                onFocus={() => { if (printers.length === 0) fetchPrinters(); }}
                            >
                                <option value="">🏷️ -- Chọn máy in tem --</option>
                                {printers.map((p) => (
                                    <option key={p.name} value={p.name}>
                                        {p.name} {p.isDefault ? '(★ Mặc định)' : ''}
                                    </option>
                                ))}
                            </select>
                            <button
                                className="btn btn-secondary"
                                onClick={fetchPrinters}
                                disabled={printersLoading}
                                title="Làm mới danh sách máy in"
                            >
                                {printersLoading ? '⏳' : '🔄'}
                            </button>
                        </div>

                        {selectedLabelPrinter && (
                            <div className="mgmt-printer-status">
                                <div className="mgmt-printer-current">
                                    <span className="mgmt-printer-badge">✅ Đang sử dụng: <strong>{selectedLabelPrinter}</strong></span>
                                    <button className="btn btn-sm btn-danger" onClick={handleClearLabelPrinter}>✕ Xóa</button>
                                </div>
                                <div className="mgmt-printer-actions">
                                    <button className="btn btn-primary" onClick={handleTestLabelPrint}>
                                        {testLabelPrintDone ? '✅ Đã gửi lệnh in!' : '🧪 In thử tem'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {!selectedLabelPrinter && (
                            <div className="mgmt-printer-hint">
                                ℹ️ Chưa chọn máy in tem. Tem sẽ hiển popup in của trình duyệt.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Customer Display Settings */}
            <div className="mgmt-settings-section glass-card">
                <h3 className="mgmt-card-title">📺 Màn hình khách hàng</h3>
                <p className="mgmt-settings-desc">
                    Tùy chỉnh tiêu đề và video quảng cáo hiển thị trên màn hình khách hàng.
                </p>

                <div className="mgmt-printer-controls">
                    {/* Title Setting */}
                    <div className="mgmt-customer-field">
                        <label className="mgmt-field-label">Tiêu đề hiển thị</label>
                        <div className="mgmt-printer-select-row">
                            <input
                                type="text"
                                className="input-field mgmt-printer-dropdown"
                                value={customerTitle}
                                onChange={(e) => setCustomerTitle(e.target.value)}
                                placeholder="Ví dụ: Welcome to DannyGreen Retail"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); }}
                            />
                            <button className="btn btn-primary" onClick={handleSaveTitle}>
                                {titleSaved ? '✅ Đã lưu!' : '💾 Lưu'}
                            </button>
                        </div>
                        {!localStorage.getItem('customerDisplayTitle') && (
                            <div className="mgmt-printer-hint">
                                ℹ️ Chưa đặt tiêu đề. Sẽ hiển thị tên POS mặc định.
                            </div>
                        )}
                    </div>

                    {/* Video Setting */}
                    <div className="mgmt-customer-field" style={{ marginTop: '16px' }}>
                        <label className="mgmt-field-label">Video quảng cáo</label>
                        <div className="mgmt-printer-select-row">
                            <button
                                className="btn btn-primary"
                                onClick={handleSelectVideo}
                                disabled={videoUploading}
                            >
                                {videoUploading ? '⏳ Đang tải...' : '📂 Chọn video từ máy'}
                            </button>
                        </div>

                        {customerVideoPath && (
                            <div className="mgmt-printer-status">
                                <div className="mgmt-printer-current">
                                    <span className="mgmt-printer-badge">✅ Video: <strong>{customerVideoPath.split(/[\\/]/).pop()}</strong></span>
                                    <button className="btn btn-sm btn-danger" onClick={handleClearVideo}>✕ Xóa</button>
                                </div>
                            </div>
                        )}

                        {!customerVideoPath && (
                            <div className="mgmt-printer-hint">
                                ℹ️ Chưa chọn video. Sẽ sử dụng video mặc định (video.mp4).
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // ===== Placeholders =====
    const renderPlaceholder = (icon, title, desc) => (
        <div className="mgmt-placeholder fade-in">
            <div className="mgmt-date-bar">
                <h2 className="mgmt-section-title">{icon} {title}</h2>
            </div>
            <div className="mgmt-coming-soon glass-card">
                <span className="mgmt-coming-icon">{icon}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
                <span className="mgmt-coming-badge">🚧 Đang phát triển</span>
            </div>
        </div>
    );

    const renderContent = () => {
        switch (activeMenu) {
            case 'dashboard': return renderDashboard();
            case 'reports': return renderReports();
            case 'products': return renderPlaceholder('📦', 'Quản lý sản phẩm', 'Thêm, sửa, xóa sản phẩm, quản lý danh mục, giá bán, tồn kho');
            case 'customers': return renderPlaceholder('👥', 'Quản lý khách hàng', 'Danh sách khách hàng, điểm tích lũy, lịch sử mua hàng');
            case 'employees': return renderPlaceholder('🧑‍💼', 'Quản lý nhân viên', 'Phân quyền, ca làm việc, hiệu suất bán hàng');
            case 'settings': return renderSettings();
            default: return renderDashboard();
        }
    };

    return (
        <div className="mgmt-screen">
            {/* Sidebar */}
            <aside className="mgmt-sidebar">
                <div className="mgmt-sidebar-header">
                    <div className="mgmt-logo">
                        <span className="mgmt-logo-icon">🔥</span>
                        <div className="mgmt-logo-text">
                            <span className="mgmt-logo-name">SeaPOS</span>
                            <span className="mgmt-logo-sub">Quản lý</span>
                        </div>
                    </div>
                </div>

                <nav className="mgmt-nav">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            className={`mgmt-nav-btn ${activeMenu === item.id ? 'mgmt-nav-btn-active' : ''}`}
                            onClick={() => setActiveMenu(item.id)}
                        >
                            <span className="mgmt-nav-icon">{item.icon}</span>
                            <span className="mgmt-nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="mgmt-sidebar-footer">
                    <div className="mgmt-user-info">
                        <div className="mgmt-user-avatar">👤</div>
                        <div className="mgmt-user-detail">
                            <span className="mgmt-user-name">{authData?.user?.name || 'Admin'}</span>
                            <span className="mgmt-user-role">{posConfig?.name || 'POS'}</span>
                        </div>
                    </div>
                    <button className="btn btn-secondary mgmt-back-btn" onClick={onBack}>
                        ← Quay lại POS
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="mgmt-main">
                {renderContent()}
            </main>
        </div>
    );
}

export default ManagementScreen;

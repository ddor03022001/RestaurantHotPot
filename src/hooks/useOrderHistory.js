import { useState, useCallback } from 'react';

/**
 * Mock data for dev/browser environment (no Electron)
 */
const MOCK_ORDERS = [
    { id: 1, name: 'POS/001', pos_reference: 'Order 00001-001-0001', date_order: '2026-02-25 10:30:00', partner_id: [1, 'Nguyễn Văn A'], amount_total: 450000, state: 'paid', lines: [1, 2, 3] },
    { id: 2, name: 'POS/002', pos_reference: 'Order 00001-001-0002', date_order: '2026-02-25 12:00:00', partner_id: false, amount_total: 120000, state: 'paid', lines: [4, 5] },
    { id: 3, name: 'POS/003', pos_reference: 'Order 00001-001-0003', date_order: '2026-02-24 18:45:00', partner_id: [2, 'Trần Thị B'], amount_total: 680000, state: 'done', lines: [6, 7, 8] },
];

const MOCK_LINES = [
    { id: 1, product_id: [1, 'Phở bò'], qty: 2, price_unit: 45000, discount: 0, price_subtotal_incl: 90000 },
    { id: 2, product_id: [2, 'Cà phê sữa'], qty: 3, price_unit: 20000, discount: 10, price_subtotal_incl: 54000 },
    { id: 3, product_id: [3, 'Bánh flan'], qty: 1, price_unit: 15000, discount: 0, price_subtotal_incl: 15000 },
];

/**
 * Custom hook to manage order history state & fetching.
 * Used by both TablePage and OrderScreen (retail mode).
 * 
 * @param {number} configId - POS config ID for fetching orders
 * @returns {object} History state and actions
 */
export function useOrderHistory(configId) {
    const [showHistory, setShowHistory] = useState(false);
    const [historyOrders, setHistoryOrders] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');

    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orderLines, setOrderLines] = useState([]);
    const [linesLoading, setLinesLoading] = useState(false);

    /**
     * Open the history popup and fetch orders (last 7 days)
     */
    const openHistory = useCallback(async () => {
        setShowHistory(true);
        setSelectedOrder(null);
        setOrderLines([]);
        setHistoryLoading(true);
        setHistoryError('');
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.getPosOrders(configId, 7);
                if (result.success) {
                    setHistoryOrders(result.orders || []);
                } else {
                    setHistoryError(result.error || 'Không thể tải đơn hàng');
                }
            } else {
                // Dev mock
                await new Promise((r) => setTimeout(r, 500));
                setHistoryOrders(MOCK_ORDERS);
            }
        } catch (err) {
            setHistoryError(err.message);
        } finally {
            setHistoryLoading(false);
        }
    }, [configId]);

    /**
     * View detail of a specific order (fetch lines)
     */
    const viewOrderDetail = useCallback(async (order) => {
        setSelectedOrder(order);
        setLinesLoading(true);
        try {
            if (window.electronAPI && order.lines && order.lines.length > 0) {
                const result = await window.electronAPI.getPosOrderLines(order.lines);
                if (result.success) {
                    setOrderLines(result.lines || []);
                }
            } else {
                // Dev mock
                await new Promise((r) => setTimeout(r, 300));
                setOrderLines(MOCK_LINES);
            }
        } catch (err) {
            setOrderLines([]);
        } finally {
            setLinesLoading(false);
        }
    }, []);

    /**
     * Close history and reset all state
     */
    const closeHistory = useCallback(() => {
        setShowHistory(false);
        setSelectedOrder(null);
        setHistoryOrders([]);
        setOrderLines([]);
        setHistoryError('');
    }, []);

    /**
     * Go back to order list (from detail view)
     */
    const backToList = useCallback(() => {
        setSelectedOrder(null);
        setOrderLines([]);
    }, []);

    return {
        // State
        showHistory,
        historyOrders,
        historyLoading,
        historyError,
        selectedOrder,
        orderLines,
        linesLoading,

        // Actions
        openHistory,
        viewOrderDetail,
        closeHistory,
        backToList,
    };
}

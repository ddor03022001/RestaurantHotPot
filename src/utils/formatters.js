/**
 * Shared formatting & helper utilities for SeaPOS
 */

/**
 * Format a number as Vietnamese currency (e.g. "45.000đ")
 */
export const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN').format(Math.round(price || 0)) + 'đ';
};

/**
 * Format an ISO/Odoo date string to Vietnamese locale (dd/MM/yyyy HH:mm)
 */
export const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

/**
 * Get a human-readable label for a POS order state
 */
export const getStateLabel = (state) => {
    const map = {
        draft: 'Nháp',
        paid: 'Đã thanh toán',
        done: 'Hoàn tất',
        invoiced: 'Đã xuất HĐ',
        cancel: 'Đã hủy',
    };
    return map[state] || state;
};

/**
 * Get a CSS class name for a POS order state badge
 */
export const getStateClass = (state) => {
    if (state === 'paid' || state === 'done' || state === 'invoiced') return 'history-state-paid';
    if (state === 'cancel') return 'history-state-cancel';
    return 'history-state-draft';
};

/**
 * Check if an order state counts as "completed" (paid/done/invoiced)
 */
export const isOrderCompleted = (state) => {
    return state === 'paid' || state === 'done' || state === 'invoiced';
};

/**
 * Get customer display name from an Odoo partner_id field
 * partner_id can be [id, name], id, or false
 */
export const getCustomerName = (partnerId, fallback = 'Khách vãng lai') => {
    if (!partnerId) return fallback;
    if (Array.isArray(partnerId)) return partnerId[1] || fallback;
    return String(partnerId);
};

/**
 * Get product display name from an Odoo product_id field
 */
export const getProductName = (productId, fallback = 'Không rõ') => {
    if (!productId) return fallback;
    if (Array.isArray(productId)) return productId[1] || fallback;
    return String(productId);
};

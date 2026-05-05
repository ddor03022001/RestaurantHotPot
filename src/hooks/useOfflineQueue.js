import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'hotpos_offline_orders';

/**
 * Custom hook to manage offline order queue.
 * When createPosOrder fails (e.g. network down), orders are saved to localStorage
 * and can be retried later when connectivity is restored.
 */
export function useOfflineQueue() {
    const [failedOrders, setFailedOrders] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const [isRetrying, setIsRetrying] = useState(false);

    // Persist to localStorage whenever failedOrders changes
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(failedOrders));
        } catch (e) {
            console.error('Failed to persist offline queue:', e);
        }
    }, [failedOrders]);

    // Add a failed order to the queue
    const addFailedOrder = useCallback((orderData, error) => {
        const entry = {
            id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            orderData,
            error: typeof error === 'string' ? error : (error?.message || 'Unknown error'),
            timestamp: new Date().toISOString(),
            orderName: orderData?.data?.name || 'Unknown',
        };
        setFailedOrders(prev => [...prev, entry]);
        return entry;
    }, []);

    // Retry sending all failed orders
    const retryAll = useCallback(async () => {
        if (!window.electronAPI?.createPosOrder || failedOrders.length === 0) {
            return { success: 0, failed: 0 };
        }

        setIsRetrying(true);
        let successCount = 0;
        let failCount = 0;
        const remaining = [];

        for (const entry of failedOrders) {
            try {
                const res = await window.electronAPI.createPosOrder(entry.orderData);
                if (res.success) {
                    successCount++;
                } else {
                    failCount++;
                    remaining.push({
                        ...entry,
                        error: res.error || 'Unknown error',
                        lastRetry: new Date().toISOString(),
                    });
                }
            } catch (err) {
                failCount++;
                remaining.push({
                    ...entry,
                    error: err.message || 'Unknown error',
                    lastRetry: new Date().toISOString(),
                });
            }
        }

        setFailedOrders(remaining);
        setIsRetrying(false);
        return { success: successCount, failed: failCount };
    }, [failedOrders]);

    // Remove a single order from the queue
    const removeOrder = useCallback((id) => {
        setFailedOrders(prev => prev.filter(o => o.id !== id));
    }, []);

    // Clear all failed orders
    const clearAll = useCallback(() => {
        setFailedOrders([]);
    }, []);

    return {
        failedOrders,
        count: failedOrders.length,
        isRetrying,
        addFailedOrder,
        retryAll,
        removeOrder,
        clearAll,
    };
}

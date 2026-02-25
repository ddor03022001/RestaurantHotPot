import React, { useState, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import PosSelectPage from './pages/PosSelectPage';
import TablePage from './pages/TablePage';
import OrderScreen from './pages/OrderScreen';
import PaymentScreen from './pages/PaymentScreen';

// Initialize 16 fixed tables
const createInitialTables = () => {
    return Array.from({ length: 16 }, (_, i) => ({
        id: i + 1,
        number: i + 1,
        status: 'available', // available | occupied | merged
        mergedWith: null,
        mergedTables: [],
        guestCount: 0,
        orderTime: null,
        orderItems: [], // [{ product, quantity }]
    }));
};

function App() {
    const [authData, setAuthData] = useState(null);
    const [posConfig, setPosConfig] = useState(null);
    const [posData, setPosData] = useState(null); // { products, customers, categories }
    const [tables, setTables] = useState(createInitialTables);
    const [activeTableId, setActiveTableId] = useState(null);
    const [screen, setScreen] = useState('tables'); // 'tables' | 'order' | 'payment'

    const handleLogin = (data) => {
        setAuthData(data);
    };

    const handleLogout = () => {
        setAuthData(null);
        setPosConfig(null);
        setPosData(null);
        setTables(createInitialTables());
        setActiveTableId(null);
        setScreen('tables');
    };

    const handleSelectPos = (config, data) => {
        setPosConfig(config);
        setPosData(data);
        setTables(createInitialTables());
        setScreen('tables');
    };

    const handleBackToPos = () => {
        setPosConfig(null);
        setPosData(null);
        setTables(createInitialTables());
        setActiveTableId(null);
        setScreen('tables');
    };

    // Table operations — lifted to App so state persists
    const updateTable = useCallback((tableId, updates) => {
        setTables((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, ...updates } : t))
        );
    }, []);

    const updateTables = useCallback((updaterFn) => {
        setTables(updaterFn);
    }, []);

    const handleOpenTableOrder = (tableId) => {
        setActiveTableId(tableId);
        setScreen('order');
    };

    const handleBackToTables = () => {
        setActiveTableId(null);
        setScreen('tables');
    };

    const handleGoToPayment = () => {
        setScreen('payment');
    };

    const handleBackToOrder = () => {
        setScreen('order');
    };

    const handlePaymentComplete = () => {
        // Clear table after payment
        if (activeTableId) {
            const table = tables.find((t) => t.id === activeTableId);
            if (table) {
                // Also clear merged sub-tables
                setTables((prev) =>
                    prev.map((t) => {
                        if (t.id === activeTableId) {
                            return { ...t, status: 'available', guestCount: 0, orderTime: null, mergedTables: [], mergedWith: null, orderItems: [] };
                        }
                        if (t.mergedWith === activeTableId) {
                            return { ...t, status: 'available', mergedWith: null, guestCount: 0, orderTime: null, orderItems: [] };
                        }
                        return t;
                    })
                );
            }
        }
        setActiveTableId(null);
        setScreen('tables');
    };

    const activeTable = activeTableId ? tables.find((t) => t.id === activeTableId) : null;

    // Determine which screen to show
    const renderCurrentScreen = () => {
        if (!authData) {
            return <LoginPage onLogin={handleLogin} />;
        }
        if (!posConfig) {
            return (
                <PosSelectPage
                    authData={authData}
                    onSelectPos={handleSelectPos}
                    onLogout={handleLogout}
                />
            );
        }

        if (screen === 'payment' && activeTable) {
            return (
                <PaymentScreen
                    authData={authData}
                    posConfig={posConfig}
                    posData={posData}
                    table={activeTable}
                    onBack={handleBackToOrder}
                    onComplete={handlePaymentComplete}
                />
            );
        }

        if (screen === 'order' && activeTable) {
            return (
                <OrderScreen
                    authData={authData}
                    posConfig={posConfig}
                    posData={posData}
                    table={activeTable}
                    updateTable={updateTable}
                    onBack={handleBackToTables}
                    onLogout={handleLogout}
                    onGoToPayment={handleGoToPayment}
                />
            );
        }

        return (
            <TablePage
                authData={authData}
                posConfig={posConfig}
                posData={posData}
                tables={tables}
                setTables={updateTables}
                onBack={handleBackToPos}
                onLogout={handleLogout}
                onOpenTableOrder={handleOpenTableOrder}
            />
        );
    };

    return (
        <HashRouter>
            <Routes>
                <Route path="/" element={renderCurrentScreen()} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
    );
}

export default App;

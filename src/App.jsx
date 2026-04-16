import React, { useState, useCallback, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import PosSelectPage from './pages/PosSelectPage';
import TablePage from './pages/TablePage';
import OrderScreen from './pages/OrderScreen';
import PaymentScreen from './pages/PaymentScreen';
import ManagementScreen from './pages/ManagementScreen';
import CustomerScreen from './pages/CustomerScreen';

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

const createInitialTablesData = (data) => {
    let tables = [];
    for (let i = 0; i < data.length; i++) {
        tables.push({
            id: data[i].id,
            number: data[i].name,
            status: 'available',
            mergedWith: null,
            mergedTables: [],
            guestCount: 0,
            orderTime: null,
            orderItems: [],
        })
    }
    return tables;
}

// Virtual counter table for retail mode
const createRetailCounter = () => ({
    id: 0,
    number: 0,
    status: 'occupied',
    mergedWith: null,
    mergedTables: [],
    guestCount: 1,
    orderTime: new Date().toISOString(),
    orderItems: [],
});

function App() {
    const [authData, setAuthData] = useState(null);
    const [posConfig, setPosConfig] = useState(null);
    const [posData, setPosData] = useState(null); // { products, customers, categories }
    const [tables, setTables] = useState(createInitialTables);
    const [activeTableId, setActiveTableId] = useState(null);
    const [screen, setScreen] = useState('tables'); // 'tables' | 'order' | 'payment' | 'management'
    const [retailCounter, setRetailCounter] = useState(createRetailCounter); // Persistent retail counter
    const [posMode, setPosMode] = useState(() => {
        return localStorage.getItem('hotpos_mode') || 'restaurant';
    });

    // Persist mode to localStorage
    useEffect(() => {
        localStorage.setItem('hotpos_mode', posMode);
    }, [posMode]);

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
        // Keep posMode on logout — it's a preference
    };

    const handleSelectPos = (config, data) => {
        setPosConfig(config);
        setPosData(data);
        if (data.tables && data.tables.length > 0) {
            const tables = createInitialTablesData(data.tables);
            setTables(tables);
        } else {
            setTables(createInitialTables());
        }
        if (posMode === 'retail') {
            // Go directly to order screen with a virtual counter
            setActiveTableId(0);
            setScreen('order');
        } else {
            setScreen('tables');
        }
    };

    const handleBackToPos = () => {
        setPosConfig(null);
        setPosData(null);
        setTables(createInitialTables());
        setActiveTableId(null);
        setScreen('tables');
    };

    const handleCloseSession = async () => {
        if (!posConfig?.session?.id) return { success: false, error: 'Không có phiên POS' };
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.closePosSession(posConfig.session.id);
                if (result.success) {
                    handleBackToPos();
                }
                return result;
            } else {
                // Browser dev mock
                await new Promise((r) => setTimeout(r, 500));
                handleBackToPos();
                return { success: true };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    // Table operations — lifted to App so state persists
    const updateTable = useCallback((tableId, updates) => {
        if (tableId === 0) {
            // Update the virtual retail counter
            setRetailCounter((prev) => ({ ...prev, ...updates }));
            return;
        }
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
        if (posMode === 'retail') {
            // In retail mode, go back to POS select
            handleBackToPos();
            return;
        }
        setActiveTableId(null);
        setScreen('tables');
    };

    const handleGoToPayment = () => {
        setScreen('payment');
    };

    const handleBackToOrder = () => {
        setScreen('order');
    };

    const handleGoToManagement = () => {
        setScreen('management');
    };

    const handleBackFromManagement = () => {
        if (posMode === 'retail') {
            setActiveTableId(0);
            setScreen('order');
        } else {
            setScreen('tables');
        }
    };

    const handlePaymentComplete = () => {
        if (posMode === 'retail') {
            // In retail mode, reset counter and stay on order screen for next order
            setRetailCounter(createRetailCounter());
            setActiveTableId(0);
            setScreen('order');
            return;
        }
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

    const handleToggleMode = (mode) => {
        setPosMode(mode);
        if (mode === 'retail' && posConfig) {
            // Switch to retail: go to order screen with virtual counter
            setActiveTableId(0);
            setScreen('order');
        } else if (mode === 'restaurant' && posConfig) {
            // Switch to restaurant: go to table page
            setActiveTableId(null);
            setScreen('tables');
        }
    };

    // For retail mode, use a stateful virtual counter table (id=0)
    const activeTable = activeTableId === 0
        ? retailCounter
        : (activeTableId ? tables.find((t) => t.id === activeTableId) : null);

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

        if (screen === 'management') {
            return (
                <ManagementScreen
                    authData={authData}
                    posConfig={posConfig}
                    posData={posData}
                    onBack={handleBackFromManagement}
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
                    posMode={posMode}
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
                    posMode={posMode}
                    onToggleMode={handleToggleMode}
                    onCloseSession={handleCloseSession}
                    onGoToManagement={handleGoToManagement}
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
                onCloseSession={handleCloseSession}
                onOpenTableOrder={handleOpenTableOrder}
                posMode={posMode}
                onToggleMode={handleToggleMode}
                onGoToManagement={handleGoToManagement}
            />
        );
    };

    return (
        <HashRouter>
            <Routes>
                <Route path="/customer-display" element={<CustomerScreen />} />
                <Route path="/" element={renderCurrentScreen()} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
    );
}

export default App;

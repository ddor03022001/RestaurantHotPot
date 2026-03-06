import React from 'react';
import './TableCard.css';

function TableCard({ table, index, onClick, onClose }) {
    const statusClass = `table-card-${table.status}`;

    // Format time since opened
    const getTimeSinceOpen = () => {
        if (!table.orderTime) return '';
        const diff = Date.now() - new Date(table.orderTime).getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes} phút`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}p`;
    };

    return (
        <div
            className={`table-card glass-card ${statusClass}`}
            style={{ animationDelay: `${index * 0.03}s` }}
            onClick={onClick}
        >

            {/* Table number */}
            <div className="table-card-number">{table.number}</div>

            {/* Status icon */}
            <div className="table-card-status-icon">
                {table.status === 'available' && '🟢'}
                {table.status === 'occupied' && '🔴'}
            </div>

            {/* Status label */}
            <div className="table-card-status-text">
                {table.status === 'available' && 'Trống'}
                {table.status === 'occupied' && 'Đang dùng'}
            </div>

            {/* Time since open */}
            {table.status === 'occupied' && table.orderTime && (
                <div className="table-card-time">⏱ {getTimeSinceOpen()}</div>
            )}

            {/* Close button (only for occupied tables) */}
            {table.status === 'occupied' && (
                <button
                    className="table-card-close-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    title="Đóng bàn"
                >
                    ✕
                </button>
            )}
        </div>
    );
}

export default TableCard;

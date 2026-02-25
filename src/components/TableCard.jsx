import React from 'react';
import './TableCard.css';

function TableCard({ table, index, isSelected, mode, mergeLabel, onClick, onClose }) {
    const statusClass = `table-card-${table.status}`;
    const selectedClass = isSelected ? 'table-card-selected' : '';
    const modeClass = mode !== 'normal' ? 'table-card-mode' : '';

    // Check if this table is clickable in current mode
    const isClickable =
        mode === 'normal' ||
        (mode === 'merge' && table.status === 'occupied') ||
        (mode === 'split' && (table.mergedTables.length > 0 || table.mergedWith));

    const dimmed = mode !== 'normal' && !isClickable;

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
            className={`table-card glass-card ${statusClass} ${selectedClass} ${modeClass} ${dimmed ? 'table-card-dimmed' : ''}`}
            style={{ animationDelay: `${index * 0.03}s` }}
            onClick={onClick}
        >
            {/* Selection indicator */}
            {isSelected && (
                <div className="table-card-check">✓</div>
            )}

            {/* Table number */}
            <div className="table-card-number">{table.number}</div>

            {/* Status icon */}
            <div className="table-card-status-icon">
                {table.status === 'available' && '🟢'}
                {table.status === 'occupied' && '🔴'}
                {table.status === 'merged' && '🟣'}
            </div>

            {/* Status label */}
            <div className="table-card-status-text">
                {table.status === 'available' && 'Trống'}
                {table.status === 'occupied' && 'Đang dùng'}
                {table.status === 'merged' && 'Đã gộp'}
            </div>

            {/* Merge label */}
            {mergeLabel && (
                <div className="table-card-merge-badge">{mergeLabel}</div>
            )}

            {/* Time since open */}
            {table.status === 'occupied' && table.orderTime && (
                <div className="table-card-time">⏱ {getTimeSinceOpen()}</div>
            )}

            {/* Close button (only in normal mode for occupied tables) */}
            {mode === 'normal' && table.status === 'occupied' && (
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

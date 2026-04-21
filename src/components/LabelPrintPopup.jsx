import React from 'react';
import { formatPrice } from '../utils/formatters';

const BARCODE_LABEL_STYLES = `
    .label-grid {
        display: flex; flex-direction: column;
        align-items: flex-start; gap: 0; padding: 0;
    }
    .product-label {
        width: 50mm; height: 30mm;
        border: 0.1mm solid #eee;
        position: relative;
        display: flex; flex-direction: column;
        justify-content: flex-start;
        padding: 1.5mm 2mm;
        page-break-inside: avoid;
        background: #fff; 
        overflow: hidden;
        color: #000;
        flex-shrink: 0;
    }
    .label-header {
        display: flex;
        justify-content: flex-start;
        align-items: flex-start;
        min-height: 4mm;
        border-bottom: 0.15mm solid #ccc;
        margin-bottom: 1mm;
        padding-right: 8mm; /* Clear room for the badge */
    }
    .label-pos-name {
        font-size: 6pt;
        font-weight: 700;
        text-transform: uppercase;
        color: #333;
        line-height: 1.2;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .label-serial-badge {
        position: absolute;
        top: 1mm;
        right: 1.5mm;
        font-size: 5.5pt;
        font-weight: 700;
        color: #666;
        padding: 0.3mm 1mm;
        border-radius: 0.5mm;
    }
    .label-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        text-align: left;
        gap: 0.5mm;
    }
    .label-product-name {
        font-size: 8.5pt;
        font-weight: 800;
        line-height: 1.15;
        color: #000;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .label-ecommerce {
        font-size: 7pt;
        font-weight: 700;
        color: #444;
        padding: 0.3mm 1mm;
        margin-top: 0.5mm;
        border-radius: 0.5mm;
        display: inline-block;
        width: fit-content;
    }
    .label-note-box {
        font-size: 6.5pt;
        font-style: italic;
        color: #555;
        line-height: 1.2;
        padding: 0.5mm 1mm;
        border-left: 0.3mm solid #ddd;
        margin-top: 0.5mm;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .label-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding-top: 0.5mm;
    }
    .label-date {
        font-size: 5pt;
        color: #999;
        font-weight: 500;
    }
    @media print {
        .label-grid { gap: 0; padding: 0; }
        .product-label { border: none; box-shadow: none; }
    }
    /* Styles for the in-app popup scroll area */
    .label-grid-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 15px;
        padding: 20px;
    }
    .product-label-preview {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
`;

function LabelPrintPopup({ show, onClose, orderItems, getProductPrice, posConfig, ecommerceCode }) {
    if (!show) return null;

    const totalLabelsCount = orderItems.reduce((s, i) => s + (i.product.print_product_label ? i.quantity : 0), 0);

    const handlePrint = () => {
        const printContent = document.getElementById('label-print-area');
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
            <html>
            <head>
                <title>In tem sản phẩm</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #fff; }
                    ${BARCODE_LABEL_STYLES}
                    @page { size: 50mm 30mm landscape; margin: 0; }
                </style>
            </head>
            <body>
                <div class="label-grid">
                    ${printContent.innerHTML}
                </div>
                <script>window.onload = function() { window.print(); window.close(); }<\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="order-popup-overlay" onClick={onClose}>
            <style>{BARCODE_LABEL_STYLES}</style>
            <div className="label-popup" onClick={(e) => e.stopPropagation()}>
                <div className="label-popup-header">
                    <h3 className="label-popup-title">🏷️ In tem sản phẩm ({totalLabelsCount} tem)</h3>
                    <div className="label-popup-actions">
                        <button className="btn btn-primary label-print-btn" onClick={handlePrint}>
                            🖨️ In
                        </button>
                        <button className="order-popup-close" onClick={onClose}>✕</button>
                    </div>
                </div>
                <div className="label-popup-body" style={{ background: '#f0f2f5' }}>
                    <div id="label-print-area" className="label-grid-preview">
                        {orderItems.map((item) => {
                            const labels = [];
                            let serialNumInLine = 0;
                            let globalSerialStart = 0;
                            for (let j = 0; j < orderItems.indexOf(item); j++) {
                                globalSerialStart += (orderItems[j].product.print_product_label ? orderItems[j].quantity : 0);
                            }

                            for (let i = 0; i < item.quantity; i++) {
                                if (!item.product.print_product_label) continue;
                                serialNumInLine++;
                                const currentGlobalSerial = globalSerialStart + serialNumInLine;
                                labels.push(
                                    <div key={`${item.lineId}-${i}`} className="product-label product-label-preview">
                                        <div className="label-serial-badge">{currentGlobalSerial}/{totalLabelsCount}</div>

                                        <div className="label-header">
                                            <div className="label-pos-name">{posConfig?.name || 'SeaPOS'}</div>
                                        </div>

                                        <div className="label-body">
                                            <div className="label-product-name">
                                                {item.product.name || item.product.display_name}
                                            </div>
                                            {ecommerceCode && ecommerceCode.trim() !== '' && (
                                                <div className="label-ecommerce">{ecommerceCode}</div>
                                            )}
                                            {item.note && item.note.trim() && (
                                                <div className="label-note-box">{item.note}</div>
                                            )}
                                        </div>

                                        <div className="label-footer">
                                            <div className="label-date">{new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} {new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</div>
                                        </div>
                                    </div>
                                );
                            }
                            return labels;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LabelPrintPopup;

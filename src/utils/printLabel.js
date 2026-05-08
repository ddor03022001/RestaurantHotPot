/**
 * Centralized Label Printing Utility
 *
 * Generates product label HTML and prints silently via Electron's native print.
 * Each label is printed as a SEPARATE print job to prevent drift on label rolls
 * where stickers have gaps between them.
 *
 * Used by: PaymentScreen (auto-print after payment), LabelPrintPopup (manual print)
 */

const LABEL_STYLES = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #fff; }
    .label-grid {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
        padding: 0;
    }
    .product-label {
        width: 50mm;
        height: 30mm;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        padding: 1mm 1mm;
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
        margin-bottom: 1mm;
        padding-right: 8mm;
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
        color: #333;
        padding: 0.3mm 1mm;
        margin-top: 0.5mm;
        border-radius: 0.5mm;
        display: inline-block;
        width: fit-content;
    }
    .label-note-box {
        font-size: 6.5pt;
        font-style: italic;
        color: #333;
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
        color: #333;
        font-weight: 500;
    }
    @page { size: 50mm 30mm landscape; margin: 0; }
`;

/**
 * Generate HTML for a SINGLE label.
 * Exported so LabelPrintPopup can reuse it.
 *
 * @param {object} params
 * @param {string} params.posName
 * @param {string} params.productName
 * @param {string} [params.ecommerceCode]
 * @param {string} [params.note]
 * @param {number} params.serialNum - Current label number (e.g. 2)
 * @param {number} params.totalLabels - Total labels in batch (e.g. 5)
 * @param {string} params.datetime - Formatted date/time string
 * @returns {string} Complete HTML document for 1 label
 */
export function generateSingleLabelHTML({ posName, productName, ecommerceCode, note, serialNum, totalLabels, datetime }) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>In tem sản phẩm</title>
    <style>${LABEL_STYLES}</style>
</head>
<body>
    <div class="label-grid">
        <div class="product-label">
            <div class="label-serial-badge">${serialNum}/${totalLabels}</div>
            <div class="label-header">
                <div class="label-pos-name">${posName}</div>
            </div>
            <div class="label-body">
                <div class="label-product-name">${productName}</div>
                ${ecommerceCode && ecommerceCode.trim() ? `<div class="label-ecommerce">${ecommerceCode}</div>` : ''}
                ${note && note.trim() ? `<div class="label-note-box">${note}</div>` : ''}
            </div>
            <div class="label-footer">
                <div class="label-date">${datetime}</div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate full HTML document string for ALL labels (used for popup/fallback printing).
 *
 * @param {object} options
 * @param {string} options.posName - POS display name
 * @param {Array<{product: object, quantity: number, note?: string}>} options.orderItems
 * @param {string} [options.ecommerceCode]
 * @returns {string} Complete HTML document string
 */
export function generateLabelHTML({ posName = 'SeaPOS', orderItems = [], ecommerceCode = '' }) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const datetime = `${timeStr} ${dateStr}`;

    // Only items with print_product_label = true
    const printableItems = orderItems.filter(item => item.product?.print_product_label);
    const totalLabels = printableItems.reduce((s, i) => s + i.quantity, 0);

    let globalSerial = 0;
    let labelsHTML = '';

    for (const item of printableItems) {
        for (let i = 0; i < item.quantity; i++) {
            globalSerial++;
            const productName = item.product.name || item.product.display_name || '';
            const note = item.note || '';

            labelsHTML += `
                <div class="product-label">
                    <div class="label-serial-badge">${globalSerial}/${totalLabels}</div>
                    <div class="label-header">
                        <div class="label-pos-name">${posName}</div>
                    </div>
                    <div class="label-body">
                        <div class="label-product-name">${productName}</div>
                        ${ecommerceCode && ecommerceCode.trim() ? `<div class="label-ecommerce">${ecommerceCode}</div>` : ''}
                        ${note && note.trim() ? `<div class="label-note-box">${note}</div>` : ''}
                    </div>
                    <div class="label-footer">
                        <div class="label-date">${datetime}</div>
                    </div>
                </div>
            `;
        }
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>In tem sản phẩm</title>
    <style>${LABEL_STYLES}</style>
</head>
<body>
    <div class="label-grid">
        ${labelsHTML}
    </div>
</body>
</html>`;
}

/**
 * Print product labels silently.
 * Each label is sent as an INDIVIDUAL print job to prevent drift on label rolls.
 *
 * @param {object} options
 * @param {string} options.posName
 * @param {Array} options.orderItems
 * @param {string} [options.ecommerceCode]
 */
export async function printLabel(options) {
    // Check if any items need labels
    const hasLabels = (options.orderItems || []).some(
        item => item.product?.print_product_label && item.quantity > 0
    );
    if (!hasLabels) return;

    const printerName = localStorage.getItem('labelPrinterName') || '';
    const printableItems = (options.orderItems || []).filter(item => item.product?.print_product_label);
    const totalLabels = printableItems.reduce((s, i) => s + i.quantity, 0);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const datetime = `${timeStr} ${dateStr}`;

    if (printerName && window.electronAPI && window.electronAPI.printSilentHtml) {
        // In silent trong Electron — MỖI TEM LÀ 1 PRINT JOB RIÊNG
        let globalSerial = 0;

        for (const item of printableItems) {
            for (let i = 0; i < item.quantity; i++) {
                globalSerial++;
                const html = generateSingleLabelHTML({
                    posName: options.posName || 'SeaPOS',
                    productName: item.product.name || item.product.display_name || '',
                    ecommerceCode: options.ecommerceCode || '',
                    note: item.note || '',
                    serialNum: globalSerial,
                    totalLabels,
                    datetime
                });

                // Chờ in xong tem hiện tại trước khi gửi tem tiếp
                try {
                    await window.electronAPI.printSilentHtml(html, printerName, 'tem');
                } catch (err) {
                    console.warn(`In tem ${globalSerial}/${totalLabels} thất bại:`, err);
                }
            }
        }
    } else {
        // Fallback: popup window với tất cả tem (dùng khi chạy trên browser)
        const html = generateLabelHTML(options);
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(html + `<script>window.onload = function() { window.print(); window.close(); }<\/script>`);
        printWindow.document.close();
    }
}

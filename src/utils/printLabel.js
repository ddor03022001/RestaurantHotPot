/**
 * Centralized Label Printing Utility
 *
 * Generates product label HTML and prints silently via html2canvas + PowerShell.
 * Uses the same approach as printBill.js.
 * Used by: PaymentScreen (auto-print after payment)
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
        border-bottom: 0.15mm solid #ccc;
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
    @page { size: 50mm 30mm landscape; margin: 0; }
`;

/**
 * Generate full HTML document string for label printing.
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
 * Uses html2canvas to render labels in the renderer, sends image to main process for PowerShell printing.
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

    const html = generateLabelHTML(options);
    const printerName = localStorage.getItem('labelPrinterName') || '';

    if (printerName && window.electronAPI && window.electronAPI.printSilentHtml) {
        // Chạy trong Electron -> In silent
        window.electronAPI.printSilentHtml(html, printerName);

    } else {
        // Fallback: Nếu chạy trên trình duyệt web bình thường
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(html + `<script>window.onload = function() { window.print(); window.close(); }<\/script>`);
        printWindow.document.close();
    }
    return;

    // Silent print via html2canvas + PowerShell
    if (printerName && window.electronAPI && window.electronAPI.silentPrint) {
        try {
            const { default: html2canvas } = await import('html2canvas');

            const container = document.createElement('div');
            container.style.cssText = 'position:fixed;left:-9999px;top:0;width:190px;background:#fff;';

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const styles = doc.querySelectorAll('style');
            styles.forEach(s => container.appendChild(s.cloneNode(true)));
            container.innerHTML += doc.body.innerHTML;

            document.body.appendChild(container);
            await new Promise(r => setTimeout(r, 200));

            const canvas = await html2canvas(container, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
            });

            document.body.removeChild(container);

            const base64 = canvas.toDataURL('image/png').split(',')[1];
            await window.electronAPI.silentPrint(base64, printerName);
            return;
        } catch (err) {
            console.warn('Silent label print failed, falling back to popup:', err);
        }
    }

    // Fallback: popup window
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
        console.error('Could not open label print window');
        return;
    }
    printWindow.document.write(html + `
        <script>
            window.onload = function() {
                window.print();
                window.onafterprint = function() { window.close(); };
                setTimeout(function() { window.close(); }, 3000);
            };
        </script>
    `);
    printWindow.document.close();
}

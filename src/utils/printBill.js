/**
 * Centralized Bill Printing Utility
 * 
 * Single source of truth for bill template and printing logic.
 * Used by: PaymentScreen (tạm tính + after payment), OrderHistoryPopup (reprint)
 */

import { formatPrice } from './formatters';

/**
 * Generate the full HTML string for a bill receipt.
 *
 * @param {object} options
 * @param {string} options.storeName - POS name
 * @param {string} options.billTitle - e.g. "HÓA ĐƠN BÁN HÀNG", "BILL TẠM TÍNH"
 * @param {string} options.orderRef - Order reference / ID
 * @param {string} options.dateStr - Date string
 * @param {string} [options.customerName] - Customer name
 * @param {string} [options.staffName] - Staff/cashier name
 * @param {Array<{name: string, priceUnit: number, qty: number, discount: number, subtotal: number, uom?: string}>} options.lines
 * @param {number} options.totalAmount - Grand total
 * @param {number} [options.discountAmount] - Discount amount (0 if none)
 * @param {string} [options.note] - Order note
 * @param {string} [options.ecommerceCode] - Ecommerce code
 * @param {string} [options.companyInvoice] - Company invoice
 * @returns {string} Complete HTML document string
 */
export function generateBillHTML({
    storeName = 'SeaPOS',
    billTitle = 'HÓA ĐƠN BÁN HÀNG',
    orderRef = '',
    dateStr = '',
    customerName = '',
    staffName = '',
    lines = [],
    totalAmount = 0,
    discountAmount = 0,
    note = '',
    ecommerceCode = '',
    companyInvoice = '',
}) {
    const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));
    const preDiscountTotal = totalAmount + discountAmount;

    const linesHTML = lines.map(line => `
        <tr class="item-name-row">
            <td colspan="5">${line.name}</td>
        </tr>
        <tr class="item-detail-row">
            <td class="col-left">${fmt(line.priceUnit)}<span class="currency">đ</span></td>
            <td style="text-align:center">${line.qty}</td>
            <td style="text-align:center">${line.uom || 'Cái'}</td>
            <td style="text-align:center">${line.discount > 0 ? line.discount + '%' : '0'}</td>
            <td class="col-right">${fmt(line.subtotal)}<span class="currency">đ</span></td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${billTitle}</title>
    <style>
        @page { 
            margin: 0; 
        }
        * { box-sizing: border-box; }
        body { 
            font-family: Arial, Helvetica, sans-serif; 
            // width: 72mm; 
            margin: 0; 
            padding: 2mm;
            color: #000;
            line-height: 1.2;
        }
        // @media print {
        //     body { width: 72mm; margin: 0; padding: 2mm; }
        // }

        /* Header Section */
        .header-container { display: flex; align-items: center; justify-content: center; margin: 10px; }
        .store-title-block { text-align: center; }
        .store-name { font-size: 16px; font-weight: bold; margin: 0; }
        
        .bill-title { 
            text-align: center; 
            font-size: 16px; 
            font-weight: bold; 
            margin: 15px 0 2px 0;
            text-transform: uppercase;
        }
        .order-id { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 10px; }

        /* Metadata */
        .meta-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-bottom: 3px; }
        .customer-name { font-size: 13px; font-weight: bold; margin: 4px 0; }
        .note-line { font-size: 12px; margin: 2px 0; }

        /* Table Styling */
        table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        thead th { 
            border-top: 2px solid #000; 
            border-bottom: 2px solid #000; 
            font-size: 12px; 
            padding: 4px 0; 
            text-align: center;
            font-weight: bold;
        }
        .col-left { text-align: left; }
        .col-right { text-align: right; }

        .item-name-row td { font-size: 13px; font-weight: bold; padding-top: 8px; }
        .item-detail-row td { 
            font-size: 13px; 
            font-weight: bold; 
            padding-bottom: 8px;
            border-bottom: 1px solid #000; 
        }

        /* Totals Section */
        .summary-container { margin-top: 8px; }
        .summary-line { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; padding: 4px 0; }
        .currency { text-decoration: underline; margin-left: 2px; }
        
        .grand-total-line { 
            font-size: 14px; 
            padding: 10px 0;
            margin-bottom: 15px;
        }

        /* Footer */
        .footer { text-align: center; font-size: 11px; font-weight: bold; line-height: 1.4; }
        .footer-thanks { font-style: italic; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="header-container">
        <div class="store-title-block">
            <p class="store-name">${storeName}</p>
        </div>
    </div>

    <div class="bill-title">${billTitle}</div>
    <div class="order-id">${orderRef}</div>

    <div class="meta-row">
        ${staffName ? `<span>${staffName}</span>` : '<span></span>'}
        <span>${dateStr}</span>
    </div>
    ${customerName ? `<div class="customer-name">Khách hàng: ${customerName}</div>` : ''}
    ${note ? `<div class="note-line"><strong>Ghi chú:</strong> ${note}</div>` : ''}
    ${ecommerceCode ? `<div class="note-line"><strong>TMĐT Code:</strong> ${ecommerceCode}</div>` : ''}

    <table>
        <thead>
            <tr>
                <th class="col-left">Mặt hàng</th>
                <th>SL</th>
                <th>ĐVT</th>
                <th>CK</th>
                <th class="col-right">Thành Tiền</th>
            </tr>
        </thead>
        <tbody>
            ${linesHTML}
        </tbody>
    </table>

    <div class="summary-container">
        ${discountAmount > 0 ? `
        <div class="summary-line">
            <span>Tiền trước giảm giá:</span>
            <span>${fmt(preDiscountTotal)}<span class="currency">đ</span></span>
        </div>
        <div class="summary-line">
            <span>Giảm giá:</span>
            <span style="border-bottom: 1px solid #000; width: 100px; text-align: right;">-${fmt(discountAmount)}<span class="currency">đ</span></span>
        </div>
        ` : ''}
        <div class="summary-line grand-total-line">
            <span>Số tiền cần thanh toán:</span>
            <span>${fmt(totalAmount)}<span class="currency">đ</span></span>
        </div>
    </div>

    <div class="footer">
        ${companyInvoice ? `<div class="note-line"><strong>Công ty:</strong> ${companyInvoice}</div>` : ''}
        Hóa đơn điện tử đã được xuất theo thông tin Quý<br>khách hàng cung cấp.
        <div class="footer-thanks">Thank you, see you again!</div>
    </div>
</body>
</html>`;
}

/**
 * Print a bill. Uses html2canvas + PowerShell for silent print if configured.
 *
 * @param {object} options - Same as generateBillHTML options
 */
export async function printBill(options) {
    const html = generateBillHTML(options);
    const printerName = localStorage.getItem('billPrinterName') || '';
    if (printerName && window.electronAPI && window.electronAPI.printSilentHtml) {
        // Chạy trong Electron -> In silent
        window.electronAPI.printSilentHtml(html, printerName, 'bill');

    } else {
        // Fallback: Nếu chạy trên trình duyệt web bình thường
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(html + `<script>window.onload = function() { window.print(); window.close(); }<\/script>`);
        printWindow.document.close();
    }
    return;
    // const printerName = localStorage.getItem('billPrinterName') || '';

    // Silent print: render HTML to image in renderer, send to main for printing
    if (printerName && window.electronAPI && window.electronAPI.silentPrint) {
        try {
            const { default: html2canvas } = await import('html2canvas');

            // Create hidden container with bill HTML
            const container = document.createElement('div');
            container.style.cssText = 'position:fixed;left:-9999px;top:0;width:280px;background:#fff;';

            // Extract body content and styles from full HTML document
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Apply styles
            const styles = doc.querySelectorAll('style');
            styles.forEach(s => container.appendChild(s.cloneNode(true)));

            // Apply body content
            container.innerHTML += doc.body.innerHTML;
            document.body.appendChild(container);

            // Wait for render
            await new Promise(r => setTimeout(r, 200));

            // Capture as image
            const canvas = await html2canvas(container, {
                width: 280,
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
            });

            document.body.removeChild(container);

            // Convert to base64 PNG
            const base64 = canvas.toDataURL('image/png').split(',')[1];

            // Send to main process for printing
            await window.electronAPI.silentPrint(base64, printerName);
            return;
        } catch (err) {
            console.warn('Silent print failed, falling back to popup:', err);
        }
    }

    // Fallback: open HTML popup window
    const printWindow = window.open('', '_blank', 'width=350,height=700');
    if (!printWindow) {
        console.error('Could not open print window');
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

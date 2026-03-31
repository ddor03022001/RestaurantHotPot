# HotPos 🍕

HotPos là một ứng dụng Desktop (Point of Sale) dành cho hệ thống nhà hàng/quán ăn, được xây dựng bằng công nghệ Web hiện đại nhúng trong Desktop Application, cho phép tương tác trực tiếp với hệ thống quản trị **Odoo**.

## Các chức năng chính
- **Quản lý Bàn (Table Management)**: 
  - Giao diện 16 bàn trực quan dạng Grid lưới.
  - Phân tách theo trạng thái: Bàn trống (Có thể mở), Bàn đang có khách (Trạng thái màu đỏ), và Bàn gộp.
  - Hỗ trợ thao tác phức tạp như **Gộp bàn** (gom toàn bộ món và gộp thanh toán về một bàn) và **Tách bàn** (chuyển một số lượng món nhất định sang bàn khác).
- **Quản lý Order (Order Management)**:
  - Chọn món nhanh chóng qua màn hình POS (Point of Sale).
  - Tích hợp chiết khấu (discount) cho mặt hàng hoặc đơn hàng.
  - Sử dụng điểm Loyalty (được cấu hình đồng bộ trực tiếp qua `pos.config` của Odoo).
- **Thanh toán & Đẩy dữ liệu về Odoo**:
  - Popup xác nhận khi thu tiền ("Bạn đã chắc chắn chưa?").
  - Tính toán các journal payment (phương thức thanh toán mặc định/loyalty).
  - Đẩy toàn bộ dữ liệu đơn hàng về Odoo (sử dụng API chuẩn `pos.order.create_from_ui` của Odoo 17 POS).
- **Lịch sử & In Bill**:
  - Giao diện In tạm tính, xem chi tiết lịch sử món của từng order ngay trong popup.
  - In lại hóa đơn lịch sử (Sử dụng hệ thống in HTML trực tiếp của trình duyệt tích hợp).

## Công nghệ sử dụng
- **Cốt lõi**: [Electron](https://www.electronjs.org/) (Cho phép build ra .exe và thao tác môi trường Windows).
- **Giao diện**: [React 18](https://reactjs.org/) kết hợp hệ thống React Router cho các màn hình.
- **Trình đóng gói**: [Vite](https://vitejs.dev/) - Quản lý HMR nhanh chóng và tối ưu cấu trúc code lúc build.
- **Tích hợp Odoo**: Package `xmlrpc` (Giao tiếp bảo mật với backend Odoo bằng XML-RPC).
- **Giao diện (CSS)**: Custom CSS, Glassmorphism, CSS Variables, Theme Dark-Mode sang trọng hiện đại.

## Hướng dẫn cài đặt và thiết lập môi trường

### 1. Yêu cầu hệ thống
- Hệ điều hành: Windows, macOS, hoặc Linux.
- Đã cài đặt [Node.js](https://nodejs.org/en/) (phiên bản v18 trở lên).

### 2. Cài đặt Dependencies
Sau khi tải source code về, thực hiện mở Terminal (Command Prompt / PowerShell / Bash) ở thư mục gốc của dự án `HotPos`, sau đó chạy:

```bash
npm install
```

### 3. Cấu hình kết nối Odoo
Vào trang Đăng nhập khi ứng dụng khởi chạy lần đầu tiên, đảm bảo bạn cung cấp:
- Đường dẫn hệ thống (Odoo URL), ví dụ `https://your-odoo-domain.com`
- Tên Cơ sở dữ liệu (Database Name).
- Username và Password (Tài khoản User của Odoo đã phân quyền truy cập POS).

Thông tin này sẽ được lưu trữ an toàn trong localStorage của ứng dụng để tự động đăng nhập ở các lần khởi chạy sau.

## Hướng dẫn chạy & Xuất ứng dụng (Build)

### Khởi chạy môi trường Phát triển (Development)
Trong quá trình code giao diện hoặc theo dõi log hệ thống:

```bash
npm run dev
```
*(Hệ thống sẽ đồng bộ Vite Server và bật ứng dụng Electron để xem ngay các thay đổi theo thời gian thực)*.

### Đóng gói ứng dụng (Build cho User cuối)
Để build ra file chạy `.exe` để cung cấp cho người dùng mang đi cài đặt ở máy tính khác:

```bash
npm run build
```

Sau khi Terminal báo thành công, mở thư mục `release/` sẽ thấy file `HotPos Setup 1.0.0.exe`. Đây chính là file để gửi cho người dùng chạy trực tiếp.

## Lưu ý về Bảo mật cấu hình Odoo

Do liên quan đến API XML-RPC trực tiếp thay vì Session, quá trình Login từ Renderer Process sẽ ủy thác qua Main Process (NodeJS context) của Electron để tránh lỗi CORS cũng như giữ độ tin cậy.

Luôn đảm bảo rằng Odoo server của bạn cho phép nhận request API RPC XML (`/xmlrpc/2/common`, `/xmlrpc/2/object`).

---
*(Phát triển bởi Quang Huy Seatek)*

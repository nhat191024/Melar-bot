# Giới thiệu tổng quan về studio:

&nbsp;- Melar studio, cung cấp dịch vụ thiết kế, vẽ và rig model Live2D cho các bạn VTuber

&nbsp;- Làm việc trên discord, qua kênh diễn đàn "Commission" hoặc kênh "Task-khác":

&nbsp; + Nếu có commission: Tạo bài đăng mới, gắn tag và thảo luận trên đó

&nbsp; + Nếu có những task tổng quan khác (chuẩn bị tài liệu, chuẩn bị video...): Tạo bài đăng tại "Task khác"

&nbsp;- Công việc được quản lý bởi role Quản lý dự án (gọi tắt là PM), PM có nhiệm vụ phân công, giám sát, nhắc nhở về các task của từng thành viên trong studio

# Những vấn đề mà studio có thể gặp phải (dựa trên kinh nghiệm làm việc của Mirai)

&nbsp;- 1 nửa thành viên low-tech (tính cả Mirai)

&nbsp;- Mỗi người có quá nhiều task, đôi lúc sẽ có những task không tên -> PM khó kiểm soát được hết, từng thành viên cũng khó nhớ được bản thân họ đang làm những task gì

&nbsp;- Mỗi thành viên đều cần note lại những ghi chú để tự nhắc nhở bản thân họ trong quá trình làm việc

# Mô tả bot tổng quan:

&nbsp;- Tên: Melar bot

&nbsp;- Không chỉ được sử dụng trong studio, mà có thể sử dụng tại các server làm việc của Mirai

&nbsp;- Hỗ trợ quản lý công việc, dự án, nhắc nhở tiến độ công việc

&nbsp;- Dễ dùng, câu lệnh đơn giản, có hỗ trợ cách sử dụng

&nbsp;- Nên có một kênh dể các thành viên dùng bot, tránh làm trôi tin nhắn ở các kênh khác

# Các chức năng của bot:

#

1. ### Tạo task:

##### &nbsp; a, tổng quan:

Cho phép PM hoặc các chức vụ cao tạo một task, mô tả task, chỉ định người làm việc, chỉ định deadline cụ thể cho từng thành viên

##### &nbsp; b, Các tính năng:

- Tạo task, cập nhật task, xóa task
- Nhắc nhở người làm việc khi Dl đang đến gần
- Người làm việc có thể check họ đang có những task nào
- PM có thể check hiện có tổng bao nhiêu công việc

&nbsp; c, Yêu cầu:

- Bot trình bày nội dung task dễ đọc, dễ hiểu, có hệ thống

---

- Có hướng dẫn chi tiết cách sử dụng, kể cả cho người low tech
- Câu lệnh cần nhập ngắn gọn

##### &nbsp; d, Quy trình:

- PM gõ lệnh gọi bot, điền các thông tin của task
- Các thông tin mà bot ghi nhận:

&nbsp; - Tên task: bắt buộc, nên ghi ngắn gọn

&nbsp; - Người làm việc: bắt buộc, khi đang nhập trường này, bot sẽ đề xuất những cái tên trong server để PM chọn cho tiện thay vì gõ thủ công hoàn toàn, có thể đề cập tới nhiều người cùng lúc

&nbsp; - Mô tả: không bắt buộc

&nbsp; - Link: không bắt buộc, PM sẽ dán link tin nhắn chi tiết hơn về cái task này để người làm việc có thể nắm được công việc mỗi lần gọi bot

&nbsp; - Deadline date: Không bắt buộc, bot sẽ nhắc nhở cả PM và người làm việc về task này trước khi tới hạn: 2 tuần, 1 tuần, 3 ngày, 1 ngày, và 1 tiếng (nghĩa là nó sẽ nhắc nhiều lần)

&nbsp; - Deadline time: không bắt buộc, nếu không điền thì bot sẽ tự động xem như là 23h

- Sau khi PM enter lệnh, bot sẽ ghi lại task, mỗi task sẽ có một ID duy nhất, hiển thị lại task lần nữa để PM đọc lại, có ghi "Task dã được tạo" đầu tin nhắn, task sẽ được tag là "đang làm" trong hệ thống
- Nếu PM cần cập nhật: có thể gõ lệnh cập nhật, chỉ định task thông qua ID, rồi nhập những trường mà muốn cập nhật, có ghi "Task đã được cập nhật" đầu tin nhắn
- Cách bot hiển thị task:

&nbsp; - Sắp xếp theo thứ tự deadline, deadline sớm thì lên đầu

&nbsp; - theo bullet point, với tên task được tô đen và in lớn,

&nbsp; - có thể thêm icon màu để dễ tách biệt giữa các task với nhau,

&nbsp; - trường nào không có thông tin thì không hiển thị

- Khi PM hoặc các thành viên cần check task, gọi bot lên:

&nbsp; - PM: Bot sẽ hiển thị toàn bộ các task "đang làm" trong hệ thống

&nbsp; - Thành viên: Bot sẽ hiển thị chỉ những task nào được chỉ định cho họ, và có tag là "đang làm"

- Khi task đã hoàn thành:

&nbsp; - Gõ lệnh để kết thúc task, chỉ định task thông qua ID,

&nbsp; - task sẽ được tag là "đã hoàn thành trong hệ thống",

&nbsp; - hiển thị tin nhắn "đã kết thúc task \[tên của cái task đó]. Nếu muốn hoàn tác, gõ lệnh..."

&nbsp; - Nếu PM hoàn thành nhầm task, có thể hoàn tác nhanh bằng gõ lệnh đó, lưu ý, lệnh hoàn tác này chỉ có tác dụng cho 1 task vừa hoàn thành

- Nếu task đã quá hạn mà chưa được đánh dấu hoàn thành:

&nbsp; - Đổi tag từ "đang làm" thành "đã quá hạn"

&nbsp; - Thông báo cho PM và thành viên làm việc là task đã quá hạn

&nbsp; - Khi gọi lệnh kiểm tra task, tiêu đề task sẽ có màu đỏ, hoặc có icon nào đó màu đỏ để thể hiện "Task này bị quá hạn"

### 2\. Tạo note:

#### a, tổng quan:

Cho phép bất kì người nào trong server có thể tạo note cho bản thân một cách nhanh chóng, giống như bot Live2D VietNam trong server của Alkan

#### b, Tính năng:

&nbsp;- Tạo ghi chú, xóa ghi chú

&nbsp;- Nhắc nhở người dùng khi dl đang đến gần (nếu có)

&nbsp;- Người dùng có thể check note của bản thân bất kì lúc nào

#### c, yêu cầu:

&nbsp;- Dễ dùng, câu lệnh ngắn gọn

#### d, quy trình:

- User gõ lệnh, kèm nội dung của note

&nbsp; - Date: Có thể thêm dl nếu muốn, nếu có dl, bot sẽ nhắc nhở user về note này trước khi tới hạn: 2 tuần, 1 tuần, 3 ngày, 1 ngày, và 1 tiếng (nghĩa là nó sẽ nhắc nhiều lần)

&nbsp; - Time: Có thể thêm thời gian cụ thể

&nbsp; - Nếu có date, hông có time: Tự động xem là 23h

&nbsp; - Nếu có time, hông có date: Tự động xem là trong ngày

- Bot ghi lại thông tin của note, mỗi note có một ID độc nhất
- User check note, trình bày theo danh sách, với những note có deadline sẽ hiển thị trên đầu
- User có thể xóa note nếu không cần nữa, có thể xóa nhiều ID trong 1 lần

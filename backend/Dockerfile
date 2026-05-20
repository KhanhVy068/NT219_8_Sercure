# Lấy image node:18-alpine làm nền tảng
FROM node:18-alpine

# Tạo thư mục làm việc bên trong container
WORKDIR /app

# Copy file package.json (danh sách thư viện cần cài)
COPY package*.json ./

# Cài đặt các thư viện (chỉ chạy 1 lần khi build)
RUN npm install

# Copy toàn bộ code vào container
COPY . .

# Mở cổng 3000 để bên ngoài truy cập được
EXPOSE 3000

# Lệnh chạy khi container start
CMD ["node", "server.js"]
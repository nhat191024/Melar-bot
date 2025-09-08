# Melar Discord Bot

Bot Discord làm custom cho Melar Studio

## Tính năng

Một đống thứ random sht

## Cài đặt

### Yêu cầu

- Node.js 16+
- MySQL Server 8.0+
- Discord Bot Token

### Hướng dẫn

1. **Cài đặt dependencies:**

   ```bash
   pnpm install
   ```

2. **Tạo database MySQL:**

   ```sql
   CREATE DATABASE discord_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **Tạo file .env:**

   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=discord_bot
   ```

4. **Chạy bot:**
   ```bash
   pnpm run dev
   ```

## Lệnh có sẵn

### Slash Commands

- `/ping` - Kiểm tra độ trễ bot
- `/help` - Hiển thị menu trợ giúp

### Prefix Commands (!)

- `!ping` - Kiểm tra độ trễ bot
- `!help` - Hiển thị menu trợ giúp

## Tác giả

- **Người đặt:** miraihm
- **Phát triển:** nhat191024 - taiyo_furuhashi
- **Dành cho:** Melar Studio
- **Link Discord:** https://discord.gg/zzebkZa7H8

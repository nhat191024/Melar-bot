# Use the official Node.js 18 LTS image based on Debian
FROM node:18-bullseye-slim

# Set the working directory inside the container
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.12.4

# Copy package.json and pnpm-lock.yaml for caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Create a non-root user and group
RUN groupadd -r botuser && useradd -r -g botuser botuser

# Switch to the non-root user
USER botuser

# Start the application
CMD ["pnpm", "start"]
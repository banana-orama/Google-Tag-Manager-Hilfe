FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Set up credentials directory
RUN mkdir -p /root/.gtm-mcp

# Set environment to use credentials from volume
ENV GTM_CREDENTIALS_PATH=/root/.gtm-mcp

# Start the server
CMD ["node", "dist/index.js"]

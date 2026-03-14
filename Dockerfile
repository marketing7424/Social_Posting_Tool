FROM node:20-slim

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install server dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Build client
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Copy server code
COPY server/ ./server/
COPY .env.example ./.env.example

# Create directories
RUN mkdir -p /data uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]

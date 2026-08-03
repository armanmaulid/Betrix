FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm clean-install --production

# Copy source code
COPY . .

# Expose port (default Express / Back4App port)
EXPOSE 3000

# Start server
CMD ["npm", "start"]

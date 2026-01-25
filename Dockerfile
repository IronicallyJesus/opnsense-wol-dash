# Use a lightweight Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the rest of the app
COPY server.js .
COPY public ./public

# Expose the port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
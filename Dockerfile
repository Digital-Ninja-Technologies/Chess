FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/server.js ./
EXPOSE 10000
ENV PORT=10000
CMD ["node", "server.js"]

FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_MODE=local
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY knowledge ./knowledge
COPY data ./data
COPY --from=web /web/dist ./web/dist
EXPOSE 8080
CMD ["node", "server/src/index.js"]

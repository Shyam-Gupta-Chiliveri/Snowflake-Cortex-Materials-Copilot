# One image: Vite build + Express API. Secrets stay out of the image
# (see .dockerignore: keys/, *.pem, .env) and are injected at runtime.
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_MODE=auto
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY knowledge ./knowledge
COPY data ./data
COPY --from=web /web/dist ./web/dist
RUN chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/src/index.js"]

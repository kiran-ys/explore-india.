FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./backend
COPY frontend ./frontend

ENV NODE_ENV=production
ENV PORT=10000
ENV EXPLORE_INDIA_DB=/app/data/explore-india.db

VOLUME ["/app/data"]
EXPOSE 10000

CMD ["npm", "start"]

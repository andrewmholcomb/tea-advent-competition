FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/* \
    && npm install \
    && npm --prefix client install
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/* \
    && npm install --omit=dev
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /app/data
EXPOSE 3001
CMD ["npm", "start"]

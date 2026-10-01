FROM node:20-slim

WORKDIR /app

# Dependências nativas (better-sqlite3, sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p data

EXPOSE 3000

CMD ["node", "src/index.js"]

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE=production
EXPOSE 3000
CMD ["node", "server.js"]

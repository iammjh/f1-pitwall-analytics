FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# Keep runtime inputs explicit: environment files never enter an image layer.
COPY server.js ./
COPY config/*.js ./config/
COPY services/*.js ./services/

EXPOSE 5000

CMD ["node", "server.js"]

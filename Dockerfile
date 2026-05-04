FROM node:20-alpine
WORKDIR /app

# Python 3 + user-scanner (https://github.com/kaifcodec/user-scanner)
# Alpine: pip upgrade zinciri kırılabiliyor; konsol script yerine `python3 -m user_scanner` kullan.
RUN apk add --no-cache python3 py3-pip py3-setuptools ca-certificates \
  && python3 -m pip install --break-system-packages --no-cache-dir "user-scanner>=1.3,<2" holehe \
  && python3 -c "import user_scanner; import holehe; print('user-scanner + holehe ok')"

COPY package*.json ./
RUN npm install
# Ayrı katman: server.js değişince Docker/Railway önbelleği bu noktadan sonra kesin yenilensin
COPY server.js ./server.js
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

ENV USER_SCANNER_ENABLED=1
ENV USER_SCANNER_EXECUTABLE=python3
ENV USER_SCANNER_USE_PYTHON_MODULE=1
ENV USER_SCANNER_FULL_SCAN=1
ENV USER_SCANNER_TIMEOUT_MS=900000
ENV USER_SCANNER_MAX_RESULTS=500
ENV USER_SCANNER_MAX_ERROR_ROWS=80

# KanekiWeb/Email-Osint — Holehe alt kümesi (scripts/kaneki_holehe_json.py)
ENV KANEKI_EMAIL_OSINT_ENABLED=1
ENV KANEKI_HOLEHE_TIMEOUT_MS=300000

# megadose/holehe — tüm modüller (scripts/holehe_full_json.py). 1 iken Kaneki 15 modül atlanır.
ENV HOLEHE_FULL_ENABLED=0
ENV HOLEHE_FULL_TIMEOUT_MS=600000
ENV HOLEHE_HTTP_TIMEOUT=12

EXPOSE 8080
CMD ["node", "server.js"]

# Kavkaz Look — контейнер для российской площадки (Amvera, Timeweb/Hostman и т. п.)
# Сборка приложения
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Запросы к базе идут через наш сервер (/sb), поэтому адрес относительный.
# Ключ — публичный (publishable), он и так виден в браузере.
ARG VITE_SUPABASE_URL=/sb
ARG VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VBsd_3oj1Z5LXN4IqFmrkQ_DgKmARTe
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

# Запуск: официальный nginx (приложение + прокладка к базе) и Node.js для превью ссылок.
# Node копируем из образа сборки — при запуске ничего не скачивается.
FROM nginx:1.29-alpine
COPY --from=build /usr/local/bin/node /usr/local/bin/node
ARG SUPABASE_HOST=llccglfpndsgjirycjhu.supabase.co
ENV SUPABASE_URL=https://${SUPABASE_HOST} SUPABASE_KEY=sb_publishable_VBsd_3oj1Z5LXN4IqFmrkQ_DgKmARTe
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/security-headers.conf /etc/nginx/security-headers.conf
RUN sed -i "s/__SUPABASE_HOST__/${SUPABASE_HOST}/" /etc/nginx/nginx.conf && rm -f /etc/nginx/conf.d/default.conf && node --version
COPY --from=build /app/dist /usr/share/nginx/html
COPY api/share.js /srv/share.mjs
COPY deploy/share-server.mjs /srv/share-server.mjs
COPY deploy/start.sh /start.sh
EXPOSE 80
CMD ["sh", "/start.sh"]

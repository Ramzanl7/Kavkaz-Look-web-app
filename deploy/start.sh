#!/bin/sh
# Запуск: сервер превью в фоне, веб-сервер — основной процесс
set -e
node /srv/share-server.mjs &
exec nginx -g 'daemon off;'

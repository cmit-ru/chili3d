# Боевой образ редактора «Макетки»: этот форк Chili3D, собранный из исходников.
#
# Файл лежит в ПУБЛИЧНОМ репозитории намеренно. Лицензия AGPL-3.0 относит к
# соответствующему исходному тексту в том числе «сценарии, управляющие сборкой и
# установкой», а собственное архитектурное решение проекта (ADR 2026-08-28-1300, п. 2)
# требует держать всю сборку на виду. По этому файлу третье лицо собирает работающий
# образ редактора, ничего не запрашивая у нас:
#
#     docker build -f deploy/Dockerfile -t maketka-editor .
#     docker run --rm -p 8080:80 maketka-editor      # редактор на http://localhost:8080/3d/
#
# Оболочка сервиса в этот образ не входит: маршрут «/» проксируется к ней, и без неё
# отдаётся честная страница «Сервис ненадолго недоступен» (см. deploy/nginx.conf).
#
# Debian, а не Alpine: эксперты читают /etc/os-release внутри контейнера, Alpine в
# перечень допустимых операционных систем не входит.
ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginx:stable

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
# На школьном хосте мало свободной памяти — ограничиваем heap сборки.
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY . .
# Реестр пакетов задаётся аргументом: на бою это кеширующее зеркало в РФ, при сборке
# третьим лицом — реестр по умолчанию.
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
    && npm install && npm run build

FROM ${NGINX_IMAGE}
LABEL org.opencontainers.image.title="Макетка — редактор трёхмерных моделей" \
      org.opencontainers.image.description="Изменённая версия Chili3D для сервиса «Макетка» (cad.cmit.ru)" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.source="https://gitverse.ru/cmit/chili3d"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html/3d

FROM node:15-alpine AS base

ENV UID=1000 GID=1000
RUN apk -U upgrade && apk add ffmpeg su-exec
RUN mkdir /app
WORKDIR /app
COPY package.json package-lock.json tsconfig.json /app/
RUN npm install --quiet --only=prod

FROM base AS dependencies
ENV HUSKY_SKIP_INSTALL=1
COPY config.json /app/
COPY src /app/src
RUN npm install --quiet --only=dev
RUN npm run build

FROM base AS release
COPY --from=dependencies /app/lib /app/lib
COPY run.sh /app/
COPY config.json /config.json
RUN chmod +x run.sh

VOLUME /recordings /logs

CMD ["/app/run.sh"]

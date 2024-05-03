FROM oven/bun:1
WORKDIR /usr/src/app
COPY . .
ARG SHORTLINKS_PORT=80
RUN bun i
EXPOSE 80
CMD ["bun", "run", "host"]
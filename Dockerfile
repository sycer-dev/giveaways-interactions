FROM node:16-alpine

LABEL name "Giveaways Interactions"
LABEL version "0.1.0"
LABEL maintainer "Carter Himmel <fyko@sycer.dev>"
EXPOSE 2399

WORKDIR /usr/giveaways-interactions

COPY package.json yarn.lock ./
COPY prisma ./prisma/

RUN apk add --update
RUN apk add --no-cache ca-certificates
RUN apk add --no-cache --virtual .build-deps git curl build-base python3 g++ make libtool autoconf automake
RUN yarn --frozen-lockfile
RUN yarn prisma migrate

COPY . .

RUN yarn build
CMD ["node", "."]


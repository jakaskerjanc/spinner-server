FROM node:18-alpine

WORKDIR /var/app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY tsconfig.json ./

COPY prisma ./prisma

COPY src ./src

RUN yarn prisma generate

RUN yarn build

CMD [ "yarn", "start" ]
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ARG GITHUB_SHA=local
ENV GITHUB_SHA=${GITHUB_SHA}

RUN npm run build-info

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]

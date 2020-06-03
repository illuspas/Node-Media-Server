FROM sitkevij/ffmpeg:4.0-alpine
FROM node:10.15.0-alpine

# copy ffmpeg bins from first image
COPY --from=0 / /

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm i

COPY . .

EXPOSE 1935 8000

CMD ["node","app.js"]

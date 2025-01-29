start http://localhost:9000

docker run -it --rm  --name videosubber -p 9000:8080 ^
  -v %cd%/app:/app -w /app ^
  -e CHOKIDAR_USEPOLLING=true ^
  -e FONTCONFIG_FILE=/app/fonts.conf ^
  node:lts-alpine3.21 ^
  sh -c "apk add --no-cache fontconfig; npm install; exec ./node_modules/.bin/nodemon server.js"
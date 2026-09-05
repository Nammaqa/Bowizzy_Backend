FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm install -f
EXPOSE 3000
CMD ["npm", "start"]


FROM node:12-alpine
# RUN npm install -g nodemon

WORKDIR /opt/app


# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

ENV PORT=80
EXPOSE 80

CMD [ "node", "index.js" ]

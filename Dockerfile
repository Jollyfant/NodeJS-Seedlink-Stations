FROM node:8
MAINTAINER Mathijs Koymans

# Set the work directory
WORKDIR /usr/src/app

# Copy the source code
COPY . .

EXPOSE 8086

CMD [ "npm", "start" ]

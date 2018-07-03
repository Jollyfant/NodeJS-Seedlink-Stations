# Dockerfile for building Seedlink station connector
#
# $ docker build -t seedlink-stations:1.0 .

FROM node:8
MAINTAINER Mathijs Koymans

# Set the work directory
WORKDIR /usr/src/app

# Copy the source code
COPY . .

EXPOSE 8086

CMD ["npm", "start"]

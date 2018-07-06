# Dockerfile for building NodeJS Seedlink Station connector
#
# Build the container:
# $ docker build -t seedlink-stations:1.0 .
#
# And run the container (may omit the -e flags):
# $ docker run --rm -p 8086:8086 -e "SERVICE_PORT=8086" -e "SERVICE_HOST=0.0.0.0" seedlink-stations:1.0

FROM node:8

# Add metadata
LABEL maintainer="Mathijs Koymans"
LABEL email="koymans@knmi.nl"

# Set the work directory
WORKDIR /usr/src/app

# Copy the source code
COPY . .

# Set default environment variables
ENV SERVICE_HOST=0.0.0.0
ENV SERVICE_PORT=8086

EXPOSE 8086

CMD ["npm", "start"]

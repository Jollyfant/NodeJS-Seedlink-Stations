# nodejs-seedlink-stations-proxy
A proxy written for NodeJS that caches Seedlink information and available stations from Seedlink servers. The cached information is made available through an HTTP API.

## Installation

    git clone https://github.com/Jollyfant/nodejs-seedlink-stations-proxy.git
    npm install

## Configuration
Modify config.json to suit your needs.

## Running

    node index.js

## Docker

    docker build -t seedlink-stations:1.0 .
    docker run -p 8086:8086 [--rm] [-d] [-e "SERVICE_PORT=8087"] [-e "SERVICE_HOST=0.0.0.0"] seedlink-stations:1.0

Two envrionment variables can passed to Docker run to modify settings at runtime. Otherwise information is read from the built configuration file.

  * SERVICE_HOST
  * SERVICE_PORT

## API
The supported parameters are valid host names and ports delimited a semicolon. Multiple hosts may be delimited by a comma.

  * host


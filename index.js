/*
 * nodejs-seedlink-stations-proxy
 *
 * NodeJS application for reading the available 
 * stations from arbitrary Seedlink servers.
 *
 * Copyright ORFEUS Data Center
 * Author: Mathijs Koymans
 * Licensed under MIT
 *
 */

// Native modules
const network = require("net");
const http = require("http");
const url = require("url");
const querystring = require("querystring");
const path = require("path");
const fs = require("fs");

// Global container for Stations
var SeedlinkStationProxy = function(configuration, callback) {

  /* class SeedlinkStationProxy
   * NodeJS proxy for getting Seedlink station information
   */

  function HTTPError(response, statusCode, message) {
 
    /* function HTTPError
     * Writes HTTP reponse to the client
     */

    response.writeHead(statusCode, {"Content-Type": "text/plain"});
    response.write(message);
    response.end();

  }

  function EnableCORS(response) {

    /* function EnableCORS
     * Enables the cross origin headers
     */

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET");

  }

  this.configuration = configuration;
  this.logger = this.setupLogger();

  this.cachedStations = new Object();

  // Create the HTTP server
  const Server = http.createServer(function(request, response) {

    // Enable CORS headers when required
    if(this.configuration.__CORS__) {
      EnableCORS(response);
    }

    var uri = url.parse(request.url);
    var initialized = Date.now();

    // Only root path is supported
    if(uri.pathname !== "/") {
      return HTTPError(response, 404, "Method not supported.")
    }

    var queryObject = querystring.parse(uri.query);

    if(!queryObject.host) {
      return HTTPError(response, 400, "Host parameter is required.");
    }

    // Get the comma delimited of requested servers 
    servers = queryObject.host.split(",").map(this.parseHost);

    if(servers.length === 0) {
      return HTTPError(response, 204);
    }

    // Check user input
    try {
      Object.keys(queryObject).forEach(this.validateParameters);
      servers.forEach(this.validateServer);
    } catch(exception) {
      if(this.configuration.__DEBUG__) {
        return HTTPError(response, 400, exception.stack);
      } else {
        return HTTPError(response, 400, exception.message);
      }
    }

    // Write information to logfile
    response.on("finish", function() {
      this.logger.write(JSON.stringify({
        "timestamp": new Date().toISOString(),
        "method": request.method,
        "query": uri.query,
        "path": uri.pathname,
        "client": request.headers["x-forwarded-for"] || request.connection.remoteAddress,
        "agent": request.headers["user-agent"] || null,
        "statusCode": response.statusCode,
        "type": "HTTP Request",
        "msRequestTime": (Date.now() - initialized)
      }) + "\n");
    }.bind(this));

    // Make queries to the servers (or read from cache)
    this.readSeedlinkStations(servers, function(data) {

      response.writeHead(200, {"Content-Type": "application/json"});
      response.write(JSON.stringify(data));
      response.end();

    });

  }.bind(this));

  // Get process environment variables (Docker)
  var host = process.env.SERVICE_HOST || this.configuration.HOST;
  var port = Number(process.env.SERVICE_PORT) || this.configuration.PORT;

  // Listen to incoming HTTP connections
  Server.listen(this.configuration.PORT, this.configuration.HOST, function() {
    callback(configuration.__NAME__, host, port); 
  }); 

}

SeedlinkStationProxy.prototype.parseHost = function(x) {

  /* function SeedlinkStationProxy.parseHost
   * Parses host:port to usable object
   */

  const DEFAULT_SEEDLINK_PORT = 18000;

  var [host, port] = x.split(":");

  port = Number(port) || DEFAULT_SEEDLINK_PORT;

  return {
    "url": host + ":" + port,
    "host": host,
    "port": port
  }

}

SeedlinkStationProxy.prototype.setupLogger = function() {

  /* function SeedlinkStationProxy.setupLogger
   * Sets up log directory and file for logging
   */

  // Create the log directory if it does not exist
  fs.existsSync(path.join(__dirname, "logs")) || fs.mkdirSync(path.join(__dirname, "logs"));
  return fs.createWriteStream(path.join(__dirname, "logs", "service.log"), {"flags": "a"});

}

SeedlinkStationProxy.prototype.validateParameters = function(key) {

  /* function SeedlinkStationProxy.validateParameters
   * Validates whether a key is allowed;
   */

  const ALLOWED_PARAMETERS = [
    "host"
  ];

  if(!ALLOWED_PARAMETERS.includes(key)) {
    throw new Error("Key " + key + " is not supported.");
  }

}

SeedlinkStationProxy.prototype.validateServer = function(server) {

  /* function SeedlinkStationProxy.validateServer
   * Validates the submitted server port
   */

  // Check if port is integer
  if(!Number.isInteger(server.port)) {
    throw new Error("A submitted port is non-numerical.");
  }

  // Check the submitted port
  if(server.port < 0 || server.port >= (1 << 16)) {
    throw new Error("A submitted port is outside the valid range.");
  }

}

SeedlinkStationProxy.prototype.readSeedlinkStations = function(servers, callback) {

  /* function SeedlinkStationProxy.readSeedlinkStations
   * Concurrently but asynchronously updates the cache 
   */

  // Collect the results for all servers
  var results = new Array();

  // Asynchronously but concurrently get the data
  (next = function() {

    var server = servers.pop();

    this.checkSeedlink(server, function(result) {

      // Update the information in the hashMap
      if(result.error === null) {
        this.cachedStations[server.url] = result;
      }

      results.push(result);

      // Proceed to the next requested server
      if(servers.length) {
        return next();
      }

      callback(results);

    }.bind(this));

  }.bind(this))();

}

SeedlinkStationProxy.prototype.isCached = function(host) {

  /* function isCached
   * Returns boolean whether a seedlink server is cached
   */

  var cachedValue = this.cachedStations[host];

  return cachedValue.requested > (Date.now() - this.configuration.REFRESH_INTERVAL_MS);

}

SeedlinkStationProxy.prototype.newRequestData = function(server) {

  /* function SeedlinkStationProxy.newRequestData
   * Returns new default object for request metadata/data
   */

  return {
    "server": server,
    "stations": new Array(),
    "error": null,
    "version": null,
    "identifier": null,
    "connected": false,
    "requested": Date.now()
  }

}

SeedlinkStationProxy.prototype.checkSeedlink = function(server, callback) {

  var finish = function(socket, host, callback, requestData) {
  
    /* function finish
     * Function to be bound and called per request
     */

    // Destroy the socket
    socket.destroy();

    // Callback with particular request data
    callback(requestData);
  
  }

  /* Function checkSeedlink
   * Checks if Seedlink is present
   * Returns all metadata: networks, stations, sites
   */

  // Constants
  const CRNL = "\r\n";
  const CAT_COMMAND = "CAT" + CRNL;
  const HELLO_COMMAND = "HELLO" + CRNL;

  // Extract the Seedlink server URL
  var url = server.url;

  // If the host is still in the cache
  if(this.cachedStations.hasOwnProperty(url) && this.isCached(url)) {
    return callback(this.cachedStations[url]);
  }

  // Metadata for the request to be filled
  var requestData = this.newRequestData(server);

  // Create a new TCP socket and empty buffer
  const socket = new network.Socket()
  var buffer = new Buffer(0);

  // Bind some parameters to the finish function
  finish = finish.bind(this, socket, url, callback);

  // When the connection is established write HELLO to Seedlink
  socket.connect(server.port, server.host, function() {
    socket.write(HELLO_COMMAND);
  });

  // Data is written over the socket
  socket.on("data", function(data) {

    requestData.connected = true;

    // Extend the buffer with new data
    buffer = Buffer.concat([buffer, data]);

    // Get the Seedlink version
    if(requestData.version === null && buffer.toString().split(CRNL).length === 3) {

      // Extract the version
      var [version, identifier] = buffer.toString().split(CRNL);

      requestData.version = version;
      requestData.identifier = identifier;

      // Reset the buffer for the next request
      buffer = new Buffer(0);

      // Info was requested: proceed with the CAT command
      return socket.write(CAT_COMMAND);

    }

    // If the command was not implemented (e.g. IRIS ringserver)
    if(buffer.toString() === "CAT command not implemented" + CRNL) {
      requestData.error = "CATNOTIMPLEMENTED";
      finish(requestData);
    }

    // End of the Seedlink response
    if(buffer.lastIndexOf("\nEND") === buffer.length - 4) {
      requestData.stations = this.parseBuffer(buffer);
      finish(requestData);
    }

  }.bind(this));

  // An error occured connecting to Seedlink
  socket.on("error", function() {
    requestData.error = "ECONNREFUSED";
    finish(requestData);
  });

  // Propagate timeout to error
  socket.on("timeout", function() {
    socket.emit("error");
  });

  // Set Timout in milliseconds
  socket.setTimeout(this.configuration.SOCKET.TIMEOUT);

}

SeedlinkStationProxy.prototype.parseBuffer = function(buffer) {

  /* function SeedlinkStationProxy.parseBuffer
   * Extracts network, station information from Seedlink CAT response
   */

  // Split by line and map result
  return buffer.slice(0, buffer.lastIndexOf("\nEND")).toString().split("\n").map(this.parseResponse);

}

SeedlinkStationProxy.prototype.parseResponse = function(x) {

  /* function SeedlinkStationProxy.parseResponse
   * Extracts network, station, site from the Seedlink response
   */

  return {
    "network": x.slice(0, 2).trim(),
    "station": x.slice(3, 8).trim(),
    "site": x.slice(9, x.length).trim()
  }

}

// Expose the class
module.exports = SeedlinkStationProxy;

// Start the NodeJS Seedlink Server
if(require.main === module) {

  const CONFIG = require("./config");

  // Start up the WFCatalog
  new module.exports(CONFIG, function(name, host, port) {
    console.log(name + " microservice has been started on " + host + ":" + port);
  });

}

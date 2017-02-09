/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var routes = require('./routes');
var Q = require('q');
var cron = require('node-cron');
var request = require('request');
var path = require('path');
var fs = require('fs');

// variables for cron
var bluemixAPIUrl = "https://www.ibm.com/blogs/bluemix/wp-json/posts";
var CAAPIUrl = "https://www.ibm.com/blogs/cloud-announcements/wp-json/posts";
var bluemixAPIData = [];
var CAAPIData = [];
var bmPage = 1;
var caPage = 1;

// write file promise
var writeToFilePromise = function(writePath, data){
  var deferred = Q.defer();

  fs.writeFile(writePath, data, function(err){
    if(err){
      deferred.reject(new Error(err));
    }
    else {
      deferred.resolve();
    }
  })

  return deferred.promise;
}

// promise loop functions
var promiseWhilePromise = function(condition, action){
  var deferred = Q.defer();
  function loop(){
    condition().then(function(bool){
      if(!bool){
        return deferred.resolve();
      }
      else {
        return Q.when(action(), loop, deferred.reject);
      }
    });
  }
  Q.nextTick(loop);
  return deferred.promise;
}

// promise get request function
var getPromises = function(url){
  var deferred = Q.defer();

  request.get(url, function(err, response, body){
    if(!err && response.statusCode == 200){
      deferred.resolve(parser.toJson(body, {object: true, sanitize: true}));
    }
    else {
      deferred.reject(new Error(err));
    }
  });

  return deferred.promise;
};

// next page
var moreBluemixPage = function(){
  console.log(bmPage);
  bmPage++;
}
var moreCaPage = function(){
  console.log(caPage);
  caPage++;
}

// retrieve bluemix data
var getBluemixData = function(){
  var deferred = Q.defer();
  var currentUrl = bluemixAPIUrl+"?page="+bmPage;
  request.get(currentUrl, function(err, response, body){
    if(!err && response.statusCode == 200){
      var tempData = JSON.parse(body);
      var filtered = tempData.filter(function(o){
        // only what's new from bluemix
        var cats = o.terms.category.filter(function(oo){
          return oo.ID == 1963;
        });
        if(cats.length) return o;
      });
      bluemixAPIData = bluemixAPIData.concat(filtered);
      deferred.resolve(bmPage <= response.headers["x-wp-totalpages"]);
    }
    else {
      deferred.reject(new Error(err));
    }
  });
  return deferred.promise;
}

// retrieve CA data
var getCaData = function(){
  var deferred = Q.defer();
  var currentUrl = CAAPIUrl+"?page="+caPage;
  request.get(currentUrl, function(err, response, body){
    if(!err && response.statusCode == 200){
      CAAPIData = CAAPIData.concat(JSON.parse(body));
      deferred.resolve(caPage <= response.headers["x-wp-totalpages"]);
    }
    else {
      deferred.reject(new Error(err));
    }
  });
  return deferred.promise;
}

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', "*");
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use('/', routes)

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
  // start the cache file
  cron.schedule('0 9,11,13,15 * * *', function(){
    promiseWhilePromise(getBluemixData, moreBluemixPage).then(function(){
      console.log("done retrieve bluemix data - " + new Date());
    })
    .then(function(){
      return promiseWhilePromise(getCaData, moreCaPage).then(function(){
        console.log("done retrieve ca data - " + new Date());
      })
    })
    .then(function(){
      return writeToFilePromise(path.join(process.cwd(), "public", "files", "bluemix.json"), JSON.stringify(bluemixAPIData));
    })
    .then(function(){
      bluemixAPIData = [];
      console.log("done written bluemix data - " + new Date());
      return writeToFilePromise(path.join(process.cwd(), "public", "files", "ca.json"), JSON.stringify(CAAPIData));
    })
    .done(function(){
      CAAPIData = [];
      console.log("done written ca data - " + new Date());
      bmPage = 1;
      caPage = 1;
    })
  });
});

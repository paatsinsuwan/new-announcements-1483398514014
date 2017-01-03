var express = require('express');
var request = require('request');
var parser = require('xml2json');
var _ = require('lodash');
var Q = require('q');
var bluemixUrl = "https://www.ibm.com/blogs/bluemix/category/whats-new/feed/";
var bluemixAPIUrl = "https://www.ibm.com/blogs/bluemix/wp-json/posts";
var middlewareUrl = "https://www.ibm.com/blogs/cloud-announcements/feed/";
var feedDataItems = [];
var router = express.Router();


_.mixin({
  'orderKeysBy': function (obj, comparator, asc) {
    var keys = _.orderBy(_.keys(obj), function (key) {
      return comparator ? comparator(obj[key], key) : key;
    }, asc);

    return _.zipObject(keys, _.map(keys, function (key) {
      return obj[key];
    }));
  },
  'reverseCollection': function (obj){
    var keys = Object.keys(obj);
    var tempCol = {};

    for(var i = keys.length-1; i >= 0; i--){
      tempCol[keys[i]] = obj[keys[i]];
    }
    return tempCol;
  }
});

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

router.use('/by-month', function(req, res, next){
  feedDataItems = [];
  getPromises(bluemixUrl).then(function(data){
    feedDataItems = feedDataItems.concat(data.rss.channel.item);
    return getPromises(middlewareUrl);
  })
  .then(function(data){
    feedDataItems = feedDataItems.concat(data.rss.channel.item);
  })
  .done(function(){
    var grouped = _.groupBy(feedDataItems, function(o){
      return new Date(o.pubDate).getMonth();
    });
    _.forEach(grouped, function(o){
      o = _.orderBy(o, function(oo){
        return new Date(oo);
      });
    });
    res.header('Content-Type', 'application/json')
    .send(JSON.stringify(grouped));
  });
});

router.use('/', function(req, res, next){
  feedDataItems = [];
  getPromises(bluemixUrl).then(function(data){
    feedDataItems = feedDataItems.concat(data.rss.channel.item);
    return getPromises(middlewareUrl);
  })
  .then(function(data){
    feedDataItems = feedDataItems.concat(data.rss.channel.item);
  })
  .done(function(){
    var sorted = _.orderBy(feedDataItems, 'DESC', function(item){
      return new Date(item.pubDate);
    });
    res.header('Content-Type', 'application/json')
    .send(JSON.stringify(sorted));
  });
});

module.exports = router;
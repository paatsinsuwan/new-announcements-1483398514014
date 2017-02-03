var express = require('express');
var request = require('request');
var parser = require('xml2json');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var Q = require('q');
var bluemixUrl = "https://www.ibm.com/blogs/bluemix/category/whats-new/feed/";
var bluemixAPIUrl = "https://www.ibm.com/blogs/bluemix/wp-json/posts";
var CAAPIUrl = "https://www.ibm.com/blogs/cloud-announcements/wp-json/posts";
var middlewareUrl = "https://www.ibm.com/blogs/cloud-announcements/feed/";
var feedDataItems = [];
var bluemixAPIData = [];
var CAAPIData = [];
var page = 1;
var router = express.Router();

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

var getBluemixData = function(){
  var deferred = Q.defer();
  var currentUrl = bluemixAPIUrl+"?page="+page;
  request.get(currentUrl, function(err, response, body){
    if(!err && response.statusCode == 200){
      var tempData = JSON.parse(body);
      var filtered = tempData.filter(function(o){
        var cats = o.terms.category.filter(function(oo){
          // what's new category ID on Bluemix blog
          return oo.ID == 1963;
        });
        if(cats.length) return o;
      });
      bluemixAPIData = bluemixAPIData.concat(filtered);
      deferred.resolve(page <= response.headers["x-wp-totalpages"]);
      // dev testing number of page
      // deferred.resolve(page <= 1);
    }
    else {
      deferred.reject(new Error(err));
    }
  });
  return deferred.promise;
}

var getCAData = function(){
  var deferred = Q.defer();
  var currentUrl = CAAPIUrl+"?page="+page;
  request.get(currentUrl, function(err, response, body){
    if(!err && response.statusCode == 200){
      // var tempData = JSON.parse(body);
      // var filtered = tempData.filter(function(o){
      //   var cats = o.terms.category.filter(function(oo){
      //     // what's new category ID on Bluemix blog
      //     return oo.ID == 1963;
      //   });
      //   if(cats.length) return o;
      // });
      // CAAPIData = bluemixAPIData.concat(filtered);
      CAAPIData = CAAPIData.concat(JSON.parse(body));
      deferred.resolve(page <= response.headers["x-wp-totalpages"]);
      // dev testing number of page
      // deferred.resolve(page <= 1);
    }
    else {
      deferred.reject(new Error(err));
    }
  });
  return deferred.promise;
}

var morePage = function(){
  console.log(page);
  page++;
}

var setFirstPage = function(){
  page = 1;
}

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

var readFilePromise = function(readPath){
  var deferred = Q.defer();

  fs.readFile(readPath, function(err, data){
    if(err){
      deferred.reject(new Error(err));
    }
    else {
      deferred.resolve(data);
    }
  })

  return deferred.promise; 
}

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
    console.log("in done");
    var grouped = _.groupBy(feedDataItems, function(o){
      return new Date(o.pubDate).getMonth();
    });
    var groupedByYear = _.groupBy(feedDataItems, function(o){
      return new Date(o.pubDate).getFullYear();
    });
    res.header('Content-Type', 'application/json')
    .send(JSON.stringify(grouped));
  });
});

router.use('/new/v2/:page', function(req, res, next){
  var sorted = [];
  var promiseCalls = [];
  var page = req.params.page;

  if(bluemixAPIData.length === 0){
    promiseCalls.push(readFilePromise(path.join(process.cwd(), "public", "files", "bluemix.json")))
  }
  if(CAAPIData.length === 0){
    promiseCalls.push(readFilePromise(path.join(process.cwd(), "public", "files", "ca.json"))) 
  }
  Q.all(promiseCalls).then(function(results){
    if(results.length !== 0){
      bluemixAPIData = JSON.parse(results[0]);
      CAAPIData = JSON.parse(results[1]);
    }
  })
  .done(function(){

    var now = new Date();
    var max = 2;
    var bd = [];
    var cd = [];

    if(page !== 1){
      now.setMonth(now.getMonth()-(((page-1)*3)));
    }

    for(var i = 0; i <= max; i++){
      var currentDate = new Date(now);
      currentDate.setMonth(currentDate.getMonth() - i);
      var arr = bluemixAPIData.filter(function(item){
        var currentItemDate = new Date(item.date_gmt);
        return (currentItemDate.getMonth() == currentDate.getMonth())&&(currentItemDate.getFullYear() == currentDate.getFullYear());
      });
      bd = bd.concat(arr);
      arr =  CAAPIData.filter(function(item){
        var currentItemDate = new Date(item.date_gmt);
        return (currentItemDate.getMonth() == currentDate.getMonth())&&(currentItemDate.getFullYear() == currentDate.getFullYear());
      });
      cd = cd.concat(arr);
    }

    sorted = sorted.concat(bd);
    sorted = sorted.concat(cd);

    var sorted2 = sorted.sort(function(a, b){
      var aa = new Date(a.date);
      var bb = new Date(b.date);
      if( aa.getTime() !== bb.getTime()){
        if(aa.getTime() < bb.getTime()){
          return 1;
        }
        if(aa.getTime() > bb.getTime()){
          return -1;
        }
      }
      return 0;

    });
    res.header('Content-Type', 'application/json')
    .send(JSON.stringify(sorted2));  
  })
  
})

router.use('/new', function (req, res, next) {
  feedDataItems = [];
  getPromises(bluemixUrl).then(function(data){
    feedDataItems = feedDataItems.concat(data.rss.channel.item);
    return getPromises(middlewareUrl);
  })
  .then(function(data){
    feedDataItems = feedDataItems.concat(data.rss.channel.item);
  })
  .done(function(){
    var sorted = feedDataItems.sort(function(a, b){
      var aa = new Date(a.pubDate);
      var bb = new Date(b.pubDate);
      if( aa.getTime() !== bb.getTime()){
        if(aa.getTime() < bb.getTime()){
          return 1;
        }
        if(aa.getTime() > bb.getTime()){
          return -1;
        }
      }
      return 0;

    });
    res.header('Content-Type', 'application/json')
    .send(JSON.stringify(sorted));
  });
});

router.use('/getBluemix', function(req, res, next){
  promiseWhilePromise(getBluemixData, morePage).then(function(){
    console.log("done retrieving!!!!")
    return writeToFilePromise(path.join(process.cwd(), "public", "files", "bluemix.json"), JSON.stringify(bluemixAPIData));
  })
  .then(function(){
    console.log("file written");
    setFirstPage();
  })
  .done(function(){
    res.send("done");
  })
})

router.use('/getCA', function(req, res, next){
  promiseWhilePromise(getCAData, morePage).then(function(){
    console.log("done retrieving!!!!")
    return writeToFilePromise(path.join(process.cwd(), "public", "files", "ca.json"), JSON.stringify(CAAPIData));
  })
  .then(function(){
    console.log("file written");
    setFirstPage();
  })
  .done(function(){
    res.send("done");
  })
})

router.use('/', function(req, res, next){
  feedDataItems = [];
  getPromises(bluemixUrl).then(function(data){

    console.log("bluemix : " + data.rss.channel.item.length);
    feedDataItems = feedDataItems.concat(data.rss.channel.item);
    return getPromises(middlewareUrl);
  })
  .then(function(data){
    console.log("CA : " + data.rss.channel.item.length);
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
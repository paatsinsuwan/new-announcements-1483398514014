var express = require('express');

var feeds = require('./feeds');

var router = express.Router();

router.use('/feeds', feeds);

router.use('/', express.static(__dirname + '/public'));

module.exports = router;
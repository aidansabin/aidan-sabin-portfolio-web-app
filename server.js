// init project
var express = require('express');
var mongodb = require('mongodb');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var dns = require('dns');
var app = express();
var port = process.env.PORT || 3000;

// enable CORS (https://en.wikipedia.org/wiki/Cross-origin_resource_sharing)
// so that your API is remotely testable by FCC
var cors = require('cors');
app.use(cors({optionsSuccessStatus: 200}));  // some legacy browsers choke on 204
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

app.get("/", function (req, res) {
  res.sendFile(__dirname + '/views/index.html');
});

app.get("/timestamp", function (req, res) {
  res.sendFile(__dirname + '/views/timestamp.html');
});

app.get("/header-parser", function (req, res) {
  res.sendFile(__dirname + '/views/header-parser.html');
});

app.get("/url-shortener", function (req, res) {
  res.sendFile(__dirname + '/views/url-shortener.html');
});

//Timestamp Microservice (no date_string)
app.get("/api", function (req, res) {
  res.json({
    "unix": Date.now(),
    "utc": new Date(Date.now()).toUTCString()
  });
});

//Request Header Parser Microservice
app.get("/api/whoami", function (req, res) {
  res.json({
    ipaddress: req.connection.remoteAddress,
    language: req.headers['accept-language'],
    software: req.headers['user-agent']
  });
});

//Url-Shortener Microservice
var Schema = mongoose.Schema;
var UrlData = mongoose.model("UrlData", new Schema({
  original_url: String,
  short_url: String,
  short_id: String
}));

var shortId;
UrlData.countDocuments({}, function (err, num) {
  if (err) return console.error(err);
  shortId = num + 1;
});

app.use(bodyParser.urlencoded());
app.post("/api/shorturl", function (req, res) {
  let url = req.body.url;
  dns.lookup(url, function (err, address) {
    if (err) {
      res.json({
        error: "invalid url"
      });
    }
  });
  let newUrl = new UrlData({
    original_url: url,
    short_url: shortId,
  });
  UrlData.findOne({ original_url: newUrl.original_url })
  .exec(function (err, data) {
    if (err) return console.error(err);
    if (data !== null) {
      res.json({ original_url: data.original_url, short_url: data.short_url });
    } else {
      shortId++;
      newUrl.save();
      res.json({ original_url: newUrl.original_url, short_url: newUrl.short_url });
    }
  })
});

app.get("/api/shorturl/:short_code", function (req, res) {
  let shortUrl = req.params.short_code;
  UrlData.findOne({ short_id: shortUrl }, function (err, data) {
    if (err) return console.error(err);
    if (data.original_url.match(/http/ig)) {
      res.status(301).redirect(data.original_url);
    } else {
      res.status(301).redirect("https://" + data.original_url);
    }
  })
});

//Timestamp Microservice (with date_string)
app.get("/api/:date_string", function (req, res) {
  let dateString = req.params.date_string;
  let date = new Date(dateString);
  let unix = date.getTime();;
  if (parseInt(dateString).toString().length > 4) {
    date = new Date(parseInt(dateString));
    unix = parseInt(dateString);
  };
  if (date == "Invalid Date") {
    res.json({ "error" : "Invalid Date" });
  } else {
    res.json({
      "unix": unix,
      "utc": date.toUTCString()
    })
  };
});

// listen for requests
var listener = app.listen(port, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});

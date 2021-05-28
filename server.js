// init project
var express = require('express');
var mongodb = require('mongodb');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var dns = require('dns');
var multer = require('multer');
//var upload = multer({ dest: '/uploads' });
var app = express();
var port = process.env.PORT || 3000;

// enable CORS (https://en.wikipedia.org/wiki/Cross-origin_resource_sharing)
// so that your API is remotely testable by FCC
var cors = require('cors');
app.use(cors());  // some legacy browsers choke on 204

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

app.get("/file-metadata", function (req, res) {
  res.sendFile(__dirname + '/views/file-metadata.html');
});

app.get("/exercise-tracker", function (req, res) {
  res.sendFile(__dirname + '/views/exercise-tracker.html');
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
  short_url: String
}));

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.post("/url-shortener/api/shorturl", async function (req, res) {
  let url = req.body.url;
  if (/\/$/.test(url)) {
    url = url.replace(/\/$/, "");
  }
  if (/^(https:\/\/(?!www.)|http:\/\/(?!www.))/.test(url)) {
    url = url.replace(/^(https:\/\/|http:\/\/)/, "www.");
  } else if (/^(https:\/\/(?=www.)|http:\/\/(?=www.))/.test(url)) {
    url = url.replace(/^(https:\/\/www.|http:\/\/www.)/, "www.");
  }
  dns.lookup(url.replace(/^www./, ""), function (err, address) {
    if (err) {
      return res.json({
        error: "invalid url"
      });
    }
  });
  var shortUrl = 1;
  await UrlData.find({}).countDocuments({}, (err, count) => {
    if (err) return console.error(err);
    shortUrl = shortUrl + count;
  })
  UrlData.findOne({ original_url: url }, (err, data) => {
    if (err) return console.error(err);
    if (data !== null) {
      return res.json({ original_url: data.original_url, short_url: data.short_url });
    } else {
      let newUrl = new UrlData({
        original_url: url,
        short_url: shortUrl
      });
      newUrl.save();
      return res.json({ original_url: newUrl.original_url, short_url: newUrl.short_url });
    }
  })
});

app.get("/url-shortener/api/shorturl/:short_code", function (req, res) {
  let shortCode = req.params.short_code;
  UrlData.findOne({ short_url: shortCode }, function (err, data) {
    if (err) return console.error(err);
    if (data === undefined || typeof(data) !== Number) {
      return res.send("invalid short url");
    }
    if (data.original_url.match(/http/ig)) {
      return res.status(301).redirect(data.original_url);
    } else {
      return res.status(301).redirect("https://" + data.original_url);
    }
  });
});

//Exercise Tracker Microservice
var Users = mongoose.model("Users", new Schema({
  username: String,
  count: Number,
  log: [Schema.Types.Mixed]
}));

app.get("/api/users", function (req, res) {
  Users.find({})
  .select({ log: 0 })
  .exec((err, data) => {
    if (err) return console.error(err);
    res.json(data);
  });
});

app.post("/api/users", function (req, res) {
  let user = new Users({
    username: req.body.username,
    count: 0,
    log: []
  });
  Users.findOne({ username: user.username }, (err, data) => {
    if (err) return console.error(err);
    if (data !== null) {
      return res.send("username already exists");
    } else {
      user.save();
      return res.json(user);
    }
  })
});

app.post("/api/users/:_id/exercises", function (req, res) {
  let user = req.params['_id'];
  let date;
  if (!req.body.date) {
    date = new Date().toDateString();
  } else {
    date = new Date(req.body.date).toDateString();
  };
  let exercise = {
    description: req.body.description,
    duration: Number(req.body.duration),
    date: date
  };
  Users.findByIdAndUpdate(user, { $push: { log: exercise } }, { new: true }, (err, data) => {
    if (err) return console.error(err);
    if (data !== null) {
      data.count++;
      data.save();
      return res.json({ _id: data['_id'], username: data.username, description: exercise.description, duration: exercise.duration, date: exercise.date });
    } else {
      return res.send("user not found");
    }
  });
});

app.get("/api/users/:_id/logs", function (req, res) {
  let from = req.query.from;
  let to = req.query.to;
  let limit = Number(req.query.limit);
  let user = req.params['_id'];
  Users.findById(user, (err, data) => {
    if (err) return console.error(err);
    if (data !== null) {
      let logs = data.log;
      let sorted = logs.sort((a,b) => new Date(b.date) - new Date(a.date));
      if (from !== undefined) {
        sorted = sorted.filter(val => new Date(val.date).getTime() > new Date(from).getTime());
      }
      if (to !== undefined) {
        sorted = sorted.filter(val => new Date(val.date).getTime() < new Date(to).getTime());
      }
      if (!isNaN(limit)) {
        sorted = sorted.filter((val, index) => index < limit);
      }
      return res.json({
        _id: data['_id'],
        username: data.username,
        count: data.count,
        log: sorted
      });
    } else {
      return res.send("user not found");
    }
  });
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
/*
//File Metadata Microservice
app.post("/api/fileanalyse", upload.single("upfile"), function (req, res) {
  var file = req.file;
  res.json({ name: file.originalname, type: file.mimetype, size: file.size })
});
*/
// listen for requests
var listener = app.listen(port, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});

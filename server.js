const http = require('http');
const https = require('https');

const FIREBASE_URL = 'relay-test1001-default-rtdb.asia-southeast1.firebasedatabase.app';  // Changed!

const server = http.createServer((req, res) => {
  console.log('Request:', req.url);
  
  if (req.url === '/' || req.url === '/test') {
    res.writeHead(200);
    res.end('Proxy Running!');
    return;
  }
  
  const parts = req.url.split('/');
  if (parts[1] !== 'relay' || !parts[2]) {
    res.writeHead(404);
    res.end('Use /relay/DEVICE_ID');
    return;
  }
  
  const deviceId = parts[2];
  const fbPath = '/devices/' + deviceId + '/relay.json';
  
  console.log('Proxy to:', fbPath);
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache'
  });
  
  https.get({
    hostname: FIREBASE_URL,
    path: fbPath,
    headers: {'Accept': 'text/event-stream'}
  }, function(fbRes) {
    fbRes.on('data', function(d) {
      res.write(d);
    });
    fbRes.on('end', function() {
      res.end();
    });
  }).on('error', function(err) {
    console.error(err);
    res.end();
  });
  
}).listen(process.env.PORT || 8080, function() {
  console.log('Server running on port', process.env.PORT || 8080);
});

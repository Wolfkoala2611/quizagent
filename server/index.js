const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'data.json');

// load or init data
let data = { status: { started: false }, results: [] };
try {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || data;
  } else {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }
} catch (e) {
  console.error('Failed to load data file', e);
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save data file', e);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // serve project root so index.html works

// status endpoints
app.get('/api/status', (req, res) => {
  res.json(data.status);
});
app.post('/api/status', (req, res) => {
  const { started } = req.body;
  data.status.started = !!started;
  saveData();
  io.emit('status', data.status);
  res.json({ ok: true, status: data.status });
});

// results endpoints
app.get('/api/results', (req, res) => {
  res.json({ results: data.results });
});
app.post('/api/results', (req, res) => {
  const rec = req.body;
  if(rec && typeof rec === 'object'){
    data.results.push(rec);
    saveData();
    io.emit('new-result', rec);
    res.json({ ok: true });
  } else res.status(400).json({ ok: false });
});

// reset results (admin)
app.post('/api/reset-results', (req, res) => {
  data.results = [];
  saveData();
  io.emit('results-reset');
  res.json({ ok: true });
});

// socket handlers for real-time
io.on('connection', socket => {
  console.log('socket connected', socket.id);
  // send current status and results
  socket.emit('status', data.status);
  socket.emit('all-results', data.results);

  socket.on('set-status', (s) => {
    data.status.started = !!s.started;
    saveData();
    io.emit('status', data.status);
  });

  socket.on('submit-result', (rec) => {
    data.results.push(rec);
    saveData();
    io.emit('new-result', rec);
  });

  socket.on('disconnect', () => {
    // nothing for now
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));

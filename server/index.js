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
let data = { started: false, answers: {}, results: [] };
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

// Root route - redirect to admin page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// status endpoints
app.get('/api/status', (req, res) => {
  res.json({ started: data.started });
});
app.post('/api/status', (req, res) => {
  const { started } = req.body;
  data.started = !!started;
  saveData();
  io.emit('quiz-started');
  res.json({ ok: true, started: data.started });
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
  // send current state to new client
  socket.emit('quiz-state', { started: data.started, answers: data.answers, results: data.results });

  socket.on('get-state', (_, callback) => {
    if (typeof callback === 'function') {
      callback({ started: data.started, answers: data.answers, results: data.results });
    }
  });

  socket.on('host-login', () => {
    console.log('Host logged in', socket.id);
  });

  socket.on('start-quiz', () => {
    data.started = true;
    saveData();
    io.emit('quiz-started');
  });

  socket.on('stop-quiz', () => {
    data.started = false;
    saveData();
    io.emit('quiz-stopped');
  });

  socket.on('set-answer', (msg) => {
    const { qIdx, ansIdx } = msg;
    if (qIdx !== undefined && ansIdx !== undefined) {
      data.answers[qIdx] = ansIdx;
      saveData();
      io.emit('answer-set', { qIdx, ansIdx });
    }
  });

  socket.on('submit-result', (rec) => {
    if (rec && typeof rec === 'object') {
      data.results.push(rec);
      saveData();
      io.emit('new-result', rec);
    }
  });

  socket.on('reset-all', () => {
    data.answers = {};
    data.results = [];
    saveData();
    io.emit('all-reset');
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));

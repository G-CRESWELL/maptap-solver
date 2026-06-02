const express = require('express');
const cors = require('cors');
const { fetchPuzzle } = require('./puzzleProxy');
const { solvePuzzle } = require('./solver');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/puzzle', async (req, res) => {
  try {
    const cities = await fetchPuzzle();
    res.json({ success: true, cities });
  } catch (err) {
    console.error('Puzzle fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/solve', async (req, res) => {
  const { cities } = req.body;
  if (!cities || !Array.isArray(cities)) {
    return res.status(400).json({ success: false, error: 'cities array required' });
  }
  try {
    const results = await solvePuzzle(cities);
    res.json({ success: true, results });
  } catch (err) {
    console.error('Solve error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`MapTap solver server running on http://localhost:${PORT}`));

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const bcrypt = require('bcrypt');
const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');
const { Pool } = require('pg');
const initializePassport = require('./passport-config');

const app = express();
const PORT = 3000;

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Helper function for database queries
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
};

// Initialize passport with database queries
initializePassport(
  passport,
  async email => {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },
  async id => {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }
);

// View setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(flash());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));

// ---------------- ROUTES ----------------

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { name: req.user.name });
});

app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login.ejs');
});

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}));

app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs');
});

app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const result = await query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [req.body.name, req.body.email, hashedPassword]
    );
    res.redirect('/login');
  } catch (err) {
    res.render('register', { 
      messages: ['Registration failed. Email may already be in use.'],
      name: req.body.name,
      email: req.body.email
    });
  }
});

app.delete('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

// --------------- GAME ROUTES ----------------

app.get('/game', ensureAuthenticated, (req, res) => {
  res.render('game');
});

// Save game result
app.post('/game/result', ensureAuthenticated, async (req, res) => {
  const score = parseInt(req.body.score);
  const userId = req.user.id;

  try {
    // Check if stats exist
    const statsCheck = await query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [userId]
    );

    if (statsCheck.rows.length === 0) {
      // Create new stats record
      await query(
        'INSERT INTO user_stats (user_id, games_played, total_clicks, best_score) VALUES ($1, 1, $2, $3)',
        [userId, score, score]
      );
    } else {
      // Update existing stats
      const currentStats = statsCheck.rows[0];
      const newGamesPlayed = currentStats.games_played + 1;
      const newTotalClicks = currentStats.total_clicks + score;
      const newBestScore = Math.max(currentStats.best_score, score);

      await query(
        'UPDATE user_stats SET games_played = $1, total_clicks = $2, best_score = $3 WHERE user_id = $4',
        [newGamesPlayed, newTotalClicks, newBestScore, userId]
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// --------------- DASHBOARD + LEADERBOARD ----------------

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [userId]
    );

    const stats = result.rows[0] || {
      games_played: 0,
      total_clicks: 0,
      best_score: 0
    };

    const averageClicks = stats.games_played
      ? (stats.total_clicks / stats.games_played).toFixed(2)
      : 0;

    res.render('dashboard', {
      userStats: {
        name: req.user.name,
        gamesPlayed: stats.games_played,
        bestScore: stats.best_score,
        averageClicks
      }
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

app.get('/leaderboard', ensureAuthenticated, async (req, res) => {
  try {
    const result = await query(
      'SELECT u.name, us.best_score FROM users u JOIN user_stats us ON u.id = us.user_id ORDER BY us.best_score DESC LIMIT 3'
    );

    const topUsers = result.rows.map(row => ({
      name: row.name,
      bestScore: row.best_score
    }));

    res.render('leaderboard', { topUsers });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ---------------- AUTH GUARDS ----------------

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return res.redirect('/');
  next();
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// ---------------- SERVER ----------------

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Handle database connection on server shutdown
process.on('SIGINT', async () => {
  await pool.end();
  process.exit();
});
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const db = require('./db');

function initialize(passport) {
  const authenticateUser = async (email, password, done) => {
    try {
      // 1. Find user by email
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      
      // 2. Check if user exists
      if (result.rows.length === 0) {
        return done(null, false, { message: 'No user with that email' });
      }

      const user = result.rows[0];
      
      // 3. Validate password is not empty
      if (!password) {
        return done(null, false, { message: 'Password is required' });
      }

      // 4. Validate hashed password exists
      if (!user.password) {
        return done(null, false, { message: 'User account corrupted' });
      }

      // 5. Compare passwords
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Password incorrect' });
      }
    } catch (e) {
      return done(e);
    }
  };

  passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser));
  
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      done(null, result.rows[0]);
    } catch (e) {
      done(e);
    }
  });
}

module.exports = initialize;
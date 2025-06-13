const { exec } = require('child_process');
require('dotenv').config();

const psqlPath = '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"'; // Use double quotes and escape backslashes
const command = `${psqlPath} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -f init.sql`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error executing command: ${error.message}`);
    return;
  }
  console.log(`Database initialized:\n${stdout}`);
  if (stderr) console.error(`Errors:\n${stderr}`);
});
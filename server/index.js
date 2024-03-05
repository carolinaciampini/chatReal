import express from "express";
import logger from "morgan";
import * as dotenv from 'dotenv';
import { Server } from "socket.io";
import { createServer } from "node:http";
import mysql from 'mysql2';

const port = process.env.PORT ?? 3000;
const app = express();
const server = createServer(app);
const io = new Server(server); // io > IN OUT bidireccional
dotenv.config();

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DB
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to database: ' + err.stack);
  } else {
    console.log('Database connection successful');

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        content TEXT,
        username TEXT
      )
    `;

    connection.query(createTableQuery, (err, results) => {
      if (err) {
        console.error('Error creating table: ' + err.stack);
      } else {
        console.log('Table created successfully');
      }

      connection.release();
    });
  }
});

io.on("connection", (socket) => {
  console.log("A user has been connected");

  socket.on("disconnect", () => {
    console.log("A user has disconnected");
  });

  socket.on("chat message", (msg) => {
      const username = socket.handshake.auth.username || "anonymous";
      const item = {
      message: msg,
      username: username,
      serverOffset: socket.handshake.auth.serverOffset ?? 0,
    };
    // console.log('Username:', username);
    
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting database connection: ' + err.stack);
        return;
      }

      const sql = "INSERT INTO messages (content, username) VALUES (?, ?)";
      const args = [item.message, item.username];

      connection.query(sql, args, (error, results, fields) => {
        if (error) {
          console.error('Error inserting message:', error);
        } else {
          console.log('Message inserted successfully');

          // Emitir el mensaje del chat y el último ID insertado a todos los clientes
          io.emit("chat message", item);
        }

        connection.release();
      });
    });
  });

  if (!socket.recovered) {
    const sql = "SELECT id, content, username FROM messages WHERE id > ?";
    const args = [socket.handshake.auth.serverOffset ?? 0];

    pool.query(sql, args, (error, results, fields) => {
      if (error) {
        console.error('Error retrieving messages:', error);
        return;
      }

      // Emitir mensajes anteriores al usuario
      results.forEach(row => {
        socket.emit("chat message", { message: row.content, messageId: row.id.toString(), username: row.user_name });
      });

      // Marcar el socket como recuperado
      socket.recovered = true;
    });
  }
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log( `Server listening on port ${port} ` );
});
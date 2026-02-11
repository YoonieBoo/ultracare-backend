const Database = require("better-sqlite3")

const db = new Database("ultracare.db")

db.exec(`
CREATE TABLE IF NOT EXISTS devices (
  deviceId TEXT PRIMARY KEY,
  lastSeen INTEGER,
  status TEXT
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT,
  room TEXT,
  cameraId TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  elderly TEXT,
  room TEXT,
  type TEXT,
  confidence REAL,
  status TEXT,
  time TEXT,
  createdAt INTEGER
);
`)

// Seed 2 residents ONLY ONCE
const count = db.prepare("SELECT COUNT(*) as c FROM residents").get().c
if (count === 0) {
  db.prepare(
    "INSERT INTO residents (nickname, room, cameraId) VALUES (?, ?, ?)"
  ).run("Grandpa", "Living Room", "CAM-201")

  db.prepare(
    "INSERT INTO residents (nickname, room, cameraId) VALUES (?, ?, ?)"
  ).run("Grandma", "Bedroom", "CAM-202")
}

module.exports = db

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT,
  thumbnail_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  published_at DATETIME,
  duration_seconds INTEGER,
  language TEXT,
  transcript TEXT,
  audio_filename TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  input_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  current_step TEXT,
  error TEXT,
  track_id TEXT,
  channel_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  title,
  transcript,
  language,
  content=tracks,
  content_rowid=rowid,
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS tracks_fts_insert AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, transcript, language)
  VALUES (new.rowid, new.title, new.transcript, new.language);
END;

CREATE TRIGGER IF NOT EXISTS tracks_fts_update AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, transcript, language)
  VALUES ('delete', old.rowid, old.title, old.transcript, old.language);
  INSERT INTO tracks_fts(rowid, title, transcript, language)
  VALUES (new.rowid, new.title, new.transcript, new.language);
END;

CREATE TRIGGER IF NOT EXISTS tracks_fts_delete AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, transcript, language)
  VALUES ('delete', old.rowid, old.title, old.transcript, old.language);
END;

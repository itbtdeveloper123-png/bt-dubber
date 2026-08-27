const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, '..', 'data', 'dubber.db');
if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);
  
  // 1. Delete demo recaps, flower videos, and empty segment recaps
  db.exec(`
    DELETE FROM recaps 
    WHERE movie_title LIKE '%Cyber Vault%' 
       OR movie_title LIKE '%ប្លន់ធនាគារ%' 
       OR movie_title LIKE '%ក្មេងស្រីអនាថា%'
       OR video_url LIKE '%flower.mp4%'
       OR segments_json = '[]'
       OR segments_json IS NULL;
  `);
  
  // 2. Deduplicate recaps: Keep only the latest entry per movie_title
  const recaps = db.prepare('SELECT id, movie_title, created_at, updated_at FROM recaps ORDER BY updated_at DESC').all();
  console.log('Recaps found after demo purge:', recaps.length);

  const seenTitles = new Set();
  for (const r of recaps) {
    if (seenTitles.has(r.movie_title)) {
      console.log('Deleting duplicate recap:', r.id, r.movie_title);
      db.prepare('DELETE FROM recaps WHERE id = ?').run(r.id);
    } else {
      seenTitles.add(r.movie_title);
    }
  }

  // 3. Clean series_projects table: Remove demo clips
  const projects = db.prepare('SELECT * FROM series_projects').all();
  for (const p of projects) {
    try {
      const clips = JSON.parse(p.clips_json || '[]');
      const cleanedClips = clips.filter(c => c.id !== 'clip_demo_1' && !c.videoUrl?.includes('flower.mp4') && !c.title?.includes('Cyber Vault'));
      db.prepare('UPDATE series_projects SET clips_json = ?, title = ? WHERE id = ?').run(
        JSON.stringify(cleanedClips),
        cleanedClips.length > 0 ? cleanedClips[0].title : 'ស៊េរីរឿងថ្មី',
        p.id
      );
    } catch(e) {}
  }

  const finalRecaps = db.prepare('SELECT id, movie_title, segments_json FROM recaps').all();
  console.log('Final clean recaps in DB (' + finalRecaps.length + '):');
  finalRecaps.forEach(r => {
    console.log(`- [${r.id}] ${r.movie_title}`);
  });
} else {
  console.log('DB file not found at:', dbPath);
}

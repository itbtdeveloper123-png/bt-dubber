import sqlite3
import json
import re

def infer_speaker(khmer_script, original_summary, current_speaker):
    text = f"{current_speaker} {khmer_script} {original_summary}".lower()

    # Grandparents / Elders
    if re.search(r'តាចាស់|លោកតា|តា\s|តាឡៅ|តា\b|grandpa|grandfather|old man|elderly', text):
        return 'male_elder', 'ឡៅចាវ'
    if re.search(r'យាយចាស់|លោកយាយ|យាយ\s|យាយ\b|grandma|grandmother|old woman', text):
        return 'female_elder', 'យាយចាស់'

    # Children
    if re.search(r'ក្មេងប្រុស|កូនប្រុសតូច|ស៊ាវប៉ៅ|កូនតូចប្រុស|little boy|schoolboy|young son', text):
        return 'child_boy', 'ស៊ាវប៉ៅ'
    if re.search(r'ក្មេងស្រី|កូនស្រីតូច|little girl|schoolgirl|young daughter', text):
        return 'child_girl', 'ក្មេងស្រី'
    if re.search(r'កូនតូច|ក្មេង|កុមារ|ក្ដៅខ្លួន|baby|kid|child', text):
        return 'child_boy', 'ស៊ាវប៉ៅ'

    # Female characters
    if re.search(r'ឆេងយី|ឆេងយីង|នាង|ស្រី|ប្រពន្ធ|ម៉ាក់|ម្ដាយ|អ្នកស្រី|មីង|កញ្ញា|នារី|sister|woman|girl|mother|wife|female|lady|she|her', text):
        return 'female', 'ឆេងយីង'

    # Villain
    if re.search(r'តួកាច|មេបិសាច|ចោរ|ឧក្រិដ្ឋជន|villain|monster|demon|thief|criminal', text):
        return 'villain', 'តួកាច'

    # Police
    if re.search(r'ប៉ូលីស|លោកប៉ូលីស|ពូប៉ូលីស|police|officer', text):
        return 'male', 'លោកប៉ូលីស'

    # Male characters
    if re.search(r'ឡៅចាវ|ឡៅចៅ|បងប្រុស|ប្ដី|ពូ|លោក|ប៉ា|ឪពុក|កូនប្រុស|មេបញ្ជាការ|man|boy|father|husband|dad|brother|male|he|him', text):
        return 'male', 'ឡៅចាវ'

    return 'male', 'តួប្រុស'

conn = sqlite3.connect('data/dubber.db')
c = conn.cursor()
c.execute('SELECT id, movie_title, segments_json, raw_data_json FROM recaps')
rows = c.fetchall()

for row in rows:
    recap_id = row[0]
    movie_title = row[1]
    segs = json.loads(row[2])
    raw_data = json.loads(row[3])

    print(f"Processing recap {recap_id} with {len(segs)} segments...")
    for idx, s in enumerate(segs):
        gender, name = infer_speaker(s.get('khmer_script', ''), s.get('original_summary', ''), s.get('speaker_name', ''))
        s['speaker_gender'] = gender
        s['speaker_name'] = name

    raw_data['recap_segments'] = segs

    c.execute(
        'UPDATE recaps SET segments_json = ?, raw_data_json = ?, updated_at = datetime("now") WHERE id = ?',
        (json.dumps(segs, ensure_ascii=False), json.dumps(raw_data, ensure_ascii=False), recap_id)
    )

# Clear TTS cache so fresh audio is generated for the new genders
c.execute('DELETE FROM tts_cache')
conn.commit()
conn.close()
print("Updated all segments in SQLite database successfully and cleared stale TTS cache!")

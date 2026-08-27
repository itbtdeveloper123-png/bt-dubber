import { SampleTranscript, MovieRecapResult } from '../types';

export const DEFAULT_DEMO_RECAP: MovieRecapResult = {
  movie_title: "ប្រតិបត្តិការប្លន់ធនាគារ សាយប័រ វ៉ូល Heist",
  total_recap_duration_est: "00:45",
  genre_tag: "Action / Cyber Crime",
  created_at: new Date().toISOString(),
  videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  videoFileName: "Cyber_Vault_Trailer_1080p.mp4",
  mediaType: "video",
  recap_segments: [
    {
      segment_id: 1,
      start_time: "00:00",
      end_time: "00:08",
      original_summary: "Ready team? Tonight we break into the Cyber Vault!",
      khmer_script: "ត្រៀមខ្លួនរួចរាល់ហើយឬនៅ? យប់នេះយើងត្រូវយកទិន្នន័យពីបន្ទប់សោរ សាយប័រ វ៉ូល ឱ្យបាន!",
      voice_tone: "excited",
      speaker_gender: "male",
      speaker_name: "ម៉ាកុស"
    },
    {
      segment_id: 2,
      start_time: "00:08",
      end_time: "00:16",
      original_summary: "Don't worry! I've bypassed the laser security. Move in now!",
      khmer_script: "កុំបារម្ភអី! ខ្ញុំបានទម្លុះប្រព័ន្ធឡាស៊ែររួចរាល់ហើយ ឆាប់ចូលទៅ!",
      voice_tone: "dramatic",
      speaker_gender: "female",
      speaker_name: "អេលេណា"
    },
    {
      segment_id: 3,
      start_time: "00:16",
      end_time: "00:25",
      original_summary: "Hold on! Why is the blast door sealing? Who triggered the lockdown?",
      khmer_script: "ចាំបន្តិច! ហេតុអ្វីបានជាទ្វារដែកថែបស្រាប់តែបិទជិតបែបនេះ? តើនរណាជាអ្នកបញ្ជា?",
      voice_tone: "tense",
      speaker_gender: "male",
      speaker_name: "ម៉ាកុស"
    },
    {
      segment_id: 4,
      start_time: "00:25",
      end_time: "00:35",
      original_summary: "I'm sorry Marcus... The 500 million credits belong to me alone!",
      khmer_script: "សូមអភ័យទោសផង ម៉ាកុស... ប្រាក់ ៥០០ លានដុល្លារនេះ គឺជារបស់ខ្ញុំតែម្នាក់គត់!",
      voice_tone: "mysterious",
      speaker_gender: "female",
      speaker_name: "អេលេណា"
    },
    {
      segment_id: 5,
      start_time: "00:35",
      end_time: "00:45",
      original_summary: "You betrayed us Elena! But you will never leave this vault alive!",
      khmer_script: "នាងបានក្បត់យើង អេលេណា! ប៉ុន្តែនាងកុំសង្ឃឹមថានឹងអាចចាកចេញពីទីនេះទាំងរស់ឱ្យសោះ!",
      voice_tone: "dramatic",
      speaker_gender: "male",
      speaker_name: "ម៉ាកុស"
    }
  ]
};

export const SAMPLE_TRANSCRIPTS: SampleTranscript[] = [
  {
    id: 'sample-en-heist',
    title: 'The Cyber Heist Betrayal (English SRT)',
    language: 'English',
    languageCode: 'en',
    genre: 'Action / Crime Thriller',
    description: 'High-stakes bank robbery in Neo-Tokyo with plot twists and betrayal.',
    content: `1
00:00:01,000 --> 00:00:15,000
Commander Marcus leads an elite team of underground hackers into the vault of the Central Cyber Bank under heavy midnight rainfall.

2
00:00:15,000 --> 00:00:32,000
They bypass the quantum laser grid in 10 seconds, but suddenly the main vault door seals behind them. Marcus receives a signal from his partner Elena.

3
00:00:32,000 --> 00:00:50,000
Elena reveals she secretly transferred the 500 million credits to an offshore account and alerted the swat police force to eliminate the team.

4
00:00:50,000 --> 00:01:10,000
Trapped inside, Marcus uses an experimental magnetic pulse device to blow the ventilation system open and barely escapes through the city sewer pipes.

5
00:01:10,000 --> 00:01:30,000
Three months later, Elena steps into her luxury yacht in Monaco, only to find Marcus sitting quietly in her armchair holding the master decryption key.`
  },
  {
    id: 'sample-ko-heir',
    title: 'The Secret Heir Mystery (Korean Transcript)',
    language: 'Korean',
    languageCode: 'ko',
    genre: 'Drama / Mystery',
    description: 'Chaebol inheritance battle and hidden family identity secret.',
    content: `1
00:00:00 --> 00:00:18
대한그룹의 회장이 갑작스럽게 뇌졸중으로 쓰러지자, 그룹의 후계자를 둘러싼 피비린내 나는 권력 암투가 시작된다.

2
00:00:18 --> 00:00:35
장남 민석은 이사회 몰래 회사 자금을 유용해온 비밀 장부를 은폐하려 하지만, 시골 작은 카센터의 정비사 도현이 아버지의 진짜 유언장을 가지고 나타난다.

3
00:00:35 --> 00:00:55
유언장에는 모든 회사의 주식이 정비사 도현에게 승계된다고 적혀있었다. 분노한 민석은 도현을 위협하기 위해 암살자를 고용한다.

4
00:00:55 --> 00:01:15
하지만 도현은 사실 전직 특수부대 출신이었고, 자신을 습격한 암살자들을 한순간에 제압하며 민석의 비리 장부를 세상에 공개한다.`
  },
  {
    id: 'sample-zh-wuxia',
    title: 'Sword of Destiny (Chinese Wuxia)',
    language: 'Chinese',
    languageCode: 'zh',
    genre: 'Martial Arts / Wuxia',
    description: 'Legendary sword technique and revenge journey across ancient Jianghu.',
    content: `1
00:00:00 --> 00:00:15
十五年前，天狼帮为夺取玄冰神剑，惨绝人寰地屠灭了林家庄七十二口人，唯独留下了藏在井底的少庄主林云。

2
00:00:15 --> 00:00:32
林云在深山绝壁中苦练十五年九霄剑法，终于下山踏上复仇之路。他手持无名铁剑，单枪匹马闯入天狼帮分舵。

3
00:00:32 --> 00:00:52
在武林大会上，天狼帮帮主出示了所谓的“镇帮之宝”，林云当众揭穿其伪善面具，并以一招“剑影留痕”将其击败。

4
00:00:52 --> 00:01:12
揭开面具的瞬间，林云赫然发现，眼前的仇人竟然就是当年抱他逃生、传授他武艺的恩师！一场动摇江湖的禁忌真相由此揭开。`
  },
  {
    id: 'sample-th-romance',
    title: 'Love in Bangkok Sunset (Thai Romance Drama)',
    language: 'Thai',
    languageCode: 'th',
    genre: 'Romance / Melodrama',
    description: 'Heartwarming story of fate, secret love, and unexpected second chances.',
    content: `1
00:00:00 --> 00:00:16
นิสา ช่างภาพสาวผู้ยากไร้ได้บังเอิญเก็บกระเป๋าเงินของ วิน มหาเศรษฐีหนุ่มหล่อเจ้าของโรงแรมหรูที่ตกอยู่ในแม่น้ำเจ้าพระยา

2
00:00:16 --> 00:00:35
เมื่อนำกระเป๋าไปคืน วินกลับเข้าใจผิดคิดว่านิสาเป็นนักต้มตุ๋นที่พยายามตักตักเงิน เขาจึงสั่งให้บอดี้การ์ดไล่เธอออกไปอย่างเย็นชา

3
00:00:35 --> 00:00:55
ต่อมาบริษัทของวินถูกหุ้นส่วนทรยศจนล้มละลายในข้ามคืน วินต้องหมดตัวและกลายเป็นคนไร้บ้าน นิสาคือคนเดียวที่ยื่นมือเข้ามาช่วยเหลือและให้ที่พักพิง

4
00:00:55 --> 00:01:20
ผ่านความยากลำบากร่วมกัน ทั้งคู่เริ่มเปิดใจและก่อเกิดเป็นความรักที่แท้จริง ก่อนที่วินจะสืบพบว่าอดีตแฟนเก่าของเขาคือผู้อยู่เบื้องหลังการล้มละลายทั้งหมด`
  }
];

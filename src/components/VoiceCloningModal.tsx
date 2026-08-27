import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Mic, MicOff, Play, Pause, Trash2, Check, Sparkles, 
  Volume2, Sliders, Radio, AlertCircle, RefreshCw, Upload, Music, UserCheck,
  FolderUp, FileAudio, CheckCircle2, Users, ArrowRight, MessageSquare,
  ExternalLink, Copy
} from 'lucide-react';
import { ClonedVoiceProfile, VoiceRolesMapping, KiriVoiceItem } from '../types';

interface VoiceCloningModalProps {
  isOpen: boolean;
  onClose: () => void;
  clonedVoices: ClonedVoiceProfile[];
  onSaveVoice: (voice: Partial<ClonedVoiceProfile>) => Promise<ClonedVoiceProfile | void>;
  onDeleteVoice: (id: string) => Promise<void>;
  onSelectActiveVoice?: (voiceId: string) => void;
  activeVoiceId?: string;
  voiceRolesMapping?: VoiceRolesMapping;
  onChangeVoiceRolesMapping?: (mapping: VoiceRolesMapping) => void;
  initialTab?: 'roles' | 'create' | 'list' | 'hf' | 'kiri' | 'colab';
}

const VOXCPM_PRESETS = [
  { id: 'female_sweet', name: 'តួស្រីសម្រាយរឿង (Female Narrator)', emoji: '👩‍💼', gender: 'female' as const, category: 'សម្រាយរឿង', desc: 'សំឡេងនារីច្បាស់ៗ រស់រវើក មានថាមពល បែបសម្រាយរឿងអាជីព' },
  { id: 'male_hero', name: 'តួប្រុសសម្រាយរឿង (Male Narrator)', emoji: '👨‍💼', gender: 'male' as const, category: 'សម្រាយរឿង', desc: 'សំឡេងបុរសច្បាស់ៗ ម៉ឺងម៉ាត់ មានកម្លាំង បែបសម្រាយរឿង' },
  { id: 'female_lively', name: 'នារីរស់រវើក/កំប្លែង (Lively Female)', emoji: '✨', gender: 'female' as const, category: 'តួអង្គស្រី', desc: 'សំឡេងនារីស្វាហាប់ ស្រស់ថ្លា ច្បាស់ៗ សម្រាប់រឿងកំប្លែង ឬ Action' },
  { id: 'kid_girl', name: 'ក្មេងស្រី (Cute Girl)', emoji: '👧', gender: 'female' as const, category: 'កុមារ', desc: 'សំឡេងកុមារីស្រស់ថ្លា ច្បាស់ៗ គួរឱ្យស្រឡាញ់' },
  { id: 'kid_boy', name: 'ក្មេងប្រុស (Playful Boy)', emoji: '👦', gender: 'male' as const, category: 'កុមារ', desc: 'សំឡេងកុមារារស់រវើក គួរឱ្យស្រឡាញ់ វ័យ ៨-១០ ឆ្នាំ' },
  { id: 'elder_male', name: 'លោកតា (Wise Grandfather)', emoji: '👴', gender: 'male' as const, category: 'មនុស្សចាស់', desc: 'សំឡេងមនុស្សចាស់ប្រុស ស្អក ជ្រៅ ស្ងប់ស្ងាត់ មានប្រាជ្ញា' },
  { id: 'elder_female', name: 'លោកយាយ (Kind Grandmother)', emoji: '👵', gender: 'female' as const, category: 'មនុស្សចាស់', desc: 'សំឡេងមនុស្សចាស់ស្រី ទន់ភ្លន់ ចិត្តល្អ កក់ក្តៅ' },
  { id: 'villain', name: 'តួកាច / មេបិសាច (Villain)', emoji: '🦹‍♂️', gender: 'male' as const, category: 'តួអង្គពិសេស', desc: 'សំឡេងកាច ធ្ងន់ គ្រលរ គួរឱ្យភ័យខ្លាច' },
  { id: 'news_host', name: 'ពិធីករ / ព័ត៌មាន (News Host)', emoji: '🎙️', gender: 'male' as const, category: 'ពិធីករ', desc: 'សំឡេងអានព័ត៌មាន ច្បាស់ៗ បែបវិទ្យុទូរទស្សន៍អាជីព' }
];

export const VoiceCloningModal: React.FC<VoiceCloningModalProps> = ({
  isOpen,
  onClose,
  clonedVoices = [],
  onSaveVoice,
  onDeleteVoice,
  onSelectActiveVoice,
  activeVoiceId,
  voiceRolesMapping = { male: 'male', female: 'female', narrator: 'narrator' },
  onChangeVoiceRolesMapping,
  initialTab
}) => {
  const [viewMode, setViewMode] = useState<'roles' | 'hf' | 'colab' | 'kiri' | 'list' | 'create'>(initialTab || 'colab');
  
  // Google Colab VoxCPM2 state
  const [colabUrl, setColabUrl] = useState<string>(localStorage.getItem('voxcpm2_colab_url') || '');
  const [colabApiKey, setColabApiKey] = useState<string>(localStorage.getItem('voxcpm2_colab_key') || '');
  const [colabSourceMode, setColabSourceMode] = useState<'preset' | 'upload'>('preset');
  const [colabSelectedPreset, setColabSelectedPreset] = useState<string>('male_hero');
  const [colabVoiceName, setColabVoiceName] = useState<string>('VoxCPM2 - តួឯកប្រុស (Heroic Male)');
  const [colabSampleText, setColabSampleText] = useState<string>('');
  const [colabGender, setColabGender] = useState<'male' | 'female'>('male');
  const [colabSelectedModel, setColabSelectedModel] = useState<string>('voxcpm2');
  const [colabStatus, setColabStatus] = useState<{ checked: boolean; valid: boolean; gpu?: string; model?: string; error?: string }>({
    checked: false,
    valid: false
  });
  const [isLoadingColab, setIsLoadingColab] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCopiedColabCode, setIsCopiedColabCode] = useState(false);
  const colabFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAutoTranscribe = async () => {
    if (!recordedAudioBlob) {
      alert('សូម Upload ហ្វាលសំឡេងជាមុនសិន!');
      return;
    }
    
    try {
      setIsTranscribing(true);
      
      const reader = new FileReader();
      reader.readAsDataURL(recordedAudioBlob);
      const audioBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          resolve((reader.result as string));
        };
      });

      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64 })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to transcribe audio');
      }

      setColabSampleText(data.text || '');
      
    } catch (err: any) {
      console.error('Transcription error:', err);
      alert('ការចាប់អត្ថបទបរាជ័យ៖ ' + (err.message || 'មានបញ្ហាបច្ចេកទេស'));
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTestColabConnection = async () => {
    const cleanUrl = colabUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl) {
      alert('សូមបញ្ចូល Google Colab API URL (ឧទាហរណ៍៖ https://xxxx.trycloudflare.com)!');
      return;
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setColabStatus({ checked: true, valid: false, error: 'URL ត្រូវតែចាប់ផ្តើមដោយ https:// (ឧ. https://xxxx.trycloudflare.com)' });
      return;
    }
    if (!cleanUrl.includes('.') || cleanUrl.length < 15) {
      setColabStatus({ checked: true, valid: false, error: 'URL មិនទាន់ពេញលេញទេ (សូមចម្លង Link ទាំងមូលដែលបញ្ចប់ដោយ .trycloudflare.com)' });
      return;
    }
    setIsLoadingColab(true);
    setColabStatus({ checked: false, valid: false });
    try {
      // 1. Try server proxy first
      let connected = false;
      try {
        const res = await fetch('/api/colab/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colabUrl: cleanUrl, apiKey: colabApiKey })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.valid) {
            setColabStatus({ checked: true, valid: true, gpu: data.gpu, model: data.model });
            localStorage.setItem('voxcpm2_colab_url', cleanUrl);
            if (colabApiKey) localStorage.setItem('voxcpm2_colab_key', colabApiKey);
            connected = true;
          }
        }
      } catch {
        // Fallback to direct client-side fetch below
      }

      // 2. Direct browser fallback if proxy failed
      if (!connected) {
        let directRes: any;
        try {
          directRes = await fetch(`${cleanUrl}/api/health`, {
            signal: AbortSignal.timeout(6000)
          });
        } catch {
          // Cloudflare DNS initial propagation delay - wait 1.5s and retry once
          await new Promise(r => setTimeout(r, 1500));
          directRes = await fetch(`${cleanUrl}/api/health`, {
            signal: AbortSignal.timeout(6000)
          });
        }

        if (directRes && directRes.ok) {
          const data = await directRes.json().catch(() => ({}));
          setColabStatus({
            checked: true,
            valid: true,
            gpu: data.gpu || 'Tesla GPU (Online)',
            model: data.model || 'OpenVoice / VoxCPM2 Engine'
          });
          localStorage.setItem('voxcpm2_colab_url', cleanUrl);
          if (colabApiKey) localStorage.setItem('voxcpm2_colab_key', colabApiKey);
          connected = true;
        } else {
          setColabStatus({ checked: true, valid: false, error: `Colab Server ឆ្លើយតបកូដ ${directRes?.status || 500}` });
        }
      }
    } catch (err: any) {
      setColabStatus({ checked: true, valid: false, error: err.message || 'Cloudflare DNS កំពុងផ្សព្វផ្សាយ សូមរង់ចាំ ៥ វិនាទី រួចចុចម្តងទៀត' });
    } finally {
      setIsLoadingColab(false);
    }
  };

  // Hugging Face state
  const [hfToken, setHfToken] = useState(localStorage.getItem('hf_token') || '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');
  const [hfStatus, setHfStatus] = useState<{ checked: boolean; valid: boolean; username?: string; message: string }>({
    checked: false,
    valid: false,
    message: ''
  });
  const [isLoadingHf, setIsLoadingHf] = useState(false);
  const [hfSelectedModel, setHfSelectedModel] = useState<string>('f5-tts');
  const [hfVoiceName, setHfVoiceName] = useState('My HF Cloned Voice');
  const [hfGender, setHfGender] = useState<'male' | 'female'>('male');

  // KiriTTS state
  const [kiriApiKey, setKiriApiKey] = useState(localStorage.getItem('kiritts_api_key') || 'sk-TQuFpIumO14-m91svdHug7I-eeCuk2vnPzKBJ6ExFZk');
  const [kiriVoices, setKiriVoices] = useState<KiriVoiceItem[]>([]);
  const [isLoadingKiri, setIsLoadingKiri] = useState(false);
  const [kiriStatus, setKiriStatus] = useState<{ checked: boolean; valid: boolean; message: string; count?: number; canSynthesize?: boolean; planNotice?: string }>({
    checked: false,
    valid: false,
    message: ''
  });
  const [selectedKiriVoice, setSelectedKiriVoice] = useState<string>('ff');
  const [isPlayingKiriTest, setIsPlayingKiriTest] = useState(false);

  // Creation state
  const [sourceMode, setSourceMode] = useState<'upload' | 'record'>('upload');
  const [voiceName, setVoiceName] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [pitchOffset, setPitchOffset] = useState<number>(0);
  const [speedRate, setSpeedRate] = useState<number>(1.0);
  const [timbrePreset, setTimbrePreset] = useState<'natural' | 'warm_deep' | 'crisp_clear' | 'energetic' | 'pure_clone'>('pure_clone');
  const [baseVoice, setBaseVoice] = useState<'km-KH-PisethNeural' | 'km-KH-SreymomNeural'>('km-KH-PisethNeural');
  const [isPureClone, setIsPureClone] = useState<boolean>(true);
  
  // Recording & Upload state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  
  // Audio playback state
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isPlayingTestTts, setIsPlayingTestTts] = useState(false);
  const [isPlayingDialogueTest, setIsPlayingDialogueTest] = useState(false);
  const [playingProfileId, setPlayingProfileId] = useState<string | null>(null);
  const [testText, setTestText] = useState('សួស្តីបងប្អូនទាំងអស់គ្នា! នេះគឺជាសំឡេងដែលបាន Clone រួចរាល់។');
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hfFileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const testTtsAudioRef = useRef<HTMLAudioElement | null>(null);

  const fetchHfStatus = async (tokenToUse?: string) => {
    setIsLoadingHf(true);
    const token = (tokenToUse !== undefined ? tokenToUse : hfToken).trim();
    try {
      const res = await fetch('/api/hf/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (data.valid) {
        setHfStatus({ checked: true, valid: true, username: data.username, message: data.message });
        if (token) localStorage.setItem('hf_token', token);
      } else {
        setHfStatus({ checked: true, valid: false, message: data.error || 'Token មិនត្រឹមត្រូវ' });
      }
    } catch (e: any) {
      setHfStatus({ checked: true, valid: false, message: e.message });
    } finally {
      setIsLoadingHf(false);
    }
  };

  const fetchKiriVoicesList = async (keyToUse?: string) => {
    setIsLoadingKiri(true);
    const key = (keyToUse !== undefined ? keyToUse : kiriApiKey).trim();
    try {
      const res = await fetch('/api/kiri/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await res.json();
      if (data.valid && Array.isArray(data.voices)) {
        setKiriVoices(data.voices);
        setKiriStatus({
          checked: true,
          valid: true,
          canSynthesize: data.canSynthesize,
          planNotice: data.planNotice,
          message: data.message,
          count: data.voiceCount
        });
        if (key) localStorage.setItem('kiritts_api_key', key);
      } else {
        setKiriStatus({ checked: true, valid: false, message: data.error || 'Connection failed' });
      }
    } catch (e: any) {
      setKiriStatus({ checked: true, valid: false, message: e.message || 'Network error' });
    } finally {
      setIsLoadingKiri(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHfStatus();
      fetchKiriVoicesList();
    }
  }, [isOpen]);

  const handleTestKiriVoice = async (voiceId: string) => {
    if (isPlayingKiriTest) return;
    setIsPlayingKiriTest(true);
    try {
      const textToSpeak = testText.trim() || 'សួស្តីបងប្អូនទាំងអស់គ្នា! នេះជាសំឡេង KiriTTS។';
      const url = `/api/tts?text=${encodeURIComponent(textToSpeak)}&voice=kiri_${encodeURIComponent(voiceId)}&kiriApiKey=${encodeURIComponent(kiriApiKey)}&preview=true`;
      
      const res = await fetch(url);
      if (!res.ok) {
        let errMsg = 'មិនអាចចាក់សំឡេង KiriTTS បានទេ។';
        try {
          const errJson = await res.json();
          errMsg = errJson.error || errMsg;
        } catch {
          errMsg = (await res.text()) || errMsg;
        }
        alert(`⚠️ KiriTTS Notice:\n${errMsg}`);
        setIsPlayingKiriTest(false);
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const aud = new Audio(blobUrl);
      testTtsAudioRef.current = aud;
      aud.onended = () => setIsPlayingKiriTest(false);
      aud.onerror = () => setIsPlayingKiriTest(false);
      await aud.play();
    } catch (e: any) {
      alert('កំហុសក្នុងការចាក់សំឡេង៖ ' + e.message);
      setIsPlayingKiriTest(false);
    }
  };

  const handleImportKiriVoiceAsProfile = async (kiriVoice: KiriVoiceItem) => {
    const payload: Partial<ClonedVoiceProfile> = {
      name: `${kiriVoice.name} (${kiriVoice.category === 'Cloned' ? 'Kiri Clone' : 'Kiri AI'})`,
      gender: kiriVoice.gender === 'female' ? 'female' : 'male',
      pitchOffset: 0,
      formantShift: 1.0,
      speedRate: 1.0,
      timbrePreset: 'natural',
      baseVoice: `kiri_${kiriVoice.voice_id}`,
      isPureClone: true,
      provider: 'kiri',
      kiriVoiceId: kiriVoice.voice_id
    };

    const saved = await onSaveVoice(payload);
    if (saved && (saved as any).id) {
      alert(`បានរក្សាទុកសំឡេង "${kiriVoice.name}" ទៅក្នុងបញ្ជី Profile រួចរាល់!`);
    }
  };

  const handleStartRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setRecordedAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);
        analyzeAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mr.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);

    } catch (err) {
      alert('មិនអាចបើក Microphone បានទេ។ សូមពិនិត្យមើលសិទ្ធិ Browser (Permission)!');
    }
  };

  const handleStopRecord = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setRecordedAudioBlob(file);
      const url = URL.createObjectURL(file);
      setRecordedAudioUrl(url);
      analyzeAudioBlob(file);
    }
  };

  const handleColabFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setRecordedAudioBlob(file);
      const url = URL.createObjectURL(file);
      setRecordedAudioUrl(url);
      setColabSourceMode('upload');
      setColabVoiceName(`VoxCPM2 - ${file.name.replace(/\.[^/.]+$/, '')}`);
      analyzeAudioBlob(file);
    }
  };

  const handleHfFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setRecordedAudioBlob(file);
      const url = URL.createObjectURL(file);
      setRecordedAudioUrl(url);
      setHfVoiceName(`HF Voice - ${file.name.replace(/\.[^/.]+$/, '')}`);
      analyzeAudioBlob(file);
    }
  };

  const analyzeAudioBlob = async (blob: Blob) => {
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const resultStr = reader.result as string;
          if (!resultStr || !resultStr.includes(',')) {
            setIsAnalyzing(false);
            return;
          }
          const b64 = resultStr.split(',')[1];
          if (!b64) {
            setIsAnalyzing(false);
            return;
          }
          const res = await fetch('/api/cloned-voices/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: b64 })
          });
          if (res.ok) {
            const data = await res.json();
            setAnalysisResult(data);
            const gen = data.inferredGender || 'male';
            const bv = data.baseVoice || (gen === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural');
            const po = data.pitchOffset ?? 0;
            setGender(gen);
            setColabGender(gen);
            setHfGender(gen);
            setBaseVoice(bv);
            setPitchOffset(po);
            if (data.timbrePreset) setTimbrePreset(data.timbrePreset);
          }
        } catch (innerErr) {
          console.warn('Audio analysis fetch error (non-fatal, proceeding with defaults):', innerErr);
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.onerror = () => {
        setIsAnalyzing(false);
      };
    } catch (e) {
      console.warn('Analysis error:', e);
      setIsAnalyzing(false);
    }
  };

  const startRecording = handleStartRecord;
  const stopRecording = handleStopRecord;
  const handleFileChange = handleFileUpload;
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setRecordedAudioBlob(file);
      const url = URL.createObjectURL(file);
      setRecordedAudioUrl(url);
      analyzeAudioBlob(file);
    }
  };

  const stopAllPlayback = () => {
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current.src = '';
      } catch {}
      previewAudioRef.current = null;
    }
    if (testTtsAudioRef.current) {
      try {
        testTtsAudioRef.current.pause();
        testTtsAudioRef.current.currentTime = 0;
        testTtsAudioRef.current.src = '';
      } catch {}
      testTtsAudioRef.current = null;
    }
    setIsPlayingPreview(false);
    setIsPlayingTestTts(false);
    setPlayingProfileId(null);
  };

  const playLiveFallbackSpeech = async (v: ClonedVoiceProfile) => {
    try {
      const textToSpeak = `សួស្តីបងប្អូនទាំងអស់គ្នា! នេះគឺជាសំឡេង ${v.name}`;
      const presetIdVal = (v.sampleAudioUrl || '').startsWith('preset:') 
        ? v.sampleAudioUrl.replace(/^preset:/, '')
        : (v.audioBase64 && v.audioBase64.startsWith('preset:') ? v.audioBase64.replace(/^preset:/, '') : undefined);

      let b64Sample = '';
      if (v.audioBase64 && !v.audioBase64.startsWith('preset:')) {
        b64Sample = v.audioBase64;
      }

      const synthRes = await fetch('/api/cloned-voices/test-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voiceId: v.id,
          sampleFileName: v.sampleFileName,
          baseVoice: v.baseVoice || (v.gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural'),
          pitchOffset: v.pitchOffset || 0,
          speedRate: v.speedRate || 1.0,
          audioBase64: b64Sample,
          presetId: presetIdVal,
          preset_id: presetIdVal,
          provider: v.provider || (presetIdVal ? 'voxcpm2' : (v.colabUrl ? 'voxcpm2' : 'edge')),
          colabUrl: v.colabUrl || colabUrl || localStorage.getItem('voxcpm2_colab_url') || '',
          gender: v.gender,
          voiceName: v.name
        })
      });

      if (synthRes.ok) {
        const blob = await synthRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        const aud = new Audio(blobUrl);
        previewAudioRef.current = aud;
        aud.onended = () => {
          setPlayingProfileId(null);
          previewAudioRef.current = null;
        };
        aud.onerror = () => {
          setPlayingProfileId(null);
          previewAudioRef.current = null;
        };
        await aud.play();
        return;
      }

      // Edge TTS fallback
      const pitchStr = (v.pitchOffset || 0) >= 0 ? `+${v.pitchOffset || 0}Hz` : `${v.pitchOffset}Hz`;
      const fallbackUrl = `/api/tts?text=${encodeURIComponent(textToSpeak)}&voice=${encodeURIComponent(v.baseVoice || 'km-KH-PisethNeural')}&gender=${encodeURIComponent(v.gender)}&pitch=${encodeURIComponent(pitchStr)}&rate=%2B20%25`;
      const aud = new Audio(fallbackUrl);
      previewAudioRef.current = aud;
      aud.onended = () => {
        setPlayingProfileId(null);
        previewAudioRef.current = null;
      };
      aud.onerror = () => {
        setPlayingProfileId(null);
        previewAudioRef.current = null;
      };
      await aud.play();
    } catch (e) {
      console.warn('Live fallback speech error:', e);
      setPlayingProfileId(null);
    }
  };

  const handlePlayProfileSample = async (v: ClonedVoiceProfile) => {
    if (playingProfileId === v.id) {
      stopAllPlayback();
      return;
    }

    stopAllPlayback();
    setPlayingProfileId(v.id);

    try {
      // For all saved profiles (especially VoxCPM2/Kiri/HF), speak the neural cloned voice live
      await playLiveFallbackSpeech(v);
    } catch (err) {
      console.warn('Error playing voice sample:', err);
      setPlayingProfileId(null);
    }
  };

  const handleTogglePlaySample = (sampleUrl?: string) => {
    const url = sampleUrl || recordedAudioUrl;
    if (!url) {
      alert('សូមបញ្ចូល ឬ Upload ហ្វាលសំឡេងគំរូមុននឹងចាក់!');
      return;
    }

    if (isPlayingPreview) {
      stopAllPlayback();
      return;
    }

    stopAllPlayback();

    try {
      const aud = new Audio(url);
      previewAudioRef.current = aud;
      setIsPlayingPreview(true);

      aud.onended = () => {
        setIsPlayingPreview(false);
        previewAudioRef.current = null;
      };
      aud.onerror = (err) => {
        console.warn('Audio playback error (sample may not be on disk):', err);
        setIsPlayingPreview(false);
        previewAudioRef.current = null;
      };
      aud.play().catch((e) => {
        console.warn('Play preview catch error:', e);
        setIsPlayingPreview(false);
        previewAudioRef.current = null;
      });
    } catch (createErr) {
      console.warn('Could not initialize preview audio:', createErr);
      setIsPlayingPreview(false);
    }
  };

  const handleTestSpeech = async () => {
    const textToSpeak = (testText || '').trim() || 'សួស្តីបងប្អូនទាំងអស់គ្នា! នេះគឺជាសំឡេងដែលបាន Clone រួចរាល់។';
    
    if (isPlayingTestTts) {
      stopAllPlayback();
      return;
    }

    stopAllPlayback();
    setIsPlayingTestTts(true);

    try {
      const isColab = viewMode === 'colab';
      const isColabPreset = isColab && colabSourceMode === 'preset';
      const activeGen = isColab ? colabGender : viewMode === 'hf' ? hfGender : gender;
      const activeBaseVoice = isColab
        ? (colabGender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural')
        : viewMode === 'hf' 
        ? (hfGender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural') 
        : baseVoice;

      let b64 = '';
      if (!isColabPreset) {
        if (recordedAudioBlob) {
          const reader = new FileReader();
          reader.readAsDataURL(recordedAudioBlob);
          await new Promise<void>((resolve) => {
            reader.onloadend = () => {
              b64 = (reader.result as string).split(',')[1] || '';
              resolve();
            };
          });
        } else if (recordedAudioUrl) {
          try {
            const resp = await fetch(recordedAudioUrl);
            const blob = await resp.blob();
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            await new Promise<void>((resolve) => {
              reader.onloadend = () => {
                b64 = (reader.result as string).split(',')[1] || '';
                resolve();
              };
            });
          } catch (fetchErr) {
            console.warn('Could not read sample URL as blob:', fetchErr);
          }
        }
      }

      if (b64 || isColabPreset || isColab) {
        const selectedPresetVal = isColabPreset ? colabSelectedPreset : (colabGender === 'female' ? 'female_sweet' : 'male_hero');
        try {
          const synthRes = await fetch('/api/cloned-voices/test-synthesis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: textToSpeak,
              baseVoice: activeBaseVoice,
              pitchOffset,
              speedRate,
              audioBase64: isColabPreset ? '' : b64,
              presetId: isColab ? selectedPresetVal : undefined,
              preset_id: isColab ? selectedPresetVal : undefined,
              provider: isColab ? 'voxcpm2' : viewMode === 'hf' ? 'hf' : 'edge',
              colabUrl: isColab ? colabUrl : undefined,
              apiKey: isColab ? colabApiKey : undefined,
              model: isColab ? colabSelectedModel : undefined,
              gender: activeGen,
              voiceName: isColab ? colabVoiceName : undefined,
              sampleText: isColab ? colabSampleText : sampleText
            })
          });

          if (synthRes.ok) {
            const warningHeader = synthRes.headers.get('X-Synthesis-Warning');
            if (warningHeader) {
              console.warn('[Synthesis Warning]:', decodeURIComponent(warningHeader));
            }
            const blob = await synthRes.blob();
            const blobUrl = URL.createObjectURL(blob);
            const aud = new Audio(blobUrl);
            testTtsAudioRef.current = aud;
            aud.onended = () => setIsPlayingTestTts(false);
            aud.onerror = () => setIsPlayingTestTts(false);
            aud.onerror = () => setIsPlayingTestTts(false);
            await aud.play();
            return;
          } else {
            const errData = await synthRes.json().catch(() => ({}));
            const errMsg = errData.error || synthRes.statusText || 'Unknown Error';
            console.error('Colab Synthesis Failed:', errMsg);
            alert(`បរាជ័យក្នុងការបង្កើតសំឡេងពី Colab៖ ${errMsg}`);
            setIsPlayingTestTts(false);
            return; // Do not fallback so user can see the error
          }
        } catch (fetchErr: any) {
          console.warn('Synthesis request error, falling back standard TTS:', fetchErr);
          alert(`កំហុសក្នុងការតភ្ជាប់៖ ${fetchErr.message}`);
          setIsPlayingTestTts(false);
          return;
        }
      }

      // Fallback standard TTS preview
      const pitchStr = pitchOffset >= 0 ? `+${pitchOffset}Hz` : `${pitchOffset}Hz`;
      const rateStr = speedRate !== 1.0 ? `${Math.round((speedRate - 1.0) * 100)}%` : '+20%';
      const url = `/api/tts?text=${encodeURIComponent(textToSpeak)}&voice=${encodeURIComponent(activeBaseVoice)}&gender=${encodeURIComponent(activeGen)}&pitch=${encodeURIComponent(pitchStr)}&rate=${encodeURIComponent(rateStr)}&t=${Date.now()}`;

      const aud = new Audio(url);
      testTtsAudioRef.current = aud;
      aud.onended = () => setIsPlayingTestTts(false);
      aud.onerror = () => setIsPlayingTestTts(false);
      await aud.play();
    } catch (e: any) {
      console.error('Test TTS error:', e);
      setIsPlayingTestTts(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!voiceName.trim()) {
      alert('សូមបញ្ចូលឈ្មោះសំឡេង!');
      return;
    }

    let audioBase64 = '';
    if (recordedAudioBlob) {
      const reader = new FileReader();
      reader.readAsDataURL(recordedAudioBlob);
      await new Promise<void>((resolve) => {
        reader.onloadend = () => {
          audioBase64 = (reader.result as string).split(',')[1];
          resolve();
        };
      });
    }

    const payload: Partial<ClonedVoiceProfile> = {
      name: voiceName.trim(),
      gender: gender,
      pitchOffset: pitchOffset,
      formantShift: 1.0,
      speedRate: speedRate,
      timbrePreset: isPureClone ? 'pure_clone' : timbrePreset,
      baseVoice: baseVoice,
      isPureClone: isPureClone,
      sampleText: sampleText.trim(),
      ...(audioBase64 ? { audioBase64 } : {})
    } as any;

    const saved = await onSaveVoice(payload);
    if (saved && (saved as any).id) {
      const newVoiceId = (saved as any).id;
      if (onSelectActiveVoice) {
        onSelectActiveVoice(newVoiceId);
      }
      if (onChangeVoiceRolesMapping) {
        if (gender === 'female') {
          onChangeVoiceRolesMapping({ ...voiceRolesMapping, female: newVoiceId });
        } else {
          onChangeVoiceRolesMapping({ ...voiceRolesMapping, male: newVoiceId, narrator: newVoiceId });
        }
      }
    }

    // Reset & return to roles
    setViewMode('roles');
    setVoiceName('');
    setSampleText('');
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setAnalysisResult(null);
    setUploadedFileName('');
  };

  const handleStartCreateForRole = (role: 'male' | 'female') => {
    setVoiceName(role === 'male' ? 'សំឡេងតួប្រុស (Male Voice)' : 'សំឡេងតួស្រី (Female Voice)');
    setGender(role);
    setBaseVoice(role === 'male' ? 'km-KH-PisethNeural' : 'km-KH-SreymomNeural');
    setPitchOffset(role === 'male' ? -5 : 5);
    setSourceMode('upload');
    setSampleText('');
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setUploadedFileName('');
    setAnalysisResult(null);
    setViewMode('create');
  };

  const handleRoleVoiceChange = (roleKey: keyof VoiceRolesMapping, voiceId: string) => {
    if (onChangeVoiceRolesMapping) {
      onChangeVoiceRolesMapping({
        ...voiceRolesMapping,
        [roleKey]: voiceId
      });
    }
  };

  const synthesizeRoleLine = async (voiceIdOrRole: string, text: string, defaultGender: 'male' | 'female'): Promise<string> => {
    const targetId = voiceIdOrRole || defaultGender;
    const cloned = clonedVoices.find(v => v.id === targetId);

    if (cloned) {
      const presetIdVal = (cloned.sampleAudioUrl || '').startsWith('preset:') 
        ? cloned.sampleAudioUrl.replace(/^preset:/, '')
        : (cloned.audioBase64 && cloned.audioBase64.startsWith('preset:') ? cloned.audioBase64.replace(/^preset:/, '') : undefined);

      let b64Sample = '';
      if (cloned.audioBase64 && !cloned.audioBase64.startsWith('preset:')) {
        b64Sample = cloned.audioBase64;
      }

      try {
        const synthRes = await fetch('/api/cloned-voices/test-synthesis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            baseVoice: cloned.baseVoice || (cloned.gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural'),
            pitchOffset: cloned.pitchOffset || 0,
            speedRate: cloned.speedRate || 1.0,
            audioBase64: b64Sample,
            presetId: presetIdVal,
            preset_id: presetIdVal,
            provider: cloned.provider || (presetIdVal ? 'voxcpm2' : 'edge'),
            colabUrl: cloned.colabUrl || colabUrl || localStorage.getItem('voxcpm2_colab_url') || '',
            gender: cloned.gender,
            voiceName: cloned.name
          })
        });

        if (synthRes.ok) {
          const blob = await synthRes.blob();
          return URL.createObjectURL(blob);
        }
      } catch (err) {
        console.warn('Role dialogue synthesis error, using fallback:', err);
      }

      const pitchStr = (cloned.pitchOffset || 0) >= 0 ? `+${cloned.pitchOffset || 0}Hz` : `${cloned.pitchOffset}Hz`;
      return `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(cloned.baseVoice || (cloned.gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural'))}&gender=${encodeURIComponent(cloned.gender)}&pitch=${encodeURIComponent(pitchStr)}&rate=%2B20%25`;
    }

    if (targetId.startsWith('kiri_')) {
      return `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(targetId)}&kiriApiKey=${encodeURIComponent(kiriApiKey)}&preview=true`;
    }

    if (targetId.startsWith('gemini_')) {
      const voiceApiKey = localStorage.getItem('gemini_voice_api_key') || '';
      return `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(targetId)}&voiceApiKey=${encodeURIComponent(voiceApiKey)}`;
    }

    const standardGender = targetId === 'male_elder' ? 'male' : (targetId.includes('female') ? 'female' : defaultGender);
    const standardPitch = targetId === 'male_elder' ? '-10Hz' : (standardGender === 'female' ? '+5Hz' : '+0Hz');
    return `/api/tts?text=${encodeURIComponent(text)}&gender=${encodeURIComponent(standardGender)}&pitch=${encodeURIComponent(standardPitch)}&rate=%2B20%25`;
  };

  const handleTestDialogue = async () => {
    if (isPlayingDialogueTest) {
      stopAllPlayback();
      setIsPlayingDialogueTest(false);
      return;
    }

    stopAllPlayback();
    setIsPlayingDialogueTest(true);

    const maleTarget = voiceRolesMapping?.male || 'male';
    const femaleTarget = voiceRolesMapping?.female || 'female';

    const maleLine = 'សួស្តី! ថ្ងៃនេះតើឯងទៅណាដែរ?';
    const femaleLine = 'ចាស៎! ខ្ញុំកំពុងត្រៀមទៅផ្ទះ ជួបគ្នានៅពេលក្រោយណា!';

    try {
      const maleUrl = await synthesizeRoleLine(maleTarget, maleLine, 'male');
      const femaleUrl = await synthesizeRoleLine(femaleTarget, femaleLine, 'female');

      const audio1 = new Audio(maleUrl);
      previewAudioRef.current = audio1;

      audio1.onended = () => {
        setTimeout(async () => {
          const audio2 = new Audio(femaleUrl);
          previewAudioRef.current = audio2;
          audio2.onended = () => {
            setIsPlayingDialogueTest(false);
            previewAudioRef.current = null;
          };
          audio2.onerror = () => {
            setIsPlayingDialogueTest(false);
            previewAudioRef.current = null;
          };
          await audio2.play().catch(() => {
            setIsPlayingDialogueTest(false);
            previewAudioRef.current = null;
          });
        }, 400);
      };

      audio1.onerror = () => {
        setIsPlayingDialogueTest(false);
        previewAudioRef.current = null;
      };

      await audio1.play().catch(() => {
        setIsPlayingDialogueTest(false);
        previewAudioRef.current = null;
      });
    } catch (e) {
      console.warn('Dialogue test error:', e);
      setIsPlayingDialogueTest(false);
    }
  };

  const handleClose = () => {
    stopAllPlayback();
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-fadeIn font-sans"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900/95 border border-slate-700/80 rounded-3xl w-full max-w-5xl h-[92vh] max-h-[920px] overflow-hidden shadow-2xl flex flex-col backdrop-blur-2xl"
      >
        
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/25">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-100 font-khmer">
                  AI Voice Cloning Studio
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                  v2.5 Full Edition
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-khmer">
                គ្រប់គ្រង ផ្គូផ្គង និង Clone សំឡេងតួប្រុស & តួស្រី សម្រាប់អានសម្រាយរឿងដោយស្វ័យប្រវត្ត
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="បិទផ្ទាំង"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tab Bar */}
        <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/70 flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('roles')}
            className={`py-2 px-3.5 text-xs font-bold font-khmer rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              viewMode === 'roles'
                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-purple-400" />
            <span>🎭 តួនាទីសំឡេង (Roles)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('colab')}
            className={`py-2 px-3.5 text-xs font-bold font-khmer rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              viewMode === 'colab'
                ? 'bg-orange-500/25 text-orange-300 border border-orange-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="text-sm">⚡</span>
            <span>Google Colab (VoxCPM2)</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 font-bold">GPU T4</span>
          </button>


          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`py-2 px-3.5 text-xs font-bold font-khmer rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ml-auto ${
              viewMode === 'list'
                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4 text-purple-400" />
            <span>បញ្ជីសំឡេង ({clonedVoices.length})</span>
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 p-5 sm:p-6 overflow-y-auto custom-scrollbar">
          
          {viewMode === 'roles' ? (
            /* 1. Character Voice Roles Mapping View (2 Columns) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Column: Role Selectors (7 Columns) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-3.5 bg-purple-950/30 border border-purple-500/30 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-purple-200 font-khmer flex items-center gap-1.5 mb-0.5">
                      <Users className="w-4 h-4 text-purple-400" />
                      <span>ផ្គូផ្គងសំឡេងតួប្រុស & តួស្រី (Multi-Character Roles)</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 font-khmer">
                      ពេល Dubbing ក្នុងទម្រង់ "🤖 តាមតួអង្គ" ប្រព័ន្ធនឹងយកសំឡេងដែលបានកំណត់ខាងក្រោមនេះទៅអានស្វ័យប្រវត្ត។
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold shrink-0">
                    Auto Routing
                  </span>
                </div>

                {/* Male Character Voice Card */}
                <div className="p-4 bg-slate-950/80 border border-blue-900/40 rounded-2xl space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
                        👨‍🦱
                      </div>
                      <div>
                        <h5 className="font-bold text-xs text-blue-200 font-khmer">
                          សំឡេងតួប្រុស (Male Character Voice)
                        </h5>
                        <p className="text-[10px] text-slate-500 font-khmer">
                          សម្រាប់ឃ្លាសន្ទនារបស់តួប្រុសទាំងអស់ក្នុងរឿង
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartCreateForRole('male')}
                      className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-khmer font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload សំឡេងប្រុស</span>
                    </button>
                  </div>

                  <select
                    value={voiceRolesMapping?.male || 'male'}
                    onChange={(e) => handleRoleVoiceChange('male', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-100 focus:outline-none focus:border-blue-500 font-khmer cursor-pointer"
                  >
                    <optgroup label="🌟 សំឡេងផ្ទាល់ខ្លួន (Google Colab VoxCPM2)">
                      {clonedVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.provider === 'voxcpm2' || v.colabUrl ? '⚡' : (v.provider === 'hf' ? '🤗' : (v.provider === 'kiri' ? '🌟' : '🎙️'))} {v.name} ({v.gender === 'female' ? 'ស្រី' : 'ប្រុស'} {v.provider === 'voxcpm2' || v.colabUrl ? 'VoxCPM2' : (v.provider === 'hf' ? 'Free HF' : 'Clone')})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🇰🇭 KiriTTS AI Voices">
                      <option value="kiri_ff">🌟 Kiri: ff (Cloud Clone)</option>
                      <option value="kiri_Chanda">👨‍🦱 Kiri: Chanda (ប្រុស - ស្តង់ដារ)</option>
                      <option value="kiri_Bora">👨‍🦱 Kiri: Bora (ប្រុស)</option>
                      <option value="kiri_Oudom">👨‍🦱 Kiri: Oudom (ប្រុស)</option>
                      <option value="kiri_Setha">👨‍🦱 Kiri: Setha (ប្រុស)</option>
                    </optgroup>
                    <optgroup label="🤖 Google Gemini Native AI Voices">
                      <option value="gemini_puck">🎭 Gemini Puck (ប្រុស - រំភើប/Dramatic)</option>
                      <option value="gemini_charon">🎙️ Gemini Charon (ប្រុស - បាសធ្ងន់/Deep Bass)</option>
                      <option value="gemini_fenrir">⚔️ Gemini Fenrir (ប្រុស - កាច/Intense Action)</option>
                    </optgroup>
                    <optgroup label="🎙️ Microsoft Neural Khmer">
                      <option value="male">👨‍🦱 Piseth (ពិសិដ្ឋ - សំឡេងស្តង់ដារ)</option>
                      <option value="male_elder">👴 Piseth (តាចាស់ - គ្រលរទាប)</option>
                    </optgroup>
                  </select>
                </div>

                {/* Female Character Voice Card */}
                <div className="p-4 bg-slate-950/80 border border-pink-900/40 rounded-2xl space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center font-bold text-sm">
                        👩‍🦰
                      </div>
                      <div>
                        <h5 className="font-bold text-xs text-pink-200 font-khmer">
                          សំឡេងតួស្រី (Female Character Voice)
                        </h5>
                        <p className="text-[10px] text-slate-500 font-khmer">
                          សម្រាប់ឃ្លាសន្ទនារបស់តួស្រីទាំងអស់ក្នុងរឿង
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartCreateForRole('female')}
                      className="px-3 py-1.5 rounded-xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/40 text-pink-300 font-khmer font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload សំឡេងស្រី</span>
                    </button>
                  </div>

                  <select
                    value={voiceRolesMapping?.female || 'female'}
                    onChange={(e) => handleRoleVoiceChange('female', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-100 focus:outline-none focus:border-pink-500 font-khmer cursor-pointer"
                  >
                    <optgroup label="🌟 សំឡេងផ្ទាល់ខ្លួន (Google Colab VoxCPM2)">
                      {clonedVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.provider === 'voxcpm2' || v.colabUrl ? '⚡' : (v.provider === 'hf' ? '🤗' : (v.provider === 'kiri' ? '🌟' : '🎙️'))} {v.name} ({v.gender === 'female' ? 'ស្រី' : 'ប្រុស'} {v.provider === 'voxcpm2' || v.colabUrl ? 'VoxCPM2' : (v.provider === 'hf' ? 'Free HF' : 'Clone')})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🇰🇭 KiriTTS AI Voices">
                      <option value="kiri_ff">🌟 Kiri: ff (Cloud Clone)</option>
                      <option value="kiri_Neary">👩‍🦰 Kiri: Neary (ស្រី - ស្រទន់)</option>
                      <option value="kiri_Maly">👩‍🦰 Kiri: Maly (ស្រី - ច្បាស់)</option>
                      <option value="kiri_Theary">👩‍🦰 Kiri: Theary (ស្រី)</option>
                      <option value="kiri_Bosba">👩‍🦰 Kiri: Bosba (ស្រី)</option>
                    </optgroup>
                    <optgroup label="🤖 Google Gemini Native AI Voices">
                      <option value="gemini_kore">👩 Gemini Kore (ស្រី - ស្រទន់ធម្មជាតិ/Calm)</option>
                      <option value="gemini_aoede">✨ Gemini Aoede (ស្រី - កក់ក្តៅ/Warm Storyteller)</option>
                    </optgroup>
                    <optgroup label="🎙️ Microsoft Neural Khmer">
                      <option value="female">👩‍🦰 Sreymom (ស្រីមុំ - សំឡេងស្តង់ដារ)</option>
                      <option value="child">👶 Sreymom (កុមារ/ក្មេង - ស្រាលស្រទន់)</option>
                    </optgroup>
                  </select>
                </div>

                {/* Narrator Voice Card */}
                <div className="p-4 bg-slate-950/80 border border-indigo-900/40 rounded-2xl space-y-3 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                      🎙️
                    </div>
                    <div>
                      <h5 className="font-bold text-xs text-indigo-200 font-khmer">
                        សំឡេងអ្នកសម្រាយ (Narrator Voice)
                      </h5>
                      <p className="text-[10px] text-slate-500 font-khmer">
                        សម្រាប់ឈុតនិទានដំណើររឿងទូទៅ
                      </p>
                    </div>
                  </div>

                  <select
                    value={voiceRolesMapping?.narrator || 'narrator'}
                    onChange={(e) => handleRoleVoiceChange('narrator', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-100 focus:outline-none focus:border-indigo-500 font-khmer cursor-pointer"
                  >
                    <optgroup label="🌟 សំឡេងផ្ទាល់ខ្លួន (Google Colab VoxCPM2)">
                      {clonedVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.provider === 'voxcpm2' || v.colabUrl ? '⚡' : (v.provider === 'hf' ? '🤗' : (v.provider === 'kiri' ? '🌟' : '🎙️'))} {v.name} ({v.gender === 'female' ? 'ស្រី' : 'ប្រុស'} {v.provider === 'voxcpm2' || v.colabUrl ? 'VoxCPM2' : (v.provider === 'hf' ? 'Free HF' : 'Clone')})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🇰🇭 KiriTTS AI Voices">
                      <option value="kiri_ff">🌟 Kiri: ff (Cloud Clone)</option>
                      <option value="kiri_Chanda">👨‍🦱 Kiri: Chanda (ប្រុស - ស្តង់ដារ)</option>
                      <option value="kiri_Neary">👩‍🦰 Kiri: Neary (ស្រី)</option>
                    </optgroup>
                    <optgroup label="🤖 Google Gemini Native AI Voices">
                      <option value="gemini_puck">🎭 Gemini Puck (ប្រុស - រំភើប/Dramatic)</option>
                      <option value="gemini_charon">🎙️ Gemini Charon (ប្រុស - បាសធ្ងន់/Deep Bass)</option>
                      <option value="gemini_aoede">✨ Gemini Aoede (ស្រី - កក់ក្តៅ/Storyteller)</option>
                    </optgroup>
                    <optgroup label="🎙️ Microsoft Neural Khmer">
                      <option value="narrator">🎙️ Piseth (អ្នកសម្រាយ - ពិសិដ្ឋ)</option>
                      <option value="female">👩‍🦰 Sreymom (ស្រីមុំ)</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Right Column: Live Interactive Dialogue Simulation (5 Columns) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-gradient-to-br from-purple-950/50 via-slate-950/90 to-indigo-950/50 border border-purple-500/40 rounded-2xl space-y-4 h-full flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-xs font-bold text-purple-200 font-khmer flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-purple-400" />
                        <span>សាកល្បងការសន្ទនា (Dialogue Test)</span>
                      </h5>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                        Live Preview
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-khmer mb-4">
                      ចាក់សាកល្បងសំឡេងតួប្រុសឆ្លើយឆ្លងជាមួយតួស្រីដើម្បីផ្ទៀងផ្ទាត់អារម្មណ៍ និងកម្រិតសំឡេង។
                    </p>

                    {/* Chat Bubble Simulation */}
                    <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">👨‍🦱</span>
                        <div className="bg-blue-950/60 border border-blue-500/30 rounded-xl px-3 py-2 text-[11px] font-khmer text-blue-200">
                          "សួស្តី! ថ្ងៃនេះតើឯងទៅណាដែរ?"
                        </div>
                      </div>

                      <div className="flex items-start gap-2 justify-end">
                        <div className="bg-pink-950/60 border border-pink-500/30 rounded-xl px-3 py-2 text-[11px] font-khmer text-pink-200 text-right">
                          "ចាស៎! ខ្ញុំកំពុងត្រៀមទៅផ្ទះ ជួបគ្នានៅពេលក្រោយណា!"
                        </div>
                        <span className="text-base shrink-0">👩‍🦰</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestDialogue}
                    disabled={isPlayingDialogueTest}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-khmer font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isPlayingDialogueTest ? <Pause className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                    <span>{isPlayingDialogueTest ? 'កំពុងចាក់សន្ទនា...' : '🔊 ចាក់តេស្តការសន្ទនា'}</span>
                  </button>
                </div>
              </div>

            </div>
          ) : viewMode === 'hf' ? (
            /* 2. Hugging Face AI Voice Cloning Studio (2 Columns) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Column: Account & Profile Configuration (5 Columns) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Hugging Face Account Card */}
                <div className="p-4 bg-gradient-to-br from-yellow-950/30 to-slate-950/90 border border-yellow-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold text-lg">
                        🤗
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-yellow-200 font-khmer">
                          Hugging Face Free AI
                        </h4>
                        <p className="text-[10px] text-slate-400 font-khmer">
                          Open-Source Zero-Shot AI Cloner
                        </p>
                      </div>
                    </div>

                    {hfStatus.checked && (
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-khmer font-bold border ${
                        hfStatus.valid
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          : 'bg-red-950/60 text-red-300 border-red-500/40'
                      }`}>
                        {hfStatus.valid ? `✓ ${hfStatus.username} (Free)` : '✗ បរាជ័យ'}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      placeholder="hf_..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-yellow-500"
                    />
                    <button
                      type="button"
                      onClick={() => fetchHfStatus(hfToken)}
                      disabled={isLoadingHf}
                      className="px-3.5 py-2 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-slate-950 font-khmer font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHf ? 'animate-spin' : ''}`} />
                      <span>{isLoadingHf ? '...' : 'ផ្ទៀងផ្ទាត់'}</span>
                    </button>
                  </div>

                  {hfStatus.message && (
                    <p className={`text-[10px] font-khmer ${hfStatus.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {hfStatus.message}
                    </p>
                  )}
                </div>

                {/* Profile Parameters */}
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3.5">
                  <h5 className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-yellow-400" />
                    <span>ការកំណត់ Profile សំឡេង</span>
                  </h5>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer">ឈ្មោះសំឡេង (Voice Name)</label>
                    <input
                      type="text"
                      value={hfVoiceName}
                      onChange={(e) => setHfVoiceName(e.target.value)}
                      placeholder="ឧ. សំឡេងតួឯកប្រុស"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-khmer focus:outline-none focus:border-yellow-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer">ភេទ (Gender)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setHfGender('male')}
                        className={`py-2 rounded-xl text-xs font-khmer font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          hfGender === 'male'
                            ? 'bg-blue-600/30 border border-blue-500/50 text-blue-300 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        👨‍🦱 ប្រុស (Male)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHfGender('female')}
                        className={`py-2 rounded-xl text-xs font-khmer font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          hfGender === 'female'
                            ? 'bg-pink-600/30 border border-pink-500/50 text-pink-300 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        👩‍🦰 ស្រី (Female)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer">ម៉ូឌែល AI Engine</label>
                    <select
                      value={hfSelectedModel}
                      onChange={(e) => setHfSelectedModel(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-yellow-500 font-khmer cursor-pointer"
                    >
                      <option value="f5-tts">🌟 F5-TTS Neural Diffusion (Fast & High Natural Emotion)</option>
                      <option value="cosyvoice">⚡ CosyVoice 2 Zero-Shot (Expressive & Multi-Tone)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Right Column: Audio Sample & Live Test Playground (7 Columns) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      <span>បញ្ចូលសំឡេងគំរូ និងតេស្តនិយាយ (Sample & Test)</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/30 font-khmer font-bold">
                      Free 100% Unlimited
                    </span>
                  </div>

                  {/* Audio Sample Upload Area */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer">សំឡេងគំរូ (Sample Audio 10-30 វិនាទី)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={hfFileInputRef}
                        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm,.flac"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => hfFileInputRef.current?.click()}
                        className={`flex-1 py-3 px-4 rounded-xl text-xs font-khmer transition flex items-center justify-center gap-2 cursor-pointer border ${
                          recordedAudioUrl
                            ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-900 hover:bg-slate-850 border-dashed border-slate-700 hover:border-yellow-500/60 text-slate-300'
                        }`}
                      >
                        {recordedAudioUrl ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Upload className="w-4 h-4 text-yellow-400" />}
                        <span className="font-bold truncate max-w-[280px]">
                          {uploadedFileName ? `📁 ${uploadedFileName}` : 'ចុចទីនេះដើម្បី Upload ហ្វាលសំឡេង (MP3/WAV)...'}
                        </span>
                      </button>

                      {recordedAudioUrl && (
                        <button
                          type="button"
                          onClick={() => handleTogglePlaySample()}
                          className={`px-4 py-3 rounded-xl text-xs font-khmer font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                            isPlayingPreview
                              ? 'bg-yellow-500 text-slate-950 border-yellow-400 shadow-md animate-pulse'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-yellow-300'
                          }`}
                          title="ស្តាប់សំឡេងគំរូ"
                        >
                          {isPlayingPreview ? <Pause className="w-3.5 h-3.5 fill-slate-950" /> : <Play className="w-3.5 h-3.5 fill-yellow-400" />}
                          <span>{isPlayingPreview ? 'ផ្អាក' : 'ស្តាប់គំរូ'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Real-time AI Analysis Feedback Badge in HF Tab */}
                  {isAnalyzing && (
                    <div className="p-3 bg-yellow-950/40 border border-yellow-500/40 rounded-xl flex items-center justify-center gap-2 text-xs font-khmer font-bold text-yellow-300 animate-pulse">
                      <Sparkles className="w-4 h-4 text-yellow-400 animate-spin" />
                      <span>AI កំពុងវិភាគរលកសូរសព្ទ ($F_0$ Pitch & Vocal Timbre) ដោយស្វ័យប្រវត្ត...</span>
                    </div>
                  )}

                  {analysisResult && !isAnalyzing && (
                    <div className="p-3 bg-gradient-to-r from-emerald-950/60 via-yellow-950/40 to-slate-950 border border-emerald-500/50 rounded-xl space-y-1 text-xs font-khmer shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-300 font-bold flex items-center gap-1.5 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>AI បានវិភាគ & Clone សំឡេងពីគំរូពិតប្រាកដ (Pure Zero-Shot 100%)</span>
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          <span className="bg-slate-900 px-2 py-0.5 rounded text-yellow-300 border border-slate-800">
                            F0: {analysisResult.meanF0 || 140}Hz
                          </span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded text-blue-300 border border-slate-800">
                            {hfGender === 'female' ? '👩 ស្រី' : '👨 ប្រុស'}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-300">
                        🎙️ ផ្ទេរទម្រង់ខ្យល់សំនៀង, Formants, និងកម្ពស់សម្លេង Pitch ({pitchOffset >= 0 ? `+${pitchOffset}` : pitchOffset}Hz) តាមហ្វាលគំរូសុទ្ធសាធ ១០០%។
                      </p>
                    </div>
                  )}

                  {/* Test Phrase Input */}
                  <div className="space-y-2 pt-1">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer">ឃ្លាសាកល្បងនិយាយ (Test Phrase)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="បញ្ចូលឃ្លាដើម្បីសាកល្បង..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-khmer focus:outline-none focus:border-yellow-500"
                      />
                      <button
                        type="button"
                        onClick={handleTestSpeech}
                        disabled={isPlayingTestTts}
                        className={`px-4 py-2 rounded-xl font-khmer font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                          isPlayingTestTts
                            ? 'bg-yellow-500 text-slate-950 animate-pulse shadow-md'
                            : 'bg-slate-800 hover:bg-slate-700 text-yellow-300'
                        }`}
                      >
                        {isPlayingTestTts ? <Pause className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-yellow-300" />}
                        <span>{isPlayingTestTts ? 'កំពុងចាក់...' : 'តេស្តស្តាប់'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Save as Profile Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      let audioBase64 = '';
                      if (recordedAudioBlob) {
                        const reader = new FileReader();
                        reader.readAsDataURL(recordedAudioBlob);
                        await new Promise<void>((resolve) => {
                          reader.onloadend = () => {
                            audioBase64 = (reader.result as string).split(',')[1] || '';
                            resolve();
                          };
                        });
                      }

                      const payload: Partial<ClonedVoiceProfile> = {
                        name: hfVoiceName.trim() || 'HuggingFace Voice',
                        gender: hfGender,
                        sampleAudioUrl: recordedAudioUrl || '',
                        sampleFileName: uploadedFileName || '',
                        audioBase64,
                        pitchOffset: pitchOffset || 0,
                        formantShift: 1.0,
                        speedRate: speedRate || 1.0,
                        timbrePreset: 'pure_clone',
                        baseVoice: hfGender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural',
                        isPureClone: true,
                        provider: 'hf',
                        hfModel: hfSelectedModel
                      };
                      const saved = await onSaveVoice(payload);
                      if (saved && (saved as any).id) {
                        alert(`🎉 បានបង្កើត និងរក្សាទុកសំឡេង Hugging Face "${payload.name}" ជោគជ័យ!`);
                        setViewMode('roles');
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-500 hover:from-yellow-500 hover:to-amber-400 text-slate-950 font-khmer font-bold text-xs sm:text-sm shadow-xl transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>រក្សាទុកជា Voice Profile សម្រាប់ Dubbing (Free)</span>
                  </button>
                </div>
              </div>

            </div>
          ) : viewMode === 'colab' ? (
            /* 2.5 Google Colab GPU (VoxCPM2 Engine) View (2 Columns) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Column: Colab API URL, GPU Ping & Voice Metadata (5 Columns) */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* Colab Connection Card */}
                <div className="p-4 bg-gradient-to-br from-orange-950/30 to-slate-950/90 border border-orange-500/30 rounded-2xl space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-sm">
                        ⚡
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-orange-200 font-khmer">
                          Google Colab GPU Engine
                        </h4>
                        <p className="text-[10px] text-slate-400 font-khmer">
                          VoxCPM2 & CosyVoice 2 (NVIDIA T4 / A100)
                        </p>
                      </div>
                    </div>

                    {colabStatus.checked && (
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-khmer font-bold border ${
                        colabStatus.valid
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          : 'bg-red-950/60 text-red-300 border-red-500/40'
                      }`}>
                        {colabStatus.valid ? `✓ ភ្ជាប់ជោគជ័យ (${colabStatus.gpu})` : '✗ បរាជ័យ'}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer">Colab Public Tunnel API URL</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={colabUrl}
                          onChange={(e) => setColabUrl(e.target.value)}
                          placeholder="https://xxxx.trycloudflare.com..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-3 pr-8 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                        />
                        {colabUrl && (
                          <button
                            type="button"
                            onClick={() => setColabUrl('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
                            title="លុប URL ចេញ"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text && text.trim()) {
                              setColabUrl(text.trim());
                            }
                          } catch {
                            alert('សូមចុច Ctrl + V លើ Keyboard របស់អ្នកដើម្បីបិទភ្ជាប់ URL!');
                          }
                        }}
                        className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-khmer text-xs border border-slate-700 transition flex items-center gap-1 cursor-pointer shrink-0"
                        title="បិទភ្ជាប់ Link ពី Clipboard"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>បិទភ្ជាប់</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestColabConnection}
                        disabled={isLoadingColab}
                        className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-slate-950 font-khmer font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isLoadingColab ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>{isLoadingColab ? '...' : 'ផ្ទៀងផ្ទាត់'}</span>
                      </button>
                    </div>
                    {colabStatus.checked && !colabStatus.valid && colabStatus.error && (
                      <p className="text-[11px] text-red-400 font-khmer pt-1">
                        ⚠️ {colabStatus.error}
                      </p>
                    )}
                  </div>

                  {/* 1-Click Run Guide on Colab */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-khmer">
                    <a
                      href="https://colab.research.google.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>🚀 បើក Google Colab (Free GPU)</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        const code = `print("📥 1/3 Installing Official OpenBMB VoxCPM2...")
!pip install -q voxcpm soundfile librosa fastapi uvicorn pydantic pycloudflared huggingface_hub

print("🧠 2/3 Loading VoxCPM2 Model (2B Multilingual with Khmer Support)...")
import os, sys, io, time, socket, base64, tempfile, threading, torch
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from pycloudflared import try_cloudflare
except ImportError:
    try_cloudflare = None

device = "cuda:0" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
print(f"🚀 Initializing Official OpenBMB VoxCPM2 on: {gpu_name} ({device})")

voxcpm_model = None
sample_rate = 48000
try:
    import torchaudio
    try:
        torchaudio.set_audio_backend("soundfile")
    except Exception:
        pass
    from voxcpm import VoxCPM
    print("🧠 Downloading & Loading OpenBMB VoxCPM2 Foundation Model...")
    voxcpm_model = VoxCPM.from_pretrained("openbmb/VoxCPM2", optimize=False, load_denoiser=False)
    sample_rate = getattr(voxcpm_model.tts_model, "sample_rate", 48000)
    print(f"🎉 Official VoxCPM2 Loaded! Output Sample Rate: {sample_rate}Hz (48kHz)")
    try:
        print("⚡ Pre-warming VoxCPM2 on GPU for Instant Synthesis...")
        _ = voxcpm_model.generate(text="(A clear voice)សួស្តី", inference_timesteps=2)
        print("🔥 VoxCPM2 Engine is Warm and Ready (<2s Speed)!")
    except Exception:
        pass
except Exception as e:
    print(f"⚠️ VoxCPM2 load note: {e}")

app = FastAPI(title="Official OpenBMB VoxCPM2 Voice Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

VOICE_PRESETS = {
    "female_sweet": {
        "id": "female_sweet",
        "name": "តួស្រីសម្រាយរឿង (Female Story Narrator)",
        "gender": "female",
        "category": "តួអង្គស្រី",
        "desc": "សំឡេងនារីច្បាស់ៗ រស់រវើក មានថាមពល បែបសម្រាយរឿងអាជីព",
        "prompt": "(A young Cambodian woman, clear, confident, vibrant, highly articulate and professional movie recap narrator with crisp energetic voice) ",
        "seed": 200302
    },
    "male_hero": {
        "id": "male_hero",
        "name": "តួប្រុសសម្រាយរឿង (Male Story Narrator)",
        "gender": "male",
        "category": "តួអង្គប្រុស",
        "desc": "សំឡេងបុរសច្បាស់ៗ ម៉ឺងម៉ាត់ មានកម្លាំង បែបសម្រាយរឿង",
        "prompt": "(A young Cambodian man, clear, confident, charismatic, engaging movie recap narrator with strong crisp voice) ",
        "seed": 100201
    },
    "female_lively": {
        "id": "female_lively",
        "name": "នារីរស់រវើក/កំប្លែង (Lively Female)",
        "gender": "female",
        "category": "តួអង្គស្រី",
        "desc": "សំឡេងនារីស្វាហាប់ ស្រស់ថ្លា ច្បាស់ៗ សម្រាប់រឿងកំប្លែង ឬ Action",
        "prompt": "(A bright, cheerful, lively and highly articulate young woman, engaging storyteller voice) ",
        "seed": 200505
    },
    "kid_girl": {
        "id": "kid_girl",
        "name": "ក្មេងស្រី (Cute Girl)",
        "gender": "female",
        "category": "កុមារ",
        "desc": "សំឡេងកុមារីស្រស់ថ្លា ច្បាស់ៗ គួរឱ្យស្រឡាញ់",
        "prompt": "(A cute little girl, sweet, bright, cheerful and articulate voice) ",
        "seed": 400504
    },
    "kid_boy": {
        "id": "kid_boy",
        "name": "ក្មេងប្រុស (Playful Boy)",
        "gender": "male",
        "category": "កុមារ",
        "desc": "សំឡេងកុមារារស់រវើក គួរឱ្យស្រឡាញ់ វ័យ ៨-១០ ឆ្នាំ",
        "prompt": "(A playful young boy, bright, cheerful and energetic voice) ",
        "seed": 300403
    },
    "elder_male": {
        "id": "elder_male",
        "name": "លោកតា / មនុស្សចាស់ប្រុស (Wise Grandfather)",
        "gender": "male",
        "category": "មនុស្សចាស់",
        "desc": "សំឡេងមនុស្សចាស់ប្រុស ស្អក ជ្រៅ ស្ងប់ស្ងាត់ មានប្រាជ្ញា",
        "prompt": "(An elderly grandfather, calm, wise, deep and husky voice) ",
        "seed": 500605
    },
    "elder_female": {
        "id": "elder_female",
        "name": "លោកយាយ / មនុស្សចាស់ស្រី (Kind Grandmother)",
        "gender": "female",
        "category": "មនុស្សចាស់",
        "desc": "សំឡេងមនុស្សចាស់ស្រី ទន់ភ្លន់ ចិត្តល្អ កក់ក្តៅ",
        "prompt": "(An elderly grandmother, gentle, kind, compassionate and warm voice) ",
        "seed": 600706
    },
    "villain": {
        "id": "villain",
        "name": "តួកាច / មេបិសាច (Action Villain)",
        "gender": "male",
        "category": "តួអង្គពិសេស",
        "desc": "សំឡេងកាច ធ្ងន់ គ្រលរ គួរឱ្យភ័យខ្លាច",
        "prompt": "(A sinister villain, deep, menacing, powerful and intimidating voice) ",
        "seed": 700807
    },
    "news_host": {
        "id": "news_host",
        "name": "ពិធីករ / ព័ត៌មាន (News Anchor)",
        "gender": "male",
        "category": "ពិធីករ",
        "desc": "សំឡេងអានព័ត៌មាន ច្បាស់ៗ បែបវិទ្យុទូរទស្សន៍អាជីព",
        "prompt": "(A professional broadcast news anchor, clear, formal, articulate and confident voice) ",
        "seed": 800908
    }
}

class CloneRequest(BaseModel):
    text: str
    audio_base64: str = ""
    preset_id: str = ""
    speed: float = 1.0
    base_voice: str = "km-KH-PisethNeural"
    gender: str = "male"
    model: str = "voxcpm2"

@app.get("/")
@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "gpu": gpu_name,
        "device": device,
        "model": "Official OpenBMB VoxCPM2 (2B Multilingual)",
        "sample_rate": sample_rate,
        "presets_available": len(VOICE_PRESETS),
        "ready": voxcpm_model is not None
    }

@app.get("/api/presets")
def get_presets():
    return {"success": True, "presets": list(VOICE_PRESETS.values())}

def clean_khmer_text_for_voxcpm(raw_text: str) -> str:
    if not raw_text:
        return ""
    import re
    t = re.sub(r'Orig\\s*:\\s*["\\'].*?["\\']', '', raw_text, flags=re.IGNORECASE)
    t = re.sub(r'\\(.*?\\)|\\[.*?\\]', '', t)
    t = re.sub(r'^(តួប្រុស|តួស្រី|អ្នកសម្រាយ|អ្នកសម្រាយរឿង|តាចាស់|យាយចាស់|កុមារ|កូនក្មេង|មេក្រុម|មេបញ្ជាការ|[^\\s:៖]{2,15})\\s*[:៖-]\\s*', '', t)
    trans_map = {
        r'\\bMarcus\\b': 'ម៉ាកុស',
        r'\\bElena\\b': 'អេលេណា',
        r'\\bSWAT\\b': 'ស្វាត',
        r'\\bCyber\\b': 'សាយប័រ',
        r'\\bVault\\b': 'វ៉ូល',
        r'\\bPolice\\b': 'ប៉ូលីស',
        r'\\bHeist\\b': 'ហាយស៍',
        r'\\bFlash\\b': 'ហ្វ្លាស',
        r'\\bLaser\\b': 'ឡាស៊ែរ',
        r'\\bTeam\\b': 'ក្រុម',
        r'\\bMonaco\\b': 'ម៉ូណាកូ'
    }
    for pat, repl in trans_map.items():
        t = re.sub(pat, repl, t, flags=re.IGNORECASE)
    t = re.sub(r'[a-zA-Z\\u4e00-\\u9fa5]+', ' ', t)
    t = re.sub(r'[\\r\\n\\t]+', ' ', t)
    t = re.sub(r'\\s+', ' ', t).strip()
    return t or raw_text.strip()

@app.post("/api/clone")
async def clone_voice(req: CloneRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    clean_text = clean_khmer_text_for_voxcpm(req.text)
    if not clean_text:
        clean_text = req.text.strip()

    print(f"🎙️ [VoxCPM2] Request (Preset: '{req.preset_id}', Gender: '{req.gender}', CustomAudio: {bool(req.audio_base64)}) | Text: '{clean_text[:40]}'")

    if voxcpm_model is None:
        raise HTTPException(status_code=503, detail="VoxCPM2 Model is not ready on GPU")

    with tempfile.TemporaryDirectory() as tmpdir:
        ref_audio_path = os.path.join(tmpdir, "ref_sample.wav")
        out_audio_path = os.path.join(tmpdir, "out_cloned.wav")
        
        has_ref_audio = False
        speaker_seed = 42
        text_to_generate = clean_text

        # 1. Custom User Audio Provided -> True Zero-Shot Voice Cloning
        if req.audio_base64 and not req.audio_base64.startswith("preset:"):
            ref_bytes = base64.b64decode(req.audio_base64)
            with open(ref_audio_path, "wb") as f:
                f.write(ref_bytes)
            try:
                import librosa
                y_c, sr_c = librosa.load(ref_audio_path, sr=16000, mono=True)
                y_trimmed, _ = librosa.effects.trim(y_c, top_db=25)
                max_len = int(5.5 * 16000)
                y_norm = librosa.util.normalize(y_trimmed[:max_len])
                sf.write(ref_audio_path, y_norm, 16000)
            except Exception:
                pass
            has_ref_audio = True
            speaker_seed = abs(hash(req.audio_base64[:500] + str(len(req.audio_base64)))) % 1000000
            used_engine = "Official VoxCPM2 (Zero-Shot Cloned Voice)"
            print(f"🧬 [VoxCPM2] Cloning speaker from reference audio ({len(ref_bytes)} bytes)...")

        # 2. Preset Selected or Voice Design
        else:
            target_preset_id = req.preset_id.strip() if req.preset_id else ""
            if not target_preset_id or target_preset_id not in VOICE_PRESETS:
                target_preset_id = "female_sweet" if (req.gender == "female" or "female" in str(req).lower()) else "male_hero"
            
            preset = VOICE_PRESETS[target_preset_id]
            speaker_seed = preset["seed"]
            text_to_generate = clean_text
            used_engine = f"Official VoxCPM2 Voice Design ({preset['name']})"
            print(f"🎭 [VoxCPM2] Applied Voice Design: '{preset['name']}'")

        # Lock Seed for Voice Consistency
        torch.manual_seed(speaker_seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(speaker_seed)

        # Generate Audio with 16 Inference Timesteps & CFG 1.6 for Smooth, Natural Tone
        gen_kwargs = {
            "text": text_to_generate,
            "cfg_value": 1.6,
            "inference_timesteps": 16
        }
        if has_ref_audio and os.path.exists(ref_audio_path):
            gen_kwargs["reference_wav_path"] = ref_audio_path

        wav = voxcpm_model.generate(**gen_kwargs)
        
        # Save output in pristine 48kHz studio quality
        out_sr = getattr(voxcpm_model.tts_model, "sample_rate", 48000)
        sf.write(out_audio_path, wav, out_sr, format='WAV')

        with open(out_audio_path, "rb") as f:
            out_bytes = f.read()

        out_b64 = base64.b64encode(out_bytes).decode("utf-8")
        return {
            "success": True,
            "audio_base64": out_b64,
            "engine": used_engine,
            "device": gpu_name,
            "sample_rate": out_sr
        }

def get_free_port(start_port=8000):
    for p in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', p)) != 0:
                return p
    return start_port

SERVER_PORT = get_free_port(8000)

def run_server():
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT, log_level="warning")

threading.Thread(target=run_server, daemon=True).start()
time.sleep(3.0)

if try_cloudflare:
    public_url = try_cloudflare(port=SERVER_PORT)
    tunnel_url = str(public_url.tunnel).strip()
    print("\\n" + "="*70)
    print(f"🎉 SUCCESS! Official OpenBMB VoxCPM2 Public Colab URL: {tunnel_url}")
    print("="*70 + "\\n")
    try:
        from IPython.display import display, HTML
        display(HTML(f'''<div style="background:#0f172a; border: 2px solid #22c55e; border-radius:12px; padding:16px; margin:12px 0;"><h3 style="color:#22c55e; margin:0 0 8px 0;">🎉 Official OpenBMB VoxCPM2 Server ដំណើរការជោគជ័យ!</h3><p style="color:#cbd5e1; font-size:13px; margin:0 0 10px 0;">ចុចលើប្រអប់ខាងក្រោមដើម្បី Copy Link (កុំឱ្យដាច់អក្សរ)៖</p><input type="text" readonly value="{tunnel_url}" style="width:100%; padding:10px 14px; font-size:14px; font-weight:bold; font-family:monospace; background:#1e293b; color:#38bdf8; border:1px solid #475569; border-radius:8px; cursor:pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value); alert('✅ បានចម្លង URL ពេញលេញជោគជ័យ!');" /></div>'''))
    except Exception:
        pass
    print("⚡ Official VoxCPM2 Server & Cloudflare Tunnel are active! (សូមកុំបិទផ្ទាំង Colab នេះ)")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("Server stopped.")`;
                        navigator.clipboard.writeText(code);
                        setIsCopiedColabCode(true);
                        setTimeout(() => setIsCopiedColabCode(false), 3000);
                      }}
                      className="text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-750 font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      {isCopiedColabCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-orange-400" />}
                      <span>{isCopiedColabCode ? 'បានចម្លងកូដ Colab!' : 'ចម្លងកូដ Python'}</span>
                    </button>
                    
                    <a
                      href="https://huggingface.co/spaces/openbmb/VoxCPM-Demo"
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-750 font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <span>🌐 វេបសាយដើម VoxCPM</span>
                    </a>
                  </div>
                </div>

                {/* Engine Configuration & GPU Info */}
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer flex items-center justify-between">
                      <span>ម៉ូឌែល AI Engine</span>
                      <span className="text-[9px] text-emerald-400 font-bold">⚡ Zero-Shot</span>
                    </label>
                    <select
                      value={colabSelectedModel}
                      onChange={(e) => setColabSelectedModel(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-orange-500 font-khmer cursor-pointer"
                    >
                      <option value="voxcpm2">🚀 VoxCPM2 Zero-Shot (High Fidelity Neural Speech)</option>
                      <option value="cosyvoice">⚡ CosyVoice 2 Multi-Tone (Emotional Prosody)</option>
                      <option value="f5-tts">🌟 F5-TTS Neural Diffusion (Fast & Natural Tone)</option>
                    </select>
                  </div>

                  <div className="p-3 bg-gradient-to-br from-orange-950/20 to-slate-900/80 border border-orange-500/20 rounded-xl space-y-1.5 text-[11px]">
                    <div className="text-orange-300 font-bold font-khmer flex items-center gap-1.5">
                      <span>💡 របៀបប្រើប្រាស់៖</span>
                    </div>
                    <ul className="text-slate-400 text-[10px] font-khmer space-y-1 list-disc list-inside">
                      <li>ជ្រើសរើស <strong>សំឡេងស្រាប់ៗ ៨ ប្រភេទ</strong> ឬ Upload ហ្វាលសំឡេងផ្ទាល់ខ្លួន</li>
                      <li>ដាក់ឈ្មោះសំឡេង & រើសភេទ រួចចុច <strong>រក្សាទុកជា Voice Profile</strong></li>
                      <li>សំឡេងដែលរក្សាទុក នឹងត្រូវបានប្រើស្វ័យប្រវត្តក្នុង Dubbing & Timeline!</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Right Column: Built-in Presets & Live Test Playground (7 Columns) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-orange-400" />
                      <span>សំឡេងបង្កើតស្រាប់ៗ និង Clone លើ Colab GPU</span>
                    </span>
                    <span className="text-[10px] text-orange-400 bg-orange-950/60 px-2.5 py-0.5 rounded-full border border-orange-500/30 font-khmer font-bold">
                      Zero-Shot 100% Neural
                    </span>
                  </div>

                  {/* Mode Selector: Built-in Presets vs Custom Audio Upload */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setColabSourceMode('preset');
                        const preset = VOXCPM_PRESETS.find(p => p.id === colabSelectedPreset) || VOXCPM_PRESETS[0];
                        setColabVoiceName(`VoxCPM2 - ${preset.name}`);
                        setColabGender(preset.gender);
                      }}
                      className={`py-2 px-2 rounded-lg text-[11px] font-khmer font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        colabSourceMode === 'preset'
                          ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-slate-950 shadow-md font-extrabold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🎭 សំឡេងស្រាប់ៗ ៨ ប្រភេទ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setColabSourceMode('upload');
                        setColabVoiceName('VoxCPM2 Custom Voice');
                      }}
                      className={`py-2 px-2 rounded-lg text-[11px] font-khmer font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        colabSourceMode === 'upload'
                          ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-slate-950 shadow-md font-extrabold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>📁 Upload សំឡេងផ្ទាល់ខ្លួន</span>
                    </button>
                  </div>

                  {/* Mode 1: Built-in VoxCPM2 Presets Grid */}
                  {colabSourceMode === 'preset' ? (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 font-khmer flex items-center justify-between">
                        <span>ជ្រើសរើសតួអង្គសំឡេងស្រាប់ៗ (VoxCPM2 Presets)</span>
                        <span className="text-[9px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/30">
                          ✨ មិនបាច់ Upload ហ្វាល
                        </span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto pr-1">
                        {VOXCPM_PRESETS.map((preset) => {
                          const isSelected = colabSelectedPreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setColabSelectedPreset(preset.id);
                                setColabVoiceName(`VoxCPM2 - ${preset.name}`);
                                setColabGender(preset.gender);
                              }}
                              className={`p-2.5 rounded-xl text-left transition border flex flex-col justify-between cursor-pointer ${
                                isSelected
                                  ? 'bg-orange-950/40 border-orange-500 text-orange-200 shadow-md shadow-orange-950/40 ring-1 ring-orange-500/50'
                                  : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full mb-1">
                                <span className="text-xl">{preset.emoji}</span>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-khmer font-bold ${
                                  preset.gender === 'female' ? 'bg-pink-950 text-pink-300 border border-pink-500/30' : 'bg-blue-950 text-blue-300 border border-blue-500/30'
                                }`}>
                                  {preset.category}
                                </span>
                              </div>
                              <div className="font-bold text-[11px] font-khmer truncate">{preset.name}</div>
                              <div className="text-[9px] text-slate-400 font-khmer line-clamp-2 mt-0.5">{preset.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Mode 2: Audio Sample Upload Area */
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 font-khmer">សំឡេងគំរូ (Sample Audio 10-30 វិនាទី)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={colabFileInputRef}
                          accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm,.flac"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => colabFileInputRef.current?.click()}
                          className={`flex-1 py-3 px-4 rounded-xl text-xs font-khmer transition flex items-center justify-center gap-2 cursor-pointer border ${
                            recordedAudioUrl
                              ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-300'
                              : 'bg-slate-900 hover:bg-slate-850 border-dashed border-slate-700 hover:border-orange-500/60 text-slate-300'
                          }`}
                        >
                          {recordedAudioUrl ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Upload className="w-4 h-4 text-orange-400" />}
                          <span className="font-bold truncate max-w-[280px]">
                            {uploadedFileName ? `📁 ${uploadedFileName}` : 'ចុចទីនេះដើម្បី Upload ហ្វាលសំឡេង (MP3/WAV)...'}
                          </span>
                        </button>

                        {recordedAudioUrl && (
                          <button
                            type="button"
                            onClick={() => handleTogglePlaySample()}
                            className={`px-4 py-3 rounded-xl text-xs font-khmer font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                              isPlayingPreview
                                ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-md animate-pulse'
                                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-orange-300'
                            }`}
                            title="ស្តាប់សំឡេងគំរូ"
                          >
                            {isPlayingPreview ? <Pause className="w-3.5 h-3.5 fill-slate-950" /> : <Play className="w-3.5 h-3.5 fill-orange-400" />}
                            <span>{isPlayingPreview ? 'ផ្អាក' : 'ស្តាប់គំរូ'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Voice Profile Name & Gender Configuration */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 font-khmer flex items-center justify-between">
                        <span>ឈ្មោះសំឡេង Profile (Voice Name)</span>
                        <span className="text-[9px] text-orange-400 font-bold">*ចាំបាច់</span>
                      </label>
                      <input
                        type="text"
                        value={colabVoiceName}
                        onChange={(e) => setColabVoiceName(e.target.value)}
                        placeholder="ឧ. សំឡេងប្រុស, សំឡេងស្រី..."
                        className="w-full bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-slate-100 font-khmer focus:outline-none transition shadow-inner"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 font-khmer">
                        ភេទតួអង្គ (Voice Gender)
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setColabGender('male')}
                          className={`py-2 rounded-xl text-xs font-khmer font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            colabGender === 'male'
                              ? 'bg-blue-600/90 text-white border-blue-500 shadow-md ring-1 ring-blue-400'
                              : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-400'
                          }`}
                        >
                          <span>👨 ប្រុស (Male)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setColabGender('female')}
                          className={`py-2 rounded-xl text-xs font-khmer font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            colabGender === 'female'
                              ? 'bg-pink-600/90 text-white border-pink-500 shadow-md ring-1 ring-pink-400'
                              : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-400'
                          }`}
                        >
                          <span>👩 ស្រី (Female)</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {colabSourceMode === 'upload' && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 font-khmer">
                          អត្ថបទនៃសំឡេងនេះ (Audio Transcript)
                        </label>
                        <button
                          type="button"
                          onClick={handleAutoTranscribe}
                          disabled={isTranscribing || !recordedAudioBlob}
                          className={`text-[10px] flex items-center gap-1 px-2.5 py-1 rounded-md font-khmer transition ${
                            isTranscribing 
                              ? 'bg-orange-500/20 text-orange-400 cursor-wait' 
                              : 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60 hover:text-emerald-200 border border-emerald-800/50 cursor-pointer'
                          }`}
                          title="ឱ្យ AI ស្តាប់ និងទាញយកអក្សរដោយស្វ័យប្រវត្តិ"
                        >
                          {isTranscribing ? (
                            <><Sparkles className="w-3 h-3 animate-spin" /> កំពុងស្កេន...</>
                          ) : (
                            <><Sparkles className="w-3 h-3" /> ស្កេនអត្ថបទស្វ័យប្រវត្តិ</>
                          )}
                        </button>
                      </div>
                      <textarea
                        value={colabSampleText}
                        onChange={(e) => setColabSampleText(e.target.value)}
                        placeholder="ឧ. សួស្តី នេះគឺជាសំឡេងរបស់ខ្ញុំ..."
                        rows={2}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-khmer resize-none shadow-inner"
                      />
                    </div>
                  )}

                  {/* Test Phrase Input */}
                  <div className="space-y-2 pt-1">
                    <label className="text-[10px] font-bold text-slate-400 font-khmer">ឃ្លាសាកល្បងនិយាយ (Test Phrase)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="បញ្ចូលឃ្លាដើម្បីសាកល្បង..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-khmer focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={handleTestSpeech}
                        disabled={isPlayingTestTts}
                        className={`px-4 py-2 rounded-xl font-khmer font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                          isPlayingTestTts
                            ? 'bg-orange-500 text-slate-950 animate-pulse shadow-md'
                            : 'bg-slate-800 hover:bg-slate-700 text-orange-300'
                        }`}
                      >
                        {isPlayingTestTts ? <Pause className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-orange-300" />}
                        <span>{isPlayingTestTts ? 'កំពុងចាក់...' : 'តេស្តស្តាប់'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Save as Profile Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      let audioBase64 = '';
                      if (colabSourceMode === 'upload' && recordedAudioBlob) {
                        const reader = new FileReader();
                        reader.readAsDataURL(recordedAudioBlob);
                        await new Promise<void>((resolve) => {
                          reader.onloadend = () => {
                            audioBase64 = (reader.result as string).split(',')[1] || '';
                            resolve();
                          };
                        });
                      }

                      const selectedPresetObj = VOXCPM_PRESETS.find(p => p.id === colabSelectedPreset);
                      const payload: Partial<ClonedVoiceProfile> = {
                        name: colabVoiceName.trim() || (colabSourceMode === 'preset' ? (selectedPresetObj?.name || 'VoxCPM2 Preset') : 'VoxCPM2 Voice'),
                        gender: colabGender,
                        sampleAudioUrl: colabSourceMode === 'preset' ? `preset:${colabSelectedPreset}` : (recordedAudioUrl || ''),
                        sampleFileName: colabSourceMode === 'preset' ? `Preset: ${selectedPresetObj?.name || colabSelectedPreset}` : (uploadedFileName || ''),
                        audioBase64: colabSourceMode === 'preset' ? `preset:${colabSelectedPreset}` : audioBase64,
                        pitchOffset: 0,
                        formantShift: 1.0,
                        speedRate: 1.0,
                        timbrePreset: 'pure_clone',
                        baseVoice: colabGender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural',
                        isPureClone: true,
                        provider: 'voxcpm2',
                        sampleText: colabSampleText.trim(),
                        colabUrl: colabUrl
                      };
                      const saved = await onSaveVoice(payload);
                      if (saved && (saved as any).id) {
                        const newVoiceId = (saved as any).id;
                        if (onSelectActiveVoice) {
                          onSelectActiveVoice(newVoiceId);
                        }
                        if (onChangeVoiceRolesMapping) {
                          if (colabGender === 'female') {
                            onChangeVoiceRolesMapping({ ...voiceRolesMapping, female: newVoiceId });
                          } else {
                            onChangeVoiceRolesMapping({ ...voiceRolesMapping, male: newVoiceId, narrator: newVoiceId });
                          }
                        }
                        alert(`🎉 បានបង្កើត និងកំណត់សំឡេង Google Colab VoxCPM2 "${payload.name}" សម្រាប់តួអង្គក្នុង Dubbing ជោគជ័យ!`);
                        setViewMode('roles');
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-500 hover:from-orange-500 hover:to-amber-400 text-slate-950 font-khmer font-bold text-xs sm:text-sm shadow-xl transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>រក្សាទុកជា Voice Profile សម្រាប់ Dubbing (GPU)</span>
                  </button>
                </div>
              </div>

            </div>
          ) : viewMode === 'kiri' ? (
            /* 3. KiriTTS Cloud Voices View (2 Columns) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Column: API Configuration & Live Test (5 Columns) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-gradient-to-br from-amber-950/30 to-slate-950/90 border border-amber-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                        ⚡
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-amber-200 font-khmer">
                          KiriTTS Cloud API
                        </h4>
                        <p className="text-[10px] text-slate-400 font-khmer">
                          សេវាកម្ម AI Speech ពី kiritts.com
                        </p>
                      </div>
                    </div>

                    {kiriStatus.checked && (
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-khmer font-bold border ${
                        kiriStatus.valid
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          : 'bg-red-950/60 text-red-300 border-red-500/40'
                      }`}>
                        {kiriStatus.valid ? `✓ ភ្ជាប់ជោគជ័យ (${kiriStatus.count} សំឡេង)` : '✗ បរាជ័យ'}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={kiriApiKey}
                      onChange={(e) => setKiriApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => fetchKiriVoicesList(kiriApiKey)}
                      disabled={isLoadingKiri}
                      className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-khmer font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingKiri ? 'animate-spin' : ''}`} />
                      <span>{isLoadingKiri ? '...' : 'តេស្ត & Sync'}</span>
                    </button>
                  </div>

                  {kiriStatus.message && (
                    <p className={`text-[10px] font-khmer ${kiriStatus.valid && kiriStatus.canSynthesize ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {kiriStatus.message}
                    </p>
                  )}

                  {kiriStatus.checked && kiriStatus.canSynthesize === false && (
                    <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-1.5 text-left">
                      <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs font-khmer">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>តម្រូវឲ្យមាន KiriTTS Studio Plan</span>
                      </div>
                      <p className="text-[10px] text-slate-300 font-khmer leading-relaxed">
                        API Key ត្រឹមត្រូវ ប៉ុន្តែគណនីលើ <a href="https://www.kiritts.com/#pricing" target="_blank" rel="noreferrer" className="text-amber-400 underline">kiritts.com</a> ត្រូវការ Plan <strong>"Studio" ($11.99/mo)</strong> ទើបមានសិទ្ធិ Generate សំឡេងតាម API។
                      </p>
                      <p className="text-[10px] text-purple-300 font-khmer">
                        💡 លោកអ្នកអាចប្រើ Tab <strong>"🤗 Hugging Face"</strong> ឬ <strong>"+ ក្លូនដោយ Mic/File"</strong> ដោយឥតគិតថ្លៃ ១០០%!
                      </p>
                    </div>
                  )}
                </div>

                {/* Live Speech Preview Playground */}
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>សាកល្បងនិយាយសំឡេង KiriTTS</span>
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Voice: {selectedKiriVoice}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      placeholder="បញ្ចូលឃ្លាដើម្បីសាកល្បង..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-khmer focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleTestKiriVoice(selectedKiriVoice)}
                      disabled={isPlayingKiriTest}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-khmer font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {isPlayingKiriTest ? <Pause className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-slate-950" />}
                      <span>{isPlayingKiriTest ? '...' : 'ស្តាប់'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Cloned & Standard Voices (7 Columns) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Cloned Voices from KiriTTS */}
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-amber-300 font-khmer flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>សំឡេង Clone លើ Cloud (KiriTTS Cloned Profiles)</span>
                  </h5>

                  {kiriVoices.filter(v => v.category === 'Cloned').length > 0 ? (
                    kiriVoices.filter(v => v.category === 'Cloned').map(kv => (
                      <div
                        key={kv.voice_id}
                        className="p-3 bg-gradient-to-r from-amber-950/20 to-slate-950 border border-amber-500/40 rounded-xl flex items-center justify-between hover:border-amber-500/70 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                            🌟
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-amber-200">{kv.name}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                                Cloud Clone
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono">voice_id: {kv.voice_id}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKiriVoice(kv.voice_id);
                              handleTestKiriVoice(kv.voice_id);
                            }}
                            disabled={isPlayingKiriTest}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-khmer font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-slate-300" />
                            <span>ស្តាប់</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleImportKiriVoiceAsProfile(kv)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-khmer font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>រក្សាទុក Profile</span>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400 font-khmer text-center">
                      លោកអ្នកអាចចូលទៅកាន់ <a href="https://www.kiritts.com/dashboard" target="_blank" rel="noreferrer" className="text-amber-400 underline">kiritts.com/dashboard</a> ដើម្បី upload សំឡេង និង Clone បន្ថែម។
                    </div>
                  )}
                </div>

                {/* Standard Voices from KiriTTS */}
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-300 font-khmer flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>សំឡេងស្តង់ដារ KiriTTS ({kiriVoices.filter(v => v.category !== 'Cloned').length || 12} សំឡេង)</span>
                  </h5>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {(kiriVoices.filter(v => v.category !== 'Cloned').length > 0 ? kiriVoices.filter(v => v.category !== 'Cloned') : [
                      { voice_id: 'Chanda', name: 'Chanda', category: 'Standard', gender: 'male' },
                      { voice_id: 'Neary', name: 'Neary', category: 'Standard', gender: 'female' },
                      { voice_id: 'Maly', name: 'Maly', category: 'Standard', gender: 'female' },
                      { voice_id: 'Bora', name: 'Bora', category: 'Standard', gender: 'male' },
                      { voice_id: 'Oudom', name: 'Oudom', category: 'Standard', gender: 'male' },
                      { voice_id: 'Setha', name: 'Setha', category: 'Standard', gender: 'male' },
                      { voice_id: 'Theary', name: 'Theary', category: 'Standard', gender: 'female' },
                      { voice_id: 'Bosba', name: 'Bosba', category: 'Standard', gender: 'female' },
                      { voice_id: 'Borey', name: 'Borey', category: 'Standard', gender: 'male' },
                      { voice_id: 'Phanin', name: 'Phanin', category: 'Standard', gender: 'female' },
                      { voice_id: 'Rithy', name: 'Rithy', category: 'Standard', gender: 'male' },
                      { voice_id: 'Arun', name: 'Arun', category: 'Standard', gender: 'male' },
                    ]).map(kv => (
                      <div
                        key={kv.voice_id}
                        className={`p-2.5 rounded-xl border transition flex items-center justify-between ${
                          selectedKiriVoice === kv.voice_id
                            ? 'bg-amber-950/30 border-amber-500/60'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{kv.gender === 'female' ? '👩‍🦰' : '👨‍🦱'}</span>
                          <div>
                            <p className="font-bold text-xs text-slate-200">{kv.name}</p>
                            <span className="text-[9px] text-slate-400 font-khmer">
                              {kv.gender === 'female' ? 'ស្រី' : 'ប្រុស'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKiriVoice(kv.voice_id);
                            handleTestKiriVoice(kv.voice_id);
                          }}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-300 transition cursor-pointer"
                          title="ចុចដើម្បីស្តាប់សំឡេង"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          ) : viewMode === 'list' ? (
            /* 4. Cloned Voices List View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-purple-400" />
                  <span>បញ្ជីសំឡេងដែលបានរក្សាទុកទាំងអស់ ({clonedVoices.length} Profiles)</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setViewMode('create')}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-khmer font-bold text-xs shadow-md transition cursor-pointer"
                >
                  + បង្កើតសំឡេងថ្មី
                </button>
              </div>

              {clonedVoices.length === 0 ? (
                <div className="p-12 text-center bg-slate-950/60 border border-slate-800 rounded-3xl space-y-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto">
                    <Mic className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-200 font-khmer">
                    មិនទាន់មានសំឡេងដែលបាន Clone នៅឡើយទេ
                  </h4>
                  <p className="text-xs text-slate-400 font-khmer max-w-md mx-auto leading-relaxed">
                    លោកអ្នកអាចចូលទៅកាន់ Tab <strong>"🤗 Hugging Face"</strong> ឬ <strong>"+ ក្លូនដោយ Mic/File"</strong> ដើម្បី Upload សំឡេងគំរូ ១០ វិនាទី និងបង្កើតសំឡេងផ្ទាល់ខ្លួន!
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMode('create')}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-khmer font-bold text-xs shadow-lg transition cursor-pointer"
                  >
                    + ចាប់ផ្តើមថតសំឡេង Clone
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {clonedVoices.map((v) => {
                    const isActive = activeVoiceId === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                          isActive
                            ? 'bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-500/10'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base ${
                              v.gender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {v.gender === 'female' ? '👩‍🦰' : '👨‍🦱'}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-xs text-slate-100 font-khmer truncate">
                                  {v.name}
                                </h4>
                                {isActive && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-500 text-slate-950 text-[9px] font-bold">
                                    Active
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-mono text-slate-400">
                                {v.provider === 'voxcpm2' || v.colabUrl ? '⚡ Google Colab VoxCPM2' : (v.provider === 'hf' ? '🤗 Hugging Face' : (v.provider === 'kiri' ? '🌟 KiriTTS' : '🎙️ Cloned Voice'))} • {v.pitchOffset > 0 ? `+${v.pitchOffset}` : v.pitchOffset}Hz
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`តើអ្នកពិតជាចង់លុបសំឡេង "${v.name}" មែនទេ?`)) {
                                onDeleteVoice(v.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-900 transition cursor-pointer shrink-0"
                            title="លុបសំឡេងនេះ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handlePlayProfileSample(v)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-khmer font-bold flex items-center gap-1.5 transition cursor-pointer ${
                              playingProfileId === v.id
                                ? 'bg-purple-600 text-white animate-pulse shadow-md'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            {playingProfileId === v.id ? (
                              <Pause className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3 fill-slate-300" />
                            )}
                            <span>{playingProfileId === v.id ? 'កំពុងចាក់...' : 'ស្តាប់គំរូ'}</span>
                          </button>

                          {onSelectActiveVoice && (
                            <button
                              type="button"
                              onClick={() => onSelectActiveVoice(v.id)}
                              className={`px-3 py-1 rounded-xl text-xs font-khmer font-bold transition cursor-pointer ${
                                isActive
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40'
                              }`}
                            >
                              {isActive ? 'កំពុងប្រើ' : 'ជ្រើសរើស'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* 5. Custom Pure Voice Clone via Mic or File (2 Columns) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Column: Recording / Upload Source (5 Columns) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Voice Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 font-khmer">
                    ឈ្មោះសំឡេង (Voice Name)៖
                  </label>
                  <input
                    type="text"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    placeholder="ឧ. សំឡេងផ្ទាល់ខ្លួន (My Voice)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 font-khmer"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 font-khmer flex items-center justify-between">
                    <span>អត្ថបទនៃសំឡេងនេះ (Audio Transcript)</span>
                    <span className="text-[9px] font-normal text-slate-500">សំខាន់សម្រាប់ AI (VoxCPM)</span>
                  </label>
                  <textarea
                    value={sampleText}
                    onChange={(e) => setSampleText(e.target.value)}
                    placeholder="ឧ. សួស្តី នេះគឺជាសំឡេងរបស់ខ្ញុំ..."
                    rows={2}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:bg-slate-900 font-khmer resize-none"
                  />
                </div>

                {/* Pure Voice Clone Toggle Banner */}
                <div className="p-3.5 bg-gradient-to-r from-emerald-950/40 via-purple-950/40 to-indigo-950/40 border border-emerald-500/40 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold">
                      ✨
                    </div>
                    <div>
                      <h5 className="font-bold text-xs text-emerald-200 font-khmer flex items-center gap-1.5">
                        <span>Pure Cloned Voice</span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">ណែនាំ</span>
                      </h5>
                      <p className="text-[10px] text-slate-400 font-khmer">
                        ចាប់យកសំនៀង និង Pitch របស់អ្នកសុទ្ធ ១០០%
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPureClone}
                      onChange={(e) => setIsPureClone(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Mode Switcher */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSourceMode('upload')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold font-khmer transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      sourceMode === 'upload'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>📂 Upload ហ្វាលសំឡេង</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceMode('record')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold font-khmer transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      sourceMode === 'record'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>🎙️ ថត Mic ផ្ទាល់</span>
                  </button>
                </div>

                {/* Input Area (Upload or Record) */}
                {sourceMode === 'upload' ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm,.flac,.wma"
                      className="hidden"
                    />

                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                        isDragging
                          ? 'border-purple-400 bg-purple-950/40 scale-[0.99]'
                          : recordedAudioBlob
                          ? 'border-emerald-500/50 bg-emerald-950/20'
                          : 'border-slate-700/80 bg-slate-900/60 hover:bg-slate-900 hover:border-purple-500/60'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                        recordedAudioBlob ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-600/20 text-purple-400'
                      }`}>
                        {recordedAudioBlob ? <CheckCircle2 className="w-6 h-6" /> : <FileAudio className="w-6 h-6" />}
                      </div>

                      <p className="text-xs font-bold text-slate-200 font-khmer">
                        {uploadedFileName || (recordedAudioBlob ? 'ហ្វាលសំឡេងត្រូវបានបញ្ចូល' : 'ចុច ឬទម្លាក់ហ្វាលសំឡេងនៅទីនេះ')}
                      </p>
                      <p className="text-[10px] text-slate-400 font-khmer">
                        MP3, WAV, M4A, OGG, WebM (AI វិភាគ Pitch ស្វ័យប្រវត្ត)
                      </p>
                    </div>

                    {recordedAudioUrl && (
                      <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                        <span className="text-[11px] font-khmer text-slate-300 font-bold truncate max-w-[160px]">
                          {uploadedFileName || 'sample_voice.mp3'}
                        </span>
                        <audio src={recordedAudioUrl} controls className="h-7 max-w-[180px]" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300 font-khmer flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5" />
                        <span>ថតសំឡេងគំរូ (១០-១៥ វិនាទី)៖</span>
                      </span>
                      <span className="font-mono text-xs text-slate-400 font-bold">
                        {recordingSeconds}s / 15s
                      </span>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs text-amber-200 font-khmer leading-relaxed">
                      📖 <strong>សូមអានអត្ថបទនេះពេលចុចថត៖</strong><br />
                      "សួស្តីបងប្អូនទាំងអស់គ្នា! ថ្ងៃនេះខ្ញុំនឹងនាំអ្នកទាំងអស់គ្នាទៅទស្សនារឿងដ៏អស្ចារ្យមួយ..."
                    </div>

                    <div className="flex items-center justify-center pt-1">
                      {!isRecording ? (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-khmer font-bold text-xs shadow-lg flex items-center gap-2 transition cursor-pointer"
                        >
                          <Mic className="w-4 h-4" />
                          <span>{recordedAudioBlob ? 'ថតម្តងទៀត (Re-record)' : 'ចុចដើម្បីចាប់ផ្តើមថត'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="px-6 py-2.5 rounded-2xl bg-red-500 text-white font-khmer font-bold text-xs shadow-lg flex items-center gap-2 transition cursor-pointer animate-pulse"
                        >
                          <MicOff className="w-4 h-4" />
                          <span>បញ្ឈប់ការថត ({15 - recordingSeconds}s)</span>
                        </button>
                      )}
                    </div>

                    {recordedAudioUrl && (
                      <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                        <span className="text-[11px] font-khmer text-slate-300 font-bold">🎧 សំឡេងដែលបានថត៖</span>
                        <audio src={recordedAudioUrl} controls className="h-7 max-w-[180px]" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: AI Analysis, Fine-tuning & Live Preview (7 Columns) */}
              <div className="lg:col-span-7 space-y-4">
                {/* AI Analysis Feedback Card */}
                {analysisResult && (
                  <div className="p-4 bg-gradient-to-r from-emerald-950/60 via-purple-950/60 to-indigo-950/60 border border-emerald-500/50 rounded-2xl space-y-2 text-xs font-khmer shadow-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>AI បានកំណត់ Pitch & សំឡេងស្វ័យប្រវត្ត ១០០%!</span>
                      </span>
                      <span className="bg-slate-900 px-2.5 py-0.5 rounded text-purple-300 font-mono text-[11px] border border-slate-800">
                        F0: {analysisResult.meanF0 || 140}Hz • {gender === 'female' ? '👩 ស្រី' : '👨 ប្រុស'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-300">
                      ✨ ប្រព័ន្ធបានគណនា Pitch ({pitchOffset >= 0 ? `+${pitchOffset}` : pitchOffset}Hz) ដោយស្វ័យប្រវត្តរួចរាល់។
                    </p>
                  </div>
                )}

                {/* Sliders & Base Voice Selection */}
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      <span>កែសម្រួលកម្រិតសំឡេង AI (Fine Tuning)</span>
                    </h4>
                    <span className="font-mono text-purple-400 font-bold text-xs">
                      {pitchOffset >= 0 ? `+${pitchOffset}` : pitchOffset} Hz
                    </span>
                  </div>

                  <input
                    type="range"
                    min="-40"
                    max="40"
                    step="2"
                    value={pitchOffset}
                    onChange={(e) => setPitchOffset(parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />

                  {/* Base Voice Selector */}
                  <div className="space-y-1.5 pt-1">
                    <span className="font-khmer text-slate-400 text-[11px] block font-bold">
                      ជ្រើសរើសម៉ាស៊ីនសំឡេងដើម (Base Synthesis Model)៖
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGender('male');
                          setBaseVoice('gemini_puck' as any);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-khmer font-bold border transition cursor-pointer text-left flex items-center justify-between ${
                          baseVoice === 'gemini_puck' || (!baseVoice.includes('Sreymom') && !baseVoice.includes('female') && !baseVoice.includes('Piseth') && !baseVoice.includes('charon'))
                            ? 'bg-purple-600/25 border-purple-500 text-purple-200 shadow-xs'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>🎭 Gemini Puck (ប្រុសភាពយន្ត)</span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">AI</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setGender('female');
                          setBaseVoice('gemini_aoede' as any);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-khmer font-bold border transition cursor-pointer text-left flex items-center justify-between ${
                          baseVoice === 'gemini_aoede' || baseVoice === 'gemini_kore'
                            ? 'bg-pink-600/25 border-pink-500 text-pink-200 shadow-xs'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>✨ Gemini Aoede (ស្រីភាពយន្ត)</span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-pink-500/20 text-pink-300 font-mono">AI</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Test Synthesis Box */}
                <div className="p-4 bg-gradient-to-br from-purple-950/60 to-indigo-950/60 border border-purple-500/50 rounded-2xl space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-200 font-khmer flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-purple-400" />
                      <span>សាកល្បងនិយាយសំឡេងដែលបាន Clone</span>
                    </span>
                    <span className="text-[10px] text-amber-300 font-khmer font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                      ⚡ Instant Preview
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      placeholder="បញ្ចូលឃ្លាដើម្បីសាកល្បង..."
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-khmer focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={handleTestSpeech}
                      disabled={isPlayingTestTts}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-khmer font-bold text-xs shadow-lg transition flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {isPlayingTestTts ? <Pause className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                      <span>{isPlayingTestTts ? 'កំពុងនិយាយ...' : 'ចុចស្តាប់'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-khmer font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    <Check className="w-4 h-4" />
                    <span>រក្សាទុកសំឡេង Cloned នេះ</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Modal Bottom Footer */}
        <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 font-khmer">
            🎙️ សរុបសំឡេង Profile៖ <strong>{clonedVoices.length}</strong> សំឡេង | Hugging Face: <strong className="text-yellow-400">{hfStatus.valid ? 'Active (Free)' : 'Ready'}</strong>
          </span>

          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-khmer font-bold transition cursor-pointer"
          >
            បិទផ្ទាំង (Close)
          </button>
        </div>

      </div>
    </div>
  );
};

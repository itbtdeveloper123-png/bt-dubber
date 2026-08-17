import React, { useState, useRef } from 'react';
import { 
  X, Upload, Film, Link as LinkIcon, Sparkles, Check, Play, AlertCircle, Layers
} from 'lucide-react';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (file: File, episodeInfo?: { episodeNumber: number; seriesTitle: string; previousContext: string }) => void;
  onSelectSampleVideo: (videoUrl: string, title: string) => void;
  isLoading: boolean;
  isProcessingFile: boolean;
  previousRecapSummary?: string;
  defaultMovieTitle?: string;
}

const SAMPLE_VIDEOS = [
  {
    id: 'sample_sintel',
    title: 'Sintel Fantasy Adventure (រឿងផ្សងព្រេង)',
    genre: 'Fantasy / Adventure',
    duration: '00:52',
    url: 'https://media.w3.org/2010/05/sintel/trailer_hd.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'sample_oceans',
    title: 'Oceans Nature Cinema (រឿងជីវិតបាតសមុទ្រ)',
    genre: 'Documentary / Nature',
    duration: '00:46',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'sample_flower',
    title: 'Flower Macro Cinematic (ធម្មជាតិដ៏ស្រស់ស្អាត)',
    genre: 'Cinema / 4K',
    duration: '00:06',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=80',
  }
];

export const VideoUploadModal: React.FC<VideoUploadModalProps> = ({
  isOpen,
  onClose,
  onFileUpload,
  onSelectSampleVideo,
  isLoading,
  isProcessingFile,
  previousRecapSummary,
  defaultMovieTitle
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'sample' | 'link'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState('');

  // Episode Continuity States
  const [isEpisodic, setIsEpisodic] = useState<boolean>(!!previousRecapSummary);
  const [seriesTitle, setSeriesTitle] = useState<string>(defaultMovieTitle || '');
  const [episodeNumber, setEpisodeNumber] = useState<number>(previousRecapSummary ? 2 : 1);
  const [previousContext, setPreviousContext] = useState<string>(previousRecapSummary || '');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const getEpisodeInfo = () => {
    if (!isEpisodic) return undefined;
    return {
      episodeNumber: episodeNumber || 1,
      seriesTitle: seriesTitle.trim() || 'រឿងភាគ',
      previousContext: previousContext.trim()
    };
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        onFileUpload(file, getEpisodeInfo());
        onClose();
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0], getEpisodeInfo());
      onClose();
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrlInput.trim()) return;
    onSelectSampleVideo(videoUrlInput.trim(), 'Imported Movie Video');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 font-khmer">
                នាំចូលវីដេអូរឿង (Upload & Import Video)
              </h2>
              <p className="text-xs text-gray-500 font-sans">
                Upload local movie video files or select from sample movie clips
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="px-6 pt-3 bg-gray-50/50 border-b border-gray-200 flex items-center gap-4 text-xs font-semibold text-gray-600">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'upload'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload File (ពីកុំព្យូទ័រ/ទូរស័ព្ទ)</span>
          </button>

          <button
            onClick={() => setActiveTab('sample')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'sample'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <Film className="w-4 h-4 text-purple-600" />
            <span>Sample Movies (វីដេអូគំរូ)</span>
          </button>

          <button
            onClick={() => setActiveTab('link')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'link'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <LinkIcon className="w-4 h-4 text-emerald-600" />
            <span>Video Link (URL)</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* TAB 1: Local File Drag & Drop Upload */}
          {activeTab === 'upload' && (
            <div className="space-y-4">

              {/* Episode Continuity Toggle Box */}
              <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3.5 space-y-3 font-khmer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-purple-900">
                        កំណត់សម្រាយរឿងតាមភាគ (Episode Continuity)
                      </h4>
                      <p className="text-[11px] text-purple-700">
                        ជួយឱ្យ Gemini AI យល់ពីសាច់រឿងភាគមុន និងបកប្រែបន្តបានត្រឹមត្រូវបំផុត
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isEpisodic} 
                      onChange={(e) => setIsEpisodic(e.target.checked)} 
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {isEpisodic && (
                  <div className="pt-2 border-t border-purple-200/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-fadeIn">
                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        ឈ្មោះរឿងរួម (Series Title)
                      </label>
                      <input 
                        type="text"
                        value={seriesTitle}
                        onChange={(e) => setSeriesTitle(e.target.value)}
                        placeholder="ឧ. សង្រ្គាមស៊ីប៊ើ"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        ភាគទី (Episode #)
                      </label>
                      <input 
                        type="number"
                        min={1}
                        value={episodeNumber}
                        onChange={(e) => setEpisodeNumber(parseInt(e.target.value) || 1)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        សម្រាយ/បរិបទភាគមុន (Previous Episode Context Summary)
                      </label>
                      <textarea
                        rows={2}
                        value={previousContext}
                        onChange={(e) => setPreviousContext(e.target.value)}
                        placeholder="សង្ខេបសាច់រឿងភាគមុន ឬឈ្មោះតួអង្គដែលបានបង្កើតដើម្បីឱ្យ AI បកប្រែបន្តរលូន..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 resize-none font-khmer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
                    : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
                }`}
              >
                {isProcessingFile || isLoading ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-10 h-10 border-3 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-sm font-bold text-blue-700 font-khmer">
                      Gemini AI កំពុងទស្សនា និងរៀបចំសម្រាយរឿងខ្មែរ...
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      Parsing video frames & background score...
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                      <Upload className="w-7 h-7" />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-gray-900 font-khmer">
                        ទាញទម្លាក់ហ្វាយវីដេអូរឿងនៅទីនេះ ឬចុចដើម្បីជ្រើសរើសហ្វាយ
                      </h3>
                      <p className="text-xs text-gray-500 font-mono">
                        Supports MP4, WEBM, MOV, MKV, AVI, MP3, M4A (Max 100MB)
                      </p>
                    </div>

                    <button
                      type="button"
                      className="mt-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-2"
                    >
                      <Film className="w-4 h-4" />
                      <span>ជ្រើសរើសវីដេអូរឿង (Select Video File)</span>
                    </button>
                  </>
                )}
              </div>

              {/* Tips Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2 font-khmer">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">ព័ត៌មានបន្ថែម៖</strong> នៅពេលលោកអ្នក Upload វីដេអូ ប្រព័ន្ធ Gemini AI នឹងមើលសកម្មភាពក្នុងវីដេអូ និងបកប្រែជាអត្ថបទសម្រាយរឿងខ្មែរ ព្រមទាំងបង្កើត Timestamp ដោយស្វ័យប្រវត្តិ!
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Sample Movies Preset Gallery */}
          {activeTab === 'sample' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600 font-khmer mb-2">
                ជ្រើសរើសវីដេអូរឿងគំរូខាងក្រោមដើម្បីសាកល្បងដោយមិនចាំបាច់ Upload ហ្វាយផ្ទាល់ខ្លួន៖
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SAMPLE_VIDEOS.map((sample) => (
                  <div
                    key={sample.id}
                    onClick={() => {
                      onSelectSampleVideo(sample.url, sample.title);
                      onClose();
                    }}
                    className="border border-gray-200 hover:border-blue-500 rounded-xl overflow-hidden hover:shadow-md transition cursor-pointer bg-white group flex flex-col"
                  >
                    <div className="aspect-video relative overflow-hidden bg-gray-900">
                      <img
                        src={sample.thumbnail}
                        alt={sample.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-white/90 text-blue-600 flex items-center justify-center shadow-md">
                          <Play className="w-4 h-4 ml-0.5 fill-blue-600" />
                        </div>
                      </div>
                      <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white font-mono text-[10px] px-1.5 py-0.5 rounded">
                        {sample.duration}
                      </span>
                    </div>

                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <h4 className="text-xs font-bold text-gray-900 font-khmer line-clamp-2">
                        {sample.title}
                      </h4>
                      <span className="text-[10px] font-mono text-blue-600 font-semibold mt-1">
                        {sample.genre}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Video URL Link Import */}
          {activeTab === 'link' && (
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-800 font-khmer mb-1">
                  បញ្ចូល Link / URL វីដេអូរឿង (Direct Video Stream URL)
                </label>
                <div className="relative">
                  <LinkIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={videoUrlInput}
                    onChange={(e) => setVideoUrlInput(e.target.value)}
                    placeholder="https://example.com/movie_clip.mp4"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!videoUrlInput.trim()}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 font-khmer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>នាំចូល និងវិភាគវីដេអូ (Import & Analyze)</span>
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
};

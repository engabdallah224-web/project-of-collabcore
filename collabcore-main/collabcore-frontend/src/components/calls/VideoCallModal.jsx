import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Maximize2, Minimize2, Video, Mic, Monitor, MessageSquare } from 'lucide-react';

/**
 * Embeds a Jitsi Meet call directly inside the app using the Jitsi External API.
 * Supports: video, audio, screen share, in-call chat — no new tab needed.
 */
export default function VideoCallModal({ roomUrl, callTitle, onClose }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  // Extract room name from URL  e.g. https://meet.jit.si/CollabCore-abc → CollabCore-abc
  const roomName = roomUrl.replace('https://meet.jit.si/', '');

  useEffect(() => {
    // Load Jitsi External API script dynamically
    const existingScript = document.getElementById('jitsi-api-script');
    const loadApi = () => {
      if (!containerRef.current) return;
      // eslint-disable-next-line no-undef
      apiRef.current = new JitsiMeetExternalAPI('meet.jit.si', {
        roomName,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        configOverwrite: {
          startWithVideoMuted: false,
          startWithAudioMuted: false,
          disableDeepLinking: true,
          enableWelcomePage: false,
          prejoinPageEnabled: true,
          toolbarButtons: [
            'microphone',
            'camera',
            'desktop',        // screen share
            'chat',
            'participants-pane',
            'tileview',
            'hangup',
            'raisehand',
            'settings',
            'videobackgroundblur',
          ],
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          DEFAULT_BACKGROUND: '#111111',
          TOOLBAR_ALWAYS_VISIBLE: true,
          MOBILE_APP_PROMO: false,
        },
      });

      apiRef.current.addEventListener('videoConferenceLeft', () => {
        onClose();
      });

      setApiReady(true);
    };

    if (existingScript) {
      if (window.JitsiMeetExternalAPI) {
        loadApi();
      } else {
        existingScript.addEventListener('load', loadApi);
      }
    } else {
      const script = document.createElement('script');
      script.id = 'jitsi-api-script';
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = loadApi;
      document.head.appendChild(script);
    }

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  return (
    <motion.div
      className={`fixed z-[999] bg-black flex flex-col shadow-2xl ${
        isFullscreen
          ? 'inset-0 rounded-none'
          : 'inset-4 md:inset-8 rounded-2xl'
      }`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 rounded-t-2xl flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-1 rounded-lg">
            <Video className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{callTitle}</p>
            <p className="text-gray-400 text-xs">Screen share · Chat · Video · Audio — all available</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tips */}
          <div className="hidden md:flex items-center gap-3 mr-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> Screen Share</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Chat</span>
            <span className="flex items-center gap-1"><Mic className="h-3 w-3" /> Audio</span>
            <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Video</span>
          </div>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-red-600 rounded-lg transition-colors"
            title="Leave & close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Jitsi iframe container */}
      <div ref={containerRef} className="flex-1 w-full min-h-0" />
    </motion.div>
  );
}

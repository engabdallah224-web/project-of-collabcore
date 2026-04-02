import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Maximize2, Minimize2, Video, Mic, Monitor, MessageSquare } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Embeds a Jitsi Meet call using a direct iframe src — works on all browsers
 * including mobile Safari/Chrome without External API WebRTC restrictions.
 */
export default function VideoCallModal({ roomUrl, callTitle, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { user } = useAuth();

  // Extract and sanitize room name → no spaces, alphanumeric+dashes only
  const rawRoom = roomUrl
    .replace('https://meet.jit.si/', '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '');
  const displayName = encodeURIComponent(user?.full_name || user?.displayName || user?.email?.split('@')[0] || 'CollabCore User');

  // Build URL with config params — skip prejoin, auto-join
  const iframeSrc = `https://meet.jit.si/${rawRoom}#userInfo.displayName="${displayName}"&config.prejoinPageEnabled=false&config.startWithVideoMuted=false&config.startWithAudioMuted=false&config.disableDeepLinking=true&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.MOBILE_APP_PROMO=false`;

  return (
    <motion.div
      className={`fixed z-[999] bg-black flex flex-col shadow-2xl ${
        isFullscreen
          ? 'inset-0 rounded-none'
          : 'inset-0 md:inset-8 md:rounded-2xl'
      }`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 md:rounded-t-2xl flex-shrink-0">
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

      {/* Direct iframe — no External API, works on all mobile browsers */}
      <iframe
        src={iframeSrc}
        allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
        allowFullScreen
        className="flex-1 w-full min-h-0 border-0"
        style={{ border: 'none' }}
        title={callTitle}
      />
    </motion.div>
  );
}

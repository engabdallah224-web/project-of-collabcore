import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Maximize2, Minimize2, Video, Mic, Monitor, MessageSquare, ExternalLink } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Video call modal.
 * - Mobile / tablet: opens Jitsi in a new tab (camera/mic always work)
 * - Desktop: embeds Jitsi directly in an iframe
 */
export default function VideoCallModal({ roomUrl, callTitle, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openedTab, setOpenedTab] = useState(false);
  const { user } = useAuth();

  // Detect mobile/tablet
  const isMobile = /Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) ||
    window.innerWidth < 768;

  // Clean room name — alphanumeric + dashes only
  const rawRoom = roomUrl
    .replace('https://meet.jit.si/', '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '');

  // Jitsi URL with hash config (no userInfo — browser sets from prejoin)
  const meetUrl = `https://meet.jit.si/${rawRoom}#config.prejoinPageEnabled=false&config.startWithVideoMuted=false&config.startWithAudioMuted=false&config.disableDeepLinking=true&config.disableVirtualBackground=true&interfaceConfig.MOBILE_APP_PROMO=false&interfaceConfig.SHOW_JITSI_WATERMARK=false`;

  // On mobile: auto-open in new tab immediately
  useEffect(() => {
    if (isMobile && !openedTab) {
      window.open(meetUrl, '_blank');
      setOpenedTab(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mobile view: informational card after opening new tab ──
  if (isMobile) {
    return (
      <motion.div
        className="fixed inset-0 z-[999] flex items-end justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        <motion.div
          className="relative bg-gray-900 rounded-t-3xl w-full max-w-lg p-6 pb-10 flex flex-col items-center gap-4"
          initial={{ y: 200 }}
          animate={{ y: 0 }}
          exit={{ y: 200 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Handle bar */}
          <div className="w-12 h-1.5 bg-gray-600 rounded-full mb-2" />

          <div className="bg-red-600 p-4 rounded-2xl">
            <Video className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-white text-xl font-bold text-center">{callTitle}</h2>
          <p className="text-gray-400 text-sm text-center">
            The call has opened in a new tab with full camera & mic access.
          </p>

          {/* Re-open button */}
          <a
            href={meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open Call Again
          </a>

          <button
            onClick={onClose}
            className="w-full py-3 text-gray-400 hover:text-white font-medium transition-colors"
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Desktop view: embedded iframe ──
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
      <div className={`flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0 ${isFullscreen ? '' : 'rounded-t-2xl'}`}>
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-1 rounded-lg">
            <Video className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{callTitle}</p>
            <p className="text-gray-400 text-xs">Screen share · Chat · Video · Audio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-3 mr-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> Screen Share</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Chat</span>
            <span className="flex items-center gap-1"><Mic className="h-3 w-3" /> Audio</span>
            <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Video</span>
          </div>

          {/* Open in new tab */}
          <a
            href={meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

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

      {/* Jitsi iframe */}
      <iframe
        src={meetUrl}
        allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
        allowFullScreen
        className="flex-1 w-full min-h-0"
        style={{ border: 'none' }}
        title={callTitle}
      />
    </motion.div>
  );
}

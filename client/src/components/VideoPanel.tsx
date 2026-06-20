import { useEffect, useRef } from 'react';

interface VideoPanelProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  opponentAudio: boolean;
  opponentVideo: boolean;
  isConnected: boolean;
  callError: string | null;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onStartCall: () => void;
  playerName: string;
  opponentName: string;
}

function VideoEl({ stream, muted, label, videoOn }: { stream: MediaStream | null; muted: boolean; label: string; videoOn: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-container">
      {stream && videoOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="video-el"
        />
      ) : (
        <div className="video-placeholder">
          <span className="avatar-big">{label.charAt(0).toUpperCase()}</span>
          {!stream && <span className="video-status">No camera</span>}
          {stream && !videoOn && <span className="video-status">Camera off</span>}
        </div>
      )}
      <div className="video-label">{label}</div>
    </div>
  );
}

export default function VideoPanel({
  localStream,
  remoteStream,
  audioEnabled,
  videoEnabled,
  opponentAudio,
  opponentVideo,
  isConnected,
  callError,
  onToggleAudio,
  onToggleVideo,
  onStartCall,
  playerName,
  opponentName,
}: VideoPanelProps) {
  return (
    <div className="video-panel">
      <div className="video-panel-header">
        <span className={`connection-dot ${isConnected ? 'connected' : remoteStream ? 'connecting' : ''}`} />
        <span className="connection-label">
          {isConnected ? 'Live' : localStream ? 'Connecting…' : 'Not connected'}
        </span>
        {!localStream && (
          <button className="btn-call" onClick={onStartCall}>
            📞 Start Call
          </button>
        )}
      </div>

      {callError && (
        <div className="call-error">⚠ {callError}</div>
      )}

      <div className="videos-grid">
        {/* Opponent (top, large) */}
        <div className="video-wrapper opponent-video">
          <VideoEl
            stream={remoteStream}
            muted={false}
            label={opponentName}
            videoOn={opponentVideo}
          />
          {!opponentAudio && <span className="mute-badge">🔇</span>}
        </div>

        {/* Self (bottom, smaller) */}
        {localStream && (
          <div className="video-wrapper self-video">
            <VideoEl
              stream={localStream}
              muted={true}
              label={playerName}
              videoOn={videoEnabled}
            />
          </div>
        )}
      </div>

      {localStream && (
        <div className="call-controls">
          <button
            className={`ctrl-btn ${audioEnabled ? '' : 'off'}`}
            onClick={onToggleAudio}
            title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {audioEnabled ? '🎙' : '🔇'}
            <span>{audioEnabled ? 'Mute' : 'Unmuted'}</span>
          </button>
          <button
            className={`ctrl-btn ${videoEnabled ? '' : 'off'}`}
            onClick={onToggleVideo}
            title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoEnabled ? '📹' : '🚫'}
            <span>{videoEnabled ? 'Camera' : 'No Cam'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

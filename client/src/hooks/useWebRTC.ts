import { useRef, useState, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

interface UseWebRTCOptions {
  socket: Socket | null;
  roomId: string;
  isInitiator: boolean; // white is initiator
}

export function useWebRTC({ socket, roomId, isInitiator }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [opponentAudio, setOpponentAudio] = useState(true);
  const [opponentVideo, setOpponentVideo] = useState(true);
  const [callError, setCallError] = useState<string | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);

  const createPeer = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.close();
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('rtc-ice-candidate', { roomId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setIsConnected(true);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsConnected(false);
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('rtc-offer', { roomId, offer: pc.localDescription });
      } catch (err) {
        console.error('Offer error:', err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    peerRef.current = pc;
    return pc;
  }, [socket, roomId, isInitiator]);

  const startCall = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeer();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Media access denied';
      setCallError(message);
      console.warn('getUserMedia failed, trying audio only:', err);
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setVideoEnabled(false);
        const pc = createPeer();
        audioStream.getTracks().forEach((track) => pc.addTrack(track, audioStream));
      } catch (audioErr) {
        setCallError('Could not access microphone or camera');
      }
    }
  }, [createPeer]);

  const stopCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
  }, []);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = !audioEnabled;
    stream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    setAudioEnabled(enabled);
    socket?.emit('media-state', { roomId, audioEnabled: enabled, videoEnabled });
  }, [audioEnabled, videoEnabled, roomId, socket]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = !videoEnabled;
    stream.getVideoTracks().forEach((t) => (t.enabled = enabled));
    setVideoEnabled(enabled);
    socket?.emit('media-state', { roomId, audioEnabled, videoEnabled: enabled });
  }, [audioEnabled, videoEnabled, roomId, socket]);

  // Socket signaling listeners
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      const pc = peerRef.current || createPeer();
      const offerCollision =
        offer.type === 'offer' && (makingOfferRef.current || pc.signalingState !== 'stable');
      ignoreOfferRef.current = !isInitiator && offerCollision;
      if (ignoreOfferRef.current) return;

      await pc.setRemoteDescription(offer);
      if (offer.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('rtc-answer', { roomId, answer: pc.localDescription });
      }
    };

    const handleAnswer = async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      const pc = peerRef.current;
      if (!pc) return;
      if (pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription(answer);
    };

    const handleIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      const pc = peerRef.current;
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        if (!ignoreOfferRef.current) console.error('ICE error:', e);
      }
    };

    const handleOpponentMedia = ({ audioEnabled: a, videoEnabled: v }: { audioEnabled: boolean; videoEnabled: boolean }) => {
      setOpponentAudio(a);
      setOpponentVideo(v);
    };

    socket.on('rtc-offer', handleOffer);
    socket.on('rtc-answer', handleAnswer);
    socket.on('rtc-ice-candidate', handleIceCandidate);
    socket.on('opponent-media-state', handleOpponentMedia);

    return () => {
      socket.off('rtc-offer', handleOffer);
      socket.off('rtc-answer', handleAnswer);
      socket.off('rtc-ice-candidate', handleIceCandidate);
      socket.off('opponent-media-state', handleOpponentMedia);
    };
  }, [socket, roomId, isInitiator, createPeer]);

  useEffect(() => {
    return () => stopCall();
  }, [stopCall]);

  return {
    localStream,
    remoteStream,
    isConnected,
    audioEnabled,
    videoEnabled,
    opponentAudio,
    opponentVideo,
    callError,
    startCall,
    stopCall,
    toggleAudio,
    toggleVideo,
  };
}

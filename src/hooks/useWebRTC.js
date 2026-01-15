import { useState, useRef, useEffect } from 'react';

const STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302'
];

export const useWebRTC = (callState, onOffer, onAnswer, onIceCandidate) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);

  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Initialize media streams
  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  // Stop media streams
  const stopMedia = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
  };

  // Create peer connection
  const createPeerConnection = async () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: STUN_SERVERS.map(server => ({ urls: server }))
    });

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    peerConnection.ontrack = (event) => {
      console.log('Received remote track');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'failed' || 
          peerConnection.connectionState === 'disconnected') {
        cleanup();
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

  // Create and send offer
  const createOffer = async () => {
    if (!peerConnectionRef.current) {
      peerConnectionRef.current = await createPeerConnection();
    }
    const offer = await peerConnectionRef.current.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);
    onOffer(offer);
  };

  // Create and send answer
  const createAnswer = async (offer) => {
    if (!peerConnectionRef.current) {
      peerConnectionRef.current = await createPeerConnection();
    }
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);
    onAnswer(answer);
  };

  // Handle incoming answer
  const handleAnswer = async (answer) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  // Add ICE candidate
  const addIceCandidate = async (candidate) => {
    if (peerConnectionRef.current && candidate) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  };

  // Cleanup
  const cleanup = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    stopMedia();
    setIsCallActive(false);
  };

  // Watch call state changes
  useEffect(() => {
    if (callState?.status === 'accepted') {
      startMedia().then(() => {
        if (callState.initiator) {
          createOffer();
        }
      });
      setIsCallActive(true);
    }
  }, [callState?.status]);

  // Handle offer from remote
  useEffect(() => {
    if (callState?.offer) {
      createAnswer(callState.offer);
    }
  }, [callState?.offer]);

  // Handle answer from remote
  useEffect(() => {
    if (callState?.answer) {
      handleAnswer(callState.answer);
    }
  }, [callState?.answer]);

  // Handle ICE candidates
  useEffect(() => {
    if (callState?.iceCandidates) {
      callState.iceCandidates.forEach(candidate => {
        addIceCandidate(candidate);
      });
    }
  }, [callState?.iceCandidates]);

  return {
    localStream,
    remoteStream,
    isCallActive,
    localVideoRef,
    remoteVideoRef,
    startMedia,
    stopMedia,
    cleanup,
    createOffer,
    createAnswer,
    handleAnswer,
    addIceCandidate
  };
};

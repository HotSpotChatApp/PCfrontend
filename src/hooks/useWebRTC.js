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
    const mediaStartedRef = useRef(false);
    const peerConnectionInitializedRef = useRef(false);
    const remoteStreamSetRef = useRef(false);

    // Initialize media streams
    const startMedia = async () => {
        if (mediaStartedRef.current) {
            console.log('📹 Media already started, skipping');
            return;
        }

        try {
            console.log('📹 Starting media stream...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true
            });
            setLocalStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            mediaStartedRef.current = true;
            console.log('✅ Media stream started successfully');
            return stream;
        } catch (error) {
            console.error('❌ Error accessing media devices:', error);
            throw error;
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
        mediaStartedRef.current = false;
    };

    // Create peer connection with local stream
    const createPeerConnection = async (localStreamParam) => {
        if (peerConnectionInitializedRef.current) {
            console.log('🔧 Peer connection already initialized, reusing');
            return peerConnectionRef.current;
        }

        console.log('🔧 Creating new peer connection');
        const peerConnection = new RTCPeerConnection({
            iceServers: STUN_SERVERS.map(server => ({ urls: server }))
        });

        // Add local tracks
        const streamToUse = localStreamParam || localStream;
        if (streamToUse) {
            console.log('📹 Adding local tracks to peer connection:', streamToUse.getTracks().length);
            streamToUse.getTracks().forEach((track) => {
                console.log(`   ➕ Adding ${track.kind} track`);
                peerConnection.addTrack(track, streamToUse);
            });
        } else {
            console.warn('⚠️ No local stream available, will retry when stream is ready');
        }

        // Handle remote tracks
        peerConnection.ontrack = (event) => {
            console.log('🎬 ===== ONTRACK EVENT FIRED! =====');
            console.log('   Streams:', event.streams.length);
            console.log('   Track kind:', event.track.kind);

            if (event.streams && event.streams[0]) {
                const remoteStreamData = event.streams[0];
                console.log('✅ Received remote stream:', remoteStreamData.id);
                console.log('   Tracks in stream:', remoteStreamData.getTracks().length);

                setRemoteStream(remoteStreamData);

                // Attach to video element ONLY once per stream
                if (remoteVideoRef.current && !remoteStreamSetRef.current) {
                    console.log('📺 Attaching remote stream to video element');
                    remoteVideoRef.current.srcObject = remoteStreamData;
                    remoteStreamSetRef.current = true;

                    // Play the video - don't call play() multiple times
                    if (remoteVideoRef.current.paused) {
                        remoteVideoRef.current.play().catch(e => {
                            console.error('⚠️ Error playing remote video:', e);
                        });
                    }
                    console.log('✅ Remote stream attached and playing');
                } else if (remoteStreamSetRef.current) {
                    console.log('✅ Remote stream already attached, track:', event.track.kind);
                } else {
                    console.error('❌ Remote video ref not available!');
                }
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('❄️ Generated ICE candidate');
                onIceCandidate(event.candidate);
            }
        };

        // Monitor connection state
        peerConnection.onconnectionstatechange = () => {
            console.log('🔄 Peer connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                console.error('❌ Connection FAILED, cleaning up');
                cleanup();
            } else if (peerConnection.connectionState === 'connected') {
                console.log('✅ Peer connection ESTABLISHED and CONNECTED');
            } else if (peerConnection.connectionState === 'connecting') {
                console.log('🔄 Peer connection CONNECTING...');
            } else if (peerConnection.connectionState === 'disconnected') {
                console.warn('⚠️ Connection temporarily disconnected, will attempt reconnection');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('❄️ ICE connection state:', peerConnection.iceConnectionState);
        };

        peerConnectionRef.current = peerConnection;
        peerConnectionInitializedRef.current = true;
        console.log('✅ Peer connection created successfully');
        return peerConnection;
    };

    // Create and send offer
    const createOffer = async (stream) => {
        console.log('📤 createOffer called');
        if (!peerConnectionRef.current) {
            console.error('❌ No peer connection available!');
            return;
        }

        try {
            console.log('   Creating offer...');
            const offer = await peerConnectionRef.current.createOffer();
            console.log('✅ Offer created');
            console.log('   Setting offer as local description...');
            await peerConnectionRef.current.setLocalDescription(offer);
            console.log('✅ Offer set as local description');
            console.log('📤 Emitting offer to remote peer');
            onOffer(offer);
        } catch (error) {
            console.error('❌ Error creating offer:', error);
        }
    };

    // Create and send answer
    const createAnswer = async (offer) => {
        console.log('📥 createAnswer called');
        if (!peerConnectionRef.current) {
            console.error('❌ No peer connection available!');
            return;
        }

        try {
            console.log('   Setting offer as remote description...');
            await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            console.log('✅ Offer set as remote description');

            console.log('   Creating answer...');
            const answer = await peerConnectionRef.current.createAnswer();
            console.log('✅ Answer created');

            console.log('   Setting answer as local description...');
            await peerConnectionRef.current.setLocalDescription(answer);
            console.log('✅ Answer set as local description');

            console.log('📤 Emitting answer to remote peer');
            onAnswer(answer);
        } catch (error) {
            console.error('❌ Error creating answer:', error);
        }
    };

    // Handle incoming answer
    const handleAnswer = async (answer) => {
        console.log('📥 handleAnswer called');
        if (!peerConnectionRef.current) {
            console.error('❌ No peer connection available!');
            return;
        }

        try {
            console.log('   Setting answer as remote description...');
            await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(answer)
            );
            console.log('✅ Answer set as remote description');
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    };

    // Add ICE candidate
    const addIceCandidate = async (candidate) => {
        if (!peerConnectionRef.current) {
            console.warn('⚠️ Peer connection not ready for ICE candidate');
            return;
        }

        if (!candidate) {
            return;
        }

        try {
            console.log('❄️ Adding ICE candidate');
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('✅ ICE candidate added');
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    };

    // Cleanup
    const cleanup = () => {
        console.log('🧹 Cleaning up WebRTC resources');
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
            peerConnectionInitializedRef.current = false;
        }
        remoteStreamSetRef.current = false;
        stopMedia();
        setIsCallActive(false);
        console.log('✅ Cleanup complete');
    };

    // Main orchestration: when call is accepted, set up WebRTC
    useEffect(() => {
        if (callState?.status !== 'accepted') {
            return;
        }

        console.log('\n========================================');
        console.log('📞 CALL ACCEPTED - Setting up WebRTC');
        console.log('Initiator:', callState.initiator);
        console.log('========================================\n');

        let isMounted = true;

        const setupWebRTC = async () => {
            try {
                // Step 1: Start media
                console.log('\n[STEP 1] Starting media...');
                const stream = await startMedia();
                if (!isMounted) return;

                // Step 2: Create peer connection
                console.log('\n[STEP 2] Creating peer connection...');
                await createPeerConnection(stream);
                if (!isMounted) return;

                setIsCallActive(true);

                // Step 3: If initiator, create and send offer
                if (callState.initiator) {
                    console.log('\n[STEP 3] Creating offer (initiator mode)...');
                    await createOffer(stream);
                } else {
                    console.log('\n[STEP 3] Waiting for offer (receiver mode)...');
                }
            } catch (error) {
                console.error('❌ Error during WebRTC setup:', error);
            }
        };

        setupWebRTC();

        return () => {
            isMounted = false;
        };
    }, [callState?.status, callState?.initiator]);

    // Handle incoming offer from remote
    useEffect(() => {
        if (!callState?.offer) {
            return;
        }

        console.log('\n========================================');
        console.log('📨 OFFER RECEIVED - Creating answer');
        console.log('========================================\n');

        createAnswer(callState.offer);
    }, [callState?.offer]);

    // Handle incoming answer from remote
    useEffect(() => {
        if (!callState?.answer) {
            return;
        }

        console.log('\n========================================');
        console.log('📩 ANSWER RECEIVED - Setting remote description');
        console.log('Answer:', callState.answer);
        console.log('========================================\n');

        handleAnswer(callState.answer);
    }, [callState?.answer]);

    // Handle ICE candidates
    useEffect(() => {
        if (!callState?.iceCandidates || callState.iceCandidates.length === 0) {
            return;
        }

        console.log('\n❄️ Processing', callState.iceCandidates.length, 'ICE candidates');
        callState.iceCandidates.forEach((candidate, index) => {
            addIceCandidate(candidate);
        });
    }, [callState?.iceCandidates?.length]);  // Use length to avoid infinite loops

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

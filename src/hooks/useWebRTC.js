import { useState, useRef, useEffect } from 'react';

const STUN_SERVERS = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
];

const SETUP_TIMEOUT = 30000; // 30 seconds for WebRTC setup
const SIGNAL_TIMEOUT = 10000; // 10 seconds for signal operations
const MAX_RETRIES = 3;
const RETRY_DELAY = [1000, 2000, 4000]; // Exponential backoff in ms

export const useWebRTC = (callState, onOffer, onAnswer, onIceCandidate) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isCallActive, setIsCallActive] = useState(false);
    const [connectionError, setConnectionError] = useState(null);

    const peerConnectionRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const mediaStartedRef = useRef(false);
    const peerConnectionInitializedRef = useRef(false);
    const remoteStreamSetRef = useRef(false);
    const setupTimeoutRef = useRef(null);
    const retryCountRef = useRef(0);
    const setupAbortedRef = useRef(false);

    // Initialize media streams with better error handling
    const startMedia = async () => {
        if (mediaStartedRef.current) {
            console.log('📹 Media already started, skipping');
            return localStream;
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
                localVideoRef.current.play().catch(e => console.error('Error playing local video:', e));
            }
            mediaStartedRef.current = true;
            console.log('✅ Media stream started successfully');
            return stream;
        } catch (error) {
            console.error('❌ Error accessing media devices:', error);
            const errorMsg = error.name === 'NotAllowedError'
                ? 'Camera/Microphone permission denied'
                : error.name === 'NotFoundError'
                    ? 'Camera/Microphone not found'
                    : error.message;
            setConnectionError(errorMsg);
            throw new Error(`Media access failed: ${errorMsg}`);
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

    // Create peer connection with local stream and better error handling
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
            console.error('❌ No local stream available for peer connection!');
            throw new Error('No local stream available');
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
            } else {
                console.error('❌ No streams in ontrack event');
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('❄️ Generated ICE candidate');
                onIceCandidate(event.candidate);
            } else {
                console.log('❄️ ICE gathering completed');
            }
        };

        // Monitor connection state
        peerConnection.onconnectionstatechange = () => {
            console.log('🔄 Peer connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                console.error('❌ Connection FAILED');
                setConnectionError('Connection failed');
            } else if (peerConnection.connectionState === 'connected') {
                console.log('✅ Peer connection ESTABLISHED and CONNECTED');
                setConnectionError(null);
            } else if (peerConnection.connectionState === 'connecting') {
                console.log('🔄 Peer connection CONNECTING...');
            } else if (peerConnection.connectionState === 'disconnected') {
                console.warn('⚠️ Connection temporarily disconnected');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('❄️ ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                console.error('❌ ICE connection failed');
                setConnectionError('ICE connection failed');
            }
        };

        peerConnection.onicegatheringstatechange = () => {
            console.log('❄️ ICE gathering state:', peerConnection.iceGatheringState);
        };

        peerConnectionRef.current = peerConnection;
        peerConnectionInitializedRef.current = true;
        console.log('✅ Peer connection created successfully');
        return peerConnection;
    };

    // Create and send offer with timeout
    const createOffer = async (stream) => {
        console.log('📤 createOffer called');
        if (!peerConnectionRef.current) {
            console.error('❌ No peer connection available!');
            throw new Error('No peer connection available');
        }

        try {
            console.log('   Creating offer...');
            const offerPromise = peerConnectionRef.current.createOffer();
            const offer = await Promise.race([
                offerPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Offer creation timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ Offer created');

            console.log('   Setting offer as local description...');
            const setDescPromise = peerConnectionRef.current.setLocalDescription(offer);
            await Promise.race([
                setDescPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Set local description timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ Offer set as local description');
            console.log('📤 Emitting offer to remote peer');
            onOffer(offer);
        } catch (error) {
            console.error('❌ Error creating offer:', error);
            setConnectionError(`Failed to create offer: ${error.message}`);
            throw error;
        }
    };

    // Create and send answer with timeout - WITH RETRY
    const createAnswer = async (offer) => {
        console.log('📥 createAnswer called');

        // Check if peer connection is ready
        if (!peerConnectionRef.current) {
            console.error('❌ No peer connection available!');
            throw new Error('No peer connection available');
        }

        // Check if peer connection is still in usable state
        if (peerConnectionRef.current.connectionState === 'closed') {
            console.error('❌ Peer connection is closed!');
            throw new Error('Peer connection is closed');
        }

        try {
            console.log('   Setting offer as remote description...');
            const setRemotePromise = peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            await Promise.race([
                setRemotePromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Set remote description timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ Offer set as remote description');

            console.log('   Creating answer...');
            const answerPromise = peerConnectionRef.current.createAnswer();
            const answer = await Promise.race([
                answerPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Answer creation timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ Answer created');

            console.log('   Setting answer as local description...');
            const setLocalPromise = peerConnectionRef.current.setLocalDescription(answer);
            await Promise.race([
                setLocalPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Set local description timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ Answer set as local description');

            console.log('📤 Emitting answer to remote peer');
            onAnswer(answer);
        } catch (error) {
            console.error('❌ Error creating answer:', error);
            setConnectionError(`Failed to create answer: ${error.message}`);
            throw error;
        }
    };

    // Handle incoming answer with timeout
    const handleAnswer = async (answer) => {
        console.log('📥 handleAnswer called');
        if (!peerConnectionRef.current) {
            console.error('❌ No peer connection available!');
            return;
        }

        try {
            console.log('   Setting answer as remote description...');
            const setRemotePromise = peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(answer)
            );
            await Promise.race([
                setRemotePromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Set remote description timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ Answer set as remote description');
        } catch (error) {
            console.error('❌ Error handling answer:', error);
            setConnectionError(`Failed to handle answer: ${error.message}`);
        }
    };

    // Add ICE candidate with timeout and error handling
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
            const addPromise = peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            await Promise.race([
                addPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Add ICE candidate timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ ICE candidate added');
        } catch (error) {
            // Some ICE candidates might fail, but that's often okay
            console.warn('⚠️ Error adding ICE candidate (may be normal):', error.message);
        }
    };

    // Reset refs after cleanup
    const resetRefs = () => {
        console.log('🔄 Resetting all refs');
        mediaStartedRef.current = false;
        peerConnectionInitializedRef.current = false;
        remoteStreamSetRef.current = false;
        retryCountRef.current = 0;
        setupAbortedRef.current = false;
        console.log('✅ All refs reset');
    };

    // Cleanup
    const cleanup = () => {
        console.log('🧹 Cleaning up WebRTC resources');

        // Clear timeout
        if (setupTimeoutRef.current) {
            clearTimeout(setupTimeoutRef.current);
            setupTimeoutRef.current = null;
        }

        // Close peer connection
        if (peerConnectionRef.current) {
            try {
                peerConnectionRef.current.close();
            } catch (e) {
                console.warn('⚠️ Error closing peer connection:', e);
            }
            peerConnectionRef.current = null;
        }

        // Stop media
        stopMedia();

        // Reset refs
        resetRefs();

        setIsCallActive(false);
        setConnectionError(null);
        setRemoteStream(null);
        console.log('✅ Cleanup complete');
    };

    // Main orchestration: when call is accepted, set up WebRTC with retry logic
    useEffect(() => {
        if (callState?.status !== 'accepted') {
            return;
        }

        console.log('\n========================================');
        console.log('📞 CALL ACCEPTED - Setting up WebRTC');
        console.log('Initiator:', callState.initiator);
        console.log('========================================\n');

        let isMounted = true;
        setupAbortedRef.current = false;

        const setupWebRTC = async (attemptNumber = 1) => {
            try {
                console.log(`\n🔄 WebRTC Setup Attempt ${attemptNumber}/${MAX_RETRIES}`);

                // Set timeout for entire setup
                const setupTimeout = new Promise((_, reject) => {
                    setupTimeoutRef.current = setTimeout(() => {
                        reject(new Error('WebRTC setup timeout'));
                    }, SETUP_TIMEOUT);
                });

                const setupPromise = (async () => {
                    // Step 1: Start media
                    if (!isMounted || setupAbortedRef.current) return;
                    console.log('\n[STEP 1] Starting media...');
                    const stream = await startMedia();

                    if (!isMounted || setupAbortedRef.current) return;

                    // Step 2: Create peer connection
                    console.log('\n[STEP 2] Creating peer connection...');
                    await createPeerConnection(stream);

                    if (!isMounted || setupAbortedRef.current) return;

                    setIsCallActive(true);

                    // Step 3: If initiator, create and send offer
                    if (callState.initiator) {
                        console.log('\n[STEP 3] Creating offer (initiator mode)...');
                        await createOffer(stream);
                    } else {
                        console.log('\n[STEP 3] Waiting for offer (receiver mode)...');
                    }

                    console.log('\n✅ WebRTC setup completed successfully');
                })();

                await Promise.race([setupPromise, setupTimeout]);

            } catch (error) {
                if (setupTimeoutRef.current) {
                    clearTimeout(setupTimeoutRef.current);
                    setupTimeoutRef.current = null;
                }

                console.error(`❌ WebRTC setup attempt ${attemptNumber} failed:`, error.message);
                setConnectionError(`Connection failed: ${error.message}`);

                // If we haven't exceeded max retries and mount is still active, retry
                if (attemptNumber < MAX_RETRIES && isMounted && !setupAbortedRef.current) {
                    const delay = RETRY_DELAY[attemptNumber - 1] || RETRY_DELAY[RETRY_DELAY.length - 1];
                    console.log(`⏳ Retrying in ${delay}ms...`);

                    setTimeout(() => {
                        if (isMounted && !setupAbortedRef.current) {
                            // Clean up before retry
                            resetRefs();
                            setupWebRTC(attemptNumber + 1);
                        }
                    }, delay);
                } else if (attemptNumber >= MAX_RETRIES) {
                    console.error('❌ Max retries exceeded, WebRTC setup failed');
                    setConnectionError('Failed to establish connection after multiple attempts');
                }
            }
        };

        setupWebRTC();

        return () => {
            isMounted = false;
            setupAbortedRef.current = true;
            if (setupTimeoutRef.current) {
                clearTimeout(setupTimeoutRef.current);
                setupTimeoutRef.current = null;
            }
        };
    }, [callState?.status, callState?.initiator]);

    // Cleanup when call ends
    useEffect(() => {
        // When callState becomes null, ensure full cleanup
        if (callState === null) {
            console.log('📞 Call state cleared, performing full cleanup');

            // Close peer connection
            if (peerConnectionRef.current) {
                try {
                    peerConnectionRef.current.close();
                    console.log('✅ Peer connection closed');
                } catch (e) {
                    console.warn('⚠️ Error closing peer connection:', e);
                }
                peerConnectionRef.current = null;
            }

            // Stop media tracks
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    try {
                        track.stop();
                    } catch (e) {
                        console.warn('⚠️ Error stopping track:', e);
                    }
                });
            }

            if (remoteStream) {
                remoteStream.getTracks().forEach(track => {
                    try {
                        track.stop();
                    } catch (e) {
                        console.warn('⚠️ Error stopping track:', e);
                    }
                });
            }

            // Reset all refs
            resetRefs();
            
            // Clear state
            setRemoteStream(null);
            setLocalStream(null);
            setIsCallActive(false);
            setConnectionError(null);

            console.log('✅ Full cleanup completed');
            console.log('   isCallActive reset to:', false);
        }
    }, [callState]);
    useEffect(() => {
        if (!callState?.offer) {
            return;
        }

        // Wait for peer connection to be ready before creating answer
        if (!peerConnectionRef.current) {
            console.log('⏳ Offer received but peer connection not ready yet, waiting...');

            const checkAndCreateAnswer = async () => {
                let attempts = 0;
                while (!peerConnectionRef.current && attempts < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }

                if (peerConnectionRef.current) {
                    console.log('\n========================================');
                    console.log('📨 OFFER RECEIVED - Creating answer');
                    console.log('========================================\n');
                    createAnswer(callState.offer);
                } else {
                    console.error('❌ Peer connection never became ready for answer');
                }
            };

            checkAndCreateAnswer();
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

    // Handle ICE candidates - WAIT FOR PEER CONNECTION
    useEffect(() => {
        if (!callState?.iceCandidates || callState.iceCandidates.length === 0) {
            return;
        }

        // If peer connection not ready yet, queue candidates
        if (!peerConnectionRef.current) {
            console.log('⏳ ICE candidates received but peer connection not ready, will retry...');

            const checkAndAddCandidates = async () => {
                let attempts = 0;
                while (!peerConnectionRef.current && attempts < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }

                if (peerConnectionRef.current) {
                    console.log('\n❄️ Processing', callState.iceCandidates.length, 'ICE candidates (after waiting)');
                    callState.iceCandidates.forEach((candidate, index) => {
                        addIceCandidate(candidate);
                    });
                }
            };

            checkAndAddCandidates();
            return;
        }

        console.log('\n❄️ Processing', callState.iceCandidates.length, 'ICE candidates');
        callState.iceCandidates.forEach((candidate, index) => {
            addIceCandidate(candidate);
        });
    }, [callState?.iceCandidates?.length]);

    return {
        localStream,
        remoteStream,
        isCallActive,
        connectionError,
        localVideoRef,
        remoteVideoRef,
        startMedia,
        stopMedia,
        cleanup,
        createOffer,
        createAnswer,
        handleAnswer,
        addIceCandidate,
        resetRefs
    };
};

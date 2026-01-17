import { useState, useRef, useEffect } from 'react';

// ============================================
// ICE SERVERS CONFIGURATION FOR GLOBAL CONNECTIVITY
// ============================================
// STUN servers: Free, discovers external IP only (not enough for NAT traversal)
// TURN servers: Relays data through server (handles complex NAT/Firewall)
// Using both ensures: ANY user can reach ANY other user globally!
const ICE_SERVERS = {
    iceServers: [
        // Google's Free STUN Servers (for external IP discovery)
        { urls: ['stun:stun.l.google.com:19302'] },
        { urls: ['stun:stun1.l.google.com:19302'] },
        { urls: ['stun:stun2.l.google.com:19302'] },
        { urls: ['stun:stun3.l.google.com:19302'] },

        // Twillio STUN (backup)
        { urls: ['stun:stun.stunprotocol.org:3478'] },

        // ============================================
        // TURN SERVER (Critical for Global Connectivity!)
        // ============================================
        // Option 1: Use Free TURN Server (Limited, but works for testing)
        {
            urls: ['turn:relay.metered.ca:80?transport=udp'],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: ['turn:relay.metered.ca:443?transport=tcp'],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },

        // Option 2: Self-Hosted TURN Server (recommended for production)
        // Uncomment and replace YOUR_TURN_SERVER_IP with your Coturn server
        /*
        {
            urls: ['turn:YOUR_TURN_SERVER_IP:3478', 'turn:YOUR_TURN_SERVER_IP:3479'],
            username: 'your_username',
            credential: 'your_password',
            credentialType: 'password'
        }
        */
    ],
    // Settings for better connectivity
    iceCandidatePoolSize: 10,  // Gather candidates
    bundlePolicy: 'max-bundle', // All media types on one connection
    rtcpMuxPolicy: 'require'    // Mux RTCP with RTP
};

// ============================================
// ICE CANDIDATE FILTERING CONSTANTS
// ============================================
const ICE_CANDIDATE_CONFIG = {
    // Only select these candidate types (ignore unnecessary ones)
    preferredTypes: ['host', 'srflx', 'relay'], // In priority order

    // Maximum candidates to keep per type
    maxCandidatesPerType: {
        'host': 1,   // One local candidate is enough
        'srflx': 1,  // One reflexive (external) candidate
        'relay': 1   // One relay candidate
    },

    // Filter out poor quality candidates
    minRTCPPort: 1024,  // Skip low port numbers
    maxUDPPort: 65535,

    // Timeout waiting for candidates
    gatheringTimeout: 5000  // 5 seconds to gather ICE candidates
};

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

    // ============================================
    // SDP & ICE STORAGE FOR DEBUGGING & MONITORING
    // ============================================
    const sdpStorageRef = useRef({
        localOffer: null,
        remoteAnswer: null,
        localAnswer: null,
        remoteOffer: null
    });

    const iceCandidatesRef = useRef({
        localCandidates: [],     // Candidates we send
        remoteCandidates: [],    // Candidates we receive
        selectedLocal: null,     // Best local candidate
        selectedRemote: null     // Best remote candidate
    });

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

        console.log('🔧 Creating new peer connection with GLOBAL connectivity');
        console.log('   Using STUN + TURN servers for ANY-to-ANY connections');

        const peerConnection = new RTCPeerConnection(ICE_SERVERS);

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

        // ============================================
        // INTELLIGENT ICE CANDIDATE HANDLING
        // Filters to only send the BEST candidates (max 2 per side)
        // ============================================
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const candidate = event.candidate;
                const candidateType = candidate.type; // 'host', 'srflx', 'relay', 'prflx'

                console.log('❄️ Generated ICE candidate:');
                console.log(`   Type: ${candidateType}`);
                console.log(`   Protocol: ${candidate.protocol}`);
                console.log(`   Address: ${candidate.address}:${candidate.port}`);
                console.log(`   Priority: ${candidate.priority}`);

                // ✅ FILTER: Only send preferred candidate types
                if (!ICE_CANDIDATE_CONFIG.preferredTypes.includes(candidateType)) {
                    console.log(`   ⏭️ SKIPPED: Type '${candidateType}' not in preferred types`);
                    return;
                }

                // ✅ FILTER: Check if we already have this type
                const existingCount = iceCandidatesRef.current.localCandidates.filter(
                    c => c.candidate.type === candidateType
                ).length;

                const maxForType = ICE_CANDIDATE_CONFIG.maxCandidatesPerType[candidateType];
                if (existingCount >= maxForType) {
                    console.log(`   ⏭️ SKIPPED: Already have ${existingCount} ${candidateType} candidate(s), max is ${maxForType}`);
                    return;
                }

                // ✅ Store and send only if it passes filters
                iceCandidatesRef.current.localCandidates.push({
                    candidate: candidate,
                    timestamp: Date.now(),
                    type: candidateType
                });

                console.log(`   ✅ ACCEPTED: Sending to remote peer (Total local: ${iceCandidatesRef.current.localCandidates.length})`);

                // ⚠️ CRITICAL FIX: Serialize RTCIceCandidate properly for Socket.IO transmission
                // RTCIceCandidate is not a plain object, so we need to convert it to JSON
                const candidateData = {
                    candidate: candidate.candidate,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    sdpMid: candidate.sdpMid,
                    usernameFragment: candidate.usernameFragment,
                    // Store additional info for verification
                    type: candidate.type,
                    protocol: candidate.protocol,
                    address: candidate.address,
                    port: candidate.port,
                    priority: candidate.priority,
                    foundation: candidate.foundation
                };

                console.log(`   📤 Serialized candidate data:`, JSON.stringify(candidateData, null, 2));
                onIceCandidate(candidateData);
            } else {
                console.log('❄️ ✅ ICE gathering COMPLETED - Total candidates sent:', iceCandidatesRef.current.localCandidates.length);
                console.log('   Local candidates summary:');
                const summary = {};
                iceCandidatesRef.current.localCandidates.forEach(c => {
                    summary[c.type] = (summary[c.type] || 0) + 1;
                });
                console.log('   ', summary);
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

            // ============================================
            // STORE & DISPLAY OFFER SDP
            // ============================================
            sdpStorageRef.current.localOffer = offer.sdp;
            console.log('📋 LOCAL OFFER SDP (Initiator - will send to remote):');
            console.log('================================');
            console.log(offer.sdp);
            console.log('================================');

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

            // ============================================
            // STORE RECEIVED OFFER SDP
            // ============================================
            sdpStorageRef.current.remoteOffer = offer.sdp;
            console.log('📋 REMOTE OFFER SDP RECEIVED (from Initiator):');
            console.log('================================');
            console.log(offer.sdp);
            console.log('================================');

            console.log('   Creating answer...');
            const answerPromise = peerConnectionRef.current.createAnswer();
            const answer = await Promise.race([
                answerPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Answer creation timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log('✅ Answer created');

            // ============================================
            // STORE & DISPLAY ANSWER SDP
            // ============================================
            sdpStorageRef.current.localAnswer = answer.sdp;
            console.log('📋 LOCAL ANSWER SDP (Responder - will send to initiator):');
            console.log('================================');
            console.log(answer.sdp);
            console.log('================================');

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

            // ============================================
            // STORE RECEIVED ANSWER SDP
            // ============================================
            sdpStorageRef.current.remoteAnswer = answer.sdp;
            console.log('📋 REMOTE ANSWER SDP RECEIVED (from Responder):');
            console.log('================================');
            console.log(answer.sdp);
            console.log('================================');

            // ============================================
            // SDP SUMMARY - CONNECTION ESTABLISHED
            // ============================================
            console.log('✅ ==================== SDP EXCHANGE COMPLETE ====================');
            console.log('📋 LOCAL OFFER:', sdpStorageRef.current.localOffer ? 'SENT ✅' : 'NOT SENT ❌');
            console.log('📋 REMOTE ANSWER:', sdpStorageRef.current.remoteAnswer ? 'RECEIVED ✅' : 'NOT RECEIVED ❌');
            console.log('🔗 Both SDPs now exchanged - WebRTC connection establishing...');
            console.log('===============================================================');
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
            // ⚠️ CRITICAL FIX: Reconstruct proper RTCIceCandidate from received data
            // The candidate object is serialized data, not a RTCIceCandidate instance
            const candidateType = candidate.type || 'unknown';
            console.log(`❄️ Received ICE candidate from remote:`);
            console.log(`   Type: ${candidateType}`);
            console.log(`   Protocol: ${candidate.protocol}`);
            console.log(`   Address: ${candidate.address}:${candidate.port}`);
            console.log(`   Priority: ${candidate.priority}`);
            console.log(`   Full data:`, JSON.stringify(candidate, null, 2));

            // ✅ Create proper RTCIceCandidate from received data
            const rtcCandidate = new RTCIceCandidate({
                candidate: candidate.candidate,
                sdpMLineIndex: candidate.sdpMLineIndex,
                sdpMid: candidate.sdpMid,
                usernameFragment: candidate.usernameFragment
            });

            // ✅ TRACK: Store received candidates
            iceCandidatesRef.current.remoteCandidates.push({
                candidate: candidate,
                timestamp: Date.now(),
                type: candidateType
            });

            const addPromise = peerConnectionRef.current.addIceCandidate(rtcCandidate);
            await Promise.race([
                addPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Add ICE candidate timeout')), SIGNAL_TIMEOUT)
                )
            ]);
            console.log(`✅ ICE candidate ADDED (Total remote: ${iceCandidatesRef.current.remoteCandidates.length})`);

            // ✅ SUMMARY: When we have 2 candidates from each side, show summary
            if (iceCandidatesRef.current.localCandidates.length >= 2 &&
                iceCandidatesRef.current.remoteCandidates.length >= 2) {
                console.log('❄️ ============= ICE CANDIDATES COMPLETE ==============');
                console.log(`   Local candidates sent: ${iceCandidatesRef.current.localCandidates.length}`);
                iceCandidatesRef.current.localCandidates.forEach((c, i) => {
                    console.log(`     ${i + 1}. ${c.type} - ${c.candidate.address}:${c.candidate.port}`);
                });
                console.log(`   Remote candidates received: ${iceCandidatesRef.current.remoteCandidates.length}`);
                iceCandidatesRef.current.remoteCandidates.forEach((c, i) => {
                    console.log(`     ${i + 1}. ${c.type} - ${c.candidate.address}:${c.candidate.port}`);
                });
                console.log('=====================================================');
            }
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

        // Reset SDP and ICE storage
        sdpStorageRef.current = {
            localOffer: null,
            remoteAnswer: null,
            localAnswer: null,
            remoteOffer: null
        };
        iceCandidatesRef.current = {
            localCandidates: [],
            remoteCandidates: [],
            selectedLocal: null,
            selectedRemote: null
        };

        console.log('✅ All refs reset (including SDP & ICE storage)');
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

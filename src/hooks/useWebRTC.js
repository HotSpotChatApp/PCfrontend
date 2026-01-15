import { useState, useRef, useEffect, useCallback } from 'react';

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
        console.log('🔧 Creating new peer connection');
        const peerConnection = new RTCPeerConnection({
            iceServers: STUN_SERVERS.map(server => ({ urls: server }))
        });

        if (localStream) {
            console.log('📹 Adding local tracks to peer connection:', localStream.getTracks().length);
            localStream.getTracks().forEach((track, index) => {
                console.log(`   Track ${index}:`, track.kind, track.enabled ? 'enabled' : 'disabled');
                peerConnection.addTrack(track, localStream);
            });
        } else {
            console.warn('⚠️ No local stream available yet');
        }

        peerConnection.ontrack = (event) => {
            console.log('🎬 ontrack event fired!');
            console.log('   event.streams:', event.streams);
            console.log('   event.track:', event.track?.kind, event.track?.id);
            if (event.streams && event.streams[0]) {
                console.log('✅ Setting remote stream:', event.streams[0].id);
                setRemoteStream(event.streams[0]);
                if (remoteVideoRef.current) {
                    console.log('📺 Attaching stream to video element');
                    remoteVideoRef.current.srcObject = event.streams[0];
                    console.log('✅ Remote stream attached to video element');
                } else {
                    console.error('❌ remoteVideoRef.current is null!');
                }
            } else {
                console.warn('⚠️ No streams in ontrack event');
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('❄️ ICE candidate:', event.candidate.candidate.substring(0, 50) + '...');
                onIceCandidate(event.candidate);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('🔄 Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed' ||
                peerConnection.connectionState === 'disconnected') {
                console.warn('⚠️ Connection lost, cleaning up');
                cleanup();
            }
        };

        peerConnectionRef.current = peerConnection;
        console.log('✅ Peer connection created');
        return peerConnection;
    };

    // Create and send offer
    const createOffer = async () => {
        console.log('📤 createOffer called');
        
        // Ensure media is started first
        if (!localStream) {
            console.log('   ⏳ Starting media first (not started yet)');
            await startMedia();
        }
        
        if (!peerConnectionRef.current) {
            console.log('   Creating peer connection first');
            peerConnectionRef.current = await createPeerConnection();
        }
        try {
            const offer = await peerConnectionRef.current.createOffer();
            console.log('✅ Offer created, setting as local description');
            await peerConnectionRef.current.setLocalDescription(offer);
            console.log('📤 Sending offer to remote');
            onOffer(offer);
        } catch (error) {
            console.error('❌ Error creating offer:', error);
        }
    };

    // Create and send answer
    const createAnswer = async (offer) => {
        console.log('📥 createAnswer called');
        
        // Ensure media is started first
        if (!localStream) {
            console.log('   ⏳ Starting media first (not started yet)');
            await startMedia();
        }
        
        if (!peerConnectionRef.current) {
            console.log('   Creating peer connection first');
            peerConnectionRef.current = await createPeerConnection();
        }
        try {
            console.log('   Setting remote description from offer');
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('✅ Offer set as remote description');
            const answer = await peerConnectionRef.current.createAnswer();
            console.log('✅ Answer created, setting as local description');
            await peerConnectionRef.current.setLocalDescription(answer);
            console.log('📤 Sending answer to remote');
            onAnswer(answer);
        } catch (error) {
            console.error('❌ Error creating answer:', error);
        }
    };

    // Handle incoming answer
    const handleAnswer = async (answer) => {
        console.log('📥 handleAnswer called');
        if (peerConnectionRef.current) {
            try {
                console.log('   Setting remote description from answer');
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('✅ Answer set as remote description');
            } catch (error) {
                console.error('❌ Error handling answer:', error);
            }
        } else {
            console.error('❌ No peer connection available!');
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
            console.log('📞 Call accepted, starting media for', callState.initiator ? 'initiator' : 'receiver');
            startMedia().then(() => {
                console.log('✅ Media started');
                // Create peer connection if not exists
                if (!peerConnectionRef.current) {
                    console.log('Creating peer connection...');
                    createPeerConnection().then(() => {
                        // For initiator only - create offer
                        if (callState.initiator) {
                            console.log('📤 Creating offer (initiator)');
                            createOffer();
                        } else {
                            console.log('⏳ Waiting for offer (receiver)');
                        }
                    });
                } else {
                    // Peer connection already exists, just create offer if initiator
                    if (callState.initiator) {
                        console.log('📤 Creating offer (initiator, peer connection already exists)');
                        createOffer();
                    }
                }
            }).catch(error => {
                console.error('❌ Error starting media:', error);
            });
            setIsCallActive(true);
        }
    }, [callState?.status, callState?.initiator]);

    // Handle offer from remote
    useEffect(() => {
        if (callState?.offer) {
            console.log('📨 Received WebRTC offer, creating answer');
            createAnswer(callState.offer).catch(error => {
                console.error('❌ Error creating answer:', error);
            });
        }
    }, [callState?.offer]);

    // Handle answer from remote
    useEffect(() => {
        if (callState?.answer) {
            console.log('✅ Received WebRTC answer, setting remote description');
            handleAnswer(callState.answer).catch(error => {
                console.error('❌ Error handling answer:', error);
            });
        }
    }, [callState?.answer]);

    // Handle ICE candidates
    useEffect(() => {
        if (callState?.iceCandidates && callState.iceCandidates.length > 0) {
            console.log('❄️ Processing ICE candidates:', callState.iceCandidates.length);
            callState.iceCandidates.forEach(candidate => {
                addIceCandidate(candidate);
            });
        }
    }, [callState?.iceCandidates?.length]);

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

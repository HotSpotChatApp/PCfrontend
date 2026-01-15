import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';

export const useSocket = () => {
    const [activeUsers, setActiveUsers] = useState([]);
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [callState, setCallState] = useState(null);
    const [isUserActive, setIsUserActive] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const socket = getSocket();
        if (!socket) {
            console.log('❌ Socket not initialized');
            return;
        }

        // Helper to request all initial data
        const requestInitialData = () => {
            console.log('🔄 Requesting initial data from server...');

            // Request active users
            socket.emit('get-active-users', (users) => {
                if (users && Array.isArray(users)) {
                    const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                    setActiveUsers(filtered);
                    console.log('✅ Received initial active users list from server:', filtered.length, 'users');
                    filtered.forEach(u => console.log(`  - ${u.displayName} (${u.userId}) - Status: ${u.status}`));
                } else {
                    console.log('⚠️ Active users response invalid:', users);
                    setActiveUsers([]);
                }
            });

            // Request incoming requests
            socket.emit('get-incoming-requests', (requests) => {
                if (requests && Array.isArray(requests)) {
                    setIncomingRequests(requests);
                    console.log('✅ Received incoming requests:', requests.length, 'requests');
                } else {
                    console.log('⚠️ Incoming requests response invalid:', requests);
                    setIncomingRequests([]);
                }
            });

            // Request outgoing requests
            socket.emit('get-outgoing-requests', (requests) => {
                if (requests && Array.isArray(requests)) {
                    setOutgoingRequests(requests);
                    console.log('✅ Received outgoing requests:', requests.length, 'requests');
                } else {
                    console.log('⚠️ Outgoing requests response invalid:', requests);
                    setOutgoingRequests([]);
                }
            });
        };

        // When user:online is received from server, request the initial data
        const handleUserOnline = () => {
            console.log('📨 Received user:online from server, requesting initial data...');
            requestInitialData();
        };

        socket.on('user:online', handleUserOnline);

        // Also request data immediately on connection (in case user:online was missed)
        if (socket.connected) {
            console.log('✅ Socket already connected, requesting data immediately');
            requestInitialData();
        }

        // Listen for real-time active users updates
        const handleActiveUsersUpdate = (users) => {
            if (users && Array.isArray(users)) {
                const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                setActiveUsers(filtered);
                console.log('📡 Real-time active users update received:', filtered.length, 'users');
                filtered.forEach(u => console.log(`  - ${u.displayName} (${u.userId}) - Status: ${u.status}`));
            }
        };

        socket.on('active-users:update', handleActiveUsersUpdate);

        // Listen for incoming requests updates
        const handleIncomingRequestsUpdate = (requests) => {
            if (Array.isArray(requests)) {
                setIncomingRequests(requests);
                console.log('📡 Incoming requests updated:', requests.length, 'requests');
            }
        };

        socket.on('incoming-requests:update', handleIncomingRequestsUpdate);

        // Listen for outgoing requests updates
        const handleOutgoingRequestsUpdate = (requests) => {
            if (Array.isArray(requests)) {
                setOutgoingRequests(requests);
                console.log('📡 Outgoing requests updated:', requests.length, 'requests');
            }
        };

        socket.on('outgoing-requests:update', handleOutgoingRequestsUpdate);

        const handleUserOffline = (userId) => {
            setActiveUsers(prev => {
                const updated = prev.filter(u => u.userId !== userId);
                console.log(`👤 User offline: ${userId}, remaining: ${updated.length}`);
                return updated;
            });
            setOutgoingRequests(prev => prev.filter(u => u.userId !== userId));
        };

        socket.on('user:offline', handleUserOffline);

        // Call Request Events
        const handleCallIncoming = (data) => {
            if (data && data.caller) {
                setIncomingRequests(prev => [...prev, data.caller]);
                console.log('📲 Incoming call:', data.caller);
            }
        };

        socket.on('call:incoming', handleCallIncoming);

        const handleCallReject = (data) => {
            setOutgoingRequests(prev => prev.filter(u => u.userId !== data.calleeId));
            console.log('📞 Call rejected');
        };

        socket.on('call:reject', handleCallReject);

        const handleCallAccept = (data) => {
            setCallState({
                callId: data.callId,
                calleeId: data.calleeId || data.callerId,
                callerId: data.callerId || data.calleeId,
                initiator: data.initiator || false,
                status: 'accepted'
            });
            setIncomingRequests([]);
            setOutgoingRequests([]);
            console.log('✅ Call accepted, setting up WebRTC');
        };

        socket.on('call:accept', handleCallAccept);

        const handleCallEnd = () => {
            setCallState(null);
            setIncomingRequests([]);
            setOutgoingRequests([]);
            console.log('📵 Call ended');

            // Refresh active users after call ends
            socket.emit('get-active-users', (users) => {
                if (users && Array.isArray(users)) {
                    const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                    setActiveUsers(filtered);
                    console.log('✅ Active users refreshed after call:', filtered.length, 'users');
                }
            });
        };

        socket.on('call:end', handleCallEnd);

        // WebRTC Signaling
        const handleWebRTCOffer = (data) => {
            setCallState(prev => ({
                ...prev,
                offer: data.offer
            }));
            console.log('📨 Received WebRTC offer');
        };

        socket.on('webrtc:offer', handleWebRTCOffer);

        const handleWebRTCAnswer = (data) => {
            setCallState(prev => ({
                ...prev,
                answer: data.answer
            }));
            console.log('📨 Received WebRTC answer');
        };

        socket.on('webrtc:answer', handleWebRTCAnswer);

        const handleWebRTCIceCandidate = (data) => {
            setCallState(prev => ({
                ...prev,
                iceCandidates: [...(prev?.iceCandidates || []), data.candidate]
            }));
        };

        socket.on('webrtc:ice-candidate', handleWebRTCIceCandidate);

        return () => {
            socket.off('user:online', handleUserOnline);
            socket.off('active-users:update', handleActiveUsersUpdate);
            socket.off('incoming-requests:update', handleIncomingRequestsUpdate);
            socket.off('outgoing-requests:update', handleOutgoingRequestsUpdate);
            socket.off('user:offline', handleUserOffline);
            socket.off('call:incoming', handleCallIncoming);
            socket.off('call:reject', handleCallReject);
            socket.off('call:accept', handleCallAccept);
            socket.off('call:end', handleCallEnd);
            socket.off('webrtc:offer', handleWebRTCOffer);
            socket.off('webrtc:answer', handleWebRTCAnswer);
            socket.off('webrtc:ice-candidate', handleWebRTCIceCandidate);
        };
    }, []);

    const sendCallRequest = (targetUserId) => {
        const socket = getSocket();
        const targetUser = activeUsers.find(u => u.userId === targetUserId);
        socket.emit('call:request', {
            targetUserId,
            targetDisplayName: targetUser?.displayName || 'Unknown'
        });
        setOutgoingRequests(prev => [...prev, targetUser || { userId: targetUserId, displayName: 'Unknown' }]);
        console.log('📞 Call request sent to', targetUser?.displayName);
    };

    const acceptCall = (callerId) => {
        const socket = getSocket();
        socket.emit('call:accept', { callerId });
    };

    const rejectCall = (callerId) => {
        const socket = getSocket();
        socket.emit('call:reject', { callerId });
        setIncomingRequests(prev => prev.filter(r => r.userId !== callerId));
    };

    const endCall = () => {
        const socket = getSocket();
        socket.emit('call:end', { callId: callState?.callId });
    };

    const sendOffer = (offer) => {
        const socket = getSocket();
        socket.emit('webrtc:offer', {
            callId: callState?.callId,
            offer
        });
    };

    const sendAnswer = (answer) => {
        const socket = getSocket();
        socket.emit('webrtc:answer', {
            callId: callState?.callId,
            answer
        });
    };

    const sendIceCandidate = (candidate) => {
        const socket = getSocket();
        socket.emit('webrtc:ice-candidate', {
            callId: callState?.callId,
            candidate
        });
    };

    const toggleUserActive = (active) => {
        const socket = getSocket();
        setIsUserActive(active);
        socket.emit('user:set-active', active);
        console.log(`🔴 User toggled active: ${active}`);
    };

    return {
        activeUsers,
        incomingRequests,
        outgoingRequests,
        callState,
        isUserActive,
        error,
        sendCallRequest,
        acceptCall,
        rejectCall,
        endCall,
        sendOffer,
        sendAnswer,
        sendIceCandidate,
        toggleUserActive
    };
};

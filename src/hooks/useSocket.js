import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';

export const useSocket = () => {
    const [activeUsers, setActiveUsers] = useState([]);
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [callState, setCallState] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        // When user:online is received from server, request the initial data
        socket.on('user:online', () => {
            console.log('📨 Received user:online from server, requesting initial data...');
            
            // Request active users
            socket.emit('get-active-users', (users) => {
                if (users && Array.isArray(users)) {
                    const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                    setActiveUsers(filtered);
                    console.log('✅ Received initial active users list from server:', filtered);
                }
            });

            // Request incoming requests
            socket.emit('get-incoming-requests', (requests) => {
                if (requests && Array.isArray(requests)) {
                    setIncomingRequests(requests);
                    console.log('✅ Received incoming requests:', requests);
                }
            });

            // Request outgoing requests
            socket.emit('get-outgoing-requests', (requests) => {
                if (requests && Array.isArray(requests)) {
                    setOutgoingRequests(requests);
                    console.log('✅ Received outgoing requests:', requests);
                }
            });
        });

        // Listen for real-time active users updates
        socket.on('active-users:update', (users) => {
            if (users && Array.isArray(users)) {
                const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                setActiveUsers(filtered);
                console.log('📡 Real-time active users update received:', filtered);
            }
        });

        // Listen for incoming requests updates
        socket.on('incoming-requests:update', (requests) => {
            if (Array.isArray(requests)) {
                setIncomingRequests(requests);
                console.log('📡 Incoming requests updated:', requests);
            }
        });

        // Listen for outgoing requests updates
        socket.on('outgoing-requests:update', (requests) => {
            if (Array.isArray(requests)) {
                setOutgoingRequests(requests);
                console.log('📡 Outgoing requests updated:', requests);
            }
        });

        socket.on('user:offline', (userId) => {
            setActiveUsers(prev => prev.filter(u => u.userId !== userId));
            setOutgoingRequests(prev => prev.filter(u => u.userId !== userId));
        });

        // Call Request Events
        socket.on('call:incoming', (data) => {
            if (data && data.caller) {
                setIncomingRequests(prev => [...prev, data.caller]);
                console.log('📲 Incoming call:', data.caller);
            }
        });

        socket.on('call:reject', (data) => {
            setOutgoingRequests(prev => prev.filter(u => u.userId !== data.calleeId));
            console.log('📞 Call rejected');
        });

        socket.on('call:accept', (data) => {
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
        });

        socket.on('call:end', () => {
            setCallState(null);
            setIncomingRequests([]);
            setOutgoingRequests([]);
            console.log('📵 Call ended');
            
            // Refresh active users after call ends
            socket.emit('get-active-users', (users) => {
                if (users && Array.isArray(users)) {
                    const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                    setActiveUsers(filtered);
                    console.log('✅ Active users refreshed after call:', filtered);
                }
            });
        });

        // WebRTC Signaling
        socket.on('webrtc:offer', (data) => {
            setCallState(prev => ({
                ...prev,
                offer: data.offer
            }));
            console.log('📨 Received WebRTC offer');
        });

        socket.on('webrtc:answer', (data) => {
            setCallState(prev => ({
                ...prev,
                answer: data.answer
            }));
            console.log('📨 Received WebRTC answer');
        });

        socket.on('webrtc:ice-candidate', (data) => {
            setCallState(prev => ({
                ...prev,
                iceCandidates: [...(prev?.iceCandidates || []), data.candidate]
            }));
        });

        return () => {
            socket.off('active-users:update');
            socket.off('incoming-requests:update');
            socket.off('outgoing-requests:update');
            socket.off('user:online');
            socket.off('user:offline');
            socket.off('call:incoming');
            socket.off('call:reject');
            socket.off('call:accept');
            socket.off('call:end');
            socket.off('webrtc:offer');
            socket.off('webrtc:answer');
            socket.off('webrtc:ice-candidate');
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

    return {
        activeUsers,
        incomingRequests,
        outgoingRequests,
        callState,
        error,
        sendCallRequest,
        acceptCall,
        rejectCall,
        endCall,
        sendOffer,
        sendAnswer,
        sendIceCandidate
    };
};

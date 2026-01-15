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

        // When user:online is received from server, request the initial active users list
        socket.on('user:online', () => {
            console.log('📨 Received user:online from server, requesting active users list...');
            socket.emit('get-active-users', (users) => {
                if (users && Array.isArray(users)) {
                    const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                    setActiveUsers(filtered);
                    console.log('✅ Received initial active users list from server:', filtered);
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

        socket.on('user:offline', (userId) => {
            setActiveUsers(prev => prev.filter(u => u.userId !== userId));
            setOutgoingRequests(prev => prev.filter(u => u.userId !== userId));
        });

        // Call Request Events
        socket.on('call:incoming', (data) => {
            setIncomingRequests(prev => [...prev, data.caller]);
        });

        socket.on('call:reject', (data) => {
            setOutgoingRequests(prev => prev.filter(u => u.userId !== data.calleeId));
        });

        socket.on('call:accept', (data) => {
            setCallState({
                callId: data.callId,
                calleeId: data.calleeId,
                callerId: data.callerId,
                initiator: false,
                status: 'accepted'
            });
            setIncomingRequests([]);
            setOutgoingRequests([]);
        });

        socket.on('call:end', () => {
            setCallState(null);
            setIncomingRequests([]);
            setOutgoingRequests([]);
        });

        // WebRTC Signaling
        socket.on('webrtc:offer', (data) => {
            setCallState(prev => ({
                ...prev,
                offer: data.offer
            }));
        });

        socket.on('webrtc:answer', (data) => {
            setCallState(prev => ({
                ...prev,
                answer: data.answer
            }));
        });

        socket.on('webrtc:ice-candidate', (data) => {
            setCallState(prev => ({
                ...prev,
                iceCandidates: [...(prev?.iceCandidates || []), data.candidate]
            }));
        });

        return () => {
            socket.off('active-users:update');
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
        socket.emit('call:request', { targetUserId });
        setOutgoingRequests(prev => [...prev, { userId: targetUserId }]);
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

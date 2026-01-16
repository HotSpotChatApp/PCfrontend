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
            console.log('📞 Call rejected by:', data.calleeId);
            setOutgoingRequests(prev => prev.filter(u => u.userId !== data.calleeId));
            
            // Refresh active users to ensure both are still available
            setTimeout(() => {
                socket.emit('get-active-users', (users) => {
                    if (users && Array.isArray(users)) {
                        const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                        setActiveUsers(filtered);
                        console.log('✅ Active users refreshed after reject');
                    }
                });
            }, 100);
        };

        socket.on('call:reject', handleCallReject);

        const handleCallAccept = (data) => {
            console.log('📞 Call accepted, setting up WebRTC');
            console.log('   Call ID:', data.callId);
            console.log('   Caller ID:', data.callerId);
            console.log('   Callee ID:', data.calleeId);
            console.log('   Initiator:', data.initiator);
            
            setCallState({
                callId: data.callId,
                calleeId: data.calleeId || data.callerId,
                callerId: data.callerId || data.calleeId,
                initiator: data.initiator || false,
                status: 'accepted',
                startTime: Date.now()
            });
            
            // Clear requests when call is accepted
            setIncomingRequests([]);
            setOutgoingRequests([]);
            
            console.log('✅ Call accepted, WebRTC setup will begin');
        };

        socket.on('call:accept', handleCallAccept);

        const handleCallEnd = () => {
            console.log('📵 Call ended from server');
            console.log('   Clearing callState');
            setCallState(null);
            
            console.log('   Clearing requests');
            setIncomingRequests([]);
            setOutgoingRequests([]);

            // Always request fresh active users after call ends
            setTimeout(() => {
                console.log('🔄 Requesting active users after call end...');
                socket.emit('get-active-users', (users) => {
                    if (users && Array.isArray(users)) {
                        const filtered = users.filter(u => u && u.userId !== socket.auth?.userId);
                        console.log('✅ Active users refreshed after call:', filtered.length, 'users');
                        setActiveUsers(filtered);
                        filtered.forEach(u => console.log(`  - ${u.displayName} (${u.userId})`));
                    }
                });
            }, 150); // Slightly longer delay to ensure cleanup is done
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
        if (!socket) {
            console.error('❌ Socket not available for call request');
            return;
        }
        
        const targetUser = activeUsers.find(u => u.userId === targetUserId);
        console.log('📞 Sending call request to:', targetUser?.displayName || targetUserId);
        
        socket.emit('call:request', {
            targetUserId,
            targetDisplayName: targetUser?.displayName || 'Unknown'
        });
        
        // Add to outgoing requests
        if (targetUser) {
            setOutgoingRequests(prev => {
                // Avoid duplicates
                if (prev.some(r => r.userId === targetUserId)) {
                    return prev;
                }
                return [...prev, targetUser];
            });
        }
        
        console.log('✅ Call request sent to', targetUser?.displayName);
    };

    const acceptCall = (callerId) => {
        const socket = getSocket();
        if (!socket) {
            console.error('❌ Socket not available for accept');
            return;
        }
        
        console.log('✅ Accepting call from:', callerId);
        socket.emit('call:accept', { callerId });
    };

    const rejectCall = (callerId) => {
        const socket = getSocket();
        if (!socket) {
            console.error('❌ Socket not available for reject');
            return;
        }
        
        console.log('📵 Rejecting call from:', callerId);
        socket.emit('call:reject', { callerId });
        
        // Remove from incoming requests
        setIncomingRequests(prev => {
            const updated = prev.filter(r => r.userId !== callerId);
            console.log('✅ Call rejected, remaining incoming requests:', updated.length);
            return updated;
        });
    };

    const endCall = () => {
        const socket = getSocket();
        if (!socket) {
            console.error('❌ Socket not available for end call');
            return;
        }

        if (!callState?.callId) {
            console.warn('⚠️ No active call to end');
            return;
        }

        console.log('📞 Ending call:', callState.callId);
        console.log('   Duration: ~', Math.floor((Date.now() - (callState?.startTime || Date.now())) / 1000), 'seconds');
        
        socket.emit('call:end', { callId: callState.callId }, (error) => {
            if (error) {
                console.error('❌ Error ending call:', error);
                setError(error);
            } else {
                console.log('✅ Call end signal sent to server');
            }
        });
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

        // If toggling to offline and there's an active call, end it
        if (!active && callState) {
            console.log('📵 User went offline, ending active call');
            endCall();
            setCallState(null);
            setIncomingRequests([]);
            setOutgoingRequests([]);
        }
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

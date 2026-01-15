import { useEffect, useState } from 'react';
import VideoPanel from '../components/VideoPanel';
import ActiveUsers from '../components/ActiveUsers';
import IncomingRequests from '../components/IncomingRequests';
import OutgoingRequests from '../components/OutgoingRequests';
import CallControls from '../components/CallControls';
import ActiveToggle from '../components/ActiveToggle';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { getSocket } from '../services/socket';

export default function Dashboard({ user, onLogout }) {
    const {
        activeUsers,
        incomingRequests,
        outgoingRequests,
        callState,
        isUserActive,
        sendCallRequest,
        acceptCall,
        rejectCall,
        endCall: socketEndCall,
        sendOffer,
        sendAnswer,
        sendIceCandidate,
        toggleUserActive
    } = useSocket();

    const {
        localStream,
        remoteStream,
        isCallActive,
        connectionError,
        localVideoRef,
        remoteVideoRef,
        cleanup: cleanupWebRTC,
        addIceCandidate
    } = useWebRTC(
        callState,
        sendOffer,
        sendAnswer,
        sendIceCandidate
    );

    const [isUpdating, setIsUpdating] = useState(false);

    // Handle browser close and page unload - end call and go offline
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isUserActive || callState) {
                // End call
                if (callState) {
                    socketEndCall();
                    cleanupWebRTC();
                }
                // Go offline
                if (isUserActive) {
                    toggleUserActive(false);
                }

                // Show confirmation dialog
                e.preventDefault();
                e.returnValue = '';
            }
        };

        const handleUnload = () => {
            if (callState) {
                socketEndCall();
                cleanupWebRTC();
            }
            if (isUserActive) {
                toggleUserActive(false);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('unload', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('unload', handleUnload);
        };
    }, [callState, isUserActive, isCallActive]);

    // Monitor connection errors
    useEffect(() => {
        if (connectionError) {
            console.error('🚨 Connection error detected:', connectionError);
            // Could show error toast/notification here
        }
    }, [connectionError]);

    const handleCallRequest = (targetUser) => {
        setIsUpdating(true);
        sendCallRequest(targetUser.userId);
        setTimeout(() => setIsUpdating(false), 500);
    };

    const handleAcceptCall = (callerId) => {
        setIsUpdating(true);
        acceptCall(callerId);
        setTimeout(() => setIsUpdating(false), 500);
    };

    const handleRejectCall = (callerId) => {
        setIsUpdating(true);
        rejectCall(callerId);
        setTimeout(() => setIsUpdating(false), 500);
    };

    const handleEndCall = () => {
        try {
            socketEndCall();
            cleanupWebRTC();
        } catch (error) {
            console.error('Error ending call:', error);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white">PeerConnect</h1>
                        <p className="text-gray-400">Welcome, {user?.displayName || user?.email}</p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                    >
                        Logout
                    </button>
                </div>

                {/* Error Display */}
                {connectionError && (
                    <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg">
                        <p className="text-red-200">Connection Error: {connectionError}</p>
                    </div>
                )}

                {/* Active Status Toggle */}
                <ActiveToggle
                    isActive={isUserActive}
                    onToggle={toggleUserActive}
                    userDisplayName={user?.displayName || user?.email}
                />
                {/* Video Panel */}
                <VideoPanel
                    localVideoRef={localVideoRef}
                    remoteVideoRef={remoteVideoRef}
                    remoteStream={remoteStream}
                    callState={callState}
                />

                {/* User Tables */}
                <div className="flex gap-4 mb-6">
                    <ActiveUsers
                        users={activeUsers}
                        onCall={handleCallRequest}
                        disabled={isCallActive}
                        currentUserId={user?.userId}
                    />
                    <IncomingRequests
                        requests={incomingRequests}
                        onAccept={handleAcceptCall}
                        onReject={handleRejectCall}
                    />
                    <OutgoingRequests
                        requests={outgoingRequests}
                        onCancel={() => { }} // Can implement cancel logic
                    />
                </div>

                {/* Call Controls */}
                <CallControls
                    isCallActive={isCallActive}
                    onEndCall={handleEndCall}
                />
            </div>
        </div>
    );
}

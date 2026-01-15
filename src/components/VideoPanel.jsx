export default function VideoPanel({ localVideoRef, remoteVideoRef, remoteStream, callState }) {
    return (
        <div className="grid grid-cols-2 gap-4 mb-6 h-96">
            {/* Local Video */}
            <div className="relative rounded-lg overflow-hidden bg-slate-800 border border-slate-700">
                <video
                    ref={localVideoRef}
                    autoPlay
                    muted={true}
                    playsInline
                    className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 text-xs bg-black bg-opacity-50 px-2 py-1 rounded text-white">
                    You (Local)
                </div>
            </div>

            {/* Remote Video */}
            <div className="relative rounded-lg overflow-hidden bg-slate-800 border border-slate-700">
                <video
                    ref={remoteVideoRef}
                    autoPlay={true}
                    muted={false}
                    playsInline
                    className="w-full h-full object-cover"
                />
                {!remoteStream && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 bg-opacity-70">
                        <div className="text-center">
                            <p className="text-gray-400">
                                {callState ? 'Waiting for remote stream...' : 'No active call'}
                            </p>
                        </div>
                    </div>
                )}
                <div className="absolute bottom-2 left-2 text-xs bg-black bg-opacity-50 px-2 py-1 rounded text-white">
                    {callState?.calleeName || 'Remote User'}
                </div>
            </div>
        </div>
    );
}

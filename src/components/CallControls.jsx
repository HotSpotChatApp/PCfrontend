export default function CallControls({ isCallActive, onEndCall }) {
    if (!isCallActive) return null;

    return (
        <div className="mt-6 flex justify-center">
            <button
                onClick={onEndCall}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition text-white"
            >
                End Call
            </button>
        </div>
    );
}

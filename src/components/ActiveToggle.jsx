export default function ActiveToggle({ isActive, onToggle, userDisplayName }) {
    return (
        <div className="bg-slate-800 rounded-lg p-4 mb-6 border border-slate-700">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-white font-semibold">Your Status</p>
                    <p className="text-gray-300 text-sm">
                        {userDisplayName}
                        {isActive ? ' • Online & Active' : ' • Offline to Others'}
                    </p>
                </div>
                <button
                    onClick={() => onToggle(!isActive)}
                    className={`px-6 py-2 rounded-lg font-semibold transition-all ${isActive
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-gray-600 hover:bg-gray-700 text-white'
                        }`}
                >
                    {isActive ? '🟢 Go Offline' : '⚪ Go Active'}
                </button>
            </div>
            <div className="mt-3 text-xs text-gray-400">
                {isActive
                    ? '✅ You are visible in other users\' Active Users list. You can receive call requests.'
                    : '❌ You are hidden. Others cannot see you or send you call requests.'}
            </div>
        </div>
    );
}

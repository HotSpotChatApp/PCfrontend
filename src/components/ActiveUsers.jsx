export default function ActiveUsers({ users, onCall, disabled, currentUserId }) {
    return (
        <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold mb-3 text-white">Active Users ({users.filter(u => u.userId !== currentUserId).length})</h3>
            <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm">
                    <thead className="bg-slate-700 sticky top-0">
                        <tr>
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-center px-3 py-2">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.filter(u => u.userId !== currentUserId).length === 0 ? (
                            <tr>
                                <td colSpan="3" className="text-center py-4 text-gray-400">
                                    No other users online
                                </td>
                            </tr>
                        ) : (
                            users.map(user => {
                                // Skip self
                                if (!user || !user.userId || user.userId === currentUserId) return null;
                                
                                return (
                                    <tr key={user.userId} className="border-t border-slate-700 hover:bg-slate-800 transition">
                                        <td className="px-3 py-2 font-medium text-white">{user.displayName || 'Unknown'}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${(user.status || 'idle') === 'idle'
                                                    ? 'bg-green-900 text-green-200'
                                                    : 'bg-yellow-900 text-yellow-200'
                                                }`}>
                                                {user.status || 'idle'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                onClick={() => onCall(user)}
                                                disabled={disabled || (user.status || 'idle') !== 'idle'}
                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-xs font-medium transition"
                                            >
                                                Call
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

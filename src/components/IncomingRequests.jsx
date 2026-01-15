export default function IncomingRequests({ requests, onAccept, onReject }) {
    return (
        <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold mb-3 text-white">Incoming Requests</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-700 sticky top-0">
                        <tr>
                            <th className="text-left px-3 py-2">From</th>
                            <th className="text-center px-3 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.length === 0 ? (
                            <tr>
                                <td colSpan="2" className="text-center py-4 text-gray-400">
                                    No incoming requests
                                </td>
                            </tr>
                        ) : (
                            requests.map(request => {
                                if (!request || !request.userId) return null;
                                return (
                                <tr key={request.userId} className="border-t border-slate-700 hover:bg-slate-800">
                                    <td className="px-3 py-2">{request.displayName || 'Unknown'}</td>
                                    <td className="px-3 py-2 flex justify-center gap-2">
                                        <button
                                            onClick={() => onAccept(request.userId)}
                                            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-medium transition"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => onReject(request.userId)}
                                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition"
                                        >
                                            Reject
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

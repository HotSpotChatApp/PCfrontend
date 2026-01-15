export default function OutgoingRequests({ requests, onCancel }) {
    return (
        <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold mb-3 text-white">Outgoing Requests</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-700 sticky top-0">
                        <tr>
                            <th className="text-left px-3 py-2">To</th>
                            <th className="text-center px-3 py-2">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.length === 0 ? (
                            <tr>
                                <td colSpan="2" className="text-center py-4 text-gray-400">
                                    No outgoing requests
                                </td>
                            </tr>
                        ) : (
                            requests.map(request => {
                                if (!request || !request.userId) return null;
                                return (
                                    <tr key={request.userId} className="border-t border-slate-700 hover:bg-slate-800">
                                        <td className="px-3 py-2">{request.displayName || 'Unknown'}</td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                onClick={() => onCancel(request.userId)}
                                                className="px-3 py-1 bg-orange-600 hover:bg-orange-700 rounded text-xs font-medium transition"
                                            >
                                                Cancel
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

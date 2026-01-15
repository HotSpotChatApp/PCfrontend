import { useState, useEffect } from 'react';
import { auth } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { initSocket, closeSocket, getSocket } from './services/socket';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './index.css';

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [socketConnected, setSocketConnected] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                console.log('🔐 User authenticated:', currentUser.email);
                const token = await currentUser.getIdToken();
                console.log('🔑 Got ID token, initializing socket...');

                // Initialize socket with token
                const socket = initSocket(token);

                // Wait for socket to connect
                if (socket) {
                    socket.on('connect', () => {
                        console.log('✅ Socket connected:', socket.id);
                        setSocketConnected(true);
                    });

                    socket.on('disconnect', () => {
                        console.log('❌ Socket disconnected');
                        setSocketConnected(false);
                    });

                    socket.on('connect_error', (error) => {
                        console.error('⚠️ Socket connection error:', error.message);
                    });
                }

                setUser(currentUser);
            } else {
                console.log('👤 User logged out');
                closeSocket();
                setSocketConnected(false);
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            closeSocket();
            console.log('✅ Logged out successfully');
        } catch (err) {
            console.error('❌ Logout error:', err);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    return user ? (
        <>
            {!socketConnected && (
                <div className="fixed top-0 left-0 right-0 bg-red-600 text-white p-2 text-center text-sm">
                    ⚠️ Socket not connected. Reconnecting...
                </div>
            )}
            <Dashboard user={user} onLogout={handleLogout} />
        </>
    ) : (
        <Login onLoginSuccess={(token, user) => setUser(user)} />
    );
}

export default App;

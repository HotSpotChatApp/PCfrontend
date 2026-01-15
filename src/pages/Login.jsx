import { useState } from 'react';
import { auth } from '../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

export default function Login({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Validate inputs
            if (!email || !password) {
                setError('Please fill in all fields');
                setLoading(false);
                return;
            }

            if (isSignUp && password.length < 6) {
                setError('Password must be at least 6 characters');
                setLoading(false);
                return;
            }

            let userCredential;
            if (isSignUp) {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                if (displayName) {
                    await updateProfile(userCredential.user, { displayName });
                }
            } else {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            }

            const token = await userCredential.user.getIdToken();
            console.log('✅ Authentication successful for:', userCredential.user.email);
            onLoginSuccess(token, userCredential.user);
        } catch (err) {
            console.error('❌ Auth Error:', err.code, err.message);

            // Better error messages
            let errorMsg = err.message;
            if (err.code === 'auth/user-not-found') {
                errorMsg = 'User not found. Please sign up first.';
            } else if (err.code === 'auth/wrong-password') {
                errorMsg = 'Incorrect password. Please try again.';
            } else if (err.code === 'auth/email-already-in-use') {
                errorMsg = 'Email already registered. Please sign in.';
            } else if (err.code === 'auth/weak-password') {
                errorMsg = 'Password is too weak. Use at least 6 characters.';
            } else if (err.code === 'auth/invalid-email') {
                errorMsg = 'Invalid email address.';
            } else if (err.code === 'auth/operation-not-allowed') {
                errorMsg = 'Email/password auth is not enabled in Firebase Console.';
            }

            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
                    <h1 className="text-3xl font-bold text-white mb-2 text-center">PeerConnect</h1>
                    <p className="text-gray-400 text-center mb-6">Real-Time Video Calling</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isSignUp && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition"
                                    placeholder="Enter your name"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white font-semibold rounded-lg transition"
                        >
                            {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
                        </button>
                    </form>

                    <button
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="w-full mt-4 py-2 text-gray-300 hover:text-white transition"
                    >
                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
}

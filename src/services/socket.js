import io from 'socket.io-client';

let socket = null;

export const initSocket = (token) => {
    const backendUrl = import.meta.env.VITE_BACKEND_SOCKET_URL || 'http://localhost:5000';
    console.log('🔗 Connecting to Socket.IO server:', backendUrl);
    console.log('🔑 Auth token present:', !!token);

    socket = io(backendUrl, {
        auth: {
            token
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling'],
        secure: true,
        rejectUnauthorized: false,
        forceNew: true,
        upgrade: true,
    });

    socket.on('connect', () => {
        console.log('✅ Socket connected successfully:', socket.id);
        console.log('📡 Active transport:', socket.io.engine.transport.name);
    });

    socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        console.error('❌ Error details:', {
            message: error.message,
            type: error.type,
            data: error.data,
            status: error.status
        });
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error event:', error);
    });

    socket.on('disconnect', (reason) => {
        console.warn('⚠️ Socket disconnected:', reason);
        console.log('💡 Disconnect reason details:', {
            reason,
            connected: socket.connected,
            disconnected: socket.disconnected
        });
    });

    socket.io.engine.on('upgrade_error', (error) => {
        console.error('⚠️ Transport upgrade error:', error);
    });

    return socket;
};

export const getSocket = () => {
    if (!socket) {
        console.warn('⚠️ Socket not initialized');
    }
    return socket;
};

export const closeSocket = () => {
    if (socket) {
        console.log('🔌 Closing socket connection');
        socket.disconnect();
        socket = null;
    }
};

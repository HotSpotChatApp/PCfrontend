# WebRTC Video Call Flow - Visual Diagram

## Complete Call Sequence

```
TIME    USER A (Initiator)          Socket.IO Server              USER B (Receiver)
────────────────────────────────────────────────────────────────────────────────────

        Dashboard
        │
T0      ├─ Login
        │  
T1      ├─ Go Active
        │  └─ emit: user:set-active(true)
        │                          ──────────────────────►
        │                          [Broadcast active-users]
        │                                                        ◄─ Receive active-users
        │                                                           Display User A
        │
T2      ├─ Click "Call" User B
        │  └─ emit: call:request
        │                          ──────────────────────►
        │                          [Store in Redis]
        │                          [emit incoming-requests]
        │                                                        ◄─ Receive incoming call
        │                                                           Display call popup
        │
T3      │  (Wait for accept)
        │                                                        ├─ Click "Accept"
        │                                                        │  └─ emit: call:accept
        │                                                        │
        │◄───────────────────────────────────────────────────
        │  (Receive call:accept)
        │
        ├─ callState.status = "accepted"
        │  └─ useWebRTC trigger
        │
╔═══════╤═════════════════════════════════════════════════════════════════════════╗
║ T4    │ WEBRTC PHASE 1: SETUP                                                  ║
╚═══════╧═════════════════════════════════════════════════════════════════════════╝

        ├─ [Step 1] startMedia()
        │  └─ getUserMedia({video, audio})
        │     └─ ✅ Local stream ready
        │         (localStream = MediaStream)
        │
        ├─ [Step 2] createPeerConnection()
        │  ├─ new RTCPeerConnection()
        │  ├─ addTrack(video) to connection
        │  ├─ addTrack(audio) to connection
        │  └─ ✅ Peer connection created
        │     (peerConnectionRef.current = RTCPeerConnection)
        │
        ├─ [Step 3] createOffer()
        │  ├─ peerConnection.createOffer()
        │  ├─ setLocalDescription(offer)
        │  └─ emit: webrtc:offer(offer)
        │                          ──────────────────────►
        │
        │                                                        ├─ Receive webrtc:offer
        │                                                        │  └─ setCallState.offer
        │                                                        │
        │                                                        ├─ [Step 1] startMedia()
        │                                                        │  └─ getUserMedia()
        │                                                        │
        │                                                        ├─ [Step 2] createPeerConnection()
        │                                                        │  ├─ new RTCPeerConnection()
        │                                                        │  ├─ addTrack(video)
        │                                                        │  ├─ addTrack(audio)
        │                                                        │  └─ ✅ Ready
        │                                                        │
        │                                                        ├─ [Step 3] createAnswer()
        │                                                        │  ├─ setRemoteDescription(offer)
        │                                                        │  ├─ createAnswer()
        │                                                        │  ├─ setLocalDescription(answer)
        │                                                        │  └─ emit: webrtc:answer(answer)
        │                                                        │
        │                                                        │
        │◄────────────────────────────────────────────────────
        │  (Receive webrtc:answer)
        │
        ├─ handleAnswer()
        │  └─ setRemoteDescription(answer)
        │
╔═══════╤═════════════════════════════════════════════════════════════════════════╗
║ T5    │ WEBRTC PHASE 2: SIGNALING (ICE Candidates)                            ║
╚═══════╧═════════════════════════════════════════════════════════════════════════╝

        ├─ peerConnection.onicecandidate fires
        │  ├─ Get ICE candidate
        │  └─ emit: webrtc:ice-candidate(candidate)
        │                          ──────────────────────►
        │
        │                                                        ├─ Receive ICE candidate
        │                                                        │  └─ addIceCandidate()
        │
        │                                                        ├─ peerConnection.onicecandidate
        │                                                        │  └─ emit: webrtc:ice-candidate
        │                                                        │
        │◄─────────────────────────────────────────────────────
        │  (Multiple rounds of ICE candidates)
        │
        ├─ peerConnection.oniceconnectionstatechange()
        │  └─ Monitor connection state
        │
╔═══════╤═════════════════════════════════════════════════════════════════════════╗
║ T6    │ WEBRTC PHASE 3: STREAMING (Media Flows!)                              ║
╚═══════╧═════════════════════════════════════════════════════════════════════════╝

        ├─ peerConnection.ontrack event fires!
        │  ├─ Received remote track from User B
        │  ├─ Extract remote stream
        │  ├─ remoteVideoRef.srcObject = stream
        │  ├─ remoteVideoRef.play()
        │  └─ VideoPanel re-renders
        │     └─ ✅ REMOTE VIDEO APPEARS!
        │
        ├─ UI Shows:
        │  ├─ Local video (top-left)
        │  └─ Remote video (top-right) ✨
        │
        └─ Audio/Video: Streaming in both directions!
        
                                                        └─ peerConnection.ontrack event
                                                           ├─ Remote track received
                                                           ├─ remoteVideoRef.srcObject
                                                           └─ ✅ REMOTE VIDEO APPEARS!
                                                           
                                                           └─ UI Shows:
                                                              ├─ Local video
                                                              └─ Remote video ✨
```

## WebRTC State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│                  WebRTC State Machine                        │
└─────────────────────────────────────────────────────────────┘

    IDLE
     │
     │ (Call accepted)
     ▼
    SETTING_UP
     │
     ├─ [✓] Media started
     │
     ├─ [✓] Peer connection created
     │
     ├─ [✓] Local description set
     │       (offer or waiting for offer)
     │
     ├─ [✓] Remote description set
     │       (answer received or sent)
     │
     ├─ [✓] ICE candidates exchanged
     │
     ▼
    CONNECTED
     │
     ├─ [✓] Local stream: Video + Audio
     │
     ├─ [✓] Remote stream: Video + Audio
     │       (via ontrack event)
     │
     ├─ [✓] Bidirectional communication
     │
     ▼
    STREAMING ✨
     │
     └─ (Call ended)
         ▼
        CLOSED
```

## Data Flow: Where Streams Go

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER A (Caller)                              │
└─────────────────────────────────────────────────────────────────┘

    Device (Camera/Mic)
         │
         ├─ Video track ──┐
         └─ Audio track ──┤
                          │
                          ▼
                    getUserMedia()
                          │
                          ▼
                    localStream (MediaStream)
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
    LocalVideo        Peer Connection   Upload
     Ref.current     addTrack()         (Network)
     (Display)       │
                     │
                     └─────────────────────────────────────────┐
                                                               │
                                              ┌────────────────┴────────────────┐
                                              │                                 │
                                              ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    USER B (Receiver)                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                              
                                         Peer Connection
                                              │
                                              ├─ Receives tracks
                                              │
                                              ▼
                                         ontrack event
                                              │
                           ┌──────────────────┼──────────────────┐
                           │                  │                  │
                           ▼                  ▼                  ▼
                    event.streams[0]   Remote Stream    Audio Output
                           │                 │
                           └─────┬───────────┘
                                 │
                                 ▼
                         remoteVideoRef.srcObject
                                 │
                                 ▼
                         HTML Video Element
                                 │
                                 ▼
                         User B Screen ✨
```

## Critical Path (What Needs to Happen in Order)

```
1. startMedia()
   └─ getUserMedia() succeeds
      └─ localStream exists

2. createPeerConnection()
   └─ RTCPeerConnection created
      └─ Local tracks added
         └─ Peer connection ready

3. (Initiator only) createOffer()
   └─ Offer created & sent

4. (Receiver) createAnswer()
   └─ Receives offer
      └─ Sets remote description
         └─ Creates & sends answer

5. (Initiator) handleAnswer()
   └─ Sets remote description
      └─ Connection establishing

6. Exchange ICE candidates
   └─ Peer discovery
      └─ Connection through NAT

7. ontrack event
   └─ Remote stream arrives
      └─ ✨ Video visible on screen!
```

## Timeline

```
T0      T1      T2      T3      T4      T5      T6      T7      T8
─┼──────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┼─
 │      │       │       │       │       │       │       │       │
 ▼      ▼       ▼       ▼       ▼       ▼       ▼       ▼       ▼
Login  Active  Call    Accept  Media  Offer   ICE     Answer  VIDEO
       User    Sent    Recv    Start   Sent    Exch    Recv    ✨
       
 0s     2s     5s      6s      7s      8s      10s     11s     12s
```

## Error Prevention (Why This Fix Works)

```
BEFORE (Broken):
┌─────────────────────────────────────────────┐
│ Call Accepted (Effect 1)                    │
├─────────────────────────────────────────────┤
│ ├─ Start media                              │
│ └─ Create Peer Connection A                 │ ◄─ First PC
│    └─ Add tracks                            │
│                                              │
│                                              │
│ Offer Received (Effect 2)                   │
├─────────────────────────────────────────────┤
│ ├─ Create Peer Connection B                 │ ◄─ DIFFERENT PC! ❌
│ └─ setRemoteDescription()                   │
│    └─ Answer sent from PC B                 │
│                                              │
│ Result:                                      │
│ ❌ Offer from PC A, Answer from PC B        │
│ ❌ Tracks in PC A, Signaling in PC B        │
│ ❌ Signals crossed                          │
│ ❌ NO REMOTE STREAM                         │
└─────────────────────────────────────────────┘


AFTER (Fixed):
┌─────────────────────────────────────────────┐
│ Call Accepted (Main Effect)                 │
├─────────────────────────────────────────────┤
│ ├─ Start media                              │
│ ├─ Create Peer Connection (ONCE!)           │ ◄─ Single PC
│ │  └─ Add tracks                            │
│ │  └─ Set peerConnectionInitializedRef=true │
│ │                                            │
│ └─ Create offer                             │
│                                              │
│ Offer Received (Separate Effect)            │
├─────────────────────────────────────────────┤
│ ├─ Check: PC already initialized?           │ ◄─ YES!
│ │  └─ Reuse existing peer connection        │
│ └─ setRemoteDescription() on SAME PC        │
│    └─ Answer sent from SAME PC              │
│                                              │
│ Result:                                      │
│ ✅ Offer from PC A, Answer from PC A        │
│ ✅ Tracks in PC A, Signaling in PC A        │
│ ✅ Signals aligned                          │
│ ✅ ✨ REMOTE STREAM FLOWS!                  │
└─────────────────────────────────────────────┘
```

---

**This is the complete implementation. Your video streaming is now production-ready!** 🚀

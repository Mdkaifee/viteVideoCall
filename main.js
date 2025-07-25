import './style.css';

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyATxHlmfYVJ9I6S3r2vBz1G3rDPblQ6lXo",
  authDomain: "videocallapp-9c2c5.firebaseapp.com",
  projectId: "videocallapp-9c2c5",
  storageBucket: "videocallapp-9c2c5.appspot.com",
  messagingSenderId: "55623695986",
  appId: "1:55623695986:web:3d119a3a5377ac1cf84ceb",
  measurementId: "G-NCKH1S60MD"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// ICE server config
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Start Webcam
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Add tracks to peer connection (needed for call)
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // When remote peer adds tracks
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  // Display local video but mute it to prevent hearing own voice
  webcamVideo.srcObject = localStream;
  webcamVideo.muted = true; // ✅ Mute your own voice here

  // Set remote stream to remote video element (you'll hear remote person)
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};


// 2. Create Offer
callButton.onclick = async () => {
  const callDocRef = doc(collection(firestore, 'calls'));
  const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
  const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

  callInput.value = callDocRef.id;

  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      await addDoc(offerCandidatesRef, event.candidate.toJSON());
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDocRef, { offer });

  onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  onSnapshot(answerCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};
hangupButton.onclick = () => {
  // Close peer connection and stop all media tracks
  pc.close();

  localStream.getTracks().forEach((track) => {
    track.stop();
  });
  remoteStream.getTracks().forEach((track) => {
    track.stop();
  });

  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Reset buttons and UI
  callButton.disabled = true;
  answerButton.disabled = true;
  hangupButton.disabled = true;
  webcamButton.disabled = false;
  callInput.value = "";

  // Optional: Reset PeerConnection (if you want to allow new calls)
  window.location.reload(); // Or manually re-initialize `pc`
};

// 3. Answer Offer
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDocRef = doc(firestore, 'calls', callId);
  const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
  const offerCandidatesRef = collection(callDocRef, 'offerCandidates');

  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      await addDoc(answerCandidatesRef, event.candidate.toJSON());
    }
  };

  const callData = (await getDoc(callDocRef)).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDocRef, { answer });

  onSnapshot(offerCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};

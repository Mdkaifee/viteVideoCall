import './style.css';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  addDoc
} from 'firebase/firestore';

// Firebase config
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
const db = getFirestore(app);

// ICE servers config
const servers = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  iceCandidatePoolSize: 10
};

let localStream = null;
let remoteStream = null;
let peerConnection = null;

const localAudio = document.getElementById('localAudio');
const remoteAudio = document.getElementById('remoteAudio');
const audioButton = document.getElementById('audioButton');
const callButton = document.getElementById('callButton');
const answerButton = document.getElementById('answerButton');
const hangupButton = document.getElementById('hangupButton');
const callInput = document.getElementById('callInput');

let callDoc;
let offerCandidatesCollection;
let answerCandidatesCollection;

// 🔊 Start Microphone
audioButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localAudio.srcObject = localStream;

    remoteStream = new MediaStream();
    remoteAudio.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    audioButton.disabled = true;

    console.log("🎙️ Microphone started.");
  } catch (err) {
    console.error("Microphone error:", err);
    alert("❌ Could not access microphone.");
  }
};

// 📞 Create Call
callButton.onclick = async () => {
  if (!localStream) {
    alert("Please start microphone first.");
    return;
  }

  peerConnection = new RTCPeerConnection(servers);
  setupPeerEvents();

  callDoc = doc(collection(db, 'calls'));
  offerCandidatesCollection = collection(callDoc, 'offerCandidates');
  answerCandidatesCollection = collection(callDoc, 'answerCandidates');

  callInput.value = callDoc.id;
  console.log("📨 Call ID:", callDoc.id);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  const offerDescription = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offerDescription);

  await setDoc(callDoc, { offer: offerDescription });

  onSnapshot(callDoc, snapshot => {
    const data = snapshot.data();
    if (data?.answer && !peerConnection.currentRemoteDescription) {
      const answerDescription = new RTCSessionDescription(data.answer);
      peerConnection.setRemoteDescription(answerDescription);
      console.log("📩 Received answer.");
    }
  });

  onSnapshot(answerCandidatesCollection, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
        console.log("➡️ Added remote ICE candidate (answerer)");
      }
    });
  });

  hangupButton.disabled = false;
  callButton.disabled = true;
};

// 📥 Answer Call
answerButton.onclick = async () => {
  if (!localStream) {
    alert("Please start microphone first.");
    return;
  }

  const callId = callInput.value.trim();
  if (!callId) {
    alert("Please enter a valid call ID.");
    return;
  }

  peerConnection = new RTCPeerConnection(servers);
  setupPeerEvents();

  callDoc = doc(db, "calls", callId);
  offerCandidatesCollection = collection(callDoc, 'offerCandidates');
  answerCandidatesCollection = collection(callDoc, 'answerCandidates');

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  const callData = (await getDoc(callDoc)).data();
  if (!callData?.offer) {
    alert("Invalid call offer.");
    return;
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
  console.log("📩 Received offer.");

  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  await updateDoc(callDoc, { answer: answerDescription });

  onSnapshot(offerCandidatesCollection, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const data = change.doc.data();
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
        console.log("➡️ Added remote ICE candidate (offerer)");
      }
    });
  });

  hangupButton.disabled = false;
  answerButton.disabled = true;
};

// 📴 Hang Up
hangupButton.onclick = () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  localStream?.getTracks().forEach(track => track.stop());
  remoteStream?.getTracks().forEach(track => track.stop());

  localAudio.srcObject = null;
  remoteAudio.srcObject = null;

  audioButton.disabled = false;
  callButton.disabled = true;
  answerButton.disabled = true;
  hangupButton.disabled = true;

  console.log("📴 Call ended.");
};

// 🔧 Setup Event Listeners
function setupPeerEvents() {
  peerConnection.onicecandidate = async event => {
    if (event.candidate) {
      const target = (callButton.disabled ? answerCandidatesCollection : offerCandidatesCollection);
      await addDoc(target, event.candidate.toJSON());
      console.log("📤 Sent ICE candidate.");
    }
  };

  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
    console.log("🎧 Receiving remote audio stream.");
  };
}

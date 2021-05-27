const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

const callerCandidatesString = 'callerCandidates';
const calleeCandidatesString = 'calleeCandidates';

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomId = null;

function init() {
  document.querySelector('#cameraBtn').addEventListener('click', openUserMedia);
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  document.querySelector('#joinBtn').addEventListener('click', joinRoom);
  document.querySelector('#next').addEventListener('click', nextRoom);
}

async function openUserMedia(e) {

  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#cameraBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = false;
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

async function createRoom() {
  console.log("je crééer une ROOM !!!!")
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });


  // Uncomment to collect ICE candidates below
  await collectIceCandidates(roomRef, peerConnection, callerCandidatesString, calleeCandidatesString);
  // Code for creating a room below

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer:', offer);
  const roomWithOffer = {
    'offer': {
      type: offer.type,
      sdp: offer.sdp
    }
  }
  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  document.querySelector('#currentRoom').innerHTML = `Votre room est la : ${roomId} - Vous êtes le <span id='call'>hoster</span> !`

  // Code for creating a room above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below

  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log('Got remote description: ', data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above
}

function joinRoom() {
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#next').disabled = false;

  console.log(document.querySelector('#roomId').innerHTML.trim().length)
  const db = firebase.firestore();
  let idList = [];

  // Request all doc ID
  db.collection("rooms").get().then((querySnapshot) => {
    querySnapshot.forEach((doc) => {
      idList.push(doc.id)
      //console.log(doc.id, " => ", doc.data());
    });
    // Select a random ID
    const idLenght = idList.length;
    min = Math.ceil(0);
    max = Math.floor(idLenght);
    const selectedNbr = Math.floor(Math.random() * (max - min)) + min;
    let roomId = idList[selectedNbr];

    if (document.querySelector('#roomId').innerHTML == roomId) {
        if (typeof idList[selectedNbr + 1] != "undefined") {
          roomId = idList[selectedNbr + 1];
        }
        else if (typeof idList[selectedNbr - 1] != "undefined") {
          roomId = idList[selectedNbr - 1];
        }
    }
    console.log('Join room: ', roomId);
    document.querySelector(
        '#currentRoom').innerHTML = "Votre room est la : <span id='roomId'>" + roomId + "</span> - Vous êtes <span id='call'>l'aventurier</span> !";
    joinRoomById(roomId);
  });
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });


    // Uncomment to collect ICE candidates below
    await collectIceCandidates(roomRef, peerConnection, calleeCandidatesString, callerCandidatesString);

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below

    const offer = roomSnapshot.data().offer;
    console.log('Got offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log('Created answer:', answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);

    // Code for creating SDP answer above
  }
}

async function collectIceCandidates(roomRef, peerConnection,
                                    localName, remoteName) {
  const candidatesCollection = roomRef.collection(localName);

  peerConnection.addEventListener('icecandidate', event => {
    if (event.candidate) {
      const json = event.candidate.toJSON();
      candidatesCollection.add(json);
    }
  });

  roomRef.collection(remoteName).onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  })
}

async function resetRoom() {
  remoteStream.getTracks().forEach(track => track.stop());
  peerConnection.close();
  document.querySelector('#remoteVideo').srcObject = null;

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection(calleeCandidatesString).get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection(callerCandidatesString).get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;
  createRoom();
}

async function nextRoom(e) {
  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }
  joinRoom();
}

async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#cameraBtn').disabled = false;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection(calleeCandidatesString).get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection(callerCandidatesString).get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

function createChat(peerConnection) {
  console.log("chat créé");
  const messageBox = document.querySelector('#messageBox');
  const sendButton = document.querySelector('#sendButton');
  const incomingMessages = document.querySelector('#incomingMessages');
  const dataChannel = peerConnection.createDataChannel('Chat');
  // Enable textarea and button when opened
  dataChannel.addEventListener('open', event => {
    console.log("Cest OPEN !!!!!")
  });
  // Send a simple text message when we click the button
  sendButton.addEventListener('click', event => {
    const message = messageBox.textContent;
    dataChannel.send(message);
  })

  // Append new messages to the box of incoming messages
  dataChannel.addEventListener('message', event => {
    const message = event.data;
    incomingMessages.textContent += message + '\n';
  })
  ;

}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
    if (peerConnection.connectionState === "connected") {
      //createChat(peerConnection);
    }
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(`ICE connection state change: ${peerConnection.iceConnectionState}`);
  });

  peerConnection.oniceconnectionstatechange = function(event) {
    if (peerConnection.iceConnectionState === "failed" ||
        peerConnection.iceConnectionState === "disconnected" ||
        peerConnection.iceConnectionState === "closed") {
      if (document.querySelector('#call').innerHTML == 'hoster') {
        peerConnection.restartIce();
        resetRoom();
      }
    }
  };
}

init();

//Setup Connection
const DEFAULT_ROBOT_PROFILE = "RPI_BW_001";
/**
 * ESP_CW_001
 * RPI_BW_001
 * RPI_CL_001
 * RPI_CL_002
 * RPI_CW_001
 * RPI_HA_001
 * RPI_HW_001
 * JTSN_HW_001
 */
const deviceNamePrefixMap = {
    ESP_CW_001: "CoPlay",
    RPI_BW_001: "BBC",
};

const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

const {
    pairButton,
    sendMediaServerInfoButton,
    openWebSocketButton,
    stopButton,
} = initializeDOMElements();
let {
    device,
    websocket,
    networkConfig,
    controlCommandMap,
    lastDirection,
} = initializeVariables();


//Setup model for prediction

const sess = new onnx.InferenceSession();
const loadingModelPromise = sess.loadModel("./tri_8_rework_50.onnx");

const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 640,
    height: 480
});


//Side function for connection
function initializeDOMElements() {
    const pairButton = document.getElementById("pairButton");
    const sendMediaServerInfoButton = document.getElementById(
        "sendMediaServerInfoButton"
    );
    const openWebSocketButton = document.getElementById("openWebSocketButton");
    const stopButton = document.getElementById("stopButton");
  
    return {
        pairButton,
        sendMediaServerInfoButton,
        openWebSocketButton,
        stopButton,
    };
}
  
function initializeVariables() {
    let device;
    let websocket;
    let networkConfig = {};
    let controlCommandMap = {
        0: "STOP",
        1: "N",
        2: "S",
        3: "FCC",
        4: "FCW",
        5: "CCW",
        6: "CW",
        7: "LED"
    };
    let lastDirection;
    return {
        device,
        websocket,
        networkConfig,
        controlCommandMap,
        lastDirection,
    };
}

async function bluetoothPairing() {
    const robotSelect = document.getElementById("robotSelect");
    const robotNameInput = document.getElementById("robotNameInput");
  
    device = await connectToBluetoothDevice(
        deviceNamePrefixMap[robotSelect.value] ?? undefined
    );
    robotNameInput.value = device.name;
}

async function connectToBluetoothDevice(deviceNamePrefix) {
    const options = {
        filters: [
            { namePrefix: deviceNamePrefix },
            { services: [UART_SERVICE_UUID] },
        ].filter(Boolean),
    };  
  
    try {
        device = await navigator.bluetooth.requestDevice(options);
        console.log("Found Bluetooth device: ", device);
    
        await device.gatt?.connect();
        console.log("Connected to GATT server");
    
        return device;
    } catch (error) {
        console.error(error);
    }
}
  
function disconnectFromBluetoothDevice(device) {
    if (device.gatt?.connected)device.gatt.disconnect();
    else console.log("Bluetooth Device is already disconnected");
}

async function sendMessageToDeviceOverBluetooth(message, device) {
    const MAX_MESSAGE_LENGTH = 15;
    const messageArray = [];
  
    // Split message into smaller chunks
    while (message.length > 0) {
        const chunk = message.slice(0, MAX_MESSAGE_LENGTH);
        message = message.slice(MAX_MESSAGE_LENGTH);
        messageArray.push(chunk);
    }
  
    if (messageArray.length > 1) {
        messageArray[0] = `${messageArray[0]}#${messageArray.length}$`;
        for (let i = 1; i < messageArray.length; i++) {
            messageArray[i] = `${messageArray[i]}$`;
        }
    }
  
    console.log("Connecting to GATT Server...");
    const server = await device.gatt?.connect();
  
    console.log("Getting UART Service...");
    const service = await server?.getPrimaryService(UART_SERVICE_UUID);
  
    console.log("Getting UART RX Characteristic...");
    const rxCharacteristic = await service?.getCharacteristic(
        UART_RX_CHARACTERISTIC_UUID
    );
  
    // Check GATT operations is ready to write
    if (rxCharacteristic?.properties.write) {
      // Send each chunk to the device
        for (const chunk of messageArray) {
            try {
                await rxCharacteristic?.writeValue(new TextEncoder().encode(chunk));
                console.log(`Message sent: ${chunk}`);
            } catch (error) {
                console.error(`Error sending message: ${error}`);
            }
        }
    }   
}

function sendMediaServerInfo() {
    const ssidInput = document.getElementById("ssidInput");
    const passwordInput = document.getElementById("passwordInput");
    const hostInput = document.getElementById("hostInput");
    const portInput = document.getElementById("portInput");
    const channelInput = document.getElementById("channelInput");
    const robotSelect = document.getElementById("robotSelect");
  
    networkConfig = {
        ssid: ssidInput.value,
        password: passwordInput.value,
        host: hostInput.value,
        port: portInput.value,
        channel: "instant",
        channel_name: channelInput.value,
    };
  
    const devicePort =
        window.location.protocol.replace(/:$/, "") === "http"
            ? networkConfig.port
            : networkConfig.port - 1;
  
    if (device) {
        const metricData = {
            type: "metric",
            data: {
                server: {
                    ssid: networkConfig.ssid,
                    password: networkConfig.password,
                    host: networkConfig.host,
                    port: devicePort,
                    path: `pang/ws/pub?channel=instant&name=${networkConfig.channel_name}&track=video&mode=bundle`,
                },
                profile: robotSelect.value,
            },
        };
        sendMessageToDeviceOverBluetooth(JSON.stringify(metricData), device);
    }
}

function handleChunk(frame) {
    const canvasElement = document.getElementById("canvasElement");
  
    drawVideoFrameOnCanvas(canvasElement, frame);
    frame.close();
}

function drawVideoFrameOnCanvas(canvas, frame) {  
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
}

function displayMessage(messageContent) {
    const messageView = document.getElementById("messageView");

    if (typeof messageContent == "object") {
        messageContent = JSON.stringify(messageContent);
    }
    messageView.innerHTML += `${messageContent}\n`;
    messageView.scrollTop = messageView.scrollHeight;
}

function keepWebSocketAlive(webSocket, interval) {
    const pingInterval = interval ?? 10000;
    let pingTimer;
  
    function sendPing() {
        if (webSocket.readyState === WebSocket.OPEN) {
            webSocket.send("ping");
        }
    }
  
    function schedulePing() {
        pingTimer = setInterval(sendPing, pingInterval);
    }
  
    function handlePong() {}
  
    function handleWebSocketClose() {
        clearInterval(pingTimer);
    }
  
    webSocket.addEventListener("open", () => {
        schedulePing();
    });
  
    webSocket.addEventListener("message", (event) => {
        if (event.data === "pong") {
            handlePong();
        }
    });
  
    webSocket.addEventListener("close", () => {
        handleWebSocketClose();
    });
}

function setupTabs() {
    document.querySelectorAll(".tabs__button").forEach(button => {
        button.addEventListener("click", () => {
            const head = button.parentElement;
            const tabContainer = head.parentElement;
            const tabNumber = button.dataset.forTab;
            const tabToActivate = tabContainer.querySelector(`.tabs__content[data-tab="${tabNumber}"]`);
    
            head.querySelectorAll(".tabs__button").forEach(button => {
                button.classList.remove("tabs__button--active");
            });
            
            tabContainer.querySelectorAll(".tabs__content").forEach(button => {
                button.classList.remove("tabs__content--active");
            });
    
            button.classList.add("tabs__button--active");
            tabToActivate.classList.add("tabs__content--active");
        });
    });
}


//Main function for web
async function openWebSocket() {
    const videoElement = document.getElementById("videoElement");
  
    const path = `pang/ws/sub?channel=instant&name=${networkConfig.channel_name}&track=video&mode=bundle`;
    const serverURL = `${
        window.location.protocol.replace(/:$/, "") === "https" ? "wss" : "ws"
    }://${networkConfig.host}:${networkConfig.port}/${path}`;
  
    websocket = new WebSocket(serverURL);
    websocket.binaryType = "arraybuffer";
    camera.start(); //detect
    websocket.onopen = async () => {
        if (device) {
            await loadingModelPromise.then(() => { //await model
                camera.start(); //detect
            });
        }
    };
    displayMessage("Open Video WebSocket");
    keepWebSocketAlive(websocket);
    
    const videoDecoder = new VideoDecoder({
        output: handleChunk,
        error: (error) => console.error(error),
    });
  
    const videoDecoderConfig = {
        codec: "avc1.42E03C",
    };
  
    if (!(await VideoDecoder.isConfigSupported(videoDecoderConfig))) {
        throw new Error("VideoDecoder configuration is not supported.");
    }
    videoDecoder.configure(videoDecoderConfig);
    websocket.onmessage = (e) => {
        try {
            if (videoDecoder.state === "configured") {
                const encodedChunk = new EncodedVideoChunk({
                    type: "key",
                    data: e.data,
                    timestamp: e.timeStamp,
                    duration: 0,
                });
                videoDecoder.decode(encodedChunk);
            }
        } catch (error) {
            console.error(error);
        }
    };
    keepWebSocketAlive(websocket);
}

function stop_receive() {
    websocket.close();
    camera.stop();
    displayMessage("Close video websocket");
    disconnectFromBluetoothDevice(device);
}


// Main function for model

async function updatePredict(flattenedArray){
    const input = new onnx.Tensor(new Float32Array(flattenedArray), "float32",[1,1,126]);
    const outputMap = await sess.run([input]);
    const outputTensor = outputMap.values().next().value;
    const predictions = outputTensor.data;
    const scoreValue = Object.values(predictions);
    const maxPrediction = Math.max(...scoreValue);
    const idx = scoreValue.indexOf(maxPrediction);
    return idx;
}

async function onResults(results) {
    let landmarks_left = Array.from({ length: 63 }).fill(0);
    let landmarks_right = Array.from({ length: 63 }).fill(0);
    let flattenedArray; 
    let direction;
    let gesture_num;
    if (results.multiHandLandmarks && results.multiHandedness.length) {
        if(results.multiHandedness.length===2){
            if(results.multiHandedness[0].label==="Right"){
                landmarks_left = results.multiHandLandmarks[0];
                landmarks_right = results.multiHandLandmarks[1];
            }
            else {
                landmarks_left = results.multiHandLandmarks[1];
                landmarks_right = results.multiHandLandmarks[0];
            }
            const flatten_1 = landmarks_left.flatMap(obj => Object.values(obj).slice(0, -1));
            const flatten_2 = landmarks_right.flatMap(obj => Object.values(obj).slice(0, -1));
            flattenedArray = flatten_1.concat(flatten_2);
        } else{
            if(results.multiHandedness[0].label==="Right"){
                landmarks_left = results.multiHandLandmarks[0];
                const flatten_1 = landmarks_left.flatMap(obj => Object.values(obj).slice(0, -1));
                flattenedArray = flatten_1.concat(landmarks_right);
            }
            else {
                landmarks_right = results.multiHandLandmarks[0];
                const flatten_2 = landmarks_right.flatMap(obj => Object.values(obj).slice(0, -1));
                flattenedArray = landmarks_left.concat(flatten_2);
            }
        }
        gesture_num = await updatePredict(flattenedArray);
        direction = controlCommandMap[gesture_num];
        console.log(direction);
    } else direction = "STOP";
    if (direction !== lastDirection) {
        lastDirection = direction; 
        const controlCommand = {
            type: "control",
            direction,
        };
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify(controlCommand));
            displayMessage(`Send '${direction}' command`);
        }
    }        
}


//Add event
document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    document.querySelectorAll(".tabs").forEach(tabContainer => {
        tabContainer.querySelector(".tabs__head .tabs__button").click();
    });
  
    pairButton.addEventListener("click", bluetoothPairing);
    sendMediaServerInfoButton.addEventListener("click", sendMediaServerInfo);
    openWebSocketButton.addEventListener("click", openWebSocket);
    stopButton.addEventListener("click", stop_receive);
});
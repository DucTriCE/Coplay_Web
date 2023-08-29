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
/**
 * Bluetooth 서비스 및 특성 UUID
 */
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

const { pairButton, sendButton, stopButton } = initializeDOMElements();
let { device, controlCommandMap, lastDirection } = initializeVariables();

function initializeDOMElements() {
  const pairButton = document.getElementById("pairButton");
  const sendButton = document.getElementById("sendButton");
  const stopButton = document.getElementById("stopButton");

  return {
    pairButton,
    sendButton,
    stopButton,
  };
}

function initializeVariables() {
  let device;
  let controlCommandMap = {
    KeyW: "N",
    KeyA: "CCW",
    KeyS: "S",
    KeyD: "CW",
    KeyM: "STOP",
  };
  let lastDirection;

  return {
    device,
    controlCommandMap,
    lastDirection,
  };
}

async function bluetoothPairing() {
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

async function sendCommand() {
  if (device) {
    console.log("Connecting to GATT Server...");
    const server = await device.gatt?.connect();

    console.log("Getting UART Service...");
    const service = await server?.getPrimaryService(UART_SERVICE_UUID);

    console.log("Getting UART RX Characteristic...");
    const rxCharacteristic = await service?.getCharacteristic(
      UART_RX_CHARACTERISTIC_UUID
    );

    document.addEventListener("keydown", (e) =>
      handleKeyDown(e, rxCharacteristic)
    );
    document.addEventListener("keyup", (e) => handleKeyUp(e, rxCharacteristic));
  }
}

function stop() {
  if (device.gatt?.connected) {
    device.gatt.disconnect();
  } else {
    console.log("Bluetooth Device is already disconnected");
  }
}

async function handleKeyDown(e, rxCharacteristic) {
  const direction = controlCommandMap[e.code];
  if (direction === lastDirection) return;
  lastDirection = direction;

  const controlCommand = {
    type: "control",
    direction,
  };

  try {
    await rxCharacteristic?.writeValueWithoutResponse(
      new TextEncoder().encode(JSON.stringify(controlCommand))
    );
  } catch (error) {
    console.error(`Error sending message: ${error}`);
  }
  displayMessage(direction);
}

async function handleKeyUp(e, rxCharacteristic) {
  const direction = "STOP";
  if (direction === lastDirection) return;
  lastDirection = direction;

  const controlCommand = {
    type: "control",
    direction,
  };
  try {
    await rxCharacteristic?.writeValueWithoutResponse(
      new TextEncoder().encode(JSON.stringify(controlCommand))
    );
  } catch (error) {
    console.error(`Error sending message: ${error}`);
  }
  displayMessage(direction);
}

function displayMessage(messageContent) {
  if (typeof messageContent == "object") {
    messageContent = JSON.stringify(messageContent);
  }
  messageView.innerHTML += `${messageContent}\n`;
  messageView.scrollTop = messageView.scrollHeight;
}

document.addEventListener("DOMContentLoaded", () => {
  pairButton.addEventListener("click", bluetoothPairing);
  sendButton.addEventListener("click", sendCommand);
  stopButton.addEventListener("click", stop);
});

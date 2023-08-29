const videoWebCodecsMap = {
  h264: "avc1.42002A", // avc1.42E03C avc1.42002A
  h265: "hev1.1.6.L120.90",
  vp8: "vp8",
  vp9: "vp09.00.31.08",
  av1: "av01.0.05M.10",
  jpeg: "jpeg",
  png: "png",
};

const {
  checkCameraPermissionButton,
  findChannelsButton,
  publishButton,
  subscribeButton,
} = initializeDOMElements();

function initializeDOMElements() {
  const checkCameraPermissionButton = document.getElementById(
    "checkCameraPermissionButton"
  );
  const findChannelsButton = document.getElementById("findChannelsButton");
  const publishButton = document.getElementById("publishButton");
  const subscribeButton = document.getElementById("subscribeButton");

  return {
    checkCameraPermissionButton,
    findChannelsButton,
    publishButton,
    subscribeButton,
  };
}

function makeResolutionOptions() {
  const resolutionSelect = document.getElementById("resolutionSelect");
  const resolutionOptions = ["640x480", "1280x720", "1920x1080"];
  for (let i = 0; i < resolutionOptions.length; i++) {
    const option = document.createElement("option");
    option.value = resolutionOptions[i];
    option.text = resolutionOptions[i];
    resolutionSelect.appendChild(option);
  }
}

// make the function for checking the camera permission in web browser
async function checkCameraPermission() {
  navigator.permissions.query({ name: "camera" }).then(async (result) => {
    const cameraPermissionLabel = document.getElementById(
      "cameraPermissionLabel"
    );
    cameraPermissionLabel.innerHTML = result.state;

    await findCameraDevice();
  });
}

async function findCameraDevice() {
  await navigator.mediaDevices
    .enumerateDevices()
    .then(function (devices) {
      devices.forEach(function (device) {
        if (device.kind === "videoinput") {
          const cameraSelect = document.getElementById("cameraSelect");
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.text = device.label;
          cameraSelect.appendChild(option);
        }
      });
    })
    .catch(function (err) {
      console.log(err.name + ": " + err.message);
    });
}

function findChannels() {
  const protocol = window.location.protocol.slice(0, -1);
  const hostInput = document.getElementById("hostInput");
  const portInput = document.getElementById("portInput");
  const url = `${protocol}://${hostInput.value}:${portInput.value}/monitor/http/cmd?format=json&op=show&obj=channel`;

  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      data.map((channel) => {
        const channelSelect = document.getElementById("channelSelect");
        const option = document.createElement("option");
        if (channel.state == 1) {
          option.text = channel.name + " (live)";
        } else if (channel.blocked == true) {
          option.text = channel.name + " (blocked)";
        } else {
          option.text = channel.name;
        }
        option.value = channel.id;

        channelSelect.appendChild(option);
      });
    })
    .catch((error) => {
      console.log(error);
    });
}

async function publish() {
  const cameraSelect = document.getElementById("cameraSelect");
  const cameraId = cameraSelect.value;
  const constraints = {
    audio: false,
    video: {
      deviceId: cameraId,
    },
  };

  const stream = await navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      const videoElement = document.getElementById("videoElement");
      videoElement.srcObject = stream;
      return stream;
    })
    .catch((error) => {
      console.log(error);
    });

  const codecSelect = document.getElementById("codecSelect");
  const resolutionSelect = document.getElementById("resolutionSelect");
  const bitrateInput = document.getElementById("bitrateInput");
  const framerateInput = document.getElementById("framerateInput");
  const bitrateModeSelect = document.getElementById("bitrateModeSelect");

  const channelSelect = document.getElementById("channelSelect");
  const protocol =
    window.location.protocol.slice(0, -1) == "http" ? "ws" : "wss";
  const hostInput = document.getElementById("hostInput");
  const portInput = document.getElementById("portInput");

  const serverURL = `${protocol}://${hostInput.value}:${portInput.value}/pang/ws/pub?channel=${channelSelect.value}&track=video&mode=single`;
  const websocket = new WebSocket(serverURL);
  websocket.binaryType = "arraybuffer";

  websocket.onopen = async function () {
    const mime = `video/${codecSelect.value};codecs=${
      videoWebCodecsMap[codecSelect.value]
    };width=${resolutionSelect.value.split("x")[0]};height=${
      resolutionSelect.value.split("x")[1]
    }}`;
    websocket.send(mime);

    function handleVideoChunk(chunk) {
      const chunkData = new Uint8Array(chunk.byteLength);
      chunk.copyTo(chunkData);
      websocket.send(chunkData);
    }

    const videoEncoderConfig = {
      codec: videoWebCodecsMap[codecSelect.value],
      width: resolutionSelect.value.split("x")[0],
      height: resolutionSelect.value.split("x")[1],
      bitrate: bitrateInput.value,
      framerate: framerateInput.value,
      bitrateMode: bitrateModeSelect.value,
      latencyMode: "realtime",
      avc: { format: "annexb" },
    };

    await encode(stream, videoEncoderConfig, handleVideoChunk, 30);
  };
  websocket.onerror = function (err) {
    console.log(err);
  };
}

async function encode(
  stream,
  videoEncoderConfig,
  handleChunk,
  keyFrameInterval = 1
) {
  const videoTrack = stream.getVideoTracks()[0];
  const trackProcessor = new MediaStreamTrackProcessor(videoTrack);
  const reader = trackProcessor.readable.getReader();

  if (!(await VideoEncoder.isConfigSupported(videoEncoderConfig))) {
    throw new Error("Unsupported video encoder configuration.");
  }

  let frameCounter = 0;

  const videoEncoder = new VideoEncoder({
    output: handleChunk,
    error: (err) => {
      console.log(err);
    },
  });

  while (true) {
    const { done, value } = await reader.read();

    if (done) return;
    if (videoEncoder.state === "closed") return;

    frameCounter++;

    videoEncoder.configure(videoEncoderConfig);
    videoEncoder.encode(value, {
      keyFrame: frameCounter % keyFrameInterval === 0,
    });
    value.close();
  }
}

async function subscribe() {
  const channelSelect = document.getElementById("channelSelect");
  const protocol =
    window.location.protocol.slice(0, -1) == "http" ? "ws" : "wss";
  const hostInput = document.getElementById("hostInput");
  const portInput = document.getElementById("portInput");

  const serverURL = `${protocol}://${hostInput.value}:${portInput.value}/pang/ws/sub?channel=${channelSelect.value}&track=video&mode=single`;
  const websocket = new WebSocket(serverURL);
  websocket.binaryType = "arraybuffer";

  const canvasElement = document.getElementById("canvasElement");
  const ctx = canvasElement.getContext("2d");

  async function handleChunk(frame) {
    ctx.drawImage(frame, 0, 0, canvasElement.width, canvasElement.height);
    frame.close();
  }

  const videoDecoder = new VideoDecoder({
    output: handleChunk,
    error: (err) => {
      console.log(err);
    },
  });

  websocket.onmessage = async function (e) {
    if (isMimeMessage(e.data)) {
      const mime = e.data;
      const [mimeType, ...mimeOption] = mime.split(";");
      const mimeOptionObj = mimeOption.reduce((acc, cur) => {
        const [key, value] = cur.split("=");
        acc[key] = value;
        return acc;
      }, {});

      const videoDecoderConfig = {
        codec: mimeOptionObj.codecs,
      };

      if (!(await VideoDecoder.isConfigSupported(videoDecoderConfig))) {
        throw new Error("Unsupported video decoder configuration.");
      }

      videoDecoder.configure(videoDecoderConfig);
    } else if (isEncodedMessage(e.data)) {
      try {
        if (videoDecoder.state === "configured") {
          decode(videoDecoder, e);
        } else {
          console.log("videoDecoder is not configured");
        }
      } catch (error) {
        console.error(error);
      }
    }
  };
  websocket.onerror = function (err) {
    console.log(err);
  };

  function isMimeMessage(message) {
    return typeof message == "string" && message.startsWith("video/");
  }
  function isEncodedMessage(message) {
    return message instanceof ArrayBuffer;
  }
}

function decode(videoDecoder, e) {
  const encodedChunk = new EncodedVideoChunk({
    type: "key",
    data: e.data,
    timestamp: e.timeStamp,
    duration: 0,
  });

  videoDecoder.decode(encodedChunk);
}

document.addEventListener("DOMContentLoaded", () => {
  makeResolutionOptions();

  checkCameraPermissionButton.addEventListener("click", checkCameraPermission);
  findChannelsButton.addEventListener("click", findChannels);
  publishButton.addEventListener("click", publish);
  subscribeButton.addEventListener("click", subscribe);
});

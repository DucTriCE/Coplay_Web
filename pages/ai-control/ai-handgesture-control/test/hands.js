const video3 = document.getElementsByClassName('input_video3')[0]; //webcam
const out3 = document.getElementsByClassName('output3')[0]; //output mediapipe
const controlsElement3 = document.getElementsByClassName('control3')[0]; //Điều chỉnh
const canvasCtx3 = out3.getContext('2d');
const fpsControl = new FPS();

const sess = new onnx.InferenceSession();
const loadingModelPromise = sess.loadModel("./fixed.onnx");


function onResultsHands(results) {
  document.body.classList.add('loaded');
  fpsControl.tick();
  canvasCtx3.save();
  canvasCtx3.clearRect(0, 0, out3.width, out3.height);
  canvasCtx3.drawImage(
      results.image, 0, 0, out3.width, out3.height);
  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let index = 0; index < results.multiHandLandmarks.length; index++) {
      const classification = results.multiHandedness[index];
      const isRightHand = classification.label === 'Right';
      const landmarks = results.multiHandLandmarks[index];
      const flattenedArray = landmarks.flatMap(obj => Object.values(obj).slice(0, -1));
      drawConnectors(
          canvasCtx3, landmarks, HAND_CONNECTIONS,
          {color: isRightHand ? '#00FF00' : '#FF0000'}),
      drawLandmarks(canvasCtx3, landmarks, {
        color: isRightHand ? '#00FF00' : '#FF0000',
        fillColor: isRightHand ? '#FF0000' : '#00FF00',
        radius: (x) => {
          return lerp(x.from.z, -0.15, .1, 10, 1);
        }
      });
      updatePredict(flattenedArray);
    }
  }
  else console.log("NOHAND");
  canvasCtx3.restore();
}

async function updatePredict(flattenedArray){
  const input = new onnx.Tensor(new Float32Array(flattenedArray), "float32", [1,1,63]);
  await loadingModelPromise

  const outputMap = await sess.run([input]);
  const outputTensor = outputMap.values().next().value;
  const predictions = outputTensor.data;
  const scoreValue = Object.values(predictions);
  const maxPrediction = Math.max(...scoreValue)
  const idx = scoreValue.indexOf(maxPrediction)
  console.log(idx)
}

const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1/${file}`;
}});
hands.onResults(onResultsHands);

const camera = new Camera(video3, {
  onFrame: async () => {
    await hands.send({image: video3});
  },
  width: 640,
  height: 480
});
camera.start();

new ControlPanel(controlsElement3, {
      selfieMode: true,
      maxNumHands: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      modelComplexity: 1
    })
    .add([
      fpsControl,
      new Slider(
          {title: 'Max Number of Hands', field: 'maxNumHands', range: [1, 4], step: 1}),
      new Slider({
        title: 'Min Detection Confidence',
        field: 'minDetectionConfidence',
        range: [0, 1],
        step: 0.01
      }),
      new Slider({
        title: 'Min Tracking Confidence',
        field: 'minTrackingConfidence',
        range: [0, 1],
        step: 0.01
      }),
    ])
    .on(options => {
      video3.classList.toggle('selfie', options.selfieMode);
      hands.setOptions(options);
    });